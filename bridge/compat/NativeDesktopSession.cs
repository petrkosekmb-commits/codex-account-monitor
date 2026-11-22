using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace CodexAccountDesk;

// Attaches to the server already owned by the desktop. It never starts a second
// app-server, resumes a stored thread, changes its settings, or redeems credits.
internal sealed class NativeDesktopSession : IAsyncDisposable
{
    private readonly NamedPipeClientStream _pipe;
    private readonly StreamReader _input;
    private readonly StreamWriter _output;
    private readonly SemaphoreSlim _writes = new(1, 1);
    private readonly SemaphoreSlim _refresh = new(1, 1);
    private readonly CancellationTokenSource _stop = new();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly Task _reader;
    private DesktopThreadState[] _threads = Array.Empty<DesktopThreadState>();
    private string _owner = "";
    public DesktopThreadState[] Threads => Volatile.Read(ref _threads);
    public SessionActivity Activity { get; private set; } = new(false, 0, 0, 0);
    internal static string CanonicalHome(string home) => Path.GetFullPath(home).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).ToUpperInvariant();
    internal static string PipeName(string home) => "codex-account-monitor-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(CanonicalHome(home)))).ToLowerInvariant()[..24];

    private NativeDesktopSession(NamedPipeClientStream pipe)
    {
        _pipe = pipe;
        _input = new StreamReader(pipe, new UTF8Encoding(false), false, 65536, true);
        _output = new StreamWriter(pipe, new UTF8Encoding(false), 65536, true) { AutoFlush = true };
        _reader = ReadAsync();
    }
    internal static async Task<NativeDesktopSession?> ConnectAsync(string home, CancellationToken cancellation)
    {
        var pipe = new NamedPipeClientStream(".", PipeName(home), PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        try { await pipe.ConnectAsync(250, cancellation); }
        catch (TimeoutException) { await pipe.DisposeAsync(); return null; }
        catch { await pipe.DisposeAsync(); throw; }
        var session = new NativeDesktopSession(pipe);
        try
        {
            var hello = await session.RequestAsync("monitor/hello", new { }, cancellation);
            if (JsonValue.Int(hello, "protocol") != 1 || !Guid.TryParse(JsonValue.String(hello, "owner"), out _) ||
                CanonicalHome(JsonValue.String(hello, "home") ?? "") != CanonicalHome(home) || (JsonValue.Int(hello, "nativePid") ?? 0) <= 0)
                throw new InvalidDataException("Desktop relay identity does not match.");
            session._owner = JsonValue.String(hello, "owner")!;
            return session;
        }
        catch { await session.DisposeAsync(); throw; }
    }
    internal async Task RefreshAsync(CancellationToken cancellation)
    {
        await _refresh.WaitAsync(cancellation);
        try
        {
            var ids = new List<string>();
            string? cursor = null;
            var cursors = new HashSet<string>();
            do
            {
                var page = await RequestAsync("thread/loaded/list", new { cursor, limit = 100 }, cancellation);
                foreach (var value in page.GetProperty("data").EnumerateArray())
                {
                    var id = value.GetString();
                    if (!Guid.TryParse(id, out _) || ids.Contains(id!)) throw new InvalidDataException("Invalid loaded thread identity.");
                    ids.Add(id!);
                }
                cursor = JsonValue.String(page, "nextCursor");
                if (cursor != null && !cursors.Add(cursor)) throw new InvalidDataException("Repeated thread page.");
            } while (cursor != null);
            var threads = new List<DesktopThreadState>();
            var queued = 0;
            foreach (var id in ids)
            {
                var read = await RequestAsync("thread/read", new { threadId = id, includeTurns = false }, cancellation);
                var thread = read.GetProperty("thread");
                if (JsonValue.String(thread, "id") != id) throw new InvalidDataException("Wrong thread returned.");
                if (JsonValue.String(thread, "parentThreadId") != null || JsonValue.String(thread, "attachedToThreadId") != null) continue;
                if (JsonValue.Bool(thread, "ephemeral") == true)
                {
                    // Temporary desktop sessions have no persisted history,
                    // goal or queue API. Idle ones need no continuation. An
                    // active one still blocks changing the shared account.
                    var ephemeralStatus = JsonValue.String(thread.GetProperty("status"), "type");
                    if (ephemeralStatus == "idle") continue;
                    if (ephemeralStatus != "active") throw new InvalidDataException("Unknown temporary session state.");
                    threads.Add(new(id, _owner, "active", true, null, null, "unsupported", null, null, null));
                    continue;
                }
                JsonElement last = default;
                try
                {
                    var turns = await RequestAsync("thread/turns/list", new { threadId = id, limit = 1, sortDirection = "desc", itemsView = "summary" }, cancellation);
                    last = turns.GetProperty("data").EnumerateArray().FirstOrDefault();
                }
                catch (NativeRequestException error) when (error.EmptyHistory &&
                    JsonValue.String(thread.GetProperty("status"), "type") == "idle")
                {
                    // The desktop assigns a rollout path before the first
                    // message materializes its history. Its explicit empty
                    // history response is authoritative even with that path. It
                    // must not hide an unrelated, genuinely interrupted task.
                }
                var goal = await RequestAsync("thread/goal/get", new { threadId = id }, cancellation);
                var queue = await RequestAsync("thread/queue/list", new { threadId = id, limit = 1 }, cancellation);
                // Only zero is used as permission to switch. A paginated/nonempty
                // queue stays blocked without reading or modifying its contents.
                if (queue.GetProperty("data").GetArrayLength() > 0 || JsonValue.String(queue, "nextCursor") != null) queued++;
                threads.Add(Parse(thread, last, goal.GetProperty("goal"), _owner));
            }
            Volatile.Write(ref _threads, threads.ToArray());
            Activity = new(true, threads.Count(t => t.Status == "active" && !t.Waiting), threads.Count(t => t.Waiting), threads.Count,
                Queued: queued, Goals: threads.Count(t => t.Goal == "active"),
                PausedGoals: threads.Count(t => t.Goal is "paused" or "blocked" or "usageLimited" or "budgetLimited"));
        }
        finally { _refresh.Release(); }
    }
    internal static DesktopThreadState Parse(JsonElement thread, JsonElement last, JsonElement goal, string owner)
    {
        var id = JsonValue.String(thread, "id") ?? throw new InvalidDataException("Missing thread ID.");
        var state = thread.GetProperty("status");
        var status = JsonValue.String(state, "type");
        if (status is not ("active" or "idle" or "notLoaded" or "systemError")) throw new InvalidDataException("Unknown thread status.");
        if (status != "notLoaded" && JsonValue.Bool(thread, "canAcceptDirectInput") != true) throw new InvalidDataException("Thread does not accept direct input.");
        var waiting = state.TryGetProperty("activeFlags", out var flags) && flags.EnumerateArray().Any(f => f.GetString() is "waitingOnApproval" or "waitingOnUserInput");
        var goalStatus = goal.ValueKind == JsonValueKind.Null ? null : JsonValue.String(goal, "status");
        if (goal.ValueKind != JsonValueKind.Null && goalStatus is not ("active" or "paused" or "blocked" or "complete" or "usageLimited" or "budgetLimited"))
            throw new InvalidDataException("Unknown goal status.");
        string? turnId = null, turnStatus = null, messageId = null;
        long? started = null;
        if (last.ValueKind == JsonValueKind.Object)
        {
            turnId = JsonValue.String(last, "id"); turnStatus = JsonValue.String(last, "status");
            if (turnId == null || turnStatus is not ("inProgress" or "completed" or "interrupted" or "failed")) throw new InvalidDataException("Unknown turn state.");
            var seconds = JsonValue.Long(last, "startedAt"); started = seconds == null ? null : checked(seconds * 1000);
            if (last.TryGetProperty("items", out var items))
                foreach (var item in items.EnumerateArray())
                    if (JsonValue.String(item, "type") == "userMessage") { messageId = JsonValue.String(item, "clientId") ?? JsonValue.String(item, "id"); break; }
        }
        var quotaError = last.ValueKind == JsonValueKind.Object && turnStatus == "failed" &&
            last.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object &&
            JsonValue.String(error, "codexErrorInfo") == "usageLimitExceeded" ? "usageLimitExceeded" : null;
        var completed = last.ValueKind == JsonValueKind.Object ? JsonValue.Long(last, "completedAt") : null;
        return new(id, owner, status, waiting, goalStatus, JsonValue.String(thread, "name"), status == "notLoaded" ? "notLoaded" : "resumed", turnId, turnStatus, messageId, started, quotaError, completed == null ? null : checked(completed * 1000));
    }
    internal async Task<JsonElement> StartTurnAsync(DesktopThreadState expected, object parameters, CancellationToken cancellation)
    {
        if (expected.Owner != _owner) throw new IOException("Desktop owner changed.");
        if (expected.LastTurnId == null) throw new InvalidOperationException("There is no previous turn to continue.");
        await RefreshAsync(cancellation);
        var current = Threads.SingleOrDefault(t => t.Id == expected.Id);
        if (current == null || current.Status != "idle" || current.Waiting || current.LastTurnId != expected.LastTurnId ||
            Threads.Any(t => t.Id != current.Id && (t.Status == "active" || t.Waiting)) || Activity.Queued != 0)
            throw new InvalidOperationException("Desktop state changed before continuation.");
        var envelope = JsonSerializer.SerializeToElement(parameters);
        if (JsonValue.String(envelope, "conversationId") != expected.Id) throw new InvalidDataException("Wrong continuation thread.");
        var request = envelope.GetProperty("turnStart").GetProperty("request");
        if (JsonValue.String(request, "threadId") != expected.Id || !Guid.TryParse(JsonValue.String(request, "clientUserMessageId"), out _))
            throw new InvalidDataException("Invalid continuation identity.");
        return await RequestAsync("monitor/start-turn", new { expectedOwner = _owner, expectedTurnId = expected.LastTurnId, request }, cancellation);
    }
    private async Task<JsonElement> RequestAsync(string method, object parameters, CancellationToken cancellation)
    {
        if (_reader.IsCompleted) { await _reader; throw new EndOfStreamException(); }
        var id = Guid.NewGuid().ToString("N");
        var reply = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = reply;
        try
        {
            var line = JsonSerializer.Serialize(new { id, method, @params = parameters });
            await _writes.WaitAsync(cancellation);
            try { await _output.WriteLineAsync(line.AsMemory(), cancellation); }
            finally { _writes.Release(); }
            return await reply.Task.WaitAsync(TimeSpan.FromSeconds(35), cancellation);
        }
        finally { _pending.TryRemove(id, out _); }
    }
    private async Task ReadAsync()
    {
        try
        {
            while (await _input.ReadLineAsync(_stop.Token) is string line)
            {
                using var document = JsonDocument.Parse(line); var response = document.RootElement;
                var id = JsonValue.String(response, "id");
                if (id == null || !_pending.TryGetValue(id, out var pending)) continue;
                if (response.TryGetProperty("error", out var error)) pending.TrySetException(new NativeRequestException(error));
                else pending.TrySetResult(response.GetProperty("result").Clone());
            }
        }
        catch (OperationCanceledException) when (_stop.IsCancellationRequested) { }
        catch (Exception error) when (error is IOException or JsonException or InvalidOperationException or ObjectDisposedException) { }
        finally { foreach (var reply in _pending.Values) reply.TrySetException(new IOException("Desktop relay disconnected.")); }
    }
    public async ValueTask DisposeAsync()
    {
        _stop.Cancel(); await _pipe.DisposeAsync(); await _reader;
        _input.Dispose();
        try { _output.Dispose(); } catch (ObjectDisposedException) { } catch (IOException) { }
        _stop.Dispose();
    }
    private sealed class NativeRequestException(JsonElement error) : IOException("Desktop relay request rejected.")
    {
        internal bool EmptyHistory { get; } = (JsonValue.String(error, "message") ?? "").Contains("thread/turns/list is unavailable before first user message", StringComparison.Ordinal);
    }
}
