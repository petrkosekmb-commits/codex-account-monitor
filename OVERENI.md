# Ověření 0.2.10 / Verification

Dne 25. října 2026 místní opravená instalace úspěšně dokončila skutečný ruční přechod a řízený automatický přechod mezi dvěma účty. Ověřena cílová identita, opětovné otevření desktopu, stejný chat, nový běžící tah, právě jeden požadavek a odstranění nedokončeného přechodu. Kontrola pokračování sledovala běh přibližně 90 sekund. Automatický test použil pouze syntetický signál vyčerpání v paměti, nikoli změnu skutečných limitů.

Dřívější neúspěšné pokusy nejsou označeny jako úspěch. Odhalily chybu čtení modulů procesu a příliš přísné odmítnutí dočasně nedostupného snímku. Obě opravy mají regresní ověření. Poslední výzva k novému přihlášení byla rozpracovaná přihlašovací operace; původní relace prošla další kontrolou bez nového přihlášení. To nevysvětluje všechny historické případy zrušení tokenu.

On 25 October 2026 the local repaired installation completed manual and controlled automatic handoffs, checking target identity, desktop reopening, the same chat, one new running continuation and cleared pending state. Verification observed continuation for approximately 90 seconds. Automatic triggering used an in-memory synthetic exhaustion signal. Long-term login stability and natural exhaustion are not proven. Earlier failed attempts remain failures; production logs, personal identities and credentials are excluded from this repository.

---
# Ověření 0.2.9 / Verification

Místní opravená instalace prošla přepnutím mezi dvěma účty a zpět (přibližně 48 a 56 sekund). Oba přechody zachovaly název chatu, každý vyvolal právě jedno pokračování, nezůstal nedokončený přechod a nastavení automatiky bylo obnoveno. Syntetické vyčerpání na kopii živého stavu vybralo vhodný účet a aktuální chat bez změny provozních limitů. Toto není živý test skutečného vyčerpání.

The locally repaired installation completed a round trip between two accounts in approximately 48 and 56 seconds. Each leg preserved the chat title, continued exactly once, cleared the pending transition and restored automation settings. A synthetic exhaustion decision used an in-memory copy and left real limits untouched. This does not establish behavior at real quota exhaustion.

Neověřeno / Not verified: dlouhodobá obnova přihlášení, skutečná expirace, všechny body pádu při rotaci tokenů, všechny budoucí dodatečné limity a plně bezobslužný provoz. Public a private zdrojové balíčky používají odlišné výchozí datové cesty; nejsou určeny k souběžnému běhu nad stejným profilem.
# Ověření opravy 0.2.7

Živá kontrola našla přechod zastavený ve fázi BackingUp bez změny účtu a bez odeslání pokračování. Vybraný chat měl prázdné pole name v thread/read, ale platný název v zachyceném stavu desktopu. Pomocník nyní zachovává tento název bez přejmenování. Chybějí-li oba názvy, přechod se stále zastaví před změnou účtu. Automatika ukazuje konkrétní fázi nedokončeného přechodu.

Prošlo 47 testů soukromé edice, 49 testů veřejné edice a 24 kontrol pomocníka .NET. Regrese zahrnují prázdný název, přednost uloženého názvu a odmítnutí chatu bez ověřeného názvu. Skutečné přepnutí během dalších běžících úloh nebylo při této opravě vyvoláváno; úplné ověření automatiky při skutečném vyčerpání zůstává otevřené.

# Ověření verze 0.2.6

Prošlo všech 46 testů soukromé edice, 48 testů veřejné edice a 20 regresních kontrol každého sestaveného pomocníka .NET. Nové kontroly ověřují výměnu účtu se zálohou přesných původních dat, zachování historie podle identity při změně pořadí, vypnutí automatiky, prázdné údaje nového účtu, blokaci nedokončeného přechodu a odmítnutí poškozené konfigurace. Veřejný distribuční seznam obsahuje pouze příkladové adresy example.com.

Živě byla ověřena instalace 0.2.6, úspěšná migrace čtyř karet, zachování aktuální identity a připravený pomocník bez nedokončeného přechodu. Nový účet byl připojen oficiálním přihlášením, služba potvrdila jeho identitu, tarif a aktuální limity. Jeho přepnutí s pokračováním není tímto ověřeno. Původní stav a chráněný trezor zůstaly v místní záloze; vyřazený účet není zahrnut do dalších kontrol.

# Dřívější ověření verze 0.2.5

Prošlo 43 testů Node a 20 kontrol pomocníka .NET (soukromé edici 37 úplných testů před přidáním předplatného a následně všech 7 testů dashboardu). Kontroly zahrnují autentizaci místního HTTP rozhraní, izolaci konfigurace, výpadek procesu, částečné přepnutí, nejasné odeslání, čekající schválení, odpočet a předplatné. Veřejný distribuční seznam používá pouze adresy example.com a prošel kontrolou citlivých vzorů.

Živě byl ověřen přechod mezi dvěma funkčními účty: identita, zachovaný název, nové pokračování, vyčištění přechodu a přežití monitoru. Návrat původně uvázl při obnově druhého chatu; po doplnění nového zjištění spojení byl připravený přechod dokončen. Další pozorovaný přechod opět zachoval hostitele i pokračování.

Záznam posledního přechodu nedokazuje spouštěč automatického vyčerpání: snímek zdroje obsahoval 98 procent a záznam pokusů automatiky byl prázdný. Úplný test tohoto spouštěče je otevřený. Některá přihlášení hlásila chybu služby a uživatel požádal pokračovat bez jejich obnovy. Starší test 12 směrů patřil předchozí verzi a není důkazem opravy nového selhání.

Kruhový odpočet a platnost předplatného byly zkontrolovány také v místním rozhraní. Údaj o platnosti pochází z posledního přihlášení; datum další platby není ověřené. Soukromé údaje ani živé testovací záznamy nejsou součástí distribuce.
Distribuce 0.2.9: všech 55 testů Node prošlo v každé edici, včetně kontroly distribučního seznamu. / All 55 Node tests passed in each edition, including the distribution allowlist check.

Distribuce 0.2.9: 55 testů Node v každé edici, sestavení obou pomocníků a protokolové i přihlašovací regrese prošly. / Both editions passed 55 Node tests, helper builds and protocol/credential regression suites.

Veřejná varianta 0.2.10: 64 testů Node, sestavení pomocníka, protokolové regrese a regrese přihlášení prošly. Distribuční seznam prošel kontrolou osobních adres a vzorů tajných údajů. / Public variant: all 64 Node tests, helper build, protocol and credential regression suites passed; distribution privacy checks passed.
