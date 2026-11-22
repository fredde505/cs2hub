# Lägg ut CS2 Hub gratis på Cloudflare

Allt nedan ryms i Cloudflares gratisnivå. Du behöver två saker: **sidan** (Pages) och **Steam-proxyn** (Worker).

## 1. Sidan (Cloudflare Pages)

**Enklast – dra och släpp:**
1. Logga in på https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Döp projektet (t.ex. `cs2hub`) och dra in **mappen `site`** (inte hela projektet).
3. Tryck **Deploy**. Du får en adress som `https://cs2hub.pages.dev`.

Priserna är då frusna till dagen du laddade upp. Vill du ha automatiska prisuppdateringar, använd i stället metoden nedan.

**Med automatiska priser (GitHub):**
1. Skapa ett GitHub-repo och ladda upp hela projektmappen (filen `.github/workflows/prices.yml` ingår).
2. I Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, välj repot.
3. Build command: *(tom)*. Build output directory: `site`.
4. GitHub Actions uppdaterar `site/data/prices.json` var 6:e timme och Cloudflare publicerar om sidan automatiskt.

## 2. Steam-proxyn (Cloudflare Worker)

Steam tillåter inte att en webbsida hämtar inventory direkt, därför behövs en liten mellanhand.

1. **Workers & Pages → Create → Create Worker**. Döp den till `steam-proxy` → **Deploy**.
2. Tryck **Edit code**, ta bort allt och klistra in innehållet från `worker/steam-proxy.js` → **Deploy**.
3. Kopiera Workerns adress, t.ex. `https://steam-proxy.dittnamn.workers.dev`.
4. Öppna appen → **My Inventory → Hämta Steam-inventory** och klistra in adressen i fältet *Din proxy-URL*. Den sparas i din webbläsare.
   (Vill du slippa göra det på varje enhet: skriv adressen i `site/js/config.js` och ladda upp sidan igen.)
5. **Rekommenderat:** begränsa proxyn till din sida. I Workern: **Settings → Variables → Add** `ALLOWED_ORIGIN` = `https://cs2hub.pages.dev` (din adress, utan snedstreck på slutet).

Kontrollera att den lever: öppna `https://din-worker.workers.dev/` – du ska se `{"ok":true,...}`.

## 3. Steam-inventoryt måste vara publikt
Steam → Profil → Redigera profil → **Sekretessinställningar** → *Inventory*: **Offentligt**.

## Uppdatera sidan efteråt
Har du laddat upp manuellt: öppna projektet i Workers & Pages → **Deployments** (eller **New deployment**) och dra in mappen `site` igen.
Med GitHub kopplat sker det automatiskt vid varje ändring (inklusive nya priser var 6:e timme).

## Gratisgränser (räcker gott)
- Statiska filer (sidan, JS, datafilerna): **gratis och obegränsat** hos Cloudflare, de räknas inte mot någon kvot.
- Steam-proxyn (Worker): 100 000 anrop/dag. En inventory-import är 1–6 anrop och cachas i 60 sekunder – du kommer aldrig i närheten.
- GitHub Actions (prisuppdatering, 4 gånger/dygn): gratis i publika repon, ca 120 minuter/månad i privata (gräns 2 000).

## Så minimeras förfrågningarna
- Datafilerna cachas i webbläsaren (15 min via `_headers`) och visas direkt vid nästa besök medan nya hämtas i bakgrunden (`sw.js`).
- Priserna hämtas inte live från någon prisleverantör i webbläsaren – de byggs in i `prices.json`, så inga externa anrop görs vid användning (bortsett från valutakursen, som cachas i 12 timmar).
- Bilder kommer från Steams CDN och cachas av webbläsaren – inga anrop mot din Cloudflare.

## Obs
All användardata (inventory, köp, loadouts) sparas i webbläsaren på varje enhet – inte på servern. Använd *Exportera backup* i Transaktioner eller *Dela* för att flytta mellan mobil och dator.
