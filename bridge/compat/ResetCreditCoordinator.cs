using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
namespace CodexAccountDesk;

// One logical redemption per observed exhaustion episode. No tokens, emails,
// raw server messages or quota timestamps enter this persistence file.
internal sealed class ResetCreditCoordinator
{
    internal sealed record Entry(string IdempotencyKey,string Outcome,long NextAttemptAt);
    internal sealed record ConfirmedUse(long ConfirmedAt,string Source);
    private readonly record struct ConfirmedUseEvent(long ConfirmedAt,string Source);
    private readonly string _historyFile;
    private readonly string _eventsFile;
    private readonly Dictionary<string,ConfirmedUse> _history;
    private readonly Dictionary<string,List<ConfirmedUseEvent>> _events;
    internal ConfirmedUse? LastConfirmedUse(string accountKey){lock(_sync)return _history.TryGetValue(Key(accountKey),out var use)?use:null;}
    internal ConfirmedUse? LastAutomaticUse(string accountKey){var use=LastConfirmedUse(accountKey);return use?.Source=="automation"?use:null;}
    private readonly string _file;
    private readonly object _sync=new();
    private readonly Dictionary<string,Entry> _entries;
    internal ResetCreditCoordinator(string directory)
    {
        _historyFile=Path.Combine(directory,"reset-credit-history.json");
        _eventsFile=Path.Combine(directory,"reset-credit-history-events.json");
        _history=File.Exists(_historyFile)?JsonSerializer.Deserialize<Dictionary<string,ConfirmedUse>>(File.ReadAllText(_historyFile))??new():new();
        _events=File.Exists(_eventsFile)?JsonSerializer.Deserialize<Dictionary<string,List<ConfirmedUseEvent>>>(File.ReadAllText(_eventsFile))??new():new();
        foreach(var previous in _history)
            if(!_events.ContainsKey(previous.Key))
                _events[previous.Key]=new(){new(previous.Value.ConfirmedAt,previous.Value.Source)};
        _file=Path.Combine(directory,"reset-credit-intents.json");
        _entries=File.Exists(_file)?JsonSerializer.Deserialize<Dictionary<string,Entry>>(File.ReadAllText(_file))??new():new();
    }
    private static string Key(string accountKey)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(accountKey)));
    private void Save()=>SecureFiles.AtomicWriteText(_file,JsonSerializer.Serialize(_entries));
    internal void Observe(string key,UsageSnapshot usage)
    {
        if(!ResetCreditPolicy.IsClear(usage))return;
        lock(_sync)if(_entries.Remove(Key(key)))Save();
    }
    internal bool ShouldAttempt(string key,UsageSnapshot usage,long? nowMs=null)
    {
        var now=nowMs??DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if(usage.CheckedAt.ToUnixTimeMilliseconds()<now-10*60*1000||usage.CheckedAt.ToUnixTimeMilliseconds()>now+60000||!ResetCreditPolicy.TryEligible(usage,out _))return false;
        lock(_sync)return !_entries.TryGetValue(Key(key),out var prior)||
            (prior.Outcome is not ("reset" or "alreadyRedeemed")&&prior.NextAttemptAt<=now);
    }
    internal async Task<UsageSnapshot> ConsumeAsync(string key,string expectedAccountId,UsageSnapshot usage,
        Func<string,object,Task<JsonElement>> request,Func<bool> ownsRegistration,CancellationToken cancellation,long? nowMs=null,string source="automation")
    {
        if(source is not ("automation" or "manual"))throw new ArgumentException("Invalid reset source.");
        cancellation.ThrowIfCancellationRequested();
        if(!ownsRegistration())return usage;
        var now=nowMs??DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if(usage.CheckedAt.ToUnixTimeMilliseconds()<now-10*60*1000||usage.CheckedAt.ToUnixTimeMilliseconds()>now+60000)return usage;
        Observe(key,usage);
        if(!ShouldAttempt(key,usage,now))return usage;
        var hashed=Key(key);Entry intent;
        lock(_sync)
        {
            if(_entries.TryGetValue(hashed,out var prior))
            {
                if(prior.Outcome is "reset" or "alreadyRedeemed"||prior.NextAttemptAt>now)return usage;
                intent=prior with {Outcome="pending",NextAttemptAt=now+5*60*1000};
            }
            else intent=new(Guid.NewGuid().ToString(),"pending",now+5*60*1000);
            _entries[hashed]=intent;
            Save(); // A request is forbidden until its stable key is durable.
        }
        if(!ownsRegistration())return usage;
        cancellation.ThrowIfCancellationRequested();
        var response=await request("account/rateLimitResetCredit/consume",new{idempotencyKey=intent.IdempotencyKey}).ConfigureAwait(false);
        var outcome=JsonValue.String(response,"outcome");
        if(outcome is not ("reset" or "alreadyRedeemed" or "nothingToReset" or "noCredit"))throw new IOException("Unknown reset-credit outcome.");
        lock(_sync){_entries[hashed]=intent with {Outcome=outcome};Save();}
        if(outcome=="reset")
        {
            lock(_sync)
            {
                var confirmedAt=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                _history[hashed]=new(confirmedAt,source);
                if(!_events.TryGetValue(hashed,out var events))_events[hashed]=events=new();
                events.Add(new(confirmedAt,source));
                SecureFiles.AtomicWriteText(_eventsFile,JsonSerializer.Serialize(_events));
                SecureFiles.AtomicWriteText(_historyFile,JsonSerializer.Serialize(_history));
            }
        }
        cancellation.ThrowIfCancellationRequested();
        if(!ownsRegistration())return usage;
        var fresh=ResetCreditMetadata.Parse(await request("account/rateLimits/read",new{}).ConfigureAwait(false),expectedAccountId);
        Observe(key,fresh);
        return fresh;
    }

    // Shared by real renewal and reset-only app-server sessions. Never acknowledge
    // a runtime as committed after a save failure or a lost revision race.
    internal static bool CommitCredentials(AccountVault vault,AccountProfile profile,long revision,string source,string candidate,
        Func<string?> canonical,RuntimeHome home)
    {
        if(AuthDocument.Parse(candidate).Key!=profile.Key)throw new IOException("Credential identity mismatch.");
        lock(vault.SyncRoot)
        {
            if(!vault.Data.Accounts.Contains(profile)||profile.CredentialRevision!=revision||profile.AuthJson!=source)return false;
            if(SessionCredentialPolicy.IsDesktopOwned(profile.Key,profile.RequiresApply,canonical()))return false;
            if(profile.AuthJson!=candidate)vault.Upsert(candidate);
            vault.Save();
            home.CredentialsSaved();
            return true;
        }
    }
}
