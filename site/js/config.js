// Adressen till din egen Steam-proxy (Cloudflare Worker). Lämna tom om du inte har någon –
// appen använder då publika proxyer, eller så kan du klistra in adressen i importfönstret.
// Exempel: export const STEAM_PROXY = "https://steam-proxy.dittnamn.workers.dev";
export const STEAM_PROXY = "";

// Färska priser publiceras av GitHub Actions på grenen "prices" i ditt repo (en enda commit som skrivs över,
// så Git-historiken växer inte). Byt användarnamn/repo om du flyttar projektet.
export const PRICES_URL = "https://raw.githubusercontent.com/fredde505/cs2hub/prices/prices.json";
