using CodexAccountDesk;
using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;

internal static class DesktopDiscoveryRegression
{
    internal static async Task ProbeAsync(string home, string expectedThread)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(22));
        await using var monitor = new DesktopSessionMonitor(home);
        monitor.Start();
        await monitor.WaitForDiscoveryAsync(timeout.Token);
        var threads = monitor.Threads;
        Console.WriteLine(JsonSerializer.Serialize(new {
            available = monitor.Current.Available, observed = threads.Length,
            running = threads.Count(t => t.Status == "active"),
            waiting = threads.Count(t => t.Waiting),
            verifiedTurn = threads.Any(t => t.LastTurnId != null && t.LastTurnStatus == "inProgress"),
            canonicalThreadMatched = threads.Any(t => t.Id == expectedThread)
        }));
    }

    internal static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        foreach (var version in new[] { 11, 13, 99 })
            await ScenarioAsync(version);
        await DisconnectedOwnerAsync(beforeReply: false);
        await DisconnectedOwnerAsync(beforeReply: true);
    }

    private static async Task DisconnectedOwnerAsync(bool beforeReply)
    {
        var home = Path.Combine(Path.GetTempPath(), "codex-owner-fixture-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(home, "thread-writer-locks"));
        var target = Guid.NewGuid().ToString(); var stale = Guid.NewGuid().ToString();
        foreach (var id in new[] { target, stale }) File.WriteAllText(Path.Combine(home, "thread-writer-locks", id + ".lock"), "");
        var pipeName = "codex-owner-fixture-" + Guid.NewGuid().ToString("N");
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using var pipe = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var server = ServeAsync();
        try
        {
            await using var monitor = new DesktopSessionMonitor(home, pipeName);
            monitor.Start();
            while (!monitor.Current.Available || !monitor.Threads.Any(t => t.Id == target && t.Owner == "replacement-owner" && t.LastTurnId == "replacement-turn"))
            {
                if (server.IsCompleted) { await server; throw new Exception("Owner recovery fixture ended early"); }
                await Task.Delay(50, stop.Token);
            }
            if (monitor.Threads.Length != 1) throw new Exception("Owner recovery included an unrelated thread");
            Console.WriteLine(beforeReply
                ? "PASS disconnect before discovery reply: stale owner rejected and replacement rediscovered"
                : "PASS fast owner followed before slow negative replies; disconnect reconnects with exact replacement");
        }
        finally
        {
            stop.Cancel();
            try { await server; } catch (OperationCanceledException) { } catch (IOException) { }
            Directory.Delete(home, true);
        }

        async Task ServeAsync()
        {
            await pipe.WaitForConnectionAsync(stop.Token);
            var requests = new List<(string Request, string Thread)>();
            var replacement = false;
            while (!stop.IsCancellationRequested)
            {
                var header = new byte[4]; await pipe.ReadExactlyAsync(header, stop.Token);
                var data = new byte[BinaryPrimitives.ReadInt32LittleEndian(header)]; await pipe.ReadExactlyAsync(data, stop.Token);
                using var doc = JsonDocument.Parse(data); var msg = doc.RootElement;
                var method = msg.GetProperty("method").GetString();
                if (method == "initialize")
                    await SendAsync(new { type = "response", requestId = msg.GetProperty("requestId").GetString(), resultType = "success", result = new { } });
                else if (method == "thread-owner-discovery")
                {
                    var request = msg.GetProperty("requestId").GetString()!;
                    var id = msg.GetProperty("params").GetProperty("conversationId").GetString()!;
                    if (replacement) { await ReplyAsync(request, id, "replacement-owner"); continue; }
                    requests.Add((request, id));
                    if (requests.Count != 2) continue;
                    if (beforeReply) await DisconnectAsync();
                    var live = requests.Single(r => r.Thread == target);
                    await ReplyAsync(live.Request, live.Thread, "departed-owner");
                    if (beforeReply)
                    {
                        var absent = requests.Single(r => r.Thread == stale);
                        await ReplyAsync(absent.Request, absent.Thread, "departed-owner");
                        replacement = true;
                    }
                    // Otherwise deliberately withhold the negative reply. The live
                    // owner must already be followed while that request is pending.
                }
                else if (method == "thread-stream-following-changed" && msg.GetProperty("params").GetProperty("following").GetBoolean())
                {
                    if (msg.GetProperty("params").GetProperty("conversationId").GetString() != target)
                        throw new Exception("An unrelated thread was followed");
                    if (!replacement)
                    {
                        await DisconnectAsync();
                        // A registered owner's disconnect must tear down the pipe,
                        // even while another discovery request is unanswered.
                        var tail = new byte[1];
                        try { while (await pipe.ReadAsync(tail, stop.Token) != 0) { } }
                        catch (IOException) { }
                        pipe.Disconnect();
                        await pipe.WaitForConnectionAsync(stop.Token);
                        replacement = true;
                        continue;
                    }
                    await SendAsync(new { type = "broadcast", method = "thread-stream-state-changed", version = 13, sourceClientId = "replacement-owner", @params = new {
                        hostId = "local", conversationId = target, change = new { type = "snapshot", revision = 1, conversationState = new {
                            threadRuntimeStatus = new { type = "active" }, threadGoal = (object?)null, resumeState = "resumed",
                            turns = new[] { new { turnId = "replacement-turn", status = "inProgress", turnStartedAtMs = 1000L } }
                        } }
                    } });
                }
            }
        }
        Task DisconnectAsync() => SendAsync(new { type = "broadcast", method = "client-status-changed", @params = new { status = "disconnected", clientId = "departed-owner" } });
        Task ReplyAsync(string request, string id, string owner) => SendAsync(new { type = "response", requestId = request,
            resultType = id == target ? "success" : "error", error = id == target ? null : "no-client-found", handledByClientId = id == target ? owner : null });
        async Task SendAsync(object value)
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(value); var frame = new byte[bytes.Length + 4];
            BinaryPrimitives.WriteInt32LittleEndian(frame, bytes.Length); bytes.CopyTo(frame, 4);
            await pipe.WriteAsync(frame, stop.Token); await pipe.FlushAsync(stop.Token);
        }
    }

    private static async Task ScenarioAsync(int version)
    {
        var home = Path.Combine(Path.GetTempPath(), "codex-discovery-fixture-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(home, "thread-writer-locks"));
        var ids = Enumerable.Range(0, 6).Select(_ => Guid.NewGuid().ToString()).ToArray();
        foreach (var id in ids) File.WriteAllText(Path.Combine(home, "thread-writer-locks", id + ".lock"), "");
        var pipeName = "codex-discovery-fixture-" + Guid.NewGuid().ToString("N");
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using var pipe = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var served = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var server = ServeAsync();
        try
        {
            await using var monitor = new DesktopSessionMonitor(home, pipeName);
            var watch = Stopwatch.StartNew();
            monitor.Start();
            await served.Task.WaitAsync(stop.Token);
            if (version == 99)
            {
                await Task.Delay(250, stop.Token);
                if (monitor.Current.Available || monitor.Threads.Length != 0)
                    throw new Exception("Unknown protocol became available");
                Console.WriteLine("PASS unknown desktop protocol remains unavailable");
            }
            else
            {
                await monitor.WaitForDiscoveryAsync(stop.Token);
                var thread = monitor.Threads.Single();
                if (watch.Elapsed > TimeSpan.FromSeconds(9) || thread.Id != ids[0] || thread.Owner != "fixture-owner" ||
                    !thread.Waiting || thread.LastTurnId != "new-turn" || thread.LastTurnStatus != "inProgress" || thread.LastMessageId != "message-one")
                    throw new Exception("Discovery lost ownership, approval, or canonical turn evidence");
                Console.WriteLine($"PASS protocol {version}: stale locks do not serialize timeouts; exact owner, approval and canonical turn preserved");
            }
        }
        finally
        {
            stop.Cancel();
            try { await server; } catch (OperationCanceledException) { } catch (IOException) { }
            Directory.Delete(home, true);
        }

        async Task ServeAsync()
        {
            await pipe.WaitForConnectionAsync(stop.Token);
            var owners = new List<(string Request, string Thread)>();
            while (!stop.IsCancellationRequested)
            {
                var header = new byte[4]; await pipe.ReadExactlyAsync(header, stop.Token);
                var data = new byte[BinaryPrimitives.ReadInt32LittleEndian(header)]; await pipe.ReadExactlyAsync(data, stop.Token);
                using var doc = JsonDocument.Parse(data); var msg = doc.RootElement;
                var method = msg.GetProperty("method").GetString();
                if (method == "initialize")
                    await SendAsync(new { type = "response", requestId = msg.GetProperty("requestId").GetString(), resultType = "success", result = new { } });
                else if (method == "thread-owner-discovery")
                {
                    owners.Add((msg.GetProperty("requestId").GetString()!, msg.GetProperty("params").GetProperty("conversationId").GetString()!));
                    // All owner probes must arrive before any negative answer.
                    // The delayed reply also reproduces the server-deadline race.
                    if (owners.Count != ids.Length) continue;
                    await Task.Delay(version == 13 ? 5100 : 100, stop.Token);
                    foreach (var owner in owners)
                        await SendAsync(new { type = "response", requestId = owner.Request, resultType = owner.Thread == ids[0] ? "success" : "error", error = owner.Thread == ids[0] ? null : "no-client-found", handledByClientId = owner.Thread == ids[0] ? "fixture-owner" : null });
                }
                else if (method == "thread-stream-following-changed" && msg.GetProperty("params").GetProperty("following").GetBoolean())
                {
                    await SendAsync(new { type = "broadcast", method = "thread-stream-state-changed", version, sourceClientId = "fixture-owner", @params = new {
                        hostId = "local", conversationId = ids[0], change = new { type = "snapshot", revision = 1, conversationState = new {
                            threadRuntimeStatus = new { type = "active", activeFlags = new[] { "waitingOnApproval" } },
                            threadGoal = (object?)null, resumeState = "resumed", latestTurnStartMessageId = "message-one", turns = Array.Empty<object>(),
                            turnHistory = new { kind = "canonical", history = new { entitiesByKey = new Dictionary<string,object> {
                                ["turn:one"] = new { turnId = "new-turn", status = "inProgress", turnStartedAtMs = 1000L }
                            } } }
                        } }
                    } });
                    served.TrySetResult();
                    await Task.Delay(Timeout.Infinite, stop.Token);
                }
            }
        }
        async Task SendAsync(object value)
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(value); var frame = new byte[bytes.Length + 4];
            BinaryPrimitives.WriteInt32LittleEndian(frame, bytes.Length); bytes.CopyTo(frame, 4);
            await pipe.WriteAsync(frame, stop.Token); await pipe.FlushAsync(stop.Token);
        }
    }
}
