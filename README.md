# Přehled účtů Codex 0.2.9

Místní přehled limitů čtyř účtů, kruhový odpočet do očekávané obnovy, údaje o platnosti předplatného a volitelné automatické přepínání. Nezávislý komunitní projekt pro Windows.

## Spuštění

Požadavky: Windows, Codex desktop a místní CLI, Node.js 20+, PowerShell 7 a .NET SDK 10.0.4xx pro sestavení pomocníka.

Nejdříve vytvořte %LOCALAPPDATA%\CodexAccountMonitor\accounts.json podle accounts.example.json a zadejte čtyři vlastní různé adresy. Hesla do konfigurace nepatří. Seznam lze změnit při zastaveném monitoru; verze 0.2.9 zachová ostatní účty a před změnou uloží původní historii do místní složky backups. Nový účet nemá převzaté limity ani přihlášení starého účtu. Automatika se při změně vypne, původní přihlášení zůstane pouze v chráněném místním trezoru a vyřazený účet se nekontroluje. Nedokončený přechod nejdříve vyřešte s původním seznamem. Provozní data jsou v %LOCALAPPDATA%\CodexAccountMonitor.

Spusťte bridge/Build.ps1, potom Install.ps1 a Spustit-prehled.cmd. Zdrojový ZIP neobsahuje sestavené binární soubory; sestavení je nutné. Skript ověřuje otisk připnutých zdrojů codex-switch a spouští regresní kontroly protokolu a přihlášení. Přehled: http://127.0.0.1:55163. Účty se připojují oficiálním přihlášením v prohlížeči.

## Přehled a přepínání

Procenta ukazují zbývající zahrnutý limit. Kruhová výseč ubývá podle času do očekávané obnovy pětihodinového nebo týdenního okna. Zastaralé údaje jsou šedé; uplynutí odpočtu samo nepotvrzuje dostupnost. Historie zaznamenává zjištění vyčerpání, nikoli přesný okamžik vzniku. Další modelové limity se neporovnávají.

Sekce Předplatné ukazuje tarif, údaj z přihlášení o platnosti a čas jeho posledního ověření. Nejde o expiraci přístupového tokenu. Datum příští platby ani automatické prodloužení se neodvozuje; není-li ověřené, přehled to výslovně uvádí.

Ruční přepnutí se spouští tlačítkem Přepnout a pokračovat. Volitelná automatika se zapíná samostatně v přehledu a kontroluje stav každých 30 sekund. Po potvrzeném vyčerpání aktuálního účtu vybírá připojený účet s největší rezervou. Staré údaje, čekající schválení a nedokončený přechod automatiku blokují. Při neověřeném výsledku se vypne. Placené kredity ani ruční obnovení limitu se nepoužívají.

Přepnutí krátce zavře všechna okna Codexu, změní přihlášení a obnoví vybraný rozpracovaný místní chat. Ovlivní také klienty sdílející stejné přihlášení. Názvy zůstávají zachované. Dokončené chaty se znovu nespouštějí. Nejasný výsledek odeslání pokračování se automaticky neopakuje. Nedokončený přechod je možné ručně obnovit; zahození je dovoleno pouze před změnou účtu a bez neověřeného odeslání.

## Provoz a soukromí

Úloha Windows spouští monitor po přihlášení uživatele a obnovuje hostitele po výpadku. Používá běžná práva bez uloženého hesla. Při vypnutém nebo odhlášeném počítači monitor nepracuje. Čerstvost dat je 10 minut. Běžná kontrola bez zapnuté automatiky běží po pěti minutách. Otevřená stránka obnoví místní oprávnění po restartu serveru.

DPAPI trezor, přístupy, provozní stav, databáze a logy zůstávají pouze místně. Nepřidávejte je do GitHubu ani hlášení chyb. MCP nástroje account_overview a refresh_limits pouze čtou a obnovují údaje; přepínání ovládá místní přehled. ACCOUNT_MONITOR_DATA, ACCOUNT_MONITOR_PORT a ACCOUNT_MONITOR_CODEX upravují datovou složku, port a cestu k CLI.

## Ověření a omezení

Tato verze obsahuje opravy cíleného zavírání desktopu, nezávislého hostitele a obnovy spojení při otevírání více chatů. Testy a zbývající omezení jsou v OVERENI.md. Úplné ověření automatického spouštěče při skutečném vyčerpání zůstává otevřené; tato verze netvrdí, že byly odstraněny všechny možné chyby.

Testy: npm test. Původ knihoven a licence: THIRD_PARTY_NOTICES.md a bridge/LICENSE-codex-switch.txt. Oficiální popis App Serveru: https://learn.chatgpt.com/docs/app-server.
## English: replacing an account (0.2.9)

Stop the monitor, edit the four distinct addresses in the local accounts.json, then restart it. The previous state is backed up locally in backups before the migration. Remaining identities retain their history, even after reordering. A replacement starts without the previous identity's usage or login. Removed credentials remain in the protected local vault for rollback, but are excluded from refresh and switching. Automation is disabled after a configuration change and can be enabled manually after verification. Finish any pending switch with the original account list first. No personal configuration is included in the repository.

## Oprava 0.2.9 / Fix 0.2.9

Příprava přechodu zachová ověřený název otevřeného chatu i při prázdném uloženém názvu. Přehled ukazuje fázi blokujícího přechodu. / Handoff preparation preserves the captured desktop title when the stored name is empty. Automation reports the phase of a blocking pending transition.

## Změny 0.2.9 / Changes

Jediný pomocník smí vlastnit jeden profil Codexu. Před spuštěním zastavte starší instalace, které tento zámek ještě nepodporují. Dokončený preferovaný chat neblokuje jediný jiný rozpracovaný chat; více rozpracovaných chatů přepnutí blokuje. Chyba zápisu nezablokuje další ukládání. Pád pomocníka zneplatní připravenost. Aktivní přihlášení obnovuje Codex; kontrola limitů používá pouze jeho přístupový token. Neaktivní účty mají oddělenou kontrolu s omezeným opakováním po 401.

Only one helper may own a Codex profile. Stop older installations that do not support the ownership lock before starting this version. A completed preferred chat no longer blocks the only ongoing chat; multiple ongoing chats block switching. Failed writes no longer poison subsequent saves, and helper failure invalidates readiness. Codex owns active-session renewal; active usage checks use only its access token. Inactive accounts use isolated checks with bounded recovery after HTTP 401.

Source packages contain no credentials or runtime data. Build the helper before installation. Existing installations are not overwritten by Install.ps1; stop the old monitor and preserve its data before a deliberate upgrade. Long-term renewal and switching at real quota exhaustion remain unverified.