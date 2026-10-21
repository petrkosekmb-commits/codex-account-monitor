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
Console.WriteLine("6 regression checks passed");
