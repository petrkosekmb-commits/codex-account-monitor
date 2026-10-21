# Použité zdroje

Pomocník pro přepínání využívá knihovny projektu [Gaebabi/codex-switch](https://github.com/Gaebabi/codex-switch), vydání v1.41.1, zdrojový commit bfd96517e08d9e697c201ae7dc11588e12763c51. Nepoužívá jeho hardwarové, senzorové ani grafické moduly.

Při sestavení musí být zachována původní licence MIT ze zdrojového archivu. Výsledný balíček obsahuje její kopii jako `bridge/publish/LICENSE-codex-switch.txt`. Oficiální .NET runtime má vlastní licenční soubory v sestaveném balíčku.

Místní úpravy: české rozhraní v prohlížeči, čtyři konkrétní účty, zachování původních názvů chatů, ověření požadované adresy při přihlášení a přehled jednotlivých fází přechodu. Údaje o přihlášení a připraveném přechodu zůstávají v místním šifrovaném úložišti; do GitHubu se ukládají jen zdroje.

Soubor `bridge/compat/SessionActivity.cs` je odvozený z původního souboru stejného názvu pod licencí MIT. Opravuje porovnávání snímků při novější aktualizaci stavu s nižší revizí. Při sestavení nahrazuje pouze tento soubor prostřednictvím `ProtocolOverride.targets`; původní stažené zdroje se nemění. Syntetické regresní testy jsou v `bridge/tests`.
