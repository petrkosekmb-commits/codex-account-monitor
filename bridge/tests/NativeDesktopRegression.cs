using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using CodexAccountDesk;

internal static class NativeDesktopRegression
{
    internal static async Task RunAsync()
    {
        foreach (var scenario in new[] { (Status: "failed", Code: "usageLimitExceeded", Expected: "usageLimitExceeded"),
            (Status: "completed", Code: "usageLimitExceeded", Expected: (string?)null),
            (Status: "failed", Code: "networkError", Expected: (string?)null) })
        {
            var thread = JsonSerializer.SerializeToElement(new { id = Guid.NewGuid().ToString(), status = new { type = "idle" }, canAcceptDirectInput = true });
            var turn = JsonSerializer.SerializeToElement(new { id = "synthetic-turn", status = scenario.Status, startedAt = 1700000000L,
                completedAt = 1700000005L, error = new { codexErrorInfo = scenario.Code, message = "private error text must not be exposed" } });
            var parsed = NativeDesktopSession.Parse(thread, turn, JsonSerializer.SerializeToElement<object?>(null), "synthetic-owner");
            Check(parsed.LastTurnErrorCode == scenario.Expected && parsed.LastTurnCompletedAtMs == 1700000005000L,
                "only explicit failed quota code and completion time are exposed");
        }
        if (!OperatingSystem.IsWindows()) return;
        var fixture = new Fixture();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var token = timeout.Token;
        await using var server = new NamedPipeServerStream(NativeDesktopSession.PipeName(fixture.Home),
            PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        var serving = fixture.ServeAsync(server, token);
        try
        {
            await using var session = await NativeDesktopSession.ConnectAsync(fixture.Home, token)
                ?? throw new Exception("Synthetic relay did not connect.");
            await session.RefreshAsync(token);
            Check(session.Activity.Available && session.Activity.Observed == 2, "both pages discovered");
            var target = session.Threads.Single(t => t.Id == fixture.Target);
            Check(session.Threads.Any(t => t.Id == fixture.Other), "second-page root retained");
            Check(target.Owner == fixture.Owner && target.LastTurnId == fixture.Turn &&
                target.LastMessageId == fixture.PreviousClientId && target.LastTurnStartedAtMs == 1700000000000L,
                "exact owner, last turn and client message identified");
            var request = fixture.Envelope(fixture.Target, fixture.Target);
            fixture.OtherStatus = "active";
            await RejectedAsync(() => session.StartTurnAsync(target, request, token), "other root active");
            fixture.OtherStatus = "idle";
            fixture.TargetStatus = "active";
            fixture.Waiting = true;
            await session.RefreshAsync(token);
            Check(session.Activity.Waiting == 1 && session.Threads.Single(t => t.Id == target.Id).Waiting,
                "approval detected on target");
            await RejectedAsync(() => session.StartTurnAsync(target, request, token), "waiting on approval");
            fixture.Waiting = false;
            await RejectedAsync(() => session.StartTurnAsync(target, request, token), "target already running");
            fixture.TargetStatus = "idle";
            fixture.Queued = true;
            await session.RefreshAsync(token);
            Check(session.Activity.Queued == 1, "queued work on other root detected");
            await RejectedAsync(() => session.StartTurnAsync(target, request, token), "queue on another root");
            fixture.Queued = false;
            await RejectedAsync(() => session.StartTurnAsync(target,
                fixture.Envelope(fixture.Other, fixture.Target), token), "wrong outer thread");
            await RejectedAsync(() => session.StartTurnAsync(target,
                fixture.Envelope(fixture.Target, fixture.Other), token), "wrong request thread");
            var originalTurn = fixture.Turn;
            fixture.Turn = Guid.NewGuid().ToString();
            await RejectedAsync(() => session.StartTurnAsync(target, request, token), "snapshot turn changed");
            fixture.Turn = originalTurn;
            Check(fixture.Starts.Count == 0, "all blocked attempts stayed local");
            await session.StartTurnAsync(target, request, token);
            Check(fixture.Starts.Count == 1 && fixture.Starts[0] == (fixture.Target, fixture.NewClientId),
                "one start for the selected idle thread with original client message ID");
            Console.WriteLine("PASS native desktop discovery, paging, queue and exact-thread continuation");
        }
        finally
        {
            timeout.Cancel();
            try { await serving; } catch (OperationCanceledException) when (timeout.IsCancellationRequested) { }
        }
        await EmptyHistoryAsync();
        await EphemeralThreadsAsync();
    }

    private static async Task EphemeralThreadsAsync()
    {
        var fixture = new Fixture { OtherEphemeral = true };
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var token = timeout.Token;
        await using var server = new NamedPipeServerStream(NativeDesktopSession.PipeName(fixture.Home),
            PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        var serving = fixture.ServeAsync(server, token);
        try
        {
            await using var session = await NativeDesktopSession.ConnectAsync(fixture.Home, token)
                ?? throw new Exception("Synthetic ephemeral-thread relay did not connect.");
            await session.RefreshAsync(token);
            var target = session.Threads.Single(t => t.Id == fixture.Target);
            Check(session.Activity.Available && session.Activity.Observed == 1 && session.Activity.Waiting == 0 &&
                session.Threads.All(t => t.Id != fixture.Other) && target.LastTurnId == fixture.Turn,
                "idle ephemeral root preserves the ordinary interrupted task without becoming a continuation candidate");
            Check(fixture.EphemeralUnsupportedRequests == 0,
                "idle ephemeral root never queries unsupported history, goals or queue");
            var request = fixture.Envelope(fixture.Target, fixture.Target);
            await session.StartTurnAsync(target, request, token);
            Check(fixture.Starts.Count == 1 && fixture.Starts[0].Thread == fixture.Target,
                "idle ephemeral root does not block the ordinary task continuation");

            fixture.OtherStatus = "active";
            await session.RefreshAsync(token);
            var ephemeral = session.Threads.Single(t => t.Id == fixture.Other);
            Check(session.Activity.Available && session.Activity.Observed == 2 && session.Activity.Waiting == 1 &&
                ephemeral.Status == "active" && ephemeral.Waiting && ephemeral.ResumeState != "resumed" &&
                ephemeral.LastTurnId == null && ephemeral.LastMessageId == null,
                "active ephemeral root remains visible as a blocking session without invented continuation evidence");
            await RejectedAsync(() => session.StartTurnAsync(target, request, token), "another ephemeral root is active");
            await RejectedAsync(() => session.StartTurnAsync(ephemeral, fixture.Envelope(fixture.Other, fixture.Other), token),
                "active ephemeral root cannot be continued");
            Check(fixture.Starts.Count == 1 && fixture.EphemeralUnsupportedRequests == 0,
                "active ephemeral root blocks continuation without sending or querying unsupported APIs");

            fixture.OtherStatus = "idle";
            await session.RefreshAsync(token);
            Check(session.Activity.Available && session.Activity.Waiting == 0 && session.Activity.Observed == 1,
                "ephemeral root becoming idle removes its activity block");
            await RejectedAsync(() => session.StartTurnAsync(ephemeral, fixture.Envelope(fixture.Other, fixture.Other), token),
                "stale ephemeral snapshot cannot become a continuation target after becoming idle");
            Check(fixture.Starts.Count == 1 && fixture.EphemeralUnsupportedRequests == 0,
                "ephemeral lifecycle never starts the temporary chat or touches unsupported APIs");
        }
        finally
        {
            timeout.Cancel();
            try { await serving; } catch (OperationCanceledException) when (timeout.IsCancellationRequested) { }
        }
        Console.WriteLine("PASS idle ephemeral roots preserve continuation and active ephemeral roots block it");
    }

    private static async Task EmptyHistoryAsync()
    {
        const string emptyHistory = "thread/turns/list is unavailable before first user message";
        foreach (var scenario in new[]
        {
            (Error: emptyHistory, Path: (string?)null, Status: "idle", Allowed: true),
            (Error: "Synthetic history storage failure", Path: (string?)null, Status: "idle", Allowed: false),
            (Error: emptyHistory, Path: (string?)"synthetic-reserved-rollout", Status: "idle", Allowed: true),
            (Error: emptyHistory, Path: (string?)null, Status: "active", Allowed: false)
        })
        {
            var fixture = new Fixture { OtherHistoryError = scenario.Error, OtherPath = scenario.Path, OtherStatus = scenario.Status };
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await using var server = new NamedPipeServerStream(NativeDesktopSession.PipeName(fixture.Home),
                PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            var serving = fixture.ServeAsync(server, timeout.Token);
            try
            {
                await using var session = await NativeDesktopSession.ConnectAsync(fixture.Home, timeout.Token)
                    ?? throw new Exception("Synthetic empty-history relay did not connect.");
                var rejected = false;
                try { await session.RefreshAsync(timeout.Token); }
                catch (IOException) { rejected = true; }
                Check(rejected != scenario.Allowed, "only an explicit first-message history error on an idle chat permits missing history");
                if (scenario.Allowed)
                {
                    var target = session.Threads.Single(t => t.Id == fixture.Target);
                    var empty = session.Threads.Single(t => t.Id == fixture.Other);
                    Check(session.Activity.Available && session.Activity.Observed == 2 && empty.LastTurnId == null &&
                        empty.LastMessageId == null && target.LastTurnId == fixture.Turn,
                        "empty loaded root preserves discovery and interrupted task identity");
                    await RejectedAsync(() => session.StartTurnAsync(empty,
                        fixture.Envelope(fixture.Other, fixture.Other), timeout.Token), "an empty root cannot be continued");
                    await session.StartTurnAsync(target, fixture.Envelope(fixture.Target, fixture.Target), timeout.Token);
                    Check(fixture.Starts.Count == 1 && fixture.Starts[0].Thread == fixture.Target,
                        "empty unrelated root does not block exact interrupted task continuation");
                }
                else Check(!session.Activity.Available && session.Threads.Length == 0 && fixture.Starts.Count == 0,
                    "unverified history does not publish an available snapshot or start a turn");
            }
            finally
            {
                timeout.Cancel();
                try { await serving; } catch (OperationCanceledException) when (timeout.IsCancellationRequested) { }
            }
        }
        Console.WriteLine("PASS empty native thread history exception is narrow and preserves unrelated work");
    }

    private static async Task RejectedAsync(Func<Task<JsonElement>> attempt, string scenario)
    {
        try { await attempt(); }
        catch (InvalidOperationException) { return; }
        catch (InvalidDataException) { return; }
        throw new Exception("Unsafe turn start accepted: " + scenario);
    }

    private static void Check(bool condition, string scenario)
    {
        if (!condition) throw new Exception("Native desktop regression: " + scenario);
    }

    private sealed class Fixture
    {
        internal readonly string Home = Path.Combine(Path.GetTempPath(), "native-desktop-test-" + Guid.NewGuid());
        internal readonly string Owner = Guid.NewGuid().ToString();
        internal readonly string Target = Guid.NewGuid().ToString();
        internal readonly string Other = Guid.NewGuid().ToString();
        internal readonly string PreviousClientId = Guid.NewGuid().ToString();
        internal readonly string NewClientId = Guid.NewGuid().ToString();
        internal string Turn = Guid.NewGuid().ToString();
        internal string OtherStatus = "idle";
        internal string TargetStatus = "idle";
        internal string? OtherHistoryError, OtherPath;
        internal bool Waiting, Queued, OtherEphemeral;
        internal int EphemeralUnsupportedRequests;
        internal readonly List<(string Thread, string ClientId)> Starts = new();

        internal object Envelope(string conversation, string target) => new {
            conversationId = conversation,
            turnStart = new { request = new { threadId = target, clientUserMessageId = NewClientId } }
        };

        internal async Task ServeAsync(NamedPipeServerStream pipe, CancellationToken token)
        {
            await pipe.WaitForConnectionAsync(token);
            using var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true);
            using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
            while (await reader.ReadLineAsync(token) is string line)
            {
                using var doc = JsonDocument.Parse(line);
                var rpc = doc.RootElement;
                var method = rpc.GetProperty("method").GetString();
                if (OtherEphemeral && (method is "thread/turns/list" or "thread/goal/get" or "thread/queue/list") &&
                    rpc.GetProperty("params").GetProperty("threadId").GetString() == Other)
                {
                    EphemeralUnsupportedRequests++;
                    await writer.WriteLineAsync(JsonSerializer.Serialize(new { id = rpc.GetProperty("id"), error = new { code = -32000, message = "ephemeral threads do not support " + method } }));
                    continue;
                }
                if (OtherHistoryError != null && rpc.GetProperty("method").GetString() == "thread/turns/list" &&
                    rpc.GetProperty("params").GetProperty("threadId").GetString() == Other)
                {
                    await writer.WriteLineAsync(JsonSerializer.Serialize(new { id = rpc.GetProperty("id"), error = new { code = -32000, message = OtherHistoryError } }));
                    continue;
                }
                var result = Reply(rpc.GetProperty("method").GetString(), rpc.GetProperty("params"));
                await writer.WriteLineAsync(JsonSerializer.Serialize(new { id = rpc.GetProperty("id"), result }));
            }
        }

        private object Reply(string? method, JsonElement args)
        {
            if (method == "monitor/hello") return new { protocol = 1, owner = Owner, home = Home, nativePid = 123 };
            if (method == "thread/loaded/list")
            {
                var cursor = args.GetProperty("cursor").GetString();
                Check(cursor == null || cursor == "page-two", "unexpected page cursor");
                return new { data = new[] { cursor == null ? Target : Other }, nextCursor = cursor == null ? "page-two" : null };
            }
            if (method == "monitor/start-turn")
            {
                Check(args.GetProperty("expectedOwner").GetString() == Owner && args.GetProperty("expectedTurnId").GetString() == Turn, "expected owner and turn sent to relay");
                args = args.GetProperty("request"); method = "turn/start";
            }
            var id = args.GetProperty("threadId").GetString()!;
            Check(id == Target || id == Other, "unknown fixture thread");
            var status = id == Target ? TargetStatus : OtherStatus;
            switch (method)
            {
                case "thread/read":
                    return new { thread = new { id, name = "Synthetic chat", ephemeral = id == Other && OtherEphemeral,
                        canAcceptDirectInput = id == Other && OtherEphemeral ? (bool?)null : true, path = id == Other ? OtherPath : "synthetic-target-rollout",
                        parentThreadId = (string?)null, attachedToThreadId = (string?)null,
                        status = new { type = status, activeFlags = Waiting && id == Target ? new[] { "waitingOnApproval" } : Array.Empty<string>() } } };
                case "thread/turns/list":
                    return new { data = new[] { new { id = Turn, status = status == "active" ? "inProgress" : "interrupted",
                        startedAt = 1700000000L, items = new[] { new { type = "userMessage", id = "server-item", clientId = PreviousClientId } } } } };
                case "thread/goal/get":
                    return new { goal = (object?)null };
                case "thread/queue/list":
                    return new { data = Queued && id == Other ? new[] { "queued" } : Array.Empty<string>(), nextCursor = (string?)null };
                case "turn/start":
                    Starts.Add((id, args.GetProperty("clientUserMessageId").GetString()!));
                    return new { turn = new { id = "new-turn", status = "inProgress" } };
                default:
                    throw new Exception("Unexpected fixture method: " + method);
            }
        }
    }
}
