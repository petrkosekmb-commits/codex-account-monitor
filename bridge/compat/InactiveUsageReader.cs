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
        { return await RenewAsync(request,ownsRefresh,expectedEmail).ConfigureAwait(false); }
    }
    internal static async Task<JsonElement> RenewAsync(Func<string,object,Task<JsonElement>> request,Func<bool> ownsRefresh,string expectedEmail,Func<string?>? refreshFailure=null)
    {
        if(!ownsRefresh())throw new SessionCredentialException(SessionCredentialPolicy.RefreshPending);
        try
        {
            var result=await request("account/read",new{refreshToken=true}).ConfigureAwait(false);
            if(!result.TryGetProperty("account",out var account)||account.ValueKind!=JsonValueKind.Object)
            {
                // account=null and usage token_revoked alone cannot establish
                // rejection of the refresh grant. Consult fixed stderr evidence.
                try { await request("account/rateLimits/read",new{}).ConfigureAwait(false); }
                catch(CodexRequestException error)
                {
                    var explicitCode=RefreshFailureEvidence.Code(error.Message);
                    if(explicitCode!=null)throw new SessionCredentialException(SessionCredentialPolicy.Reauthenticate,explicitCode);
                }
                for(var i=0;refreshFailure!=null&&refreshFailure()==null&&i<4;i++)await Task.Delay(25).ConfigureAwait(false);
                var code=refreshFailure?.Invoke();
                if(code!=null&&RefreshFailureEvidence.Code(code)!=null)throw new SessionCredentialException(SessionCredentialPolicy.Reauthenticate,code);
                throw new SessionCredentialException(SessionCredentialPolicy.Retry);
            }
            if(JsonValue.String(account,"type")!="chatgpt"||!string.Equals(JsonValue.String(account,"email"),expectedEmail,StringComparison.OrdinalIgnoreCase))
                throw new SessionCredentialException("usage_identity_mismatch");
            return await request("account/rateLimits/read",new{}).ConfigureAwait(false);
        }
        catch(CodexRequestException error) when(RefreshFailureEvidence.Code(error.Message)!=null)
        { throw new SessionCredentialException(SessionCredentialPolicy.Reauthenticate,RefreshFailureEvidence.Code(error.Message)); }
    }
}
