using CodexAccountDesk;
using System.Text;
using System.Text.Json;
using System.Diagnostics;

// Small local host for the upstream account/session libraries. No hardware/UI assemblies.
internal static class Program
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly object OutputLock = new();
    private static AccountService Service = null!;
    private static AccountVault Vault = null!;
    private static DesktopSessionMonitor Sessions = null!;
    private static CancellationTokenSource? Operation;
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static bool Ready;
    private static readonly CancellationTokenSource MonitorStop = new();
    private static async Task RecheckWaitingAsync()
    {
        try
        {
            while(!MonitorStop.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(15),MonitorStop.Token);
                if(!Ready||!Sessions.Threads.Any(t=>t.Waiting)||!await Gate.WaitAsync(0))continue;
                try
                {
                    using var deadline=CancellationTokenSource.CreateLinkedTokenSource(MonitorStop.Token);
                    deadline.CancelAfter(TimeSpan.FromSeconds(25));
                    Sessions.RestartDiscovery();await Sessions.WaitForDiscoveryAsync(deadline.Token);
                }
                catch { /* Keep discovery unavailable when the fresh state cannot be verified. */ }
                finally { Gate.Release(); }
            }
        }
        catch(OperationCanceledException) when(MonitorStop.IsCancellationRequested) { }
    }
    private static string[] Allowed = Array.Empty<string>();
    private static void Send(object message) { lock (OutputLock) Console.WriteLine(JsonSerializer.Serialize(message, Json)); }
    private static bool AllowedEmail(string email) => Allowed.Contains(email, StringComparer.OrdinalIgnoreCase);
    private static object? Window(UsageWindow? w) => w == null ? null : new { usedPercent=w.UsedPercent, windowDurationMins=w.Minutes, resetsAt=w.ResetsAt };
    private static object Status()
    {
        var accounts=Service.Accounts.Where(a=>AllowedEmail(a.Email)).Select(a=>new {
            email=a.Email, plan=a.Plan, current=a.IsCurrent, error=AccountErrors.Describe(a.Error),
            subscription=new { activeUntil=a.SubscriptionActiveUntil?.ToUnixTimeMilliseconds(), checkedAt=a.SubscriptionLastChecked?.ToUnixTimeMilliseconds() },
            checkedAt=a.Usage?.CheckedAt.ToUnixTimeMilliseconds(),
            raw=a.Usage==null?null:new {
                ordinaryUsageAllowed=a.Usage.OrdinaryUsageAllowed,
                rateLimitResetCredits=new { availableCount=a.Usage.AvailableResets },
                rateLimitsByLimitId=a.Usage.Buckets.ToDictionary(b=>b.Id,b=>(object)new {
                    limitId=b.Id, primary=Window(b.Primary), secondary=Window(b.Secondary), rateLimitReachedType=b.LimitState,
                    spendControlReached=b.SpendControlReached, credits=new { balance=b.CreditBalance, unlimited=b.UnlimitedCredits,
                        hasCredits=decimal.TryParse(b.CreditBalance,System.Globalization.NumberStyles.Any,System.Globalization.CultureInfo.InvariantCulture,out var n)&&n>0 }
                })
            }
        }).ToArray();
        var pending=Vault.Data.PendingSwitch;
        return new { ready=Ready, accounts, desktop=Sessions.Current.Available,
            threads=Sessions.Threads.Select(t=>new {t.Id,t.Title,t.Status,t.Waiting,t.Goal,t.ResumeState,t.LastTurnId,t.LastTurnStatus,t.LastTurnStartedAtMs}),
            pending=pending==null?null:new { pending.Id, targetEmail=Service.Accounts.SingleOrDefault(a=>a.Key==pending.TargetAccountKey)?.Email,phase=pending.Phase.ToString(), pending.AccountApplied,
                error=pending.Error==null?null:"Přechod není dokončený. Ověř stav jednotlivých chatů.",
                chats=pending.Chats.Select(c=>new {c.Id,state=c.ResumeState.ToString(),error=c.Error}) }
        };
    }
    public static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding=new UTF8Encoding(false); Console.InputEncoding=new UTF8Encoding(false); Loc.SetLanguage("en");
        if(args.Length!=3) {Send(new {fatal="Chybí místní konfigurace pomocníka."});return 1;}
        try
        {
            Allowed=JsonSerializer.Deserialize<string[]>(args[2])??Array.Empty<string>();
            if(Allowed.Length!=4||Allowed.Distinct(StringComparer.OrdinalIgnoreCase).Count()!=4||Allowed.Any(e=>!System.Net.Mail.MailAddress.TryCreate(e,out var address)||address.Address!=e))throw new InvalidDataException();
        }
        catch {Send(new {fatal="Neplatný seznam čtyř účtů. / Invalid account configuration."});return 1;}
        Vault=new AccountVault(Path.GetFullPath(args[0]));Service=new AccountService(Vault,Path.GetFullPath(args[1]));
        Sessions=new DesktopSessionMonitor(Path.GetFullPath(args[1]));Sessions.Start();
        var recheck=RecheckWaitingAsync();
        string? line;
        while((line=await Console.In.ReadLineAsync())!=null)
        {
            try {var msg=JsonDocument.Parse(line).RootElement.Clone();_ = Handle(msg);}
            catch {Send(new {error="Neplatný požadavek."});}
        }
        MonitorStop.Cancel();Operation?.Cancel();await recheck;await Service.StopAsync();await Sessions.DisposeAsync();Service.ReleaseDesktop();return 0;
    }
    private static async Task Handle(JsonElement msg)
    {
        var id=msg.GetProperty("id").GetInt32();var method=msg.GetProperty("method").GetString();
        if(method=="status"){Send(new {id,result=Status()});return;}
        if(method=="cancel"){Operation?.Cancel();Send(new{id,result=new{cancelRequested=true}});return;}
        if(!await Gate.WaitAsync(0)){Send(new{id,error="Probíhá jiné přihlášení, kontrola nebo přepnutí."});return;}
        try
        {
            Operation=new CancellationTokenSource(TimeSpan.FromMinutes(method=="login"?15:10));var ct=Operation.Token;
            if(!Ready){await Service.InitializeAsync(ct);Ready=true;}
            if(method=="initialize"||method=="refresh"){await Service.SynchronizeCurrentAsync(ct);await Task.WhenAll(Service.Accounts.Where(a=>AllowedEmail(a.Email)).Select(a=>Service.RefreshAccountAsync(a.Key,ct)));}
            else if(method=="dismiss")
            {
                var pending=Vault.Data.PendingSwitch;
                if(pending!=null)
                {
                    if(pending.AccountApplied||pending.Chats.Any(c=>c.ResumeState is ChatResumeState.Sending or ChatResumeState.Unconfirmed))throw new InvalidOperationException();
                    lock(Vault.SyncRoot){Vault.Data.PendingSwitch=null;Vault.Save();}
                }
                await Service.SynchronizeCurrentAsync(ct);
            }
            else if(method=="login")
            {
                var email=msg.GetProperty("email").GetString()!;if(!AllowedEmail(email))throw new InvalidOperationException();
                var before=Service.Accounts.Select(a=>a.Key).ToHashSet();
                var registration=await Service.AddAccountAsync(uri=>Send(new {notification="loginUrl",id,url=uri.AbsoluteUri}),ct);
                if(!string.Equals(registration.Profile.Email,email,StringComparison.OrdinalIgnoreCase))
                {var actual=registration.Profile.Email;if(!before.Contains(registration.Profile.Key))await Service.RemoveAsync(registration.Profile.Key);throw new WrongAccountException(actual,email);}
                await registration.ImmediateRefresh;
            }
            else if(method=="switch"||method=="resume")
            {
                var email=msg.GetProperty("email").GetString()!;if(!AllowedEmail(email))throw new InvalidOperationException();
                var target=Service.Accounts.Single(a=>string.Equals(a.Email,email,StringComparison.OrdinalIgnoreCase));
                if(method=="switch"&&Vault.Data.PendingSwitch!=null)throw new InvalidOperationException();
                if(method=="switch"&&target.IsCurrent)throw new InvalidOperationException();
                var threadId=msg.TryGetProperty("threadId",out var tid)&&tid.ValueKind==JsonValueKind.String?tid.GetString():null;
                Sessions.RestartDiscovery();await Sessions.WaitForDiscoveryAsync(ct);
                if(Sessions.Threads.Any(t=>t.Waiting))throw new PendingApprovalException();
                await Service.RefreshAccountAsync(target.Key,ct);
                if(Service.Accounts.Single(a=>a.Key==target.Key).Error!=null)throw new InvalidOperationException();
                await using var backend=new PreservingBackend(Service,Sessions,target.Key,threadId);
                var coordinator=new AccountSwitchCoordinator(backend,
                    plan=>{lock(Vault.SyncRoot){Vault.Data.PendingSwitch=plan;Vault.Save();}},
                    plan=>Send(new{notification="switchProgress",phase=plan.Phase.ToString(),accountApplied=plan.AccountApplied}),
                    e=>e is DesktopCloseException?e.Message:e is TimeoutException?"Codex včas nepotvrdil zavření nebo otevření chatu. Zkontroluj jeho stav.":"Operace přepnutí selhala; případný neověřený požadavek na pokračování neopakuj naslepo.");
                var plan=method=="resume"?Vault.Data.PendingSwitch:await coordinator.PrepareAsync(target.Key,DateTimeOffset.UtcNow,ct);
                if(plan==null||plan.TargetAccountKey!=target.Key)throw new InvalidOperationException();
                if(!await coordinator.RunAsync(plan,ct))throw new IncompleteSwitchException();
                await Service.SynchronizeCurrentAsync(ct);
            }
            else throw new InvalidOperationException();
            Send(new{id,result=Status()});
        }
        catch(Exception e)
        {
            var message=e switch {
                WrongAccountException wrong=>$"Přihlášení vrátilo účet {wrong.ActualEmail}; tato karta očekává {wrong.ExpectedEmail}. Zkontroluj přesnou adresu účtu.",
                PendingApprovalException=>"Codex hlásí čekání na schválení nebo odpověď uživatele. Nejdřív dokonči čekající požadavek v Codexu.",
                IncompleteSwitchException=>"Účet nebo pokračování nejsou plně ověřené. Zkontroluj stav a případně obnov připravený přechod.",
                OperationCanceledException=>"Operace byla zrušena nebo vypršel její čas. Zkontroluj aktuální účet.",
                _=>"Požadavek nelze dokončit. Přihlášení nebo spojení s aplikací nebylo ověřené."
            };
            Send(new{id,error=message});
        }
        finally{Operation?.Dispose();Operation=null;Gate.Release();}
    }
    private sealed class WrongAccountException(string? actualEmail,string expectedEmail):Exception
    {
        public string ActualEmail {get;}=string.IsNullOrWhiteSpace(actualEmail)?"bez e-mailové adresy":actualEmail;
        public string ExpectedEmail {get;}=expectedEmail;
    }
    private sealed class PendingApprovalException:Exception{}
    private sealed class IncompleteSwitchException:Exception{}
}

