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
            if(!ownsRefresh())throw new SessionCredentialException(SessionCredentialPolicy.RefreshPending);
            var result=await request("account/read",new{refreshToken=true}).ConfigureAwait(false);
            if(!result.TryGetProperty("account",out var account)||JsonValue.String(account,"type")!="chatgpt"||!string.Equals(JsonValue.String(account,"email"),expectedEmail,StringComparison.OrdinalIgnoreCase))
                throw new SessionCredentialException("usage_identity_mismatch");
            return await request("account/rateLimits/read",new{}).ConfigureAwait(false);
        }
    }
}
