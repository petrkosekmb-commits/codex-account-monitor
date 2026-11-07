## Aktualizace 5. listopadu 2026

- Předplatné má jednoduchou vodorovnou čáru: plná délka představuje 31 dní, 15 dní přibližně polovinu. Po vypršení je prázdná; neznámé datum se nezobrazuje jako ověřená platnost.
- Zelený puntík připojeného účtu má při potvrzeném vyčerpání limitu výraznou červenou auru. Neznámý nebo zastaralý stav se nadále posuzuje samostatně.
- Kruhové odpočty a zbývající limity jsou nad předplatným. Ovládání obnovy údajů, automatiky a ručního přepnutí je nahoře.
- Pravidelná kontrola ani automatika samovolně nespotřebují uložený reset. Automatika vybírá ověřený účet s volným limitem; reset vyžaduje výslovné potvrzení konkrétního účtu a ověřené vyčerpání týdenního limitu. Reset aktivního účtu se potvrzuje v Codexu.
- Přehled zobrazuje dostupný počet resetů, známé vypršení a doložené poslední použití. Podpora rozhraní je doplněna také v serveru a pomocníkovi.
- Přepínání zachovává kontrolu aktuálního chatu, čekajících schválení, souběžné práce a neověřených přechodů. Výpadek seznamu chatů nezahodí pozorovaný tah; ochrana proti opakování se vztahuje na konkrétní tah a limit.
- Změna e-mailu na kartě ověřuje identitu, zálohuje konfiguraci a vypíná automatiku do nové kontroly. Hostitel umí načíst novou konfiguraci.
- Veřejná distribuce používá ukázkové identity a oddělený port. Přihlašovací údaje, provozní stav a osobní data nejsou součástí změny.

Ověření při uložení 5. listopadu 2026: veřejná sada 145/145 testů, privátní sada 139/139 testů; sestavení veřejného pomocníka dokončeno bez chyb a upozornění. Testy používají syntetické účty. Vzhled a aktuální stav byly ověřeny v místním přehledu. To samo nedokládá úspěšné nové automatické přepnutí účtu s pokračováním chatu.

## Oprava pripravy chatu bez nazvu / unnamed chat preparation

CZ: Opraveno selhani SwitchTitle.Stamp pred zmenou uctu. Prepinani zachova presny overeny identifikator chatu a puvodni nazev, vcetne chybejiciho nazvu. Nazev se neopatruje datem ani nemení. Blokace nejednoznacne ulohy a cekajiciho schvaleni zustavaji. Regrese pouziva synteticky backend; skutecne predani touto verzi zatim neni overene.

EN: Fixed SwitchTitle.Stamp failure before account application. Preparation preserves the verified thread ID and original title, including absent titles, without timestamping or renaming. Ambiguous work and pending approvals remain blocked. Regression coverage uses a synthetic backend; a live handoff with this version is not yet verified.

## 0.2.20 - spolehlive kliknuti pri obnovovani prehledu / reliable clicks during polling

CZ: Pravidelna obnova uz nevymeni tlacitko mezi stisknutim a uvolnenim mysi nebo klavesy. Prave odesilany pozadavek blokuje druhy klik a jeho stav i pripadna chyba zustanou viditelne. Prehled obsahuje ikonu se ctyrmi body a ctyri karty vedle sebe. Regrese pouzivaji pouze synteticke ucty. Toto vydani nedoklada nove skutecne prepnuti uctu ani dlouhodobou stabilitu prihlaseni. Nejednoznacny rozpracovany chat nadale blokuje prepnuti s pokracovanim.

EN: Polling no longer replaces a button between pointer/key press and release. An in-flight request prevents duplicate clicks, and progress or errors remain visible. The dashboard includes a four-dot favicon and four side-by-side account cards. Regressions use synthetic accounts only. This release does not establish a new live account handoff or long-term login stability. Ambiguous current work still blocks switching with continuation.

# Přehled účtů Codex 0.2.20

Místní přehled limitů čtyř účtů, kruhový odpočet do očekávané obnovy, údaje o platnosti předplatného a volitelné automatické přepínání. Nezávislý komunitní projekt pro Windows.

## Spuštění

Požadavky: Windows, Codex desktop a místní CLI, Node.js 20+, PowerShell 7 a .NET SDK 10.0.4xx pro sestavení pomocníka.

