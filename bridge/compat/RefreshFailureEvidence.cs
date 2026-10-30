using System;
using System.Text.RegularExpressions;
namespace CodexAccountDesk;

// Only fixed error codes leave the child stderr stream. Never retain raw lines.
internal static class RefreshFailureEvidence
{
    internal static string? Code(string text)
    {
        foreach(var code in new[]{"invalid_grant","invalid_refresh_token","refresh_token_expired","refresh_token_invalidated","refresh_token_reused","refresh_token_revoked"})
            if(Regex.IsMatch(text,@"(?<![a-zA-Z0-9_])"+code+@"(?![a-zA-Z0-9_])",RegexOptions.IgnoreCase))return code;
        foreach(var pair in new[]{("refresh token has already been used","refresh_token_reused"),("refresh token was already used","refresh_token_reused"),("refresh token has expired","refresh_token_expired"),("refresh token has been revoked","refresh_token_revoked"),("refresh token has been invalidated","refresh_token_invalidated")})
            if(text.Contains(pair.Item1,StringComparison.OrdinalIgnoreCase))return pair.Item2;
        return null;
    }
}
