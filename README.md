# CS2 Hub

Gratis, statisk CS2-plattform (ingen server, ingen build-step). Användardata sparas lokalt i IndexedDB.

## Köra lokalt
```
python tools/serve.py        # dev-server utan cache
```
Öppna http://localhost:5173

## Data
```
python tools/build_data.py            # schema + färganalys + priser -> site/data/
python tools/build_data.py --prices   # bara priser (körs var 6:e timme av .github/workflows/prices.yml)
```
Kräver Python 3 + Pillow. Källor: ByMykel/CSGO-API (schema), prices.csgotrader.app (Steam, Skinport, BUFF163, CSFloat, CS.MONEY, Swap.gg).

## Hosting
Ladda upp mappen `site/` till GitHub Pages / Cloudflare Pages / Netlify. Priser uppdateras genom att workflow:n committar ny `prices.json`.

## Status
Klart: Database, Color Explorer, My Inventory + vinstspårning, Watchlist, Loadout Builder, Sticker Workshop, Inspect & Float,
Trade-up, Pattern Explorer, Collection Tracker, Skin Comparison, Float Ranking, Share, Sell Calculator, Market-rörelser.
Prissystem: ett gemensamt pris (lägsta utropspris på riktiga marknadsplatser, Steam valbart) i `site/js/data.js` (`priceInfo`). Saknas prisdata visas "Pris saknas", aldrig 0 kr.
Egna avgifter och Steam-kredit-kvot sparas i webbläsaren (Tools → Sell Calculator).
Mönsterdata (Fade/Blue Gem): `python tools/build_data.py --patterns` (källor: chescos, MIT).
Hosting: slå på gzip/brotli – JSON-filerna är ca 12 MB okomprimerade men ca 2–3 MB komprimerade.
