using System;
using System.Linq;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json;
namespace CodexAccountDesk;
internal static class ResetCreditMetadata
{
    private sealed record Details(long[] Expirations,long? LastRedeemedAt);
    private static readonly ConditionalWeakTable<UsageSnapshot,Details> Values=new();
    internal static UsageSnapshot Parse(JsonElement root,string accountId)=>Attach(UsageSnapshot.Parse(root,accountId),root,false);
    internal static UsageSnapshot Attach(UsageSnapshot snapshot,JsonElement root,bool snake)
    {
        if(root.TryGetProperty(snake?"rate_limit_reset_credits":"rateLimitResetCredits",out var resets)&&resets.ValueKind==JsonValueKind.Object)
            return AttachDetails(snapshot,resets,snake);
        return snapshot;
    }
    private static long? Timestamp(JsonElement credit,string field)
    {
        if(!credit.TryGetProperty(field,out var value))return null;
        if(value.ValueKind==JsonValueKind.Number&&value.TryGetInt64(out var seconds))return seconds;
        if(value.ValueKind==JsonValueKind.String&&DateTimeOffset.TryParse(value.GetString(),CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal,out var date))return date.ToUnixTimeSeconds();
        return null;
    }
    internal static UsageSnapshot AttachDetails(UsageSnapshot snapshot,JsonElement details,bool snake)
    {
        var dates=Array.Empty<long>();
        if(details.TryGetProperty("credits",out var credits)&&credits.ValueKind==JsonValueKind.Array)
          dates=credits.EnumerateArray().Where(c=>c.ValueKind==JsonValueKind.Object&&JsonValue.String(c,"status")=="available")
            .Select(c=>Timestamp(c,snake?"expires_at":"expiresAt")).Where(t=>t is >0 and <4102444800L).Select(t=>t!.Value).OrderBy(t=>t).ToArray();
        long? redeemed=null;
        if(details.TryGetProperty("credits",out var used)&&used.ValueKind==JsonValueKind.Array)
          redeemed=used.EnumerateArray().Where(c=>c.ValueKind==JsonValueKind.Object&&JsonValue.String(c,"status")=="redeemed")
            .Select(c=>Timestamp(c,snake?"redeemed_at":"redeemedAt")).Where(t=>t is >0 and <4102444800L).OrderByDescending(t=>t).FirstOrDefault();
        Values.Remove(snapshot);Values.Add(snapshot,new(dates,redeemed));return snapshot;
    }
    internal static long? LastRedeemedAt(UsageSnapshot snapshot)=>Values.TryGetValue(snapshot,out var details)?details.LastRedeemedAt:null;
    internal static long[] Expirations(UsageSnapshot snapshot)=>Values.TryGetValue(snapshot,out var details)?details.Expirations:Array.Empty<long>();
}
