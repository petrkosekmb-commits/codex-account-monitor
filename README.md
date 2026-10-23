# Přehled účtů Codex 0.2.5

Místní přehled limitů čtyř účtů, kruhový odpočet do očekávané obnovy, údaje o platnosti předplatného a volitelné automatické přepínání. Nezávislý komunitní projekt pro Windows.

## Spuštění

Požadavky: Windows, Codex desktop a místní CLI, Node.js 20+, PowerShell 7 a .NET SDK 10.0.4xx pro sestavení pomocníka.

Nejdříve vytvořte %LOCALAPPDATA%\CodexAccountMonitor\accounts.json podle accounts.example.json a zadejte čtyři vlastní různé adresy. Hesla do konfigurace nepatří. Změna seznamu vyžaduje novou datovou složku. Provozní data jsou v %LOCALAPPDATA%\CodexAccountMonitor.

Spusťte bridge/Build.ps1, potom Install.ps1 a Spustit-prehled.cmd. Zdrojový ZIP neobsahuje sestavené binární soubory; sestavení je nutné. Skript ověřuje otisk připnutých zdrojů codex-switch a spouští 20 regresních kontrol. Přehled: http://127.0.0.1:55163. Účty se připojují oficiálním přihlášením v prohlížeči.

## Přehled a přepínání

Procenta ukazují zbývající zahrnutý limit. Kruhová výseč ubývá podle času do očekávané obnovy pětihodinového nebo týdenního okna. Zastaralé údaje jsou šedé; uplynutí odpočtu samo nepotvrzuje dostupnost. Historie zaznamenává zjištění vyčerpání, nikoli přesný okamžik vzniku. Další modelové limity se neporovnávají.

Sekce Předplatné ukazuje tarif, údaj z přihlášení o platnosti a čas jeho posledního ověření. Nejde o expiraci přístupového tokenu. Datum příští platby ani automatické prodloužení se neodvozuje; není-li ověřené, přehled to výslovně uvádí.

Ruční přepnutí se spouští tlačítkem Přepnout a pokračovat. Volitelná automatika se zapíná samostatně v přehledu a kontroluje stav každých 30 sekund. Po potvrzeném vyčerpání aktuálního účtu vybírá připojený účet s největší rezervou. Staré údaje, čekající schválení a nedokončený přechod automatiku blokují. Při neověřeném výsledku se vypne. Placené kredity ani ruční obnovení limitu se nepoužívají.

Přepnutí krátce zavře všechna okna Codexu, změní přihlášení a obnoví rozpracované místní chaty. Ovlivní také klienty sdílející stejné přihlášení. Názvy zůstávají zachované. Dokončené chaty se znovu nespouštějí. Nejasný výsledek odeslání pokračování se automaticky neopakuje. Nedokončený přechod je možné ručně obnovit; zahození je dovoleno pouze před změnou účtu a bez neověřeného odeslání.

## Provoz a soukromí

Úloha Windows spouští monitor po přihlášení uživatele a obnovuje hostitele po výpadku. Používá běžná práva bez uloženého hesla. Při vypnutém nebo odhlášeném počítači monitor nepracuje. Čerstvost dat je 10 minut. Běžná kontrola bez zapnuté automatiky běží po pěti minutách. Otevřená stránka obnoví místní oprávnění po restartu serveru.

DPAPI trezor, přístupy, provozní stav, databáze a logy zůstávají pouze místně. Nepřidávejte je do GitHubu ani hlášení chyb. MCP nástroje account_overview a refresh_limits pouze čtou a obnovují údaje; přepínání ovládá místní přehled. ACCOUNT_MONITOR_DATA, ACCOUNT_MONITOR_PORT a ACCOUNT_MONITOR_CODEX upravují datovou složku, port a cestu k CLI.

## Ověření a omezení

Tato verze obsahuje opravy cíleného zavírání desktopu, nezávislého hostitele a obnovy spojení při otevírání více chatů. Testy a zbývající omezení jsou v OVERENI.md. Úplné ověření automatického spouštěče při skutečném vyčerpání zůstává otevřené; tato verze netvrdí, že byly odstraněny všechny možné chyby.

Testy: npm test. Původ knihoven a licence: THIRD_PARTY_NOTICES.md a bridge/LICENSE-codex-switch.txt. Oficiální popis App Serveru: https://learn.chatgpt.com/docs/app-server.