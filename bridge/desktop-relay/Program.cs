using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace CodexMonitorRelay;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
            var config = JsonSerializer.Deserialize<Bootstrap>(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "CodexMonitorRelay.bootstrap.json")), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? throw new InvalidDataException();
            var native = Path.GetFullPath(config.NativeExecutable);
            if (!File.Exists(native) || string.Equals(native, Environment.ProcessPath, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException();
            var home = RelayProtocol.CanonicalHome(Environment.GetEnvironmentVariable("CODEX_HOME") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex"));
            var desktop = OperatingSystem.IsWindows() && RelayProtocol.IsStdioServer(args) && string.Equals(home, RelayProtocol.CanonicalHome(config.Home), StringComparison.OrdinalIgnoreCase) && ParentImage.Matches(config.DesktopExecutable);
            var start = new ProcessStartInfo(native) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8 };
            foreach (var arg in args) start.ArgumentList.Add(arg);
            using var child = Process.Start(start) ?? throw new IOException();
            using var job = OperatingSystem.IsWindows() ? KillOnCloseJob.Create(child) : null;
            if (!desktop)
            {
                var input = Task.Run(async () => { try { await Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream); } finally { try { child.StandardInput.Close(); } catch { } } });
                var output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
                var error = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
                await child.WaitForExitAsync();
                await Task.WhenAll(output, error);
                return child.ExitCode;
            }
            using var relay = new Relay(child, home);
            return await relay.RunAsync();
        }
        catch { await Console.Error.WriteLineAsync("Codex Monitor Relay nelze spustit. Zkontrolujte jeho místní konfiguraci."); return 78; }
    }
    private sealed record Bootstrap(string NativeExecutable, string DesktopExecutable, string Home);
}

