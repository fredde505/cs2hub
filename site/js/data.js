import { getKV, setKV } from "./store.js";
import { setRate, fx, WEAR_LONG, WEARS } from "./util.js";
import { PRICES_URL, HISTORY_URL } from "./config.js";

export const D = {
  skins: [], stickers: [], other: [], collections: [], catalog: [],
  byId: new Map(), mhn: new Map(), colById: new Map(),
  P: { src: [], p: {}, t: 0 }, trend: new Map(), live: false, priceAge: 0,
};

// Marknadsplatser: index i prisraden [steam, skinport, buff163, csfloat, csmoney, swapgg, buff163_order]
// (Visningsordning: riktiga marknadsplatser först, Steam sist. `i` är kolumnen i prisdatan.)
export const MARKETS = [
  { key: "skinport", i: 1, name: "Skinport", fee: 0.12, real: true },
  { key: "csfloat", i: 3, name: "CSFloat", fee: 0.02, real: true },
  { key: "csmoney", i: 4, name: "CS.MONEY", fee: 0.07, real: true },
  { key: "buff163", i: 2, name: "BUFF163", fee: 0.025, real: true, note: "Svårt för icke-kinesiska konton" },
  { key: "swapgg", i: 5, name: "Swap.gg", fee: 0.10, real: true },
  { key: "steam", i: 0, name: "Steam Market", fee: 0.15, real: false },
];
// Uppskattad kvot: Steam-krediter -> riktiga pengar (kan ändras av användaren)
// priceMode: "market" = lägsta riktiga marknadspris (Skinport, CSFloat, CS.MONEY, Swap.gg), "steam" = Steam Market-pris
export const settings = { creditToCash: 0.70, priceMode: "market" };

const json = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };

const KIND_BY_CAT = { Knives: "knife", Gloves: "glove" };
const CAPSULE_TYPES = new Set(["Sticker Capsule", "Autograph Capsule", "Patch Capsule", "Graffiti", "Pins", "Souvenir Highlight"]);

export function mhnFor(skin, wear, { st = false, sv = false } = {}) {
  let n = skin.n;
  const knife = n.startsWith("★ ");
  if (st) n = knife ? "★ StatTrak™ " + n.slice(2) : "StatTrak™ " + n;
  if (sv) n = "Souvenir " + n;
  return wear ? `${n} (${WEAR_LONG[wear]})` : n;
}

export async function loadData(onStatus = () => { }) {
  const [skins, stickers, other, collections, prices] = await Promise.all([
    json("data/skins.json"), json("data/stickers.json"), json("data/other.json"),
    json("data/collections.json"), json("data/prices.json").catch(() => null),
  ]);
  D.skins = skins; D.stickers = stickers; D.other = other; D.collections = collections;
  if (prices) { D.P = prices; D.priceAge = prices.t * 1000; }
  // Färskare prissnapshot från förra besöket (hämtad från grenen "prices") går före den inbyggda filen
  try { const c = await getKV("pricesCache"); if (okPrices(c?.data) && c.data.t > (D.P.t || 0)) { D.P = c.data; D.priceAge = c.data.t * 1000; } } catch { /* ignorera */ }
  applyTrend();
  for (const c of collections) D.colById.set(c.id, c);

  const cat = [];
  // Schemats StatTrak/Souvenir-flaggor är grova – verifiera mot marknadsdata när den finns.
  if (Object.keys(D.P.p).length) {
    for (const s of skins) {
      const ws = s.wr.length ? s.wr : [null];
      if (s.st) s.st = ws.some(w => D.P.p[mhnFor(s, w, { st: true })]);
      if (s.sv) s.sv = ws.some(w => D.P.p[mhnFor(s, w, { sv: true })]);
    }
  }
  // Flera skins delar samma marknadsnamn (Doppler-faser, gamla modeller). Ge dem ett visningsnamn så de går att skilja åt.
  const PHASE = { 415: "Ruby", 416: "Sapphire", 417: "Black Pearl", 418: "Phase 1", 419: "Phase 2", 420: "Phase 3", 421: "Phase 4", 568: "Emerald", 569: "Phase 1", 570: "Phase 2", 571: "Phase 3", 572: "Phase 4" };
  const nameCount = new Map(); for (const s of skins) nameCount.set(s.n, (nameCount.get(s.n) || 0) + 1);
  const labelCount = new Map(); // sista utväg: om visningsnamnet fortfarande krockar, lägg till paint index
  for (const s of skins) if (nameCount.get(s.n) > 1) { const l = s.n + "|" + (PHASE[s.pi] || (s.lg ? "Legacy" : "")); labelCount.set(l, (labelCount.get(l) || 0) + 1); }
  const setM = (key, val) => { const cur = D.mhn.get(key); if (!cur || (cur.e.lg && !val.e.lg)) D.mhn.set(key, val); }; // nya modellen går först
  for (const s of skins) {
    if (nameCount.get(s.n) > 1) {
      s.ph = PHASE[s.pi] || (s.lg ? "Legacy" : "");
      if (labelCount.get(s.n + "|" + s.ph) > 1) s.ph = (s.ph ? s.ph + " " : "") + "#" + s.pi;
    }
    if (s.f && (s.f[0] == null || s.f[1] == null)) s.f = null; // vanilla-knivar har ingen float
    s.kind = s.k === "weapon" ? "weapon" : s.k;
    s.type = s.kind;
    s.mhnBase = s.n;
    cat.push(s);
    D.byId.set(s.id, s);
    const wears = s.wr.length ? s.wr : [null];
    for (const w of wears) {
      setM(mhnFor(s, w), { e: s, wear: w, st: false, sv: false });
      if (s.st) setM(mhnFor(s, w, { st: true }), { e: s, wear: w, st: true, sv: false });
      if (s.sv) setM(mhnFor(s, w, { sv: true }), { e: s, wear: w, st: false, sv: true });
    }
  }
  for (const s of stickers) { s.kind = "sticker"; s.type = "sticker"; s.mh = s.mh || s.n; cat.push(s); D.byId.set(s.id, s); D.mhn.set(s.mh, { e: s }); }
  for (const o of other) {
    o.kind = o.ty === "crate" ? (o.ct === "Case" || o.ct === "Souvenir" || o.ct === "Music Kit Box" ? "case" : CAPSULE_TYPES.has(o.ct) ? "capsule" : "case") : o.ty;
    o.mh = o.mh || (o.ty === "music" ? "Music Kit | " + o.n : o.n);
    cat.push(o); D.byId.set(o.id, o); D.mhn.set(o.mh, { e: o });
  }
  D.catalog = cat;
  onStatus("data");
  return D;
}

