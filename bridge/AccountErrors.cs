// Only fixed, reviewed messages leave the account library; raw server errors may contain secrets.
internal static class AccountErrors
{
    internal const string Expired = "\ub85c\uadf8\uc778\uc774 \ub9cc\ub8cc\ub418\uac70\ub098 \ucde8\uc18c\ub410\uc2b5\ub2c8\ub2e4. \uacc4\uc815 \ucd94\uac00\ub85c \ub2e4\uc2dc \ub85c\uadf8\uc778\ud574 \uc8fc\uc138\uc694.";
    internal const string InvalidFormat = "\ub85c\uadf8\uc778 \uc815\ubcf4 \ub610\ub294 Codex \uc751\ub2f5\uc758 \ud615\uc2dd\uc774 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. \ub2e4\uc2dc \ub85c\uadf8\uc778\ud574 \uc8fc\uc138\uc694.";
    internal const string Connection = "Codex \uc11c\ubc84\uc5d0\uc11c \uc0ac\uc6a9\ub7c9\uc744 \uac00\uc838\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \uc5f0\uacb0\uc744 \ud655\uc778\ud558\uace0 \uc0c8\ub85c \uace0\uce68\ud574 \uc8fc\uc138\uc694.";
    internal static string? Describe(string? error) => error switch
    {
        null => null,
        "session_refresh_backoff" => "Obnova přihlášení čeká po neúspěšném pokusu. Přihlášení zůstává uložené; další pokus proběhne automaticky.",
        "session_account_unavailable" => "Služba nyní nepotvrdila přihlášený účet. Přihlášení zůstává uložené; kontrola se zopakuje.",
        "desktop_session_refresh_pending" => "Čekám na automatickou obnovu přihlášení v Codexu. Kontrola se zopakuje.",
        "usage_check_retry" => "Kontrola limitů se nezdařila. Přihlášení zůstává uložené; kontrola se zopakuje.",
        "usage_identity_mismatch" => "Služba vrátila limity jiného účtu; tento údaj nebyl použit.",
        "session_reauthentication_required" => "Služba potvrdila neplatné obnovovací přihlášení. Tento účet vyžaduje nové přihlášení.",
        Expired => "Přihlášení vypršelo nebo bylo zrušeno. Přihlas tento účet znovu.",
        InvalidFormat => "Odpověď kontroly má neplatný formát. Přihlášení zůstává uložené; kontrola se zopakuje.",
        Connection => "Codex nevrátil údaje o využití. Zkontroluj připojení a zopakuj kontrolu.",
        _ => "Účet se nepodařilo ověřit. Přihlášení zůstává uložené; zopakuj kontrolu."
    };
}