internal sealed class Relay(Process native, string home) : IDisposable
{
    private readonly StreamReader desktopInput = new(Console.OpenStandardInput(), new UTF8Encoding(false, true), false, 65536, true);
    private readonly StreamWriter desktopOutput = new(Console.OpenStandardOutput(), new UTF8Encoding(false, true), 65536, true) { AutoFlush = true, NewLine = "\n" };
    private readonly string owner = Guid.NewGuid().ToString("D");
    private readonly string prefix = "__codex_monitor_" + Guid.NewGuid().ToString("N") + "_";
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> pending = new();
    private readonly SemaphoreSlim nativeWrite = new(1, 1), dispatch = new(1, 1);
    private readonly CancellationTokenSource stop = new();
    private long sequence;
    private readonly ConcurrentDictionary<string, byte> sentMessages = new();
    private volatile bool initialized;
    private string? initializeRequestId;
    private readonly SemaphoreSlim pipeSlots = new(4, 4);
    public async Task<int> RunAsync()
    {
        var output = ReadNativeAsync();
        var error = native.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
        var input = Task.Run(ReadDesktopAsync);
        var pipes = ListenAsync();
        var exited = native.WaitForExitAsync();
        var ended = await Task.WhenAny(exited, output, input);
        if (ended != exited)
        {
            try { native.StandardInput.Close(); } catch { }
            try { await exited.WaitAsync(TimeSpan.FromSeconds(5)); }
            catch { try { native.Kill(true); } catch { } await exited; }
        }
        stop.Cancel();
        foreach (var request in pending.Values) request.TrySetException(new IOException("Původní server skončil."));
        await Task.WhenAll(output, error);
        try { await pipes; } catch (Exception listenerError) when (listenerError is OperationCanceledException or IOException or UnauthorizedAccessException) { }
        return native.ExitCode;
    }
    private async Task ReadDesktopAsync()
    {
        try
        {
            while (await desktopInput.ReadLineAsync(stop.Token) is { } line)
            {
                // Approval and tool replies must remain deliverable while a
                // monitor request validates state; only new commands are gated.
                var isReply = false;
                try { using var message = JsonDocument.Parse(line); isReply = !message.RootElement.TryGetProperty("method", out _); } catch (JsonException) { }
                if (isReply) { await WriteNativeAsync(line, stop.Token); continue; }
                await dispatch.WaitAsync(stop.Token);
                try
                {
                    try
                    {
                        using var request = JsonDocument.Parse(line);
                        if (request.RootElement.TryGetProperty("method", out var operation) && operation.GetString() == "initialize" && request.RootElement.TryGetProperty("id", out var requestId))
                            Volatile.Write(ref initializeRequestId, requestId.GetRawText());
                    }
                    catch (JsonException) { }
                    await WriteNativeAsync(line, stop.Token);
                    try { using var doc = JsonDocument.Parse(line); if (doc.RootElement.TryGetProperty("method", out var method) && method.GetString() == "initialized") initialized = true; } catch (JsonException) { }
                }
                finally { dispatch.Release(); }
            }
        }
        catch (OperationCanceledException) when (stop.IsCancellationRequested) { return; }
        catch { }
        finally
        {
            try { native.StandardInput.Close(); } catch { }
            try { await native.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)); } catch { try { native.Kill(true); } catch { } }
        }
    }
    private async Task ReadNativeAsync()
    {
        while (await native.StandardOutput.ReadLineAsync() is { } line)
        {
            var own = false;
            try
            {
                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                if (!root.TryGetProperty("method", out _) && root.TryGetProperty("id", out var responseId) &&
                    responseId.GetRawText() == Volatile.Read(ref initializeRequestId) && root.TryGetProperty("result", out _)) initialized = true;
                if (!root.TryGetProperty("method", out _) && root.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && id.GetString() is { } key && key.StartsWith(prefix, StringComparison.Ordinal))
                {
                    own = true; // Also consume timed-out and disconnected responses.
                    if (pending.TryRemove(key, out var completion)) completion.TrySetResult(root.Clone());
                }
            }
            catch (JsonException) { }
            if (!own) { await desktopOutput.WriteLineAsync(line); }
        }
    }
    private async Task WriteNativeAsync(string line, CancellationToken cancellation)
    {
        await nativeWrite.WaitAsync(cancellation);
        try { await native.StandardInput.WriteLineAsync(line.AsMemory(), cancellation); await native.StandardInput.FlushAsync(cancellation); }
        finally { nativeWrite.Release(); }
    }
    private async Task<JsonElement> RequestAsync(string method, object parameters, CancellationToken cancellation, Action? written = null)
    {
        var key = prefix + Interlocked.Increment(ref sequence);
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[key] = completion;
        try
        {
            await WriteNativeAsync(JsonSerializer.Serialize(new { id = key, method, @params = parameters }), cancellation);
            written?.Invoke();
            var response = await completion.Task.WaitAsync(TimeSpan.FromSeconds(30), cancellation);
            return response;
        }
        finally { pending.TryRemove(key, out _); }
    }
    private async Task<JsonElement> ResultAsync(string method, object parameters, CancellationToken cancellation)
    {
        var response = await RequestAsync(method, parameters, cancellation);
        if (!response.TryGetProperty("result", out var result)) throw new InvalidDataException("Server nemohl ověřit stav chatu.");
        return result;
    }
    private async Task PreflightAsync(string threadId, string? expectedTurnId, CancellationToken cancellation)
    {
        var found = false;
        string? cursor = null;
        var cursors = new HashSet<string>(StringComparer.Ordinal);
        do
        {
            var page = await ResultAsync("thread/loaded/list", new { cursor, limit = 100 }, cancellation);
            foreach (var id in page.GetProperty("data").EnumerateArray())
            {
                var value = id.GetString() ?? throw new InvalidDataException();
                var read = await ResultAsync("thread/read", new { threadId = value, includeTurns = false }, cancellation);
                var thread = read.GetProperty("thread");
                if (!RelayProtocol.IsRoot(thread)) continue;
                if (!RelayProtocol.IsIdle(thread)) throw new InvalidDataException("Jiný chat běží nebo čeká na zásah.");
                if (thread.TryGetProperty("ephemeral", out var ephemeral) && ephemeral.ValueKind == JsonValueKind.True)
                {
                    if (value == threadId) throw new InvalidDataException("Dočasný chat nelze převést mezi účty.");
                    continue;
                }
                var queue = await ResultAsync("thread/queue/list", new { threadId = value, limit = 1 }, cancellation);
                if (queue.GetProperty("data").GetArrayLength() != 0 || (queue.TryGetProperty("nextCursor", out var next) && next.ValueKind != JsonValueKind.Null)) throw new InvalidDataException("Chat má čekající zprávy.");
                if (value == threadId)
                {
                    if (!thread.TryGetProperty("canAcceptDirectInput", out var allowed) || allowed.ValueKind != JsonValueKind.True) throw new InvalidDataException("Chat nepřijímá přímý vstup.");
                    found = true;
                }
            }
            cursor = page.TryGetProperty("nextCursor", out var nextCursor) && nextCursor.ValueKind == JsonValueKind.String ? nextCursor.GetString() : null;
            if (cursor != null && !cursors.Add(cursor)) throw new InvalidDataException("Neplatné stránkování chatů.");
        } while (cursor != null);
        if (!found) throw new InvalidDataException("Vybraný chat není načtený v desktopu.");
        var turns = await ResultAsync("thread/turns/list", new { threadId, limit = 1, sortDirection = "desc", itemsView = "notLoaded" }, cancellation);
        var last = turns.GetProperty("data").EnumerateArray().FirstOrDefault();
        var lastId = last.ValueKind == JsonValueKind.Object ? last.GetProperty("id").GetString() : null;
        if (lastId != expectedTurnId) throw new InvalidDataException("Původní tah se změnil; pokračování nebylo odesláno.");
    }
    private async Task ListenAsync()
    {
        while (!stop.IsCancellationRequested)
        {
            await pipeSlots.WaitAsync(stop.Token);
            var pipe = new NamedPipeServerStream(RelayProtocol.PipeName(home), PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            try { await pipe.WaitForConnectionAsync(stop.Token); }
            catch { pipe.Dispose(); pipeSlots.Release(); throw; }
            _ = ServeAndReleaseAsync(pipe);
        }
    }
    private async Task ServeAndReleaseAsync(NamedPipeServerStream pipe)
    {
        try { await ServeAsync(pipe); }
        catch (Exception error) when (error is IOException or OperationCanceledException or ObjectDisposedException) { }
        finally { pipeSlots.Release(); }
    }
    private async Task ServeAsync(NamedPipeServerStream pipe)
    {
        using (pipe)
        using (var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true))
        using (var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true })
        {
            try
            {
                while (await reader.ReadLineAsync(stop.Token) is { } line)
                {
                    JsonElement id = default;
                    try
                    {
                        if (line.Length > 1048576) throw new InvalidDataException();
                        using var document = JsonDocument.Parse(line);
                        var request = document.RootElement;
                        id = request.GetProperty("id").Clone();
                        if (id.ValueKind is not (JsonValueKind.String or JsonValueKind.Number)) throw new InvalidDataException("Neplatné ID požadavku.");
                        var method = request.GetProperty("method").GetString() ?? throw new InvalidDataException();
                        if (method == "monitor/hello")
                        {
                            await writer.WriteLineAsync(JsonSerializer.Serialize(new { id, result = new { protocol = 1, owner, home, nativePid = native.Id, ready = initialized } }));
                            continue;
                        }
                        if (!initialized) throw new InvalidDataException("Desktop dosud nedokončil inicializaci.");
                        var parameters = request.TryGetProperty("params", out var supplied) ? supplied.Clone() : JsonSerializer.SerializeToElement(new { });
                        if (method != "monitor/start-turn") RelayProtocol.Validate(method, parameters);
                        JsonElement response;
                        if (method == "monitor/start-turn")
                        {
                            if (parameters.GetProperty("expectedOwner").GetString() != owner) throw new InvalidDataException("Vlastník chatu se změnil.");
                            var expectedTurnId = parameters.GetProperty("expectedTurnId").GetString();
                            parameters = parameters.GetProperty("request").Clone();
                            RelayProtocol.Validate("turn/start", parameters);
                            await dispatch.WaitAsync(stop.Token);
                            var locked = true;
                            try
                            {
                                var threadId = parameters.GetProperty("threadId").GetString()!;
                                var messageId = parameters.GetProperty("clientUserMessageId").GetString()!;
                                await PreflightAsync(threadId, expectedTurnId, stop.Token);
                                if (!sentMessages.TryAdd(threadId + ":" + messageId, 0)) throw new InvalidDataException("Toto pokračování již bylo odesláno; ověřte jeho výsledek.");
                                response = await RequestAsync("turn/start", parameters, stop.Token, () => { locked = false; dispatch.Release(); });
                            }
                            finally { if (locked) dispatch.Release(); }
                        }
                        else if (method == "turn/start") throw new InvalidDataException("Pokračování vyžaduje ověření původního tahu.");
                        else response = await RequestAsync(method, parameters, stop.Token);
                        if (response.TryGetProperty("result", out var result)) await writer.WriteLineAsync(JsonSerializer.Serialize(new { id, result }));
                        else await writer.WriteLineAsync(JsonSerializer.Serialize(new { id, error = response.GetProperty("error") }));
                    }
                    catch (Exception error) when (error is not OperationCanceledException)
                    {
                        // Only fixed local messages are returned. Never include native diagnostics.
                        var message = error is TimeoutException ? "Čas požadavku vypršel. Pokračování neopakujte bez ověření." : "Požadavek nebyl povolen nebo stav desktopu nebyl bezpečně ověřen.";
                        await writer.WriteLineAsync(JsonSerializer.Serialize(new { id = id.ValueKind == JsonValueKind.Undefined ? (object?)null : id, error = new { code = -32000, message } }));
                    }
                }
            }
            catch (Exception error) when (error is IOException or OperationCanceledException or ObjectDisposedException) { }
        }
    }
    public void Dispose() { stop.Cancel(); stop.Dispose(); }
}

