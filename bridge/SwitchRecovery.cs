using CodexAccountDesk;
internal static class SwitchRecovery
{
    internal static bool CanDismiss(AccountSwitchPlan plan,string? current)
        => !plan.AccountApplied && current==plan.SourceAccountKey && current!=plan.TargetAccountKey
           && plan.Phase is not (SwitchPhase.Resuming or SwitchPhase.Finished)
           && plan.Chats.All(c=>c.ResumeState is ChatResumeState.Pending or ChatResumeState.Failed);
}
