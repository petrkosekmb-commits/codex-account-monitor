## Oprava pripravy chatu bez nazvu / unnamed chat preparation

CZ: Opraveno selhani SwitchTitle.Stamp pred zmenou uctu. Prepinani zachova presny overeny identifikator chatu a puvodni nazev, vcetne chybejiciho nazvu. Nazev se neopatruje datem ani nemení. Blokace nejednoznacne ulohy a cekajiciho schvaleni zustavaji. Regrese pouziva synteticky backend; skutecne predani touto verzi zatim neni overene.

EN: Fixed SwitchTitle.Stamp failure before account application. Preparation preserves the verified thread ID and original title, including absent titles, without timestamping or renaming. Ambiguous work and pending approvals remain blocked. Regression coverage uses a synthetic backend; a live handoff with this version is not yet verified.

# Overeni 0.2.20

Reprodukce v Edge pred opravou: obnova mezi pointerdown a pointerup zpusobila 0 pozadavku. Po oprave stejny test odesle prave 1 pozadavek. Regrese navic overuje klavesnici, pointercancel, blokaci duplicitniho kliknuti a zachovani chyb po obnoveni. scripts/test-browser-switch.cjs vyzaduje Playwright a Edge; vsechny HTTP pozadavky nahrazuje syntetickym API a neprepina skutecne ucty. Spusteni: node scripts/test-browser-switch.cjs.

Toto vydani nema novy zivy test zmeny identity a pokracovani. Opravuje ztracene kliknuti; neprokazuje trvalost prihlaseni ani nerusi ochranu nejednoznacne rozpracovane ulohy.

# Ověření opravy 0.2.7

Živá kontrola našla přechod zastavený ve fázi BackingUp bez změny účtu a bez odeslání pokračování. Vybraný chat měl prázdné pole name v thread/read, ale platný název v zachyceném stavu desktopu. Pomocník nyní zachovává tento název bez přejmenování. Chybějí-li oba názvy, přechod se stále zastaví před změnou účtu. Automatika ukazuje konkrétní fázi nedokončeného přechodu.

Prošlo 47 testů soukromé edice, 49 testů veřejné edice a 24 kontrol pomocníka .NET. Regrese zahrnují prázdný název, přednost uloženého názvu a odmítnutí chatu bez ověřeného názvu. Skutečné přepnutí během dalších běžících úloh nebylo při této opravě vyvoláváno; úplné ověření automatiky při skutečném vyčerpání zůstává otevřené.

# Ověření verze 0.2.6

Prošlo všech 46 testů soukromé edice, 48 testů veřejné edice a 20 regresních kontrol každého sestaveného pomocníka .NET. Nové kontroly ověřují výměnu účtu se zálohou přesných původních dat, zachování historie podle identity při změně pořadí, vypnutí automatiky, prázdné údaje nového účtu, blokaci nedokončeného přechodu a odmítnutí poškozené konfigurace. Veřejný distribuční seznam obsahuje pouze příkladové adresy example.com.

Živě byla ověřena instalace 0.2.6, úspěšná migrace čtyř karet, zachování aktuální identity a připravený pomocník bez nedokončeného přechodu. Nový účet byl připojen oficiálním přihlášením, služba potvrdila jeho identitu, tarif a aktuální limity. Jeho přepnutí s pokračováním není tímto ověřeno. Původní stav a chráněný trezor zůstaly v místní záloze; vyřazený účet není zahrnut do dalších kontrol.

# Dřívější ověření verze 0.2.5

Prošlo 38 testů Node a 20 kontrol pomocníka .NET (soukromé edici 37 úplných testů před přidáním předplatného a následně všech 7 testů dashboardu). Kontroly zahrnují autentizaci místního HTTP rozhraní, izolaci konfigurace, výpadek procesu, částečné přepnutí, nejasné odeslání, čekající schválení, odpočet a předplatné. Veřejný distribuční seznam používá pouze adresy example.com a prošel kontrolou citlivých vzorů.

Živě byl ověřen přechod mezi dvěma funkčními účty: identita, zachovaný název, nové pokračování, vyčištění přechodu a přežití monitoru. Návrat původně uvázl při obnově druhého chatu; po doplnění nového zjištění spojení byl připravený přechod dokončen. Další pozorovaný přechod opět zachoval hostitele i pokračování.

Záznam posledního přechodu nedokazuje spouštěč automatického vyčerpání: snímek zdroje obsahoval 98 procent a záznam pokusů automatiky byl prázdný. Úplný test tohoto spouštěče je otevřený. Některá přihlášení hlásila chybu služby a uživatel požádal pokračovat bez jejich obnovy. Starší test 12 směrů patřil předchozí verzi a není důkazem opravy nového selhání.

Kruhový odpočet a platnost předplatného byly zkontrolovány také v místním rozhraní. Údaj o platnosti pochází z posledního přihlášení; datum další platby není ověřené. Soukromé údaje ani živé testovací záznamy nejsou součástí distribuce.