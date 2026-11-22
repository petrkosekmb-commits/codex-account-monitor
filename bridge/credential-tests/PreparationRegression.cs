using CodexAccountDesk;

internal static class PreparationRegression
{
    public static async Task RunAsync()
    {
        var id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        await using(var backend=new Fixture(Array.Empty<SwitchChat>()))
        {
            AccountSwitchPlan? saved=null;
            var plan=await SwitchPreparation.PrepareAsync(backend,"target",DateTimeOffset.UtcNow,p=>saved=p,CancellationToken.None,"source",true);
            Require(plan.Chats.Count==0&&saved==plan,"account-only plan is durable with zero chats");
            var coordinator=new AccountSwitchCoordinator(backend,p=>saved=p,_=>{},_=>"failure");
            Require(await coordinator.RunAsync(plan,CancellationToken.None)&&saved==null&&backend.Account=="target"&&backend.Sends==0&&backend.Operations==3,"account-only closes applies launches and never resumes a chat");
        }
        await using(var backend=new Fixture(new[]{new SwitchChat{Id=id}}))
        {
            try{await SwitchPreparation.PrepareAsync(backend,"target",DateTimeOffset.UtcNow,_=>throw new Exception("unexpected checkpoint"),CancellationToken.None,"source",true);throw new Exception("account-only captured a chat");}catch(InvalidDataException){}
        }
        foreach(var title in new[]{"", " ", "[261101] ", "Original title"})
        {
            await using var backend=new Fixture(new[]{new SwitchChat{Id=id,OriginalTitle=title}});
            AccountSwitchPlan? saved=null;var writes=0;
            var plan=await SwitchPreparation.PrepareAsync(backend,"target",DateTimeOffset.UtcNow,p=>{saved=p;writes++;},CancellationToken.None);
            Require(writes==1&&saved==plan&&!plan.AccountApplied&&plan.Phase==SwitchPhase.BackingUp,"one checkpoint before account change");
            Require(plan.Chats.Single().Id==id&&plan.Chats.Single().OriginalTitle==title&&plan.Chats.Single().BackupTitle==title,"exact identity and unchanged title");
            Require(backend.Operations==0,"preparation must not switch or send");
            var coordinator=new AccountSwitchCoordinator(backend,p=>saved=p,_=>{},_=>"test failure");
            Require(await coordinator.RunAsync(plan,CancellationToken.None)&&saved==null,"normal coordinator completes prepared plan");
            Require(backend.Operations==4&&backend.Sends==1,"single close/apply/launch/resume");
        }
        foreach(var chats in new[]{Array.Empty<SwitchChat>(),new[]{new SwitchChat{Id="bad"}},new[]{new SwitchChat{Id=id},new SwitchChat{Id=id}}})
        {
            await using var backend=new Fixture(chats);var writes=0;
            try{await SwitchPreparation.PrepareAsync(backend,"target",DateTimeOffset.UtcNow,_=>writes++,CancellationToken.None);throw new Exception("invalid capture accepted");}
            catch(InvalidDataException){}
            Require(writes==0&&backend.Operations==0,"invalid identity or ambiguous capture cannot checkpoint or switch");
        }
        await using(var backend=new Fixture(new[]{new SwitchChat{Id=id}}))
        {
            try{await SwitchPreparation.PrepareAsync(backend,"target",DateTimeOffset.UtcNow,_=>throw new Exception("cancelled checkpoint"),new CancellationToken(true));throw new Exception("cancellation ignored");}
            catch(OperationCanceledException){}
            Require(backend.Operations==0,"cancelled preparation cannot switch");
        }
        foreach (var nextAccount in new string?[] { "other", "target", null })
        {
            await using var backend = new Fixture(new[] { new SwitchChat { Id = id } });
            backend.OnCapture = () => backend.Account = nextAccount;
            var writes = 0;
            try
            {
                await SwitchPreparation.PrepareAsync(backend, "target", DateTimeOffset.UtcNow,
                    _ => writes++, CancellationToken.None, "source");
                throw new Exception("account change during capture accepted");
            }
            catch (SwitchPreconditionException) { }
            Require(writes == 0 && backend.Operations == 0 && backend.Sends == 0,
                "account change or logout during capture cannot checkpoint, close, switch or send");
        }
        foreach (var actualAccount in new string?[] { "other", null })
        {
            await using var backend = new Fixture(new[] { new SwitchChat { Id = id } }) { Account = actualAccount };
            var writes = 0;
            try
            {
                await SwitchPreparation.PrepareAsync(backend, "target", DateTimeOffset.UtcNow,
                    _ => writes++, CancellationToken.None, "source");
                throw new Exception("preflight identity change accepted");
            }
            catch (SwitchPreconditionException) { }
            Require(writes == 0 && backend.Operations == 0 && backend.Sends == 0,
                "changed preflight account or missing login cannot checkpoint, close, switch or send");
        }
        Console.WriteLine("PASS preserving preparation: unchanged titles; verified identity; cancellation; stable source before and during capture; single continuation");
    }
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    sealed class Fixture(SwitchChat[] chats):IAccountSwitchBackend
    {
        public string? Account { get; set; } = "source";
        public Action? OnCapture { get; set; }
        public int Operations,Sends;
        public Task<string?> CurrentAccountAsync(CancellationToken c)=>Task.FromResult(Account);
        public Task<SwitchChat[]> CaptureAsync(CancellationToken c){OnCapture?.Invoke();return Task.FromResult(chats);}
        public Task BackupNameAsync(SwitchChat chat,DateTimeOffset at,CancellationToken c){chat.BackupTitle=chat.OriginalTitle;return Task.CompletedTask;}
        public Task CloseDesktopAsync(CancellationToken c){Operations++;return Task.CompletedTask;}
        public Task ApplyAccountAsync(string target,string? source,CancellationToken c){Operations++;Account=target;return Task.CompletedTask;}
        public Task LaunchDesktopAsync(CancellationToken c){Operations++;return Task.CompletedTask;}
        public Task<ChatResumeState> ResumeAsync(SwitchChat chat,Action sending,CancellationToken c){Operations++;Sends++;sending();return Task.FromResult(ChatResumeState.Resumed);}
        public ValueTask DisposeAsync()=>ValueTask.CompletedTask;
    }
}
