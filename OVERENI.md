# Ověření verze 0.2.3 / Validation

## Česky

Veřejná verze používá pouze ukázkové adresy `example.com`. Vlastní seznam účtů musí uživatel vytvořit místně v `%LOCALAPPDATA%\CodexAccountMonitor\accounts.json` a každý účet přihlásit oficiálním postupem. Součástí repozitáře ani zdrojového balíčku nejsou hesla, tokeny, přihlášení, šifrovaný trezor, konfigurace konkrétních účtů, soukromé protokoly ani historie chatů.

Verze 0.2.3 přenáší opravy prvního otevření původního chatu, čtení kanonické historie, aktualizace aktivního účtu po částečném selhání a čekání hostitele pouze na monitor místo celého stromu potomků. Přidává bezpečné české hlášky přihlášení a povinné regresní kontroly při sestavení. Opravená je také diakritika manifestu pluginu.

Místní kontrola veřejných zdrojů: **32 testů Node**, včetně konfigurace, izolovaného HTTP serveru, odmítnutí cizího původu, chybějícího oprávnění a neplatného cíle, duplicitního startu, obnovy monitoru, neopakování nejasného požadavku a kontroly souborů distribuce. Integrační testy používají pouze syntetické účty a náhradní nebo nedostupné CLI. Nečtou skutečné přihlášení ani nepřepínají skutečný účet.

Pomocník se sestavil pro Windows x64 na .NET SDK 10.0.402 a prošel **18 regresními kontrolami** revizí, aktuálního schválení, kanonické historie, prvního spuštění chatu a bezpečných chybových hlášek.

Sdílená logika přepínání prošla v soukromé instalaci živým ověřením všech **12 směrů mezi čtyřmi účty**. U každého se ověřila cílová identita, zachovaný název, nové pokračování ve stejném chatu, dokončený přechod a spojení s desktopem. Záznamy ani údaje těchto účtů se sem nekopírují. Veřejná místní konfigurace se ověřuje samostatnými syntetickými testy; veřejné vydání se nevydává za nové živé přihlášení provedené za budoucího uživatele.

Veřejná kopie má oddělenou datovou složku, katalog a výchozí port **55163**. Soukromou instalaci neinstaluje, nečte její konfiguraci a nepřepisuje ji. Po vlastní instalaci ovládá místní Codex přihlášeného uživatele; při ručním přepnutí ovlivní jeho okna a klienty sdílející stejné přihlášení.

Distribuce používá výslovný seznam `distribution-files.json`. Test povoluje pouze ukázkové e-mailové domény, odmítá provozní a autentizační soubory a známé vzory přístupových klíčů. Kontrola seznamu nenahrazuje posouzení změn před zveřejněním. Aktuální i předchozí veřejné revize byly navíc zkontrolovány na osobní adresy a skutečné přístupové údaje.

Budoucí verze desktopového protokolu, dlouhodobá platnost přihlášení a dostupnost služby nejsou zaručené. Přepnutí zůstává ruční a nejistý výsledek pokračování se automaticky neopakuje. Systémem blokovaná hardwarová knihovna upstream projektu není součástí pomocníka.

## English

Version 0.2.3 includes the corrected cold launch of the original chat, canonical turn history, account reconciliation after partial failure, and monitor host recovery without waiting for descendant processes. The public package contains example addresses and reviewed sources only. Each user provides a local account list and completes their own official login; credentials, account vaults, private configuration, chat histories, and private test records are excluded.

Validation: **32 Node tests** using synthetic accounts and isolated or replacement CLI processes, plus a successful Windows x64 build and **18 .NET regression checks**. The shared switching logic was separately verified in a private installation across all **12 directed transitions between four accounts**. The configurable public edition is not claimed to have authenticated or switched accounts on behalf of a future user.

The public edition uses its separate local data folder, catalog, and default port **55163**. Distribution is restricted to `distribution-files.json`; a regression check rejects non-example email domains, runtime authentication files, and known credential patterns. Real switching affects the installing user's local Codex clients sharing the same login. Future internal protocol changes and uninterrupted service availability are not guaranteed.