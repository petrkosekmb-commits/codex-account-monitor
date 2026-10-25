using CodexAccountDesk;
using System.Net;
using System.Text;
using System.Text.Json;
static void Check(bool ok,string name){if(!ok)throw new Exception(name);Console.WriteLine("PASS "+name);}
static string Auth(string account="account-one"){
 var payload=Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{sub="subject",email="one@example.com"}))).TrimEnd('=').Replace('+','-').Replace('/','_');
 return JsonSerializer.Serialize(new{auth_mode="chatgpt",tokens=new{account_id=account,id_token="head."+payload+".sig",access_token="synthetic-access",refresh_token="synthetic-refresh"}});
}
var auth=Auth();var key=AuthDocument.Parse(auth).Key;
Check(SessionCredentialPolicy.IsDesktopOwned(key,false,auth),"active registration is owned by the desktop");
Check(!SessionCredentialPolicy.IsDesktopOwned(AuthDocument.Parse(Auth("other")).Key,false,auth),"inactive registration can refresh under monitor ownership");
Check(!SessionCredentialPolicy.IsDesktopOwned(key,true,auth),"new independent sign-in is not overwritten by the old desktop registration");
foreach(var message in new[]{"401 Unauthorized","auth gateway unavailable","refresh request timed out","refresh returned 503","authentication endpoint not reachable"})
 Check(SessionCredentialPolicy.ClassifyFailure(message)==SessionCredentialPolicy.Retry,"transient failure does not request login: "+message);
foreach(var message in new[]{"invalid_grant","refresh_token_reused","refresh_token_expired","refresh_token_invalidated","Your refresh token has already been used","Your refresh token has expired"})
 Check(SessionCredentialPolicy.ClassifyFailure(message)==SessionCredentialPolicy.Reauthenticate,"confirmed invalid grant is terminal: "+message);