internal sealed class PreservingBackend:IAccountSwitchBackend
{
    private readonly AccountService Service;private readonly DesktopSessionMonitor Sessions;private readonly DesktopSwitchBackend Backend;
    private readonly string? Selected;private readonly string Target;private CodexRpc? Metadata;
    public PreservingBackend(AccountService service,DesktopSessionMonitor sessions,string target,string? selected)
    {Service=service;Sessions=sessions;Selected=selected;Target=target;Backend=new(service,sessions,target);}
    public Task<string?> CurrentAccountAsync(CancellationToken c)=>Backend.CurrentAccountAsync(c);
    public async Task<SwitchChat[]> CaptureAsync(CancellationToken c)
    {
        var chats=(await Backend.CaptureAsync(c)).ToList();
        if(Selected!=null)
        {
            var thread=Sessions.Threads.Single(t=>t.Id==Selected);
            if(thread.Waiting)throw new InvalidOperationException();
            if(thread.LastTurnStatus=="completed"&&thread.Goal!="active")throw new InvalidOperationException();
            if(!chats.Any(t=>t.Id==Selected))chats.Add(new(){Id=thread.Id,OriginalTitle=thread.Title??"",OriginalTurnId=thread.LastTurnId,OriginalGoal=thread.Goal});
        }
        if(chats.Count==0)throw new InvalidOperationException("Nebyla nalezena rozpracovaná úloha.");
        return chats.OrderBy(t=>t.Id==Selected?0:1).ToArray();
    }
    public async Task BackupNameAsync(SwitchChat chat,DateTimeOffset at,CancellationToken c)
    {
        Metadata??=new CodexRpc(Service.Installation.CliPath,Service.CodexHome,true);
        if(Metadata.Initialization==null)await Metadata.InitializeAsync(c);
        var r=await Metadata.RequestAsync("thread/read",new{threadId=chat.Id,includeTurns=false},c);
        var title=JsonValue.String(r.GetProperty("thread"),"name");if(string.IsNullOrWhiteSpace(title))throw new InvalidDataException();
        // The encrypted handoff keeps the original name. No date prefix or user-visible rename.
        chat.OriginalTitle=title;chat.BackupTitle=title;
    }
    public async Task CloseDesktopAsync(CancellationToken c){if(Metadata!=null){await Metadata.DisposeAsync();Metadata=null;}if(OperatingSystem.IsWindows()){await DesktopClose.CloseAsync(Service.Installation.DesktopPath,c);Sessions.RestartDiscovery();}else await Backend.CloseDesktopAsync(c);}
    public Task ApplyAccountAsync(string key,string? source,CancellationToken c)=>Backend.ApplyAccountAsync(key,source,c);
    public async Task LaunchDesktopAsync(CancellationToken c)
    {
        if(OperatingSystem.IsWindows()&&!RuntimeLocator.IsDesktopRunning(Service.Installation.DesktopPath))
        {
            string? firstChat;
            lock(Service.Vault.SyncRoot)firstChat=Service.Vault.Data.PendingSwitch?.Chats.FirstOrDefault()?.Id;
            // Deliver the route in the initial launch. A second process can arrive
            // before the new desktop has registered its window/deep-link handler.
            Process.Start(DesktopLaunch.Create(Service.Installation.DesktopPath,firstChat))?.Dispose();
            await Sessions.WaitForDiscoveryAsync(c);
            return;
        }
        await Backend.LaunchDesktopAsync(c);
    }
    public async Task<ChatResumeState> ResumeAsync(SwitchChat chat,Action sending,CancellationToken c)
    {
        if(!OperatingSystem.IsWindows())return await Backend.ResumeAsync(chat,sending,c);
        if(await CurrentAccountAsync(c)!=Target)throw new InvalidOperationException("Aktivní účet se změnil.");
        var thread=Sessions.Threads.FirstOrDefault(t=>t.Id==chat.Id&&t.ResumeState=="resumed"&&t.Status is "idle" or "active");
        if(thread==null)Process.Start(DesktopLaunch.Create(Service.Installation.DesktopPath,chat.Id))?.Dispose();
        var deadline=DateTimeOffset.UtcNow.AddMinutes(2);
        var rediscoverAt=DateTimeOffset.UtcNow.AddSeconds(15);
        while(thread==null&&DateTimeOffset.UtcNow<deadline)
        {
            await Task.Delay(200,c);
            thread=Sessions.Threads.FirstOrDefault(t=>t.Id==chat.Id&&t.ResumeState=="resumed"&&t.Status is "idle" or "active");
            if(thread==null&&DateTimeOffset.UtcNow>=rediscoverAt)
            {
                // Navigation may finish after the first discovery snapshot.
                // Re-read ownership before sending anything to a newly opened chat.
                Sessions.RestartDiscovery();
                await Sessions.WaitForDiscoveryAsync(c);
                rediscoverAt=DateTimeOffset.UtcNow.AddSeconds(15);
            }
        }
        if(thread==null)throw new TimeoutException("Codex nepotvrdil otevření chatu.");
        if(thread.Waiting)throw new InvalidOperationException("Chat čeká na schválení nebo odpověď.");
        if(SwitchContinuation.Decide(chat,thread) is ChatResumeState settled)return settled;
        if(await CurrentAccountAsync(c)!=Target)throw new InvalidOperationException("Aktivní účet se změnil.");
        sending();
        var result=await Sessions.SendToOwnerAsync(thread,"thread-follower-start-turn",SwitchContinuation.StartParameters(chat),2,c);
        var turn=result.GetProperty("result").GetProperty("turn");
        if(string.IsNullOrEmpty(JsonValue.String(turn,"id")))throw new InvalidDataException("Pokračování chatu nebylo potvrzené.");
        return ChatResumeState.Resumed;
    }
    public async ValueTask DisposeAsync(){if(Metadata!=null)await Metadata.DisposeAsync();await Backend.DisposeAsync();}
}
