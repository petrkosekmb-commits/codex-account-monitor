# Codex Account Monitor

**CZ:** Místní přehled limitů čtyř účtů Codexu a ruční přepnutí s pokračováním v rozpracovaném chatu.

**EN:** A local usage dashboard for four Codex accounts, with manual account switching and continuation of unfinished chats.

Community project for Windows. The dashboard is currently in Czech. Documentation is provided in Czech and English. This is an independent project, not an official OpenAI product.

## Česky

### Co aplikace umí

- Ukazuje zbývající pětihodinové a týdenní limity a očekávané časy obnovy.
- Kontroluje účty každých pět minut při zapnutém počítači. Neznámé, staré a chybové údaje neoznačuje jako dostupné.
- Po ručním požadavku zavře Codex, přepne na dříve připojený účet, znovu otevře místní chat a pokračuje v něm.
- Zachovává název chatu a ukládá stav přechodu pro obnovu po přerušení. Nejisté pokračování automaticky neopakuje.
- Odmítá přepnutí, pokud Codex hlásí čekající schválení nebo odpověď uživatele.

Přepnutí ovlivní všechna okna Codexu a další klienty sdílející stejné přihlášení. Automatické střídání účtů se nenastavuje. Placené kredity ani ruční obnovení limitu se nepoužívají.

### Příprava a spuštění

Potřebujete Windows, nainstalovaný Codex desktop s místním CLI, Node.js 20 nebo novější, PowerShell 7 a .NET SDK 10.0.4xx pro sestavení pomocníka. Spouštěče umějí použít i existující běhové prostředí dodané s Codexem.

1. Stáhněte zdroje nebo naklonujte tento repozitář.
2. Připravte místní konfiguraci mimo repozitář:

```powershell
$settingsDir = Join-Path $env:LOCALAPPDATA 'CodexAccountMonitor'
New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
$accountsPath = Join-Path $settingsDir 'accounts.json'
if (Test-Path -LiteralPath $accountsPath) { throw 'Konfigurace už existuje; nejdřív ji zkontrolujte.' }
Copy-Item -LiteralPath .\accounts.example.json -Destination $accountsPath
notepad $accountsPath
```

3. Nahraďte všechny čtyři ukázkové adresy vlastními odlišnými adresami. Soubor obsahuje pouze seznam adres, nikoli hesla. Při změně již používaného seznamu použijte novou datovou složku; stará historie se nesmí přiřadit jinému účtu.
4. Sestavte pomocníka a případně nainstalujte místní plugin:

```powershell
.\bridge\Build.ps1
.\Install.ps1
```

Sestavení ověří SHA256 připnutých zdrojů projektu codex-switch a vytvoří vlastní kontrolní součty knihoven. Binární soubory nejsou součástí tohoto repozitáře.

5. Spusťte `Spustit-prehled.cmd` nebo `Spustit-prehled.ps1`. Přehled běží na **http://127.0.0.1:55163**. U každého účtu dokončete vlastní oficiální přihlášení přes tlačítko **Připojit účet**. Potom vyberte chat a cílový účet tlačítkem **Přepnout a pokračovat**.

Přehled běží v samostatné úloze Windows `Codex Account Monitor - manual public`, aby přežil zavření Codexu. Spouští se po přihlášení daného uživatele do Windows; hostitel po chybě zkusí až třikrát nový proces s odstupem tří sekund a úloha Windows až třikrát nový běh hostitele po jedné minutě. Neukládá heslo a nepoužívá zvýšená práva. Automaticky se spouští pouze přehled, přepnutí účtu zůstává ruční. Už otevřená stránka po restartu přehledu sama obnoví místní oprávnění. Po uspání či vypnutí počítače se dostupnost neověřuje.

### Soukromí a nastavení

Vlastní adresy, přihlášení, historie, databáze a logy patří výhradně na místní počítač. Výchozí datová složka je `%LOCALAPPDATA%\CodexAccountMonitor`. Úložiště účtů na Windows chrání uživatelské DPAPI. Chraňte je stejně jako přihlášení k účtu. Vývojové a produkční přihlašovací údaje se nevkládají do repozitáře ani do hlášení chyb.

