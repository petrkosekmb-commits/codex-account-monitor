using CodexAccountDesk;
using System.Text.Json;

static JsonElement Snapshot(long revision,long? updatedAt,bool waiting)
{
    var state=new Dictionary<string,object?> {
        ["threadRuntimeStatus"]=new {type="active",activeFlags=waiting?new[]{"waitingOnApproval"}:Array.Empty<string>()},
        ["turns"]=Array.Empty<object>(),["title"]="Synthetic chat",["threadGoal"]=null
    };
    if(updatedAt!=null)state["updatedAt"]=updatedAt;
    return JsonSerializer.SerializeToElement(new {type="snapshot",revision,conversationState=state});
}
static SessionActivityLedger Ledger(){var l=new SessionActivityLedger();l.Discover("chat","owner");l.CompleteDiscovery();return l;}
static void Check(bool condition,string label){if(!condition)throw new Exception(label);Console.WriteLine("PASS "+label);}
if(args.FirstOrDefault()=="--desktop-close-fixture"){DesktopCloseFixture.Run(args.ElementAtOrDefault(1)=="refuse");return;}
var ledger=Ledger();
ledger.Apply("chat","owner",Snapshot(1200,1000,true));
ledger.Apply("chat","owner",Snapshot(470,2000,false));
Check(!ledger.Threads().Single().Waiting,"newer state accepts restarted revision and clears old waiting");
ledger.Apply("chat","owner",Snapshot(1201,1000,true));
Check(!ledger.Threads().Single().Waiting,"late older high-revision snapshot cannot restore old approval");
ledger.Apply("chat","owner",Snapshot(469,2000,true));
Check(!ledger.Threads().Single().Waiting,"same state still rejects out-of-order revisions");
ledger.Apply("chat","owner",Snapshot(471,2000,true));
Check(ledger.Threads().Single().Waiting,"actual current approval remains blocked");
var patch=JsonSerializer.SerializeToElement(new {type="patches",revision=472,baseRevision=471,patches=new[]{new{op="replace",path=new[]{"threadRuntimeStatus","activeFlags"},value=Array.Empty<string>()}}});
ledger.Apply("chat","owner",patch);
Check(!ledger.Threads().Single().Waiting,"current patch clears resolved approval");
var legacy=Ledger();legacy.Apply("chat","owner",Snapshot(20,null,true));legacy.Apply("chat","owner",Snapshot(19,null,false));
Check(legacy.Threads().Single().Waiting,"missing timestamps preserve original monotonic revision guard");
var paginated=Ledger();
var canonical=JsonSerializer.SerializeToElement(new {type="snapshot",revision=1,conversationState=new {
    threadRuntimeStatus=new {type="idle"},turns=Array.Empty<object>(),threadGoal=(object?)null,
    turnHistory=new {kind="canonical",history=new {entitiesByKey=new Dictionary<string,object>{
        ["turn:older"]=new {turnId="older",status="completed",turnStartedAtMs=100L},
        ["tail:newer"]=new {turnId="newer",status="interrupted",turnStartedAtMs=200L}
    }}}
}});
paginated.Apply("chat","owner",canonical);
Check(paginated.Threads().Single().LastTurnId=="newer","canonical history selects latest turn rather than empty legacy array");
Check(paginated.Threads().Single().LastTurnStatus=="interrupted","canonical interrupted status is preserved");
var historyPatch=JsonSerializer.SerializeToElement(new {type="patches",revision=2,baseRevision=1,patches=new[]{new {op="replace",path=new[]{"turnHistory","history","entitiesByKey","tail:newer","status"},value="completed"}}});
Check(paginated.Apply("chat","owner",historyPatch),"canonical history update requests a fresh snapshot");
Check(!paginated.Read().Available,"incomplete history refresh cannot report ready");
var exe=Environment.ProcessPath!;
var launch=DesktopLaunch.Create(exe,"00000000-0000-0000-0000-000000000001");
Check(launch.ArgumentList.SequenceEqual(new[]{"--single-argument","codex://threads/00000000-0000-0000-0000-000000000001"}),"cold launch carries the exact thread URL as one argument");
Check(!launch.UseShellExecute,"desktop launch avoids shell command parsing");
var rejected=false;try{DesktopLaunch.Create(exe,"bad\" --argument");}catch(InvalidDataException){rejected=true;}
Check(rejected,"invalid thread identifiers cannot become launch arguments");
Check(AccountErrors.Describe(null)==null,"successful account has no error");
Check(AccountErrors.Describe(AccountErrors.Expired)!.Contains("Přihlášení vypršelo"),"expired login has a Czech actionable message");
Check(AccountErrors.Describe(AccountErrors.InvalidFormat)!.Contains("neplatný formát"),"invalid response format has a fixed message");
Check(AccountErrors.Describe(AccountErrors.Connection)!.Contains("připojení"),"usage connection failure is distinct from expired login");
Check(!AccountErrors.Describe("access_token=synthetic-secret")!.Contains("synthetic-secret"),"unknown errors never expose raw secret-bearing messages");
if(OperatingSystem.IsWindows())await DesktopCloseFixture.VerifyAsync();
Console.WriteLine("24 regression checks passed");

Check(ChatTitle.Resolve(null,"Captured title")=="Captured title","unnamed canonical chat preserves captured desktop title");
Check(ChatTitle.Resolve("Stored name","Captured title")=="Stored name","explicit stored chat name takes precedence");
Check(ChatTitle.Resolve(" ","Captured title")=="Captured title","blank canonical name uses captured title");
try{ChatTitle.Resolve(null," ");throw new Exception("Missing title accepted");}catch(InvalidDataException){Console.WriteLine("PASS missing titles fail before account changes");}
