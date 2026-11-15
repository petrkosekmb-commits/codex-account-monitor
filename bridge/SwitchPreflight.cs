using CodexAccountDesk;

internal sealed class SwitchPreconditionException(string message):Exception(message) { }

// These checks run before any checkpoint, desktop close or account write.
internal static class SwitchPreflight
{
    internal static void Validate(string? source, string target, bool resume, AccountSwitchPlan? plan)
    {
        if (string.IsNullOrWhiteSpace(source))
            throw new SwitchPreconditionException("Aktivní přihlášení Codexu není ověřené. Přepnutí nebylo zahájeno.");
        if (resume)
        {
            if (plan == null || plan.TargetAccountKey != target || plan.Chats.Count != 1)
                throw new SwitchPreconditionException("Uložený přechod neodpovídá vybranému účtu a jednomu chatu. Pokračování nebylo odesláno.");
            if (plan.AccountApplied ? source != target : source != plan.SourceAccountKey && !(source == target && plan.Phase == SwitchPhase.Applying))
                throw new SwitchPreconditionException("Aktivní účet se od uloženého přechodu změnil. Tento přechod nelze bezpečně obnovit.");
        }
        else
        {
            if (plan != null) throw new SwitchPreconditionException("Nejdřív vyřeš předchozí nedokončený přechod.");
            if (source == target) throw new SwitchPreconditionException("Vybraný účet už je aktivní. Další přepnutí není potřeba.");
        }
    }

    internal static void ValidateTarget(string? error)
    {
        if (error != null)
            throw new SwitchPreconditionException("Kontrola cílového účtu selhala. " + AccountErrors.Describe(error));
    }

    internal static void ValidateSource(string? expected, string? actual)
    {
        if (string.IsNullOrWhiteSpace(expected) || string.IsNullOrWhiteSpace(actual))
            throw new SwitchPreconditionException("Aktivní přihlášení Codexu není ověřené. Přepnutí bylo zastaveno.");
        if (expected != actual)
            throw new SwitchPreconditionException("Aktivní účet se během přípravy změnil. Přepnutí bylo zastaveno.");
    }
}