internal static class ParentImage
{
    [StructLayout(LayoutKind.Sequential)] private struct BasicInfo { public nint Reserved1, Peb, Reserved2, Reserved3, Pid, ParentPid; }
    [DllImport("ntdll.dll")] private static extern int NtQueryInformationProcess(nint process, int informationClass, ref BasicInfo info, int size, out int returnLength);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern nint OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool QueryFullProcessImageName(nint process, uint flags, StringBuilder name, ref int size);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(nint handle);
    public static bool Matches(string expected)
    {
        var info = new BasicInfo();
        if (NtQueryInformationProcess(Process.GetCurrentProcess().Handle, 0, ref info, Marshal.SizeOf<BasicInfo>(), out _) != 0) return false;
        var handle = OpenProcess(0x1000, false, checked((int)info.ParentPid));
        if (handle == 0) return false;
        try { var name = new StringBuilder(32768); var size = name.Capacity; return QueryFullProcessImageName(handle, 0, name, ref size) && string.Equals(Path.GetFullPath(expected), Path.GetFullPath(name.ToString()), StringComparison.OrdinalIgnoreCase); }
        finally { CloseHandle(handle); }
    }
}

internal sealed class KillOnCloseJob : IDisposable
{
    private nint handle;
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits { public long ProcessTime, JobTime; public uint Flags; public nuint MinSet, MaxSet; public uint Active; public nuint Affinity; public uint Priority, Scheduling; }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits { public BasicLimits Basic; public IoCounters Io; public nuint ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern nint CreateJobObject(nint attrs, string? name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(nint job, int kind, ref ExtendedLimits info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(nint job, nint process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(nint handle);
    public static KillOnCloseJob Create(Process child)
    {
        var result = new KillOnCloseJob { handle = CreateJobObject(0, null) };
        var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000;
        if (result.handle == 0 || !SetInformationJobObject(result.handle, 9, ref limits, (uint)Marshal.SizeOf<ExtendedLimits>()) || !AssignProcessToJobObject(result.handle, child.Handle))
        {
            result.Dispose(); try { child.Kill(true); } catch { } throw new IOException("Nelze zajistit životní cyklus procesu.");
        }
        return result;
    }
    public void Dispose() { if (handle != 0) { CloseHandle(handle); handle = 0; } }
}
