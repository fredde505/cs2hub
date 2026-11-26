// Prisanalys utan DOM och utan beroenden, så att den går att testa (se tests.html).
// Allt här bygger på det prisdatan faktiskt innehåller: antal marknader, hur långt de ligger från varandra och hur gammal snapshoten är.
// Prisfeeden ger EN tidpunkt för hela snapshoten (inte per marknad), så åldern är densamma för alla marknader.

/** Marknader i prisraden: [steam, skinport, buff163, csfloat, csmoney, swapgg]. `hard` = svårtillgänglig, används för jämförelse men inte som köpkälla. */
export const SRC = [
  { key: "skinport", i: 1, name: "Skinport" },
  { key: "csfloat", i: 3, name: "CSFloat" },
  { key: "csmoney", i: 4, name: "CS.MONEY" },
  { key: "swapgg", i: 5, name: "Swap.gg" },
  { key: "buff163", i: 2, name: "BUFF163", hard: true },
];
export const STALE_HOURS = 36;
/** Föremål vars pris beror på fas eller mönster – ett lägsta pris säger lite om det enskilda exemplaret. */
export const PATTERN_PRICED = /Doppler|Marble Fade|Case Hardened|\bFade\b/;

export const median = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const LEVELS = {
  high: { label: "Hög tillförlitlighet", tone: "ok" },
  limited: { label: "Begränsad prisdata", tone: "warn" },
  uncertain: { label: "Osäkert pris", tone: "bad" },
  stale: { label: "Gammal prisdata", tone: "bad" },
  missing: { label: "Pris saknas", tone: "miss" },
};

/**
 * Bedömer ett pris ur en prisrad. Returnerar nivå, orsaker (på svenska) och underlag.
 * @param {number[]|null} row  prisrad [steam, skinport, buff163, csfloat, csmoney, swapgg, ...]
 * @param {{ageMs?:number, mhn?:string}} opt  ageMs = hur gammal snapshoten är
 */
export function analysePrice(row, { ageMs = 0, mhn = "" } = {}) {
  const base = (level, reasons, extra = {}) => ({ level, ...LEVELS[level], reasons, markets: [], outliers: [], lowest: null, median: null, spread: null, ...extra });
  if (!row) return base("missing", ["Ingen marknad i vår prisdata har det här föremålet."]);
  const markets = SRC.map(m => ({ ...m, usd: row[m.i] > 0 ? row[m.i] : null })).filter(m => m.usd);
  const steam = row[0] > 0 ? row[0] : null;
  const buyable = markets.filter(m => !m.hard);
  if (!buyable.length) {
    if (steam || markets.length) return base("limited", [steam ? "Bara Steam Market (Steam-krediter) har ett pris – går inte att ta ut som riktiga pengar." : "Bara BUFF163 har ett pris, och den marknaden är svårtillgänglig."], { markets, steam });
    return base("missing", ["Ingen marknad i vår prisdata har det här föremålet."]);
  }
  const reasons = [];
  let level = "high";
  const worsen = l => { const order = ["high", "limited", "uncertain", "stale"]; if (order.indexOf(l) > order.indexOf(level)) level = l; };
  const lowest = buyable.reduce((a, b) => (b.usd < a.usd ? b : a));

  // Avvikande marknad: jämför varje marknad med medianen av de övriga (kräver minst tre marknader)
  // Billiga föremål (under ca 0,5 USD) svänger naturligt mellan marknaderna – där flaggas inga avvikelser, och en avvikelse måste vara minst MIN_DIFF USD.
  const outliers = [], MIN_DIFF = 0.5;
  if (markets.length >= 3 && lowest.usd >= 0.5) {
    for (const m of markets) {
      const med = median(markets.filter(x => x !== m).map(x => x.usd));
      const ratio = m.usd / med;
      if ((ratio < 0.6 || ratio > 1.6) && Math.abs(m.usd - med) >= MIN_DIFF) outliers.push({ key: m.key, name: m.name, usd: m.usd, ratio, kind: ratio < 1 ? "low" : "high", extreme: ratio < 0.4 || ratio > 2.5 });
    }
  }
  // Det som avgör tillförlitligheten är om DET LÄGSTA priset (det vi visar) är trovärdigt. En marknad som ligger högt påverkar det inte – den nämns bara.
  const lowOut = outliers.find(o => o.key === lowest.key && o.kind === "low");
  if (lowOut) { worsen("uncertain"); reasons.push(`${lowOut.name} ligger ${Math.round((1 - lowOut.ratio) * 100)} % under övriga marknader${lowOut.extreme ? " (extremt lågt)" : ""} – troligen en felprissatt eller föråldrad listning.`); }
  for (const o of outliers.filter(x => x.kind === "high")) reasons.push(`${o.name} ligger ${Math.round((o.ratio - 1) * 100)} % över övriga marknader${o.extreme ? " (extremt högt)" : ""} – det påverkar inte det lägsta priset.`);

  const ext = buyable.map(m => m.usd), spread = Math.max(...ext) / Math.min(...ext);
  if (buyable.length >= 2 && spread > 1.6 && !lowOut && Math.max(...ext) - Math.min(...ext) >= 1) reasons.push(`Skillnad mellan marknaderna: högsta pris är ${spread.toFixed(1).replace(".", ",")} × det lägsta.`);

  if (buyable.length <= 2) { worsen("limited"); reasons.push(buyable.length === 1 ? "Bara en marknad har ett pris – inget att jämföra med." : "Bara två marknader har ett pris."); }

  if (PATTERN_PRICED.test(mhn)) { worsen("uncertain"); reasons.push("Priset beror på fas eller mönster. Prisdatan skiljer inte på dem, så det är ett lägsta pris och kan ligga långt under verkligt värde."); }

  if (steam) {
    const r = steam / lowest.usd;
    if (r > 3) reasons.push("Steam-priset är mer än 3 × marknadspriset (Steam-krediter går inte att ta ut).");
    else if (r < 0.7) { worsen("uncertain"); reasons.push("Steam-priset ligger klart under marknadspriset – någon av listningarna kan vara föråldrad."); }
  }

  const ageH = ageMs / 3600e3;
  if (ageH > STALE_HOURS) { worsen("stale"); reasons.push(`Prisdatan är ${ageH < 72 ? Math.round(ageH) + " timmar" : Math.round(ageH / 24) + " dagar"} gammal.`); }

  if (!reasons.length) reasons.push(`${buyable.length} marknader har ett pris och de ligger nära varandra.`);
  return base(level, reasons, { markets, outliers, lowest, median: median(ext), spread, steam });
}

