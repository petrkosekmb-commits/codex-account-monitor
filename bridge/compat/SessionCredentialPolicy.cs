using System;
using System.IO;
using System.Collections.Generic;
namespace CodexAccountDesk;
internal sealed class SessionCredentialException(string code) : IOException(code)
{ public string Code { get; } = code; }
internal static class SessionCredentialPolicy
{
    internal static readonly System.Collections.Concurrent.ConcurrentDictionary<string,string> Diagnostics=new();
    internal static string Diagnostic(Exception error)
    {
        var words=new[]{"expired","already","used","revoked","invalid","401","403","429","refresh","auth","network","timeout","token","denied","forbidden","retry","sign","certificate","tls","invalid_grant","refresh_token_reused","refresh_token_expired","access_token","expired_token","token_expired","deactivated","account_deactivated"};
        return (error is SessionCredentialException session ? session.Code : error.GetType().Name)+(error is CodexRequestException request?"/"+request.Operation:"")+":"+string.Join(",",System.Linq.Enumerable.Where(words,w=>error.Message.Contains(w,StringComparison.OrdinalIgnoreCase)));
    }
    internal const string RefreshPending="desktop_session_refresh_pending";
    internal const string Retry="usage_check_retry";
    internal const string Reauthenticate="session_reauthentication_required";
    internal static bool IsDesktopOwned(string key,bool requiresApply,string? canonical)
        => !requiresApply && canonical != null && AuthDocument.Parse(canonical).Key == key;
    internal static string ClassifyFailure(string message)
    {
        // A generic 401, timeout or mention of auth/refresh does not establish
        // that a refresh grant is invalid. Match only known terminal failures.
        foreach(var code in new[]{"invalid_grant","invalid_refresh_token","refresh_token_expired","refresh_token_invalidated","refresh_token_reused","refresh_token_revoked"})
            if(message.Contains(code,StringComparison.OrdinalIgnoreCase))return Reauthenticate;
        foreach(var phrase in new[]{"refresh token has already been used","refresh token was already used","refresh token has expired","refresh token has been revoked","refresh token has been invalidated"})
            if(message.Contains(phrase,StringComparison.OrdinalIgnoreCase))return Reauthenticate;
        return Retry;
    }
}

// Only digests, timestamps and fixed status codes are persisted here, never tokens.
internal sealed class RefreshGuard
{
    internal sealed record Entry(string Credential, int Failures, long NextAttemptAt, bool Terminal, string Result, long UpdatedAt);
    private readonly string _file;
    private readonly object _sync = new();
    private readonly System.Collections.Generic.Dictionary<string,Entry> _entries;
    internal RefreshGuard(string directory)
    {
        _file=Path.Combine(directory,"refresh-health.json");
        _entries=File.Exists(_file)?System.Text.Json.JsonSerializer.Deserialize<System.Collections.Generic.Dictionary<string,Entry>>(File.ReadAllText(_file))??new():new();
    }
    private void Save() => SecureFiles.AtomicWriteText(_file,System.Text.Json.JsonSerializer.Serialize(_entries));
    private static string Fingerprint(string credential)
    {
        using var auth=System.Text.Json.JsonDocument.Parse(credential);
        if(auth.RootElement.TryGetProperty("tokens",out var tokens) && tokens.TryGetProperty("refresh_token",out var token) && token.ValueKind==System.Text.Json.JsonValueKind.String && !string.IsNullOrEmpty(token.GetString()))
            return RuntimeHome.Hash(token.GetString()!);
        return RuntimeHome.Hash(credential);
    }
    internal object? Status(string key)
    {
        lock(_sync)return _entries.TryGetValue(RuntimeHome.Hash(key),out var e)?new {e.Failures,e.NextAttemptAt,e.Terminal,e.Result,e.UpdatedAt}:null;
    }
    internal void Begin(string key,string credential,long now)
    {
        lock(_sync)
        {
            var id=RuntimeHome.Hash(key);var hash=Fingerprint(credential);
            var old=_entries.GetValueOrDefault(id);
            if(old?.Credential==hash)
            {
                if(old.Terminal)throw new SessionCredentialException(SessionCredentialPolicy.Reauthenticate);
                if(now<old.NextAttemptAt)throw new SessionCredentialException("session_refresh_backoff");
            }
            // Persist before contacting the refresh endpoint, including across restarts.
            _entries[id]=new(hash,old?.Credential==hash?old.Failures:0,now+10*60*1000,false,"refresh_started",now);Save();
        }
    }
    internal void Failed(string key,string credential,bool terminal,long now)
    {
        lock(_sync)
        {
            var id=RuntimeHome.Hash(key);var hash=Fingerprint(credential);var old=_entries.GetValueOrDefault(id);
            var failures=Math.Min(16,(old?.Credential==hash?old.Failures:0)+1);
            var delay=Math.Min(30*60*1000L,60*1000L*(1L<<Math.Min(failures,5)));
            _entries[id]=new(hash,failures,terminal?long.MaxValue:now+delay,terminal,terminal?"refresh_rejected":"refresh_retry_later",now);Save();
        }
    }
    internal void Succeeded(string key,long now)
    {
        lock(_sync)
        {
            var id=RuntimeHome.Hash(key);
            if(!_entries.TryGetValue(id,out var old)||old.Result=="verified")return;
            _entries[id]=old with {Failures=0,NextAttemptAt=0,Terminal=false,Result="verified",UpdatedAt=now};Save();
        }
    }
}
