# Ověření / Validation

## Česky

Před zveřejněním prošlo 21 testů aplikace, 6 syntetických regresních kontrol parseru a sestavení pomocníka pro Windows. Integrační test přehledu používá výhradně náhradní CLI a ukázkové účty; nečte skutečné přihlášení. Kontrola souborů pro publikaci povoluje pouze zkontrolované zdroje a e-mailové příklady na doméně `example.com`.

Soukromý předchůdce této aplikace prošel skutečným přepnutím mezi dvěma účty, novým otevřením Codexu a automatickým pokračováním ve stejném chatu. Při testu se opravilo ukončení pomocníka společně s Codexem i nesprávné řazení starších stavových snímků. Přechod skončil jako `Finished` bez nedokončeného přechodu. Veřejná kopie neobsahuje adresy, identifikátory chatů, osobní cesty ani záznamy tohoto testu.

Veřejná verze přidává místní konfiguraci čtyř účtů a samostatnou výchozí datovou složku a port. Syntetické testy kontrolují limity, čerstvost údajů, izolaci konfigurace, validaci adres, obsluhu tlačítka a řazení snímků při změně revizí. Živé přepnutí s novou konfigurovatelnou verzí není vydáváno za ověřené jen na základě testu soukromého předchůdce.

Nejsou ověřené všechny směry přepínání, další verze Codexu ani dlouhodobé chování při změnách interního desktopového protokolu. Při nejasném výsledku pokračování aplikace požadavek sama neopakuje. Systémem blokovaná hardwarová knihovna původního projektu není součástí pomocníka.

## English

Before publication, 21 application tests, 6 synthetic parser regressions, and the Windows helper build passed. The dashboard integration test uses a replacement CLI and example accounts only; it does not read real authentication. Publication checks admit only reviewed source files and email examples under `example.com`.

A private predecessor completed a real two-account switch, desktop restart, and automatic continuation in the same local chat. Testing uncovered and fixed the helper being terminated with Codex and incorrect ordering of older desktop-state snapshots. The handoff finished without a pending transition. This public copy contains no account addresses, chat identifiers, personal paths, or private test records from that run.

The public edition introduces local four-account configuration and separate default data and port settings. Synthetic tests cover usage rules, freshness, configuration isolation, address validation, dashboard actions, and snapshot ordering across revision resets. A live switch with the generalized public configuration has not been validated merely by the predecessor's successful test.

Not all switching directions, Codex releases, or long-term internal protocol changes have been tested. Uncertain continuation messages are not automatically retried. Hardware-monitoring assemblies from the upstream project are not included.

Obnova po ukončení / Process recovery: přehled používá uživatelský přihlašovací spouštěč a až tři pokusy o opětovné spuštění po chybě. The monitor starts at user sign-in and retries after process failures; account switching remains manual. A synthetic dashboard test verifies recovery from a stale local authorization key.

CZ: Obnova byla živě ověřena na místní instalaci řízeným ukončením procesu: nový proces se sám spustil, připojil ke Codexu a zachoval účet. Hostitel opakuje start nejvýše třikrát po třech sekundách, úloha Windows obnovuje hostitele po jedné minutě. Izolovaný test ověřuje duplicitní spuštění a start po neuklizeném zámku ukončeného procesu.

EN: Process recovery was verified on the local installation by terminating the monitor: a new process started automatically, reconnected to Codex, and preserved the account. The host retries up to three times after three seconds; Windows retries a failed host after one minute. An isolated test covers verified duplicate runs and restart with a stale lock left by a terminated process.