Veřejná edice obsahuje pouze čtyři ukázkové adresy. Vlastní seznam má přednost v místním souboru accounts.json v datové složce; obsahuje objekt s polem accounts se čtyřmi různými adresami. Při zastaveném monitoru lze adresu nahradit nebo účty přeskládat. Verze 0.2.7 nejprve zálohuje původní stav do místní složky backups, zachová historii podle identity a nový účet založí bez starých limitů. Automatika se při změně seznamu vypne. Vyřazené přihlášení zůstává chráněné místně pro případ návratu, ale účet se nekontroluje ani nenabízí k přepnutí. Nedokončený přechod nejprve dokončete s původním seznamem. Provozní data jsou v %USERPROFILE%\Codex\account-monitor. Přihlašovací údaje součástí zdrojů nejsou.

Spusťte bridge/Build.ps1, potom Install.ps1 a Spustit-prehled.cmd. Zdrojový ZIP neobsahuje sestavené binární soubory; sestavení je nutné. Skript ověřuje otisk připnutých zdrojů codex-switch a spouští 20 regresních kontrol. Přehled: http://127.0.0.1:55162. Účty se připojují oficiálním přihlášením v prohlížeči.

## Přehled a přepínání

Procenta ukazují zbývající zahrnutý limit. Kruhová výseč ubývá podle času do očekávané obnovy pětihodinového nebo týdenního okna. Zastaralé údaje jsou šedé; uplynutí odpočtu samo nepotvrzuje dostupnost. Historie zaznamenává zjištění vyčerpání, nikoli přesný okamžik vzniku. Další modelové limity se neporovnávají.

Sekce Předplatné ukazuje tarif, údaj z přihlášení o platnosti a čas jeho posledního ověření. Nejde o expiraci přístupového tokenu. Datum příští platby ani automatické prodloužení se neodvozuje; není-li ověřené, přehled to výslovně uvádí.

Ruční přepnutí se spouští tlačítkem Přepnout a pokračovat. Chat už není potřeba vybírat: přehled automaticky rozpozná právě běžící místní chat, případně poslední jednoznačně rozpracovaný chat po přerušení. Staré uložené volby nemají přednost. Pokud současně běží více chatů nebo některý čeká na odpověď, přepnutí vyčká. Dokončená práce se sama znovu nespouští.

Volitelná automatika se zapíná samostatně v přehledu a kontroluje stav každých 30 sekund. Po potvrzeném vyčerpání aktuálního účtu vybírá připojený účet s největší rezervou. Staré údaje a nedokončený přechod automatiku blokují. Při neověřeném výsledku se vypne. Placené kredity se nenakupují ani nezapínají.

Uložený reset se čerpá pouze po výslovném potvrzení konkrétního účtu při ověřeném vyčerpání týdenního limitu. Samotná automatika ani Obnovit údaje jej nespotřebují. Výsledek použití se ověřuje novým načtením limitů.

Přepnutí krátce zavře všechna okna Codexu, změní přihlášení a obnoví rozpracované místní chaty. Ovlivní také klienty sdílející stejné přihlášení. Názvy zůstávají zachované. Dokončené chaty se znovu nespouštějí. Nejasný výsledek odeslání pokračování se automaticky neopakuje. Nedokončený přechod je možné ručně obnovit; zahození je dovoleno pouze před změnou účtu a bez neověřeného odeslání.

## Provoz a soukromí

Úloha Windows spouští monitor po přihlášení uživatele a obnovuje hostitele po výpadku. Používá běžná práva bez uloženého hesla. Při vypnutém nebo odhlášeném počítači monitor nepracuje. Čerstvost dat je 10 minut. Běžná kontrola bez zapnuté automatiky běží po pěti minutách. Otevřená stránka obnoví místní oprávnění po restartu serveru.

DPAPI trezor, přístupy, provozní stav, databáze a logy zůstávají pouze místně. Nepřidávejte je do GitHubu ani hlášení chyb. MCP nástroje account_overview a refresh_limits pouze čtou a obnovují údaje; přepínání ovládá místní přehled. ACCOUNT_MONITOR_DATA, ACCOUNT_MONITOR_PORT a ACCOUNT_MONITOR_CODEX upravují datovou složku, port a cestu k CLI.

## Ověření a omezení

Tato verze obsahuje opravy cíleného zavírání desktopu, nezávislého hostitele a obnovy spojení při otevírání více chatů. Testy a zbývající omezení jsou v OVERENI.md. Úplné ověření automatického spouštěče při skutečném vyčerpání zůstává otevřené; tato verze netvrdí, že byly odstraněny všechny možné chyby.

Testy: npm test. Původ knihoven a licence: THIRD_PARTY_NOTICES.md a bridge/LICENSE-codex-switch.txt. Oficiální popis App Serveru: https://learn.chatgpt.com/docs/app-server.
## Místní oprava 0.2.8