var payloadJson=JsonSerializer.Serialize(new{account_id="account-one",plan_type="plus",rate_limit=new{allowed=true,limit_reached=false,primary_window=new{used_percent=35,limit_window_seconds=18000,reset_at=2000000000},secondary_window=new{used_percent=50,limit_window_seconds=604800,reset_at=2000500000}},credits=new{balance="0",unlimited=false},rate_limit_reset_credits=new{available_count=2}});
var handler=new FixtureHandler(HttpStatusCode.OK,payloadJson);using var client=new HttpClient(handler);
var usage=await ActiveUsageClient.ReadAsync(auth,"account-one",CancellationToken.None,client);
Check(handler.Requests==1&&handler.Method==HttpMethod.Get,"active usage only sends one GET, never a refresh POST");
Check(handler.Url=="https://chatgpt.com/backend-api/wham/usage","access token goes only to the fixed official usage endpoint");
Check(handler.Access=="Bearer synthetic-access"&&handler.Account=="account-one","usage request uses access token and exact account scope");
Check(!handler.SeenRefresh,"request never contains the refresh token");
Check(usage.Buckets.Single().Primary!.UsedPercent==35&&usage.Buckets.Single().Primary!.Minutes==300,"five-hour limit keeps percentage and duration");
Check(usage.Buckets.Single().Secondary!.Minutes==10080&&usage.AvailableResets==2,"weekly window and manual reset count are preserved");
using var unauthorized=new HttpClient(new FixtureHandler(HttpStatusCode.Unauthorized,"{}"));
try{await ActiveUsageClient.ReadAsync(auth,"account-one",CancellationToken.None,unauthorized);throw new Exception("401 accepted");}catch(SessionCredentialException e){Check(e.Code==SessionCredentialPolicy.RefreshPending,"active 401 waits for desktop renewal instead of rotating the token");}
using var unavailable=new HttpClient(new FixtureHandler(HttpStatusCode.ServiceUnavailable,"{}"));
try{await ActiveUsageClient.ReadAsync(auth,"account-one",CancellationToken.None,unavailable);throw new Exception("503 accepted");}catch(SessionCredentialException e){Check(e.Code==SessionCredentialPolicy.Retry,"503 preserves credentials and requests another check");}
using var parsed=JsonDocument.Parse(payloadJson);
try{ActiveUsageClient.Parse(parsed.RootElement,"different-account");throw new Exception("identity accepted");}catch(SessionCredentialException e){Check(e.Code=="usage_identity_mismatch","mismatched identity cannot update another account's usage");}
Check(!AccountErrors.Describe(SessionCredentialPolicy.Retry)!.Contains("znovu přihl"),"transient UI message does not ask to log in");
Check(AccountErrors.Describe(SessionCredentialPolicy.Reauthenticate)!.Contains("Služba potvrdila"),"terminal UI message states confirmed invalid credentials");
Check(!AccountErrors.Describe("token=synthetic-secret")!.Contains("synthetic-secret"),"unknown errors cannot leak secrets");
var calls=new List<string>();
var queryCount=0;
var accountReply=JsonSerializer.SerializeToElement(new{account=new{type="chatgpt",email="one@example.com"}});
async Task<JsonElement> RecoverRequest(string method,object parameters){await Task.Yield();calls.Add(method);if(method=="account/read"){Check(JsonSerializer.Serialize(parameters).Contains("true"),"inactive 401 explicitly requests official token renewal");return accountReply;}if(queryCount++==0)throw new CodexRequestException("401 Unauthorized","account/rateLimits/read");return parsed.RootElement.Clone();}
await InactiveUsageReader.ReadAsync(RecoverRequest,()=>true,"one@example.com");
Check(calls.SequenceEqual(new[]{"account/rateLimits/read","account/read","account/rateLimits/read"}),"inactive usage renews once after 401 then retries exactly once");
calls.Clear();queryCount=0;
try{await InactiveUsageReader.ReadAsync(RecoverRequest,()=>false,"one@example.com");throw new Exception("active refresh allowed");}catch(SessionCredentialException e){Check(e.Code==SessionCredentialPolicy.RefreshPending&&calls.Count==1,"ownership change to active prevents refresh of a copied registration");}
var repeated=0;
try{await InactiveUsageReader.ReadAsync((method,p)=>{if(method=="account/read")return Task.FromResult(accountReply);repeated++;throw new CodexRequestException("401 Unauthorized","account/rateLimits/read");},()=>true,"one@example.com");throw new Exception("loop not bounded");}catch(CodexRequestException){Check(repeated==2,"failed inactive refresh cannot produce an unbounded retry loop");}
var missingCalls=0;
try { await InactiveUsageReader.RenewAsync((m,p)=>{missingCalls++;return Task.FromResult(JsonSerializer.SerializeToElement(new {account=(object?)null}));},()=>true,"one@example.com"); throw new Exception("Null account accepted"); }
catch(SessionCredentialException e){Check(e.Code==SessionCredentialPolicy.Retry && missingCalls==2,"null account alone is transient; one bounded usage probe follows renewal");}
try { await InactiveUsageReader.RenewAsync((m,p)=>throw new CodexRequestException("refresh_token_reused",m),()=>true,"one@example.com"); throw new Exception("Revoked grant accepted"); }
catch(CodexRequestException e){Check(SessionCredentialPolicy.ClassifyFailure(e.Message)==SessionCredentialPolicy.Reauthenticate,"renewal preserves confirmed terminal errors");}
var revokedCalls=new List<string>();
try { await InactiveUsageReader.RenewAsync((m,p)=>{revokedCalls.Add(m);if(m=="account/read")return Task.FromResult(JsonSerializer.SerializeToElement(new{account=(object?)null}));throw new CodexRequestException("401 token_revoked",m);},()=>true,"one@example.com");throw new Exception("Revoked session accepted"); }
catch(SessionCredentialException e){Check(e.Code==SessionCredentialPolicy.Reauthenticate && revokedCalls.Count==2,"revoked token after attempted renewal produces actionable reauthentication");}
var rotated=auth.Replace("synthetic-refresh","rotated-refresh");
Check(RuntimeHome.CanRecover(RuntimeHome.Hash(auth),auth,rotated),"orphaned rotation can recover only from the exact previous credential");
Check(!RuntimeHome.CanRecover(RuntimeHome.Hash(auth),rotated,auth),"old orphan cannot roll back a newer credential");
Check(!RuntimeHome.CanRecover(RuntimeHome.Hash(auth),auth,Auth("other")),"orphan cannot change account identity");
Check(!AccountErrors.Describe("session_account_unavailable")!.Contains("jednorázově"),"empty account no longer claims a proven logout");
var pending=new AccountSwitchPlan{SourceAccountKey="source",TargetAccountKey="target",Phase=SwitchPhase.Applying,Chats=new(){new SwitchChat{ResumeState=ChatResumeState.Pending}}};
Check(SwitchRecovery.CanDismiss(pending,"source"),"unapplied failed switch can be dismissed when source identity still matches");
Check(!SwitchRecovery.CanDismiss(pending,"target"),"crash after applying cannot be dismissed using an outdated accountApplied flag");
Check(!SwitchRecovery.CanDismiss(pending,"third"),"external account change prevents dismissal");
pending.Chats[0].ResumeState=ChatResumeState.Unconfirmed;
Check(!SwitchRecovery.CanDismiss(pending,"source"),"uncertain sent continuation is retained");
if(OperatingSystem.IsWindows()) {
 using var self=System.Diagnostics.Process.GetCurrentProcess();
 Check(string.Equals(WindowsProcessImage.Read(self),Environment.ProcessPath,StringComparison.OrdinalIgnoreCase),"limited-rights process path matches live executable");
 if(args.Length==1)Check(RuntimeLocator.IsDesktopRunning(args[0]),"runtime locator inspects actual running desktop without module enumeration");
 Check(RuntimeLocator.IsDesktopRunning(Environment.ProcessPath!),"process detection finds exact executable");
 Check(!RuntimeLocator.IsDesktopRunning(System.IO.Path.Combine(System.IO.Path.GetTempPath(),System.IO.Path.GetFileName(Environment.ProcessPath!))),"same process name at another path is not the target");
}
var recoveryDir=Path.Combine(Path.GetTempPath(),"account-monitor-recovery-"+Guid.NewGuid().ToString("N"));
try {
 var vault=new AccountVault(recoveryDir);vault.Upsert(auth);vault.Save();
 var abandoned=new RuntimeHome(recoveryDir,auth);
 await File.WriteAllTextAsync(Path.Combine(abandoned.Path,"auth.json"),rotated);
 await File.WriteAllTextAsync(Path.Combine(abandoned.Path,"owner.json"),JsonSerializer.Serialize(new{pid=int.MaxValue,startedAt=1L,sourceAuthHash=RuntimeHome.Hash(auth)}));
 await abandoned.DisposeAsync();
 Check(Directory.Exists(abandoned.Path),"uncommitted credential survives runtime disposal");
 RuntimeHome.RecoverStale(vault,auth);
 Check(vault.Data.Accounts.Single().AuthJson==auth,"orphan never overwrites the desktop-owned active session");
 RuntimeHome.RecoverStale(vault,null);
 Check(new AccountVault(recoveryDir).Data.Accounts.Single().AuthJson==rotated,"rotated orphan is durably recovered into the encrypted vault");
 RuntimeHome.CleanupStale(recoveryDir);
 Check(!Directory.Exists(abandoned.Path),"recovered orphan is cleaned only after persistence");
} finally { if(Directory.Exists(recoveryDir))Directory.Delete(recoveryDir,true); }
Console.WriteLine("Credential regression suite completed.");
sealed class FixtureHandler(HttpStatusCode status,string response):HttpMessageHandler{
 public int Requests;public HttpMethod? Method;public string? Url,Access,Account;public bool SeenRefresh;
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct){Requests++;Method=request.Method;Url=request.RequestUri!.ToString();Access=request.Headers.Authorization?.ToString();Account=request.Headers.GetValues("ChatGPT-Account-Id").Single();SeenRefresh=request.ToString().Contains("synthetic-refresh");return Task.FromResult(new HttpResponseMessage(status){Content=new StringContent(response)});}
}
