using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
namespace CodexAccountDesk;
internal static class ActiveUsageClient
{
    private static readonly HttpClient Client=new(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(20),MaxResponseContentBufferSize=2*1024*1024};
    internal static async Task<UsageSnapshot> ReadAsync(string authJson,string accountId,CancellationToken ct,HttpClient? transport=null)
    {
        using var auth=JsonDocument.Parse(authJson);
        var tokens=auth.RootElement.GetProperty("tokens");
        var access=JsonValue.String(tokens,"access_token");
        if(string.IsNullOrWhiteSpace(access)||JsonValue.String(tokens,"account_id")!=accountId)throw new SessionCredentialException(SessionCredentialPolicy.RefreshPending);
        using var request=new HttpRequestMessage(HttpMethod.Get,"https://chatgpt.com/backend-api/wham/usage");
        request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",access);
        request.Headers.Add("ChatGPT-Account-Id",accountId);
        request.Headers.UserAgent.ParseAdd("codex-cli");
        using var response=await (transport??Client).SendAsync(request,ct).ConfigureAwait(false);
        if(response.StatusCode==HttpStatusCode.Unauthorized)throw new SessionCredentialException(SessionCredentialPolicy.RefreshPending);
        if(!response.IsSuccessStatusCode)throw new SessionCredentialException(SessionCredentialPolicy.Retry);
        using var payload=JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false));
        var snapshot=Parse(payload.RootElement,accountId);
        if(snapshot.AvailableResets is >=0)
        {
            try
            {
                using var detailRequest=new HttpRequestMessage(HttpMethod.Get,"https://chatgpt.com/backend-api/wham/rate-limit-reset-credits");
                detailRequest.Headers.Authorization=new AuthenticationHeaderValue("Bearer",access);
                detailRequest.Headers.Add("ChatGPT-Account-Id",accountId);detailRequest.Headers.UserAgent.ParseAdd("codex-cli");
                using var details=await (transport??Client).SendAsync(detailRequest,ct).ConfigureAwait(false);
                if(details.IsSuccessStatusCode){using var detailPayload=JsonDocument.Parse(await details.Content.ReadAsStringAsync(ct).ConfigureAwait(false));ResetCreditMetadata.AttachDetails(snapshot,detailPayload.RootElement,true);}
            }
            catch(OperationCanceledException) when(ct.IsCancellationRequested){throw;}
            catch { /* Missing reset details do not invalidate a verified usage read. */ }
        }
        return snapshot;
    }
    internal static UsageSnapshot Parse(JsonElement root,string expectedAccountId)
    {
        if(JsonValue.String(root,"account_id")!=expectedAccountId)throw new SessionCredentialException("usage_identity_mismatch");
        if(!root.TryGetProperty("rate_limit",out var rate)||rate.ValueKind!=JsonValueKind.Object)throw new SessionCredentialException(SessionCredentialPolicy.Retry);
        var snapshot=new UsageSnapshot{CheckedAt=DateTimeOffset.UtcNow,OrdinaryUsageAllowed=JsonValue.Bool(rate,"allowed")};
        var bucket=new UsageBucket{Id="codex",Label="codex",Plan=JsonValue.String(root,"plan_type"),
            Primary=Window(rate,"primary_window"),Secondary=Window(rate,"secondary_window"),LimitState=JsonValue.String(root,"rate_limit_reached_type")};
        if(bucket.Primary==null&&bucket.Secondary==null)throw new SessionCredentialException(SessionCredentialPolicy.Retry);
        if(JsonValue.Bool(rate,"limit_reached")==true&&bucket.LimitState==null)bucket.LimitState="rate_limit_reached";
        if(root.TryGetProperty("credits",out var credits)&&credits.ValueKind==JsonValueKind.Object){bucket.CreditBalance=JsonValue.String(credits,"balance");bucket.UnlimitedCredits=JsonValue.Bool(credits,"unlimited");}
        if(root.TryGetProperty("spend_control",out var spend)&&spend.ValueKind==JsonValueKind.Object)
            bucket.SpendControlReached=JsonValue.Bool(spend,"limit_reached")??JsonValue.Bool(spend,"limitReached");
        if(root.TryGetProperty("rate_limit_reset_credits",out var resets)&&resets.ValueKind==JsonValueKind.Object)snapshot.AvailableResets=JsonValue.Int(resets,"available_count");
        snapshot.Buckets.Add(bucket);return ResetCreditMetadata.Attach(snapshot,root,true);
    }
    private static UsageWindow? Window(JsonElement parent,string name)
    {
        if(!parent.TryGetProperty(name,out var w)||w.ValueKind==JsonValueKind.Null)return null;
        if(w.ValueKind!=JsonValueKind.Object||!w.TryGetProperty("used_percent",out var percent)||!percent.TryGetDouble(out var used)||!double.IsFinite(used)||used<0||used>100)throw new SessionCredentialException(SessionCredentialPolicy.Retry);
        var seconds=JsonValue.Long(w,"limit_window_seconds");
        if(seconds is null or <=0||seconds%60!=0)throw new SessionCredentialException(SessionCredentialPolicy.Retry);
        return new UsageWindow{UsedPercent=used,Minutes=seconds/60,ResetsAt=JsonValue.Long(w,"reset_at")};
    }
}
