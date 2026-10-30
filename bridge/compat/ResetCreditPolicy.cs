using System;
using System.Linq;
namespace CodexAccountDesk;

internal static class ResetCreditPolicy
{
    internal static bool TryEligible(UsageSnapshot usage, out string windowKey)
    {
        windowKey=string.Join(",",usage.Buckets.Where(b=>b.Id=="codex").SelectMany(b=>new[]{(Key:b.Id+":primary",Window:b.Primary),(Key:b.Id+":secondary",Window:b.Secondary)})
            .Where(x=>x.Window?.Minutes is 300 or 10080 && double.IsFinite(x.Window.UsedPercent) && x.Window.UsedPercent>=100)
            .OrderBy(x=>x.Key)
            .Select(x=>x.Key+"@"+(x.Window!.ResetsAt?.ToString()??"unknown")));
        return usage.AvailableResets is > 0 && windowKey.Length>0;
    }

    internal static bool IsClear(UsageSnapshot usage) => usage.Buckets.Any(b=>b.Id=="codex" &&
        new[]{b.Primary,b.Secondary}.Any(w=>w?.Minutes==300) && new[]{b.Primary,b.Secondary}.Any(w=>w?.Minutes==10080) &&
        new[]{b.Primary,b.Secondary}.All(w=>w!=null&&double.IsFinite(w.UsedPercent)&&w.UsedPercent>=0&&w.UsedPercent<100));
}
