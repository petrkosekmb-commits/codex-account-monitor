using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CodexMonitorRelay;

internal static class RelayProtocol
{
    private static readonly HashSet<string> ReadMethods = new(StringComparer.Ordinal)
    {
        "thread/loaded/list", "thread/read", "thread/turns/list", "thread/items/list",
        "thread/goal/get", "thread/queue/list"
    };
    public static string CanonicalHome(string path) => Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    public static string PipeName(string home) => "codex-account-monitor-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(CanonicalHome(home).ToUpperInvariant()))).ToLowerInvariant()[..24];
    public static bool IsStdioServer(string[] args)
    {
        var command = -1;
        for (var i = 0; i < args.Length; i++)
        {
            if (args[i] is "-c" or "--config" or "--enable" or "--disable") { i++; continue; }
            if (args[i].StartsWith("--config=", StringComparison.Ordinal)) continue;
            if (args[i] != "app-server") return false;
            command = i; break;
        }
        if (command < 0) return false;
        for (var i = command + 1; i < args.Length; i++)
        {
            if (args[i] is "-c" or "--config" or "--enable" or "--disable") { i++; continue; }
            if (args[i] == "daemon" || args[i] == "proxy" || args[i] == "--help" || args[i] == "-h" || args[i] == "generate-ts" || args[i] == "generate-json-schema") return false;
            if (args[i] == "--listen" && (i + 1 >= args.Length || args[++i] != "stdio://")) return false;
            if (args[i].StartsWith("--listen=", StringComparison.Ordinal) && args[i] != "--listen=stdio://") return false;
        }
        return true;
    }
    public static void Validate(string method, JsonElement parameters)
    {
        if (!ReadMethods.Contains(method) && method != "turn/start") throw new InvalidDataException("Metoda není povolena.");
        if (parameters.ValueKind != JsonValueKind.Object) throw new InvalidDataException("Parametry musí být objekt.");
        if (method != "thread/loaded/list" && (!parameters.TryGetProperty("threadId", out var id) || id.ValueKind != JsonValueKind.String || !Guid.TryParse(id.GetString(), out _))) throw new InvalidDataException("Chybí platné ID chatu.");
        if (method != "turn/start") return;
        foreach (var property in parameters.EnumerateObject())
            if (property.Name is not ("threadId" or "input" or "clientUserMessageId")) throw new InvalidDataException("Pokračování nesmí měnit nastavení chatu.");
        if (!parameters.TryGetProperty("clientUserMessageId", out var message) || message.ValueKind != JsonValueKind.String || !Guid.TryParse(message.GetString(), out _)) throw new InvalidDataException("Chybí platné ID pokračování.");
        if (!parameters.TryGetProperty("input", out var input) || input.ValueKind != JsonValueKind.Array || input.GetArrayLength() != 1) throw new InvalidDataException("Pokračování vyžaduje jednu textovou zprávu.");
        var item = input[0];
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("type", out var type) || type.GetString() != "text" || !item.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String || text.GetString() != "Continue") throw new InvalidDataException("Pokračování vyžaduje pevný pokyn Continue.");
        foreach (var property in item.EnumerateObject())
            if (property.Name is not ("type" or "text" or "text_elements")) throw new InvalidDataException("Nepovolený obsah pokračování.");
        if (item.TryGetProperty("text_elements", out var elements) && (elements.ValueKind != JsonValueKind.Array || elements.GetArrayLength() != 0)) throw new InvalidDataException("Pokračování nesmí přidávat externí obsah.");
    }
    public static bool IsRoot(JsonElement thread) => IsNull(thread, "parentThreadId") && IsNull(thread, "attachedToThreadId");
    private static bool IsNull(JsonElement value, string name) => value.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.Null;
    public static bool IsIdle(JsonElement thread) => thread.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.Object && status.TryGetProperty("type", out var type) && type.GetString() == "idle";
}