/* ---------------- priser ---------------- */
export function priceRow(mhn) {
  const r = D.P.p[mhn];
  if (!r) return null;
  const o = {};
  MARKETS.forEach(m => o[m.key] = r[m.i] ?? null);
  o.order = r[6] ?? null;
  return o;
}
export const steamUsd = mhn => D.P.p[mhn]?.[0] ?? null;
// Steam-priser är i snitt ~1,75× högre än externa marknader (Steam-krediter går inte att ta ut), så standardvärdet är
// lägsta externa pris. BUFF163 räknas inte med (svårtillgänglig). Samma källa används överallt för konsekventa priser.
export function lowestExternal(r) {
  let m = null;
  for (const i of [1, 3, 4, 5]) if (r[i] && (m == null || r[i] < m)) m = r[i];
  return m;
}
/** Lägsta externa pris + vilken marknadsplats det kommer från. */
export function lowestExternalSrc(r) {
  let m = null;
  for (const key of ["skinport", "csfloat", "csmoney", "swapgg"]) {
    const mk = MARKETS.find(x => x.key === key), p = r[mk.i];
    if (p && (!m || p < m.usd)) m = { usd: p, key, name: mk.name };
  }
  return m;
}
/**
 * Det gemensamma priset som alla delar av sidan använder: { usd, key, name, kind } eller null om prisdata saknas.
 * kind: "listning" = lägsta utropspris (inte genomförd försäljning) på en riktig marknadsplats, "steam" = Steam Market (Steam-krediter).
 */
