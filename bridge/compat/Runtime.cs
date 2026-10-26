using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace CodexAccountDesk;

internal sealed class RuntimeHome : IAsyncDisposable
{
    public string Path { get; }
    private readonly string _root;
    private bool _preserve;
    internal void CredentialsSaved()
    {
        MarkSaved(Path);
        _preserve=false;
    }
    private static void MarkSaved(string path) => SecureFiles.AtomicWriteText(System.IO.Path.Combine(path,"credentials.saved"),"committed");
    public RuntimeHome(string dataDirectory, string? authJson)
    {
        _preserve=true;
        _root = System.IO.Path.Combine(dataDirectory, "runtime");
        Directory.CreateDirectory(_root);
        Path = System.IO.Path.Combine(_root, Guid.NewGuid().ToString("N"));
        SecureFiles.CreatePrivateDirectory(Path);
        if (authJson != null) SecureFiles.AtomicWriteText(System.IO.Path.Combine(Path, "auth.json"), authJson);
        using var owner = Process.GetCurrentProcess();
        SecureFiles.AtomicWriteText(System.IO.Path.Combine(Path, "owner.json"), JsonSerializer.Serialize(new { pid = owner.Id, startedAt = owner.StartTime.ToUniversalTime().Ticks, sourceAuthHash = authJson == null ? null : Hash(authJson) }));
    }
    public string ReadAuth()
    {
        var file = System.IO.Path.Combine(Path, "auth.json");
        return OperatingSystem.IsLinux() ? new System.Text.UTF8Encoding(false, true).GetString(SecureFiles.ReadPrivateBytes(file)) : File.ReadAllText(file);
    }
    public async ValueTask DisposeAsync()
    {
        if(_preserve&&File.Exists(System.IO.Path.Combine(Path,"auth.json")))return;
        // Windows may release the child process file handles shortly after exit.
        // Preserve the account query/refresh result instead of replacing it with
        // an unrelated temporary-directory cleanup exception.
        for(var attempt=0;attempt<4;attempt++)
        {
            try { SecureFiles.DeleteOwnedRuntime(_root, Path); return; }
            catch(IOException) { if(attempt<3)await Task.Delay(150); }
            catch(UnauthorizedAccessException) { if(attempt<3)await Task.Delay(150); }
        }
        // Owner metadata is retained; CleanupStale can remove it on next start.
    }
    internal static string Hash(string value) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value)));
    internal static bool CanRecover(string expectedHash, string current, string candidate)
        => Hash(current)==expectedHash && AuthDocument.Parse(current).Key==AuthDocument.Parse(candidate).Key;
    public static void RecoverStale(AccountVault vault, string? canonical)
    {
        var root=System.IO.Path.Combine(vault.DirectoryPath,"runtime");
        if(!Directory.Exists(root))return;
        foreach(var directory in Directory.GetDirectories(root))
        {
            if(!Guid.TryParseExact(System.IO.Path.GetFileName(directory),"N",out _))continue;
            var ownerFile=System.IO.Path.Combine(directory,"owner.json");
            var authFile=System.IO.Path.Combine(directory,"auth.json");
            if(!File.Exists(ownerFile)||!File.Exists(authFile))continue;
            using var owner=JsonDocument.Parse(File.ReadAllText(ownerFile));
            var pid=JsonValue.Int(owner.RootElement,"pid"); var ticks=JsonValue.Long(owner.RootElement,"startedAt");
            var hash=JsonValue.String(owner.RootElement,"sourceAuthHash");
            if(pid==null||ticks==null||hash==null)continue;
            try { using var process=Process.GetProcessById(pid.Value); if(process.StartTime.ToUniversalTime().Ticks==ticks)continue; }
            catch(ArgumentException) { }
            var candidate=File.ReadAllText(authFile);
            var identity=AuthDocument.Parse(candidate);
            lock(vault.SyncRoot)
            {
                var profile=vault.Data.Accounts.Find(a=>a.Key==identity.Key);
                if(profile==null||SessionCredentialPolicy.IsDesktopOwned(profile.Key,profile.RequiresApply,canonical))continue;
                // Recover only a child of the exact credential revision still in the vault.
                // Never replace a newer login or the active desktop's session with an orphan.
                if(CanRecover(hash,profile.AuthJson,candidate)) { vault.Upsert(candidate); vault.Save(); MarkSaved(directory); }
            }
        }
    }
    public static void CleanupStale(string dataDirectory)
    {
        var root = System.IO.Path.Combine(dataDirectory, "runtime");
        if (!Directory.Exists(root)) return;
        foreach (var path in Directory.GetDirectories(root))
        {
            if (!Guid.TryParseExact(System.IO.Path.GetFileName(path), "N", out _)) continue;
            var ownerFile = System.IO.Path.Combine(path, "owner.json");
            if (!File.Exists(ownerFile)) continue;
            using var owner = JsonDocument.Parse(File.ReadAllText(ownerFile));
            var pid = JsonValue.Int(owner.RootElement, "pid");
            var startTicks = JsonValue.Long(owner.RootElement, "startedAt");
            if (pid == null || startTicks == null) continue;
            var alive = false;
            try { using var process = Process.GetProcessById(pid.Value); alive = process.StartTime.ToUniversalTime().Ticks == startTicks; }
            catch (ArgumentException) { }
            // Recovery may deliberately skip an active or newer credential. Do not
            // erase that uncommitted evidence merely because its old owner exited.
            if (!alive && (!File.Exists(System.IO.Path.Combine(path,"auth.json")) || File.Exists(System.IO.Path.Combine(path,"credentials.saved"))))
                SecureFiles.DeleteOwnedRuntime(root, path);
        }
    }
}
