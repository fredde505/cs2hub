// Visningsvaluta: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.
//
// Principer:
//  - ALLA sparade belopp (inköp, försäljningar, avgifter, målpriser, budgetar) är och förblir i KRONOR (SEK). De ändras aldrig av valutaval.
//  - Valutan är ett presentationslager: belopp visas omräknade till vald valuta med dagens kurs, och belopp du skriver in tolkas i den valda
//    valutan och räknas om till kronor innan de sparas. Därför kan samma kronbelopp visas olika dag för dag när kursen ändras.
//  - Kurserna är "enheter per 1 USD" (open.er-api.com). Saknas kursen för vald valuta visas kronor i stället – vi hittar aldrig på en kurs.

export const CURRENCIES = {
  SEK: { sym: "kr", name: "Svenska kronor (SEK)" },
  USD: { sym: "US$", name: "US-dollar (USD)" },
  EUR: { sym: "€", name: "Euro (EUR)" },
  NOK: { sym: "NOK", name: "Norska kronor (NOK)" },
  DKK: { sym: "DKK", name: "Danska kronor (DKK)" },
};
export const isCurrency = c => typeof c === "string" && Object.prototype.hasOwnProperty.call(CURRENCIES, c);

/** Antal enheter av `code` per 1 SEK, eller null om kursen saknas/är ogiltig. rates = { SEK: kr per USD, EUR: euro per USD, ... }. */
export function unitsPerSek(code, rates) {
  if (code === "SEK") return 1;
  const s = rates?.SEK; if (!(s > 0) || !Number.isFinite(s)) return null;
  if (code === "USD") return 1 / s;
  const a = rates?.[code]; return a > 0 && Number.isFinite(a) ? a / s : null;
}
/** Valutan som faktiskt visas: vald valuta om kurs finns, annars SEK. */
export const effectiveCode = (code, rates) => (isCurrency(code) && unitsPerSek(code, rates) != null ? code : "SEK");

const nfCache = new Map();
function nf(code, d) {
  const key = code + d;
  if (!nfCache.has(key)) nfCache.set(key, new Intl.NumberFormat("sv-SE", code === "SEK" ? { minimumFractionDigits: d, maximumFractionDigits: d } : { style: "currency", currency: code, currencyDisplay: code === "NOK" || code === "DKK" ? "code" : "symbol", minimumFractionDigits: d, maximumFractionDigits: d }));
  return nfCache.get(key);
}
/** Formaterar ett belopp i KRONOR som visningsvalutan (k = enheter per SEK). Kronor ger "12,50 kr" (som förut). */
export function formatMoney(sek, code = "SEK", k = 1) {
  if (sek == null || typeof sek !== "number" || Number.isNaN(sek) || !Number.isFinite(sek)) return "–";
  const v = sek * k, d = Math.abs(v) >= 1000 ? 0 : 2;
  return code === "SEK" ? nf("SEK", d).format(v) + " kr" : nf(code, d).format(v);
}
export const sekToDisplay = (sek, k) => (sek == null ? null : sek * k);
export const displayToSek = (x, k) => (x == null || !Number.isFinite(x) || !(k > 0) ? null : x / k);

/** Ord och symboler för valutor som får stå i inmatade belopp ("12,5 €", "$20", "100 kr"). Tas bort innan talet tolkas. */
export const CURRENCY_NOISE = /us\$|usd|eur|nok|dkk|sek|kr|€|\$|:-/gi;