export function priceInfo(mhn) {
  const r = D.P.p[mhn]; if (!r) return null;
  const ext = lowestExternalSrc(r);
  if (settings.priceMode === "steam" && r[0]) return { usd: r[0], key: "steam", name: "Steam Market", kind: "steam" };
  if (ext) return { ...ext, kind: "listning" };
  if (r[0]) return { usd: r[0], key: "steam", name: "Steam Market", kind: "steam" }; // reserv: bara Steam har pris
  return null;
}
export const bestUsd = mhn => priceInfo(mhn)?.usd ?? null;
/** Förklaring till visning vid hover: källa, typ och ålder. */
export function priceTip(mhn) {
  const i = priceInfo(mhn);
  if (!i) return "Pris saknas – ingen marknadsplats i vår prisdata har det här föremålet.";
  const d = D.priceAge ? new Date(D.priceAge).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "okänt datum";
  return (i.kind === "steam" ? "Steam Market-pris (Steam-krediter, går inte att ta ut)" : `Lägsta utropspris (listning, inte genomförd försäljning) på ${i.name}`) + ` · prisdata från ${d}`;
}
export const DEFAULT_FEES = { skinport: 0.12, csfloat: 0.02, csmoney: 0.07, buff163: 0.025, swapgg: 0.10, steam: 0.15 };
export async function loadSettings() {
  const f = await getKV("fees", null);
  if (f) for (const m of MARKETS) if (typeof f[m.key] === "number" && f[m.key] >= 0 && f[m.key] < 0.6) m.fee = f[m.key];
  const c = await getKV("creditToCash", null);
  if (typeof c === "number" && c > 0 && c <= 1) settings.creditToCash = c;
}
export async function saveSettings() {
  await setKV("fees", Object.fromEntries(MARKETS.map(m => [m.key, m.fee])));
  await setKV("creditToCash", settings.creditToCash);
}
export async function setPriceMode(mode) {
  settings.priceMode = mode === "steam" ? "steam" : "market";
  resetPriceCache();
  await setKV("priceMode", settings.priceMode);
}
// Vad man faktiskt får ut i riktiga pengar: nettot efter avgift på marknader där privatpersoner säljer till varandra
// (Skinport, CSFloat). CS.MONEY och Swap.gg är botsajter vars säljpris inte är vad de betalar, så de räknas inte här.
export function cashUsd(mhn) {
  const r = D.P.p[mhn]; if (!r) return null;
  let best = null;
  // Avvikelseskydd: ett pris som är mer än 1,6× medianen av de externa priserna är sannolikt fel (t.ex. Doppler-faser) och ignoreras.
  const ext = [1, 2, 3, 4, 5].map(i => r[i]).filter(Boolean).sort((a, b) => a - b);
  const median = ext.length >= 3 ? ext[Math.floor(ext.length / 2)] : null;
  for (const m of MARKETS) {
    if (m.key !== "skinport" && m.key !== "csfloat") continue;
    const p = r[m.i]; if (!p) continue;
    if (median && p > 1.6 * median) continue;
    const net = p * (1 - m.fee);
    if (best == null || net > best) best = net;
  }
  if (best == null) { const ext = lowestExternal(r); if (ext) best = ext * 0.88; }
  if (best == null && r[0]) best = r[0] * settings.creditToCash;
  return best;
}

// Länk till föremålet på marknadsplatsen (där en stabil sök-URL finns)
export function marketUrl(key, mhn) {
  const q = encodeURIComponent(mhn);
  return { steam: `https://steamcommunity.com/market/listings/730/${q}`, skinport: `https://skinport.com/market?search=${q}`, csfloat: `https://csfloat.com/search?market_hash_name=${q}`, csmoney: `https://cs.money/market/buy/?search=${q}` }[key] || null;
}

// "Från-pris" för katalogkort
export function fromPrice(e) {
  if (e._pf !== undefined) return e._pf;
  let v = null;
  if (e.wr) {
    const arr = (e.wr.length ? e.wr : [null]).map(w => bestUsd(mhnFor(e, w))).filter(Boolean);
    v = arr.length ? Math.min(...arr) : null;
  } else v = bestUsd(e.mh);
  return e._pf = v;
}
export function pricesByWear(e, opts = {}) {
  return (e.wr.length ? e.wr : [null]).map(w => {
    const mhn = mhnFor(e, w, opts);
    return { wear: w, mhn, row: priceRow(mhn) };
  });
}
export function resetPriceCache() { D.skins.concat(D.stickers, D.other).forEach(e => delete e._pf); }

export function lookup(mhn) { return D.mhn.get(mhn) || null; }
export function imgOf(entry) { return entry?.img || ""; }

/** Kontrollerar att en prisfil (från nätet eller lokal cache) har rätt form innan den används – skadad eller manipulerad data ska aldrig nå gränssnittet. */
function okPrices(j) {
  if (!j || typeof j !== "object" || !Number.isFinite(j.t) || j.t * 1000 > Date.now() + 864e5 || j.t < 1e9) return false;
  if (!j.p || typeof j.p !== "object" || Array.isArray(j.p)) return false;
  const vals = Object.values(j.p); if (!vals.length) return false;
  const rowOk = r => Array.isArray(r) && r.length <= 12 && r.every(x => x == null || (typeof x === "number" && x >= 0 && x < 1e7));
  const step = Math.max(1, Math.floor(vals.length / 400)); // stickprov över hela filen
  for (let i = 0; i < vals.length; i += step) if (!rowOk(vals[i])) return false;
  if (j.tr != null && (typeof j.tr !== "object" || Array.isArray(j.tr))) return false;
  return true;
}
const okHistory = j => j && Array.isArray(j.d) && j.d.length <= 400 && j.d.every(x => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) && j.p && typeof j.p === "object" && !Array.isArray(j.p) && Object.values(j.p).slice(0, 200).every(s => Array.isArray(s) && s.length === j.d.length && s.every(x => x == null || (typeof x === "number" && x >= 0 && x < 1e7)));