Volitelné proměnné: `ACCOUNT_MONITOR_DATA` změní datovou složku a `ACCOUNT_MONITOR_PORT` místní port. Nastavte je před spuštěním přehledu i klienta MCP. `ACCOUNT_MONITOR_CODEX` může určit cestu k místnímu CLI. Změna konfigurace neprovádí odhlášení ani přihlášení automaticky.

Nástroje pluginu `account_overview` a `refresh_limits` pouze čtou stav nebo vyžádají kontrolu. Samotné přepnutí není nástrojem dostupným modelu.

## English

### Features

- Displays remaining five-hour and weekly usage limits, expected reset times, and snapshot age for four locally configured accounts.
- Refreshes every five minutes while the local process and computer are running. Stale or failed reads are never treated as verified availability.
- A manual action closes Codex, applies a previously connected account, reopens local unfinished chats, and continues work.
- Preserves chat titles and checkpoints interrupted handoffs. An uncertain continuation is not blindly sent again.
- Refuses a switch when Codex reports a pending approval or user response.

Switching affects all Codex windows and clients sharing the same login. There is no automatic account rotation. Paid credits and manual usage resets are not consumed by this application.

### Setup

Requirements: Windows, Codex desktop and its local CLI, Node.js 20+, PowerShell 7, and .NET SDK 10.0.4xx to build the helper. Existing runtimes bundled with Codex can also be used.

1. Clone or download the source.
2. Copy `accounts.example.json` to `%LOCALAPPDATA%\CodexAccountMonitor\accounts.json`, creating the directory if needed. Replace the four example addresses with your own distinct addresses. Do not overwrite existing configuration without reviewing it. No passwords belong in this file. Use a new data directory if changing an account list that already has saved history.
3. Run `bridge/Build.ps1` to build the helper. It verifies the pinned upstream archive before building. Run `Install.ps1` for local plugin installation, then `Spustit-prehled.cmd` or `Spustit-prehled.ps1` to start the dashboard.
4. Open **http://127.0.0.1:55163**. Connect each account through its own official browser login. Select an unfinished chat and use **Přepnout a pokračovat** on the target account.

A Windows task hosts the monitor outside Codex's process tree so it survives the desktop restart. It starts when its user signs in to Windows and retries a failed monitor process up to three times at three-second intervals; Windows retries a failed host up to three times at one-minute intervals. It stores no password and runs with ordinary interactive-user privileges. Only monitoring starts automatically; account switching remains manual. An already open dashboard recovers its local authorization after a monitor restart. Logging out or shutting down stops monitoring until the next sign-in.

`ACCOUNT_MONITOR_DATA` changes the data directory; `ACCOUNT_MONITOR_PORT` changes the loopback port. Set them consistently for the dashboard launcher and MCP client. `ACCOUNT_MONITOR_CODEX` overrides local CLI discovery. Custom settings do not trigger an account login automatically.

### Privacy and validation

This repository contains example addresses and source code only. Configuration, credentials, account history, databases, and logs remain local. The Windows account vault uses user-scoped DPAPI. Treat it as sensitive authentication material and never upload it with bug reports.

The MCP tools `account_overview` and `refresh_limits` do not switch the desktop account or send continuation messages. Switching is initiated by a manual dashboard action.

A private predecessor was tested through a real account transition, desktop restart, and continuation in the same local chat. This public edition replaces embedded account addresses with local configuration. Its configuration, dashboard, and protocol changes have synthetic tests; the generalized public edition has not been tested across every account combination or Codex release. See [validation notes](OVERENI.md).

## Development and license

```powershell
npm test
.\bridge\Build.ps1
```

The helper uses the pinned MIT-licensed [codex-switch](https://github.com/Gaebabi/codex-switch) libraries without hardware monitoring modules. See [third-party notices](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE). Runtime binaries and personal data are excluded from Git.