/* ---------------- köp/sälj-matematik (används av Price Calculator och testerna) ---------------- */
const pctOk = v => Number.isFinite(v) && v >= 0 && v < 100;
/**
 * Beräknar utfallet av ett köp och en försäljning.
 * buyFeePct = avgift/påslag vid köp (t.ex. insättning), sellFeePct = marknadens avgift vid försäljning, fixedFee = fast avgift i valutan.
 */
export function tradeMath({ buy = 0, sell = 0, qty = 1, buyFeePct = 0, sellFeePct = 0, fixedFee = 0 } = {}) {
  qty = Math.max(1, Math.floor(qty) || 1);
  if (!pctOk(sellFeePct)) sellFeePct = 0;
  if (!pctOk(buyFeePct)) buyFeePct = 0;
  const cost = buy * qty * (1 + buyFeePct / 100);
  const gross = sell * qty, fee = gross * sellFeePct / 100 + fixedFee, net = gross - fee, profit = net - cost;
  const breakEven = (cost + fixedFee) / (qty * (1 - sellFeePct / 100)); // säljpris per st där vinsten blir 0
  return { qty, cost, gross, fee, net, profit, roi: cost > 0 ? profit / cost * 100 : null, breakEven, breakEvenRise: buy > 0 ? (breakEven / buy - 1) * 100 : null };
}
/** Listpris som krävs för att få ut `net` efter avgift. */
export const listForNet = (net, feePct) => pctOk(feePct) ? net / (1 - feePct / 100) : net;

/* ---------------- statistik över en prisserie ---------------- */
/** pts: [{x: tid(ms), y: pris}] sorterad i tid. Returnerar null om serien är tom. */
export function seriesStats(pts) {
  if (!pts || !pts.length) return null;
  const ys = pts.map(p => p.y), first = ys[0], last = ys[ys.length - 1], mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
  return { n: ys.length, min: Math.min(...ys), max: Math.max(...ys), mean, median: median(ys), first, last, changePct: first > 0 ? (last / first - 1) * 100 : null, vol: mean > 0 ? sd / mean * 100 : null };
}
/** Punkter från de senaste `days` dagarna (räknat från sista punkten, så luckor i datan inte ger en tom graf). */
export function lastDays(pts, days) {
  if (!pts?.length) return [];
  const end = pts[pts.length - 1].x, from = end - days * 864e5;
  return pts.filter(p => p.x >= from);
}
/** Hur många dagar historiken faktiskt täcker. */
export const spanDays = pts => pts && pts.length > 1 ? (pts[pts.length - 1].x - pts[0].x) / 864e5 : 0;
