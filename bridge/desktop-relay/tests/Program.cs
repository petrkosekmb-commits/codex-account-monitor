using System.Diagnostics;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using CodexMonitorRelay;

internal static class RelayTests
{
    private const string ThreadId = "00000000-0000-0000-0000-000000000001";
    private const string EphemeralId = "00000000-0000-0000-0000-000000000002";
    private static Process Start(params string[] arguments)
    {
        var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = new UTF8Encoding(false) };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        return Process.Start(start)!;
    }
    public static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false); Console.InputEncoding = new UTF8Encoding(false);
        if (args.FirstOrDefault() == "--native") { await Native(); return 0; }
        if (args.FirstOrDefault() == "--relay")
        {
            // Reproduce a Windows caller with a non-UTF8 console code page.
            // Production relay streams must not inherit these text encoders.
            Console.OutputEncoding = Encoding.Latin1; Console.InputEncoding = Encoding.Latin1;
            using var native = Start("--native"); using var job = KillOnCloseJob.Create(native);
            using var relay = new Relay(native, args[1]); return await relay.RunAsync();
        }
        Check(RelayProtocol.IsStdioServer(new[] { "-c", "features.code_mode_host=true", "app-server", "--analytics-default-enabled", "-c", "foo=true" }), "desktop global config flags select relay");
        Check(!RelayProtocol.IsStdioServer(new[] { "app-server", "proxy" }) && !RelayProtocol.IsStdioServer(new[] { "app-server", "--listen", "ws://127.0.0.1:1234" }) && !RelayProtocol.IsStdioServer(new[] { "exec", "resume" }), "other commands stay passthrough");
        var parameters = new { threadId = ThreadId, clientUserMessageId = Guid.NewGuid().ToString(), input = new[] { new { type = "text", text = "Continue", text_elements = Array.Empty<object>() } } };
        RelayProtocol.Validate("turn/start", JsonSerializer.SerializeToElement(parameters));
        var rejected = false;
        try { RelayProtocol.Validate("turn/start", JsonSerializer.SerializeToElement(new { parameters.threadId, parameters.clientUserMessageId, parameters.input, approvalPolicy = "never" })); } catch (InvalidDataException) { rejected = true; }
        Check(rejected, "relay rejects settings changes");
        rejected = false; try { RelayProtocol.Validate("account/rateLimits/reset", JsonSerializer.SerializeToElement(new { })); } catch (InvalidDataException) { rejected = true; }
        Check(rejected, "relay rejects reset redemption");
        var home = Path.Combine(Path.GetTempPath(), "relay-contract-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(home);
        using var process = Start("--relay", home);
        try
        {
            await process.StandardInput.WriteLineAsync("{\"id\":7,\"method\":\"initialize\",\"params\":{}}"); await process.StandardInput.FlushAsync();
            var initialized = JsonDocument.Parse((await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)))!);
            Check(initialized.RootElement.GetProperty("id").GetInt32() == 7, "desktop response IDs pass through unchanged");
            var unicode = string.Concat(Enumerable.Repeat("Příliš žluťoučký kůň úpěl ďábelské ódy. € \u2028 \u2029 \u0085 ", 10000));
            var raw = JsonSerializer.Serialize(new { id = "unicode", method = "fixture/echo", @params = new { text = unicode } }, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
            await process.StandardInput.WriteLineAsync(raw); await process.StandardInput.FlushAsync();
            var echoed = JsonDocument.Parse((await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)))!);
            Check(echoed.RootElement.GetProperty("result").GetProperty("text").GetString() == unicode, "long UTF8 request and response survive non-UTF8 Windows console defaults");
            // Current desktop needs no extra initialized notification after
            // the successful initialize reply. Readiness follows that reply.
            await using var pipe = new NamedPipeClientStream(".", RelayProtocol.PipeName(home), PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            await pipe.ConnectAsync(10000);
            var input = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true);
            var output = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
            async Task<JsonElement> Request(string id, string method, object param)
            {
                await output.WriteLineAsync(JsonSerializer.Serialize(new { id, method, @params = param }));
                return JsonDocument.Parse((await input.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)))!).RootElement.Clone();
            }
            var hello = await Request("hello", "monitor/hello", new { });
            Check(hello.GetProperty("result").GetProperty("protocol").GetInt32() == 1 && hello.GetProperty("result").GetProperty("ready").GetBoolean(), "private pipe ready after successful initialize without extra notification");
            var list = await Request("list", "thread/loaded/list", new { });
            Check(list.GetProperty("id").GetString() == "list" && list.GetProperty("result").GetProperty("data")[0].GetString() == ThreadId, "monitor response routes only to requesting pipe");
            var startRequest = new { expectedOwner = hello.GetProperty("result").GetProperty("owner").GetString(), expectedTurnId = "old-turn", request = parameters };
            var started = await Request("start", "monitor/start-turn", startRequest);
            Check(started.TryGetProperty("result", out var receipt) && receipt.GetProperty("turn").GetProperty("id").GetString() == "new-turn", "exact idle chat receives one continuation");
            var notification = JsonDocument.Parse((await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)))!);
            Check(notification.RootElement.GetProperty("method").GetString() == "turn/started", "turn notifications still reach desktop");
            var duplicate = await Request("duplicate", "monitor/start-turn", startRequest);
            Check(duplicate.TryGetProperty("error", out _), "duplicate continuation is rejected");
            output.Dispose(); input.Dispose(); await pipe.DisposeAsync();
            await process.StandardInput.WriteLineAsync("{\"id\":8,\"method\":\"fixture/count\"}"); await process.StandardInput.FlushAsync();
            var count = JsonDocument.Parse((await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)))!);
            Check(count.RootElement.GetProperty("result").GetProperty("starts").GetInt32() == 1, "monitor disconnect leaves desktop server running without a resend");
            process.StandardInput.Close(); await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
            Check(process.ExitCode == 0, "desktop EOF shuts down relay and native child");
        }
        finally { if (!process.HasExited) process.Kill(true); Directory.Delete(home); }
        return 0;
    }
    private static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine("PASS " + label); }
    private static async Task Native()
    {
        var starts = 0;
        while (await Console.In.ReadLineAsync() is string line)
        {
            using var doc = JsonDocument.Parse(line); var request = doc.RootElement;
            if (!request.TryGetProperty("id", out var id)) continue;
            var method = request.GetProperty("method").GetString();
            object result = method switch
            {
                "thread/loaded/list" => new { data = new[] { ThreadId, EphemeralId }, nextCursor = (string?)null },
                "thread/read" => new { thread = new { id = request.GetProperty("params").GetProperty("threadId").GetString(), ephemeral = request.GetProperty("params").GetProperty("threadId").GetString() == EphemeralId, parentThreadId = (string?)null, attachedToThreadId = (string?)null, status = new { type = "idle" }, canAcceptDirectInput = true } },
                "thread/queue/list" => new { data = Array.Empty<object>(), nextCursor = (string?)null },
                "thread/turns/list" => new { data = new[] { new { id = "old-turn" } } },
                "turn/start" => new { turn = new { id = "new-turn", status = "inProgress" } },
                "fixture/count" => new { starts },
                "fixture/echo" => request.GetProperty("params").Clone(),
                _ => new { }
            };
            if (method == "thread/queue/list" && request.GetProperty("params").GetProperty("threadId").GetString() == EphemeralId)
            {
                await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new { id, error = new { code = -32600, message = "ephemeral thread does not support queued submissions" } }));
                await Console.Out.FlushAsync(); continue;
            }
            if (method == "turn/start")
            {
                starts++; await Console.Out.WriteLineAsync("{\"method\":\"turn/started\",\"params\":{}}");
            }
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new { id, result }, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping })); await Console.Out.FlushAsync();
        }
    }
}