Aktivní přihlašovací relaci obnovuje pouze Codex. Přehled čte limity pevným GET požadavkem na oficiální usage endpoint a nepředává kopii obnovovacího tokenu dalšímu procesu. Neaktivní účty nadále obnovuje pomocník, se zachováním nejnovějších údajů v chráněném trezoru. Dočasná chyba kontroly ani samostatná odpověď 401 nejsou označovány jako potvrzeně neplatná relace. Nové přihlášení je požadováno pouze při potvrzeném terminálním selhání obnovovacího tokenu.

## 0.2.14 — zachování vybraného chatu / preserve selected chat

CZ: Výpadek seznamu již nepřepne volbu na jiný chat. Nedostupný výběr zůstává zachován a odeslání je blokováno, dokud se chat nevrátí nebo uživatel nezvolí jiný. Sjednoceno číslo verze v přehledu, pluginu a pomocníkovi. Ověřeno třemi regresními testy a testem skutečného prohlížeče proti syntetickému API. Toto vydání neřeší opakované odhlašování a nedokládá živé předání účtu s pokračováním.

EN: A temporary thread-list gap no longer changes the selected thread. An unavailable selection is retained and sending is blocked until the thread returns or the user explicitly selects another one. Dashboard, plugin and helper versions are aligned. Verified by three regression tests and a real-browser test against a synthetic API. This release does not resolve recurring sign-outs or establish successful live account handoff and continuation.

## 0.2.19 - filtrovana historie rozhodnuti automatiky

Dashboard zobrazuje poslednich dvanact bezpecne filtrovanych rozhodnuti automatiky. U kazdeho je duvod, stav spojeni a pocty uloh; nezobrazuji se nazvy, texty chatu, tokeny ani prihlasovaci udaje. Tato historie pomaha rozlisit cekani na overeni, blokaci soubehem, nejednoznacny chat a skutecne zahajeny prechod.

English: Version 0.2.19 adds an allowlisted automation-decision history to the dashboard. It shows the reason, connection state and task counts without chat titles, chat text, tokens or credentials, making skipped and started automatic switches auditable.

## 0.2.17 - cekani na limit a presnejsi obnoveni prihlaseni

- Automatika uchova konkretni cekajici tah az 24 hodin, pokud je ucet stale vycerpany. Novy tah, dokonceni, zmena uctu nebo limitoveho okna cekani zrusi. Dalsi aktivni chat zustava prekazkou prepnuti.
- Povinne vybirani chatu bylo odstraneno. Rucni prepnuti i automatika pouzivaji stejny aktualni stav rozpracovaneho chatu; stara ulozena volba se ignoruje. Nova prace v jinem chatu zrusi cekani na puvodni chat. Pri nejednoznacnem stavu se nic neodesila.
- Overovani pokracovani snese docasne chybejici historii s celkovou rezervou 30 sekund. Odeslani zpravy se neopakuje. Skutecny neuspesny tah, zmena identity a cekajici schvaleni zustavaji samostatnymi vysledky.
- Obecne odmitnuti pristupoveho tokenu se nezamenuje za prokazane odmitnuti obnovovaciho tokenu. Pomocnik uchovava jen povolene kody chyb; puvodni texty serveru ani prihlasovaci udaje se neloguji.
- Pouze stare terminalni zaznamy bez zachovaneho duvodu dostanou jednorazove nove posouzeni. Dolozene odmitnuti obnovovaciho tokenu zastavi dalsi obnovy a vyzaduje nove prihlaseni.
- Nejde o zaruku trvaleho prihlaseni. Vzdalenou sluzbou zrusene opravneni nelze obnovit bez uzivatele; testy odlisujeme od skutecneho automatickeho predani v provozu.

English: Version 0.2.17 removes the required chat picker. Manual and automatic switching resolve the current unfinished task from the same live snapshot, ignoring legacy pinned selections. An exact pending continuation survives quota waits and is cancelled by newer work in another chat. Multiple running tasks, pending user input and uncertain chronology remain guarded. A shared 30-second snapshot-gap budget improves verification without resending messages. Authentication distinguishes access-token failures from confirmed refresh-grant rejection and preserves only allowlisted error codes. Ambiguous legacy rejection records receive one persisted re-evaluation. Confirmed invalid grants stay blocked. Current reset behavior is described in the update dated 5 November 2026: explicit confirmation is required. This release does not promise permanent sign-in or treat simulated tests as live handoff proof.


## Podpora vývoje / Support development

Pokud vám projekt pomáhá, můžete dobrovolně podpořit jeho další vývoj a údržbu
na [Buy Me a Coffee](https://buymeacoffee.com/kojakcio). Příspěvek není podmínkou používání.

If this project helps you, you can optionally support its continued development
and maintenance on [Buy Me a Coffee](https://buymeacoffee.com/kojakcio).
Contributions are not required to use the project.
