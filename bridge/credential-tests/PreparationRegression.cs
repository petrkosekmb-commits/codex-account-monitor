using CodexAccountDesk;

internal static class PreparationRegression
{
    public static async Task RunAsync()
    {
        var id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
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
        Console.WriteLine("PASS preserving preparation: unnamed, whitespace, date-only and named chats; invalid identity; ambiguity; cancellation; single continuation");
    }
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    sealed class Fixture(SwitchChat[] chats):IAccountSwitchBackend
    {
        string account="source";public int Operations,Sends;
        public Task<string?> CurrentAccountAsync(CancellationToken c)=>Task.FromResult<string?>(account);
        public Task<SwitchChat[]> CaptureAsync(CancellationToken c)=>Task.FromResult(chats);
        public Task BackupNameAsync(SwitchChat chat,DateTimeOffset at,CancellationToken c){chat.BackupTitle=chat.OriginalTitle;return Task.CompletedTask;}
        public Task CloseDesktopAsync(CancellationToken c){Operations++;return Task.CompletedTask;}
        public Task ApplyAccountAsync(string target,string? source,CancellationToken c){Operations++;account=target;return Task.CompletedTask;}
        public Task LaunchDesktopAsync(CancellationToken c){Operations++;return Task.CompletedTask;}
        public Task<ChatResumeState> ResumeAsync(SwitchChat chat,Action sending,CancellationToken c){Operations++;Sends++;sending();return Task.FromResult(ChatResumeState.Resumed);}
        public ValueTask DisposeAsync()=>ValueTask.CompletedTask;
    }
}
