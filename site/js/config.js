// Adressen till din egen Steam-proxy (Cloudflare Worker). Lämna tom om du inte har någon –
// Steam-importen fungerar då inte automatiskt (du kan klistra in adressen i importfönstret eller använda manuell JSON).
// Exempel: export const STEAM_PROXY = "https://steam-proxy.dittnamn.workers.dev";
export const STEAM_PROXY = "https://steam-proxy.leonnordstrom08.workers.dev";

// Färska priser publiceras av GitHub Actions på grenen "prices" i ditt repo (en enda commit som skrivs över,
// så Git-historiken växer inte). Byt användarnamn/repo om du flyttar projektet.
export const PRICES_URL = "https://raw.githubusercontent.com/fredde505/cs2hub/prices/prices.json";
// Egen prishistorik (dagligt lägsta pris, byggs upp av samma jobb) – hämtas först när du öppnar ett föremål.
export const HISTORY_URL = PRICES_URL.replace(/prices\.json$/, "history.json");
