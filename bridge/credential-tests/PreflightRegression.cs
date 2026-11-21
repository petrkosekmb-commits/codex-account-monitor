using CodexAccountDesk;

internal static class PreflightRegression
{
    internal static void Run()
    {
        void Reject(Action action, string expected)
        {
            try { action(); throw new Exception("Unsafe preflight accepted"); }
            catch (SwitchPreconditionException e) { if (!e.Message.Contains(expected)) throw new Exception("Unexpected preflight diagnostic"); }
        }
        SwitchPreflight.Validate("source", "target", false, null);
        SwitchPreflight.ValidateSource("source", "source");
        Reject(() => SwitchPreflight.ValidateSource("source", "other"), "během přípravy změnil");
        Reject(() => SwitchPreflight.ValidateSource("source", null), "není ověřené");
        Reject(() => SwitchPreflight.ValidateSource(null, "source"), "není ověřené");
        Reject(() => SwitchPreflight.Validate(null, "target", false, null), "není ověřené");
        Reject(() => SwitchPreflight.Validate("target", "target", false, null), "už je aktivní");
        Reject(() => SwitchPreflight.Validate("source", "target", true, null), "Uložený přechod");
        var plan = new AccountSwitchPlan { SourceAccountKey = "source", TargetAccountKey = "target", AccountApplied = true,
            Phase = SwitchPhase.Resuming, Chats = new() { new SwitchChat { Id = Guid.NewGuid().ToString() } } };
        SwitchPreflight.Validate("target", "target", true, plan);
        Reject(() => SwitchPreflight.Validate("other", "target", true, plan), "Aktivní účet se");
        Reject(() => SwitchPreflight.Validate("source", "target", false, plan), "předchozí nedokončený");
        SwitchPreflight.ValidateTarget(null);
        Reject(() => SwitchPreflight.ValidateTarget("session_reauthentication_required"), "vyžaduje nové přihlášení");
        Reject(() => SwitchPreflight.ValidateTarget("usage_check_retry"), "kontrola se zopakuje");
        Reject(() => SwitchPreflight.ValidateTarget("secret-server-response"), "Účet se nepodařilo ověřit");
        Console.WriteLine("PASS preflight rejects missing/changed/current identities and reports safe target errors before any account write");
    }
}
