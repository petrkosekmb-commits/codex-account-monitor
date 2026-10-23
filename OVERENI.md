# Ověření verze 0.2.6

Prošlo všech 46 testů soukromé edice, 48 testů veřejné edice a 20 regresních kontrol každého sestaveného pomocníka .NET. Nové kontroly ověřují výměnu účtu se zálohou přesných původních dat, zachování historie podle identity při změně pořadí, vypnutí automatiky, prázdné údaje nového účtu, blokaci nedokončeného přechodu a odmítnutí poškozené konfigurace. Veřejný distribuční seznam obsahuje pouze příkladové adresy example.com.

Živě byla ověřena instalace 0.2.6, úspěšná migrace čtyř karet, zachování aktuální identity a připravený pomocník bez nedokončeného přechodu. Nový účet byl připojen oficiálním přihlášením, služba potvrdila jeho identitu, tarif a aktuální limity. Jeho přepnutí s pokračováním není tímto ověřeno. Původní stav a chráněný trezor zůstaly v místní záloze; vyřazený účet není zahrnut do dalších kontrol.

# Dřívější ověření verze 0.2.5

Prošlo 43 testů Node a 20 kontrol pomocníka .NET (soukromé edici 37 úplných testů před přidáním předplatného a následně všech 7 testů dashboardu). Kontroly zahrnují autentizaci místního HTTP rozhraní, izolaci konfigurace, výpadek procesu, částečné přepnutí, nejasné odeslání, čekající schválení, odpočet a předplatné. Veřejný distribuční seznam používá pouze adresy example.com a prošel kontrolou citlivých vzorů.

Živě byl ověřen přechod mezi dvěma funkčními účty: identita, zachovaný název, nové pokračování, vyčištění přechodu a přežití monitoru. Návrat původně uvázl při obnově druhého chatu; po doplnění nového zjištění spojení byl připravený přechod dokončen. Další pozorovaný přechod opět zachoval hostitele i pokračování.

Záznam posledního přechodu nedokazuje spouštěč automatického vyčerpání: snímek zdroje obsahoval 98 procent a záznam pokusů automatiky byl prázdný. Úplný test tohoto spouštěče je otevřený. Některá přihlášení hlásila chybu služby a uživatel požádal pokračovat bez jejich obnovy. Starší test 12 směrů patřil předchozí verzi a není důkazem opravy nového selhání.

Kruhový odpočet a platnost předplatného byly zkontrolovány také v místním rozhraní. Údaj o platnosti pochází z posledního přihlášení; datum další platby není ověřené. Soukromé údaje ani živé testovací záznamy nejsou součástí distribuce.