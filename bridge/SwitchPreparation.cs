using CodexAccountDesk;

// This backend never renames chats. A missing display title is not a missing
// identity: CaptureAsync verifies the exact discovered thread before this point.
internal static class SwitchPreparation
{
    public static async Task<AccountSwitchPlan> PrepareAsync(IAccountSwitchBackend backend,
        string target, DateTimeOffset at, Action<AccountSwitchPlan> checkpoint, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var source=await backend.CurrentAccountAsync(ct);
        var chats=await backend.CaptureAsync(ct);
        if(chats.Length!=1 || !Guid.TryParse(chats[0].Id,out _))
            throw new InvalidDataException("Rozpracovaný chat nemá jednoznačnou ověřenou identitu.");
        foreach(var chat in chats)chat.BackupTitle=chat.OriginalTitle;
        ct.ThrowIfCancellationRequested();
        var plan=new AccountSwitchPlan {SourceAccountKey=source,TargetAccountKey=target,
            RequestedAt=at,Chats=chats.ToList(),Phase=SwitchPhase.BackingUp};
        checkpoint(plan);
        return plan;
    }
}
