# Ověření verze 0.2.4

Prošlo 43 testů Node a 20 kontrol pomocníka .NET (soukromé edici 37 úplných testů před přidáním předplatného a následně všech 7 testů dashboardu). Kontroly zahrnují autentizaci místního HTTP rozhraní, izolaci konfigurace, výpadek procesu, částečné přepnutí, nejasné odeslání, čekající schválení, odpočet a předplatné. Veřejný distribuční seznam používá pouze adresy example.com a prošel kontrolou citlivých vzorů.

Živě byl ověřen přechod mezi dvěma funkčními účty: identita, zachovaný název, nové pokračování, vyčištění přechodu a přežití monitoru. Návrat původně uvázl při obnově druhého chatu; po doplnění nového zjištění spojení byl připravený přechod dokončen. Další pozorovaný přechod opět zachoval hostitele i pokračování.

Záznam posledního přechodu nedokazuje spouštěč automatického vyčerpání: snímek zdroje obsahoval 98 procent a záznam pokusů automatiky byl prázdný. Úplný test tohoto spouštěče je otevřený. Některá přihlášení hlásila chybu služby a uživatel požádal pokračovat bez jejich obnovy. Starší test 12 směrů patřil předchozí verzi a není důkazem opravy nového selhání.

Kruhový odpočet a platnost předplatného byly zkontrolovány také v místním rozhraní. Údaj o platnosti pochází z posledního přihlášení; datum další platby není ověřené. Soukromé údaje ani živé testovací záznamy nejsou součástí distribuce.