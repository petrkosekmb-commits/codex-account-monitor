using System;
using System.IO;
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
