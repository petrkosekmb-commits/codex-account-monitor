using System;
using System.Text.Json;
using System.Threading.Tasks;
namespace CodexAccountDesk;
internal static class InactiveUsageReader
{
    internal static async Task<JsonElement> ReadAsync(Func<string,object,Task<JsonElement>> request,Func<bool> ownsRefresh,string expectedEmail)
    {
        try{return await request("account/rateLimits/read",new{}).ConfigureAwait(false);}
        catch(CodexRequestException error) when(error.Operation=="account/rateLimits/read"&&error.Message.Contains("401",StringComparison.Ordinal))
        {
            // Usage may return 401 for an expired access token while its refresh
            // grant remains valid. Only the inactive registration owner renews it.
            return await RenewAsync(request, ownsRefresh, expectedEmail).ConfigureAwait(false);
        }
    }
    internal static async Task<JsonElement> RenewAsync(Func<string,object,Task<JsonElement>> request,Func<bool> ownsRefresh,string expectedEmail)
    {
            if(!ownsRefresh())throw new SessionCredentialException(SessionCredentialPolicy.RefreshPending);
            var result=await request("account/read",new{refreshToken=true}).ConfigureAwait(false);
            if(!result.TryGetProperty("account",out var account)||account.ValueKind!=JsonValueKind.Object)
            {
                // Current app-server hides permanent refresh failures behind account=null.
                // Obtain a bounded usage error after the attempted renewal, never infer
                // revocation from an empty account alone.
                try { await request("account/rateLimits/read",new{}).ConfigureAwait(false); }
                catch(CodexRequestException error) when(
                    SessionCredentialPolicy.ClassifyFailure(error.Message)==SessionCredentialPolicy.Reauthenticate ||
                    error.Message.Contains("token_revoked",StringComparison.OrdinalIgnoreCase))
                { throw new SessionCredentialException(SessionCredentialPolicy.Reauthenticate); }
                throw new SessionCredentialException(SessionCredentialPolicy.Retry);
            }
            if(JsonValue.String(account,"type")!="chatgpt"||!string.Equals(JsonValue.String(account,"email"),expectedEmail,StringComparison.OrdinalIgnoreCase))
                throw new SessionCredentialException("usage_identity_mismatch");
            return await request("account/rateLimits/read",new{}).ConfigureAwait(false);
    }
}
