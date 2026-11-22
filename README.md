# tick. — je OSRS + RS3 cockpit

Een desktop-app die je naast RuneLite of de RS3-client open hebt: de complete wiki, quest- en skill guides, een GE-terminal, money-making op jouw stats en een persoonlijke "wat zal ik nu doen?"-adviseur. Alles draait op je eigen pc; tick. leest alleen data en automatiseert niets in de game.

> Fanproject, niet gelieerd aan of goedgekeurd door Jagex. Wiki-inhoud: RuneScape Wiki & OSRS Wiki (CC BY-NC-SA 3.0).

## Downloaden

**[⬇ Nieuwste versie](https://github.com/yuus27/tick-rs/releases/latest)**

- **`tick-setup-x.y.z.exe`** (aanbevolen): installeert tick. en **werkt zichzelf automatisch bij** bij nieuwe versies.
- **`tick-portable-x.y.z.exe`**: zonder installatie, bijv. vanaf een USB-stick. Werkt niet automatisch bij.

Windows toont de eerste keer *"Windows heeft uw pc beschermd"*, omdat de app niet ondertekend is. Klik **Meer informatie → Toch uitvoeren**.

Daarna: vul bij **Instellingen** je RSN in. Voor je questvoortgang installeer je **WikiSync** (zie [Je account koppelen](#je-account-koppelen)).

## Updates

- De geïnstalleerde app zoekt bij het opstarten en elke 4 uur naar een nieuwe versie, downloadt die op de achtergrond en vraagt of je wilt herstarten. Je data blijft altijd bewaard (`%APPDATA%\tick\data`).
- Handmatig: tray-icoon → *Zoek naar updates*, of Instellingen → Updates.

## Een nieuwe versie uitbrengen (voor de maintainer)

Verhoog `version` in `package.json` (bijv. `0.4.0` → `0.4.1`) en push naar `main`. De workflow **Release** ziet dat er voor dat nummer nog geen release is, bouwt op Windows de installer + portable en publiceert ze met `latest.yml` (voor auto-update) in GitHub Releases. Een tag `vX.Y.Z` pushen of de workflow handmatig starten (Actions → Release → Run workflow) kan ook.

## Zelf draaien vanuit de broncode

1. Installeer **Node.js LTS**: https://nodejs.org
2. Dubbelklik **`start-tick.bat`** (browserversie op `http://localhost:5177`) of **`desktop-testen.bat`** (desktopvenster).
3. Code aangepast? `rebuild-tick.bat`. Hot reload: `npm run dev`. Zelf een .exe bouwen: `desktop-bouwen.bat`.

## Desktop-app (eigen venster, icoon, tray)

- **Bouwen:** dubbelklik `desktop-bouwen.bat`. In de map `release` komen een installer (`tick-setup-*.exe`) en een losse `tick-portable-*.exe`.
- **Snel testen zonder bouwen:** `desktop-testen.bat`.
- **In de app:** de punaise rechtsboven of **Ctrl+Shift+T** zet tick. *altijd bovenop*, handig op je tweede scherm naast de game. Via het tray-icoon: altijd bovenop, start met Windows, open in browser, datamap.
- **Je data** staat in `%APPDATA%\tick\data`, gedeeld door de geïnstalleerde app en `desktop-testen.bat`. De eerste start neemt data uit de browserversie (`data\`) mee. Overzetten kan ook via Instellingen → Exporteer/Importeer backup.

## Flipping Utilities

GE-terminal → Flip-journaal → **Importeer uit Flipping Utilities**. tick. leest automatisch `%USERPROFILE%\.runelite\flipping\*.json`, koppelt aankopen aan verkopen (FIFO) en slaat flips over die al in je journaal staan. Een CSV- of JSON-bestand kiezen kan ook.

## Diagnose

Instellingen → **Diagnose** (of `#/diag`). Test alle wiki-uitlezing, prijzen en je account, en maakt een rapport dat je kunt kopiëren.

## Wat zit erin

| Onderdeel | Wat het doet | Bron |
|---|---|---|
| **Dashboard** | Stats, comeback-modus, beste flips, doelen, game-updates | Hiscores, WikiSync, wiki |
| **Nu spelen** | Persoonlijke adviseur: plan op basis van je levels, XP, quests én quest-voorwaarden, quest-XP (level-ups), training per level met XP/u uit de skill guides, combo's (train → quest), money-making, runs en GE. Members/F2P en ironman. | Jouw account + wiki |
| **Unlock-radar** | Welke paar levels openen de meeste quests en money-methodes | Quest skill requirements, money making guide |
| **Markt-radar** | Anomaliedetectie op de GE (volumepiek, prijssprong/crash, pump, dump, spread) met 24u-baseline | Wiki real-time prices (/1h) |
| **GE-terminal** | Flip finder met marge ná tax, ROI, buy limits, realistische winst/4u, grafieken, watchlist met prijsalerts, flip-journaal | Wiki real-time prices |
| **Quests** | Optimale questroute met jouw voortgang, alle quests met filters | Optimal quest guide, questlijst |
| **Quest guide** | Requirements-paneel (jouw levels vs. vereist, boostable, quest-prereqs ✓), items, startpunt, **quick guide** én volledige guide | Questpagina + `/Quick guide` |
| **Skill guides 1–99** | Per skill: Pay-to-play, Free-to-play, Ironman, Questing (quest-XP) en Overzicht. De route laat zien waar jij nu zit. | Trainingsgidsen op de wiki |
| **Wiki** | De complete wiki in de app; elke link opent in tick. | MediaWiki API |
| **Money-making** | Alle methodes, gefilterd op wat jouw account kan | Money making guide |
| **Doelen** | Skill- en quest-doelen, stappenplan, streak | Lokaal |
| **Calculators** | Kopen of grinden (in uren van jóuw tijd), XP, dry-kans, GE-tax, combat level | Officiële XP-formule, live prijzen |

Wissel bovenaan de sidebar tussen **OSRS** en **RS3**: alle schermen schakelen mee.

## Je account koppelen

- **OSRS**: vul je RSN in. Voor questvoortgang: installeer de **WikiSync**-plugin in RuneLite en log één keer in.
- **RS3**: vul je RSN in en installeer **WikiSync** via de Plugin Hub in de RS3-client (toolbox-icoon → Browse → WikiSync → Install, daarna inschakelen bij Manage). Log één keer in en tick. ziet je quests en levels.

## Privacy en veiligheid

- De server luistert alleen op `127.0.0.1`, dus niet vanaf je netwerk.
- Hij praat uitsluitend met een vaste lijst bronnen: wiki, prices.runescape.wiki, de officiële hiscores en WikiSync. Het is geen open proxy.
- Wiki-HTML wordt gesanitized (DOMPurify) voordat hij getoond wordt.
- Je data (journaal, doelen, watchlist, instellingen) staat in `data/*.json`. Je kunt het exporteren via Instellingen.
- Wil je je eigen contactinfo in de User-Agent (wordt gewaardeerd door de wiki)? Zet de omgevingsvariabele `TICK_UA`.

## Structuur

```
server/index.js     lokale server: proxy, cache, opslag
web/src/lib         games.js (OSRS/RS3-verschillen), wiki.js (parsen), market.js (GE), xp.js
web/src/pages       alle schermen
web/src/components  sidebar, zoekbalk, UI-bouwstenen
```

Inhoud van de wiki's valt onder CC BY-NC-SA 3.0.