/* ------------- levande uppdatering (Steam-priser + valuta) med cache ------------- */
export async function refreshLive(onStatus = () => { }, force = false) {
  // valuta
  try {
    let c = await getKV("fx"); const okFx = x => x && Number.isFinite(x.t) && Number.isFinite(x.rate) && x.rate > 1 && x.rate < 100;
    if (!okFx(c) || Date.now() - c.t > 12 * 3600e3) {
      const j = await json("https://open.er-api.com/v6/latest/USD");
      c = { t: Date.now(), rate: +j.rates.SEK };
      if (!okFx(c)) throw new Error("ogiltig växelkurs");
      await setKV("fx", c);
    }
    setRate(c.rate); fx.updated = c.t;
  } catch { const c = await getKV("fx"); if (c && Number.isFinite(c.rate) && Number.isFinite(c.t)) { setRate(c.rate); fx.updated = c.t; } }
  // Priser: ingen prisleverantör anropas från webbläsaren (de saknar CORS). GitHub Actions publicerar en färsk snapshot
  // på grenen "prices" (en enda commit, så repot växer inte). Den hämtas högst en gång i timmen och cachas lokalt.
  // Reserv: den inbyggda data/prices.json.
  const take = async j => { if (okPrices(j) && j.t * 1000 > D.priceAge) { D.P = j; D.priceAge = j.t * 1000; resetPriceCache(); await setKV("pricesCache", { t: j.t, data: j }); return true; } return false; };
  try {
    const last = await getKV("pricesFetched", 0);
    if (force || Date.now() - last > 3600e3) {
      onStatus("Hämtar färska priser…");
      let got = false;
      try { const r = await fetch(PRICES_URL, { cache: "no-cache" }); if (r.ok) { got = true; await take(await r.json()); } } catch { /* grenen saknas eller offline */ }
      if (!got) { try { await take(await fetch("data/prices.json", { cache: "no-cache" }).then(r => r.json())); } catch { /* behåll det som redan är laddat */ } }
      if (got) await setKV("pricesFetched", Date.now());
    }
  } catch { /* behåll det som redan är laddat */ }
  applyTrend();
  D.live = Date.now() - D.priceAge < 36 * 3600e3;
  return D.live;
}
/* ---- Egen prishistorik (history.json på grenen "prices"): hämtas första gången den behövs, cachas 6 timmar ---- */
let hist = null, histP = null, histFail = 0;
export function loadHistory() {
  if (!histP && Date.now() - histFail < 5 * 60e3) return Promise.resolve(hist); // misslyckades nyss: försök inte igen för varje föremål man öppnar
  if (!histP) histP = (async () => {
    try { const c = await getKV("histCache"); if (c && Number.isFinite(c.t) && okHistory(c.data) && Date.now() - c.t < 6 * 3600e3) return (hist = c.data); } catch { /* ignorera */ }
    try {
      const r = await fetch(HISTORY_URL, { cache: "no-cache" });
      if (r.ok) { const j = await r.json(); if (okHistory(j)) { hist = j; try { await setKV("histCache", { t: Date.now(), data: j }); } catch { /* ignorera */ } return j; } }
    } catch { /* offline eller saknas */ }
    return hist;
  })().then(v => { if (!v) { histP = null; histFail = Date.now(); } return v; });
  return histP;
}
/** [{x: tid, y: USD}] för ett marknadsnamn, eller null om historik saknas helt. */
export function historyFor(mhn) {
  const s = hist?.p?.[mhn]; if (!s) return null;
  const out = []; for (let i = 0; i < hist.d.length; i++) if (s[i] != null) out.push({ x: Date.parse(hist.d[i] + "T12:00:00Z"), y: s[i] });
  return out;
}
export const historyDays = () => hist?.d?.length || 0;
export const historyNames = () => hist ? Object.keys(hist.p) : [];

export function applyTrend() {
  D.trend.clear();
  for (const [k, v] of Object.entries(D.P.tr || {})) D.trend.set(k, v);
}
