// Vinstmotor: varje köp och försäljning är en egen händelse. Kostnad räknas med glidande genomsnittligt inköpspris (GAV).
// Föremål med egen float/seed är egna positioner och blandas inte ihop med andra av samma skin.
import { all } from "./store.js";
import { steamUsd, cashUsd, bestUsd, lookup, D, ensureStickers } from "./data.js";
import { usd2sek } from "./util.js";
import { analysePrice } from "./pricing.js";

export async function loadState() {
  const [items, trades] = await Promise.all([all("items"), all("trades")]);
  /* Stickers slås upp i katalogen som laddas i bakgrunden: vänta bara om innehav/affärer faktiskt innehåller några */
  if (!D.stickersReady && (items.some(i => /^Sticker \|/.test(i.mhn)) || trades.some(t => /^Sticker \|/.test(t.mhn)))) await ensureStickers();
  return { items, trades };
}

const has = v => v != null && v !== "" && Number.isFinite(+v);
// Föremål som aldrig går att sälja på en marknad (medaljer, märken, mynt …) – de har inget pris och räknas inte som "pris saknas".
const NON_MARKET = /Service Medal|Season .*Medal|\bMedal$|Global Offensive Badge|\bBadge$|Veteran Coin|\bCoin$|Storage Unit|C4 Explosive|Collectible Pin|Premier Season/i;
export const isNotSellable = it => !!it.nm || NON_MARKET.test(it.mhn || "");
/** Nyckel för position: market_hash_name, plus float och seed när de finns (unikt föremål). */
export const posKey = (mhn, float, seed) => has(float) ? `${mhn}#${(+float).toFixed(5)}${has(seed) ? "#" + +seed : ""}` : mhn;

/** Räknar positioner ur transaktionsloggen (kronor). */
export function positions(trades) {
  const pos = new Map();
  const sorted = [...trades].sort((a, b) => a.date - b.date || a.created - b.created);
  for (const t of sorted) {
    const key = posKey(t.mhn, t.float, t.seed);
    const p = pos.get(key) || { key, mhn: t.mhn, float: has(t.float) ? +t.float : null, seed: has(t.seed) ? +t.seed : null, qty: 0, cost: 0, realized: 0, realizedSteam: 0, realizedCash: 0, bought: 0, sold: 0, fees: 0, buys: 0, sells: 0, proceeds: 0, firstBuy: null };
    const q = +t.qty || 1, price = +t.price || 0, fee = +t.fee || 0;
    p.fees += fee;
    if (t.type === "buy") {
      p.qty += q; p.cost += price * q + fee; p.bought += q; p.buys++;
      if (p.firstBuy == null) p.firstBuy = t.date;
    } else {
      const avg = p.qty > 0 ? p.cost / p.qty : 0;
      const covered = Math.min(q, p.qty);
      const proceeds = price * q - fee;
      const gain = proceeds - avg * covered; // oregistrerat överskott räknas utan kostnadsbas
      p.realized += gain;
      if (t.pay === "steam") p.realizedSteam += gain; else p.realizedCash += gain;
      p.proceeds += proceeds;
      p.cost -= avg * covered; p.qty -= covered; p.sold += q; p.sells++;
    }
    pos.set(key, p);
  }
  for (const p of pos.values()) p.avg = p.qty > 0 ? p.cost / p.qty : (p.bought ? 0 : null);
  return pos;
}

/** Bygger rader för inventoryt med värde (Steam / riktiga pengar), kostnad och vinst. */
export function buildRows(items, trades) {
  const pos = positions(trades);
  const rows = items.map(it => {
    const ref = lookup(it.mhn);
    const e = ref?.e;
    const key = posKey(it.mhn, it.float, it.seed);
    let p = pos.get(key), approx = false;
    if (!p && key !== it.mhn) { p = pos.get(it.mhn); approx = !!p; } // reserv: köp registrerade utan float
    const qty = Math.max(1, Math.floor(+it.qty) || 1);
    const steam = usd2sek(steamUsd(it.mhn) ?? bestUsd(it.mhn));
    const cash = usd2sek(cashUsd(it.mhn));
    const unitCost = p && p.avg != null && p.bought ? p.avg : null;
    const cost = unitCost != null ? unitCost * qty : null;
    const vSteam = steam != null ? steam * qty : null;
    const vCash = cash != null ? cash * qty : null;
    const ps = analysePrice(D.P.p[it.mhn] || null, { ageMs: D.priceAge ? Date.now() - D.priceAge : 0, mhn: it.mhn }); // pristillförlitlighet (antal marknader, avvikelser, ålder)
    return {
      ps, firstBuy: p ? p.firstBuy : null, realized: p ? p.realized : 0, sold: p ? p.sold : 0, // realiserad vinst för positionen (för filter)
      it, e, ref, qty, mhn: it.mhn, key, costApprox: approx,
      name: e?.n || it.name || it.mhn, img: e?.img || it.img || "",
      kind: e?.kind || it.kind || "other", rc: e?.rc || it.rc || "#666",
      rarity: e?.r || "", c1: e?.c1 || null, c2: e?.c2 || null,
      weapon: e?.w || "", wear: ref?.wear || null, st: !!ref?.st,
      float: has(it.float) ? +it.float : null, seed: has(it.seed) ? +it.seed : null,
      steam, cash, vSteam, vCash, unitCost, cost,
      notSellable: steam == null && cash == null && isNotSellable(it),
      noPrice: steam == null && cash == null && !isNotSellable(it),
      plSteam: cost != null && vSteam != null ? vSteam - cost : null,
      plCash: cost != null && vCash != null ? vCash - cost : null,
    };
  });
  return { rows, pos };
}

export function totals(rows, pos) {
  const t = { steam: 0, cash: 0, cost: 0, byKind: {}, count: 0, unrealizedSteam: 0, unrealizedCash: 0, unpriced: 0, unpricedItems: 0, notSellable: 0, withCost: 0, withoutCost: 0, doubtItems: 0, doubtValue: 0 };
  for (const r of rows) {
    if (r.it.hidden) continue;
    t.count += r.qty;
    if (r.noPrice) { t.unpriced += r.qty; t.unpricedItems++; }
    if (r.notSellable) t.notSellable++;
    if (!r.noPrice && !r.notSellable && (r.ps.level === "uncertain" || r.ps.level === "stale")) { t.doubtItems++; t.doubtValue += r.vCash || 0; }
    t.steam += r.vSteam || 0; t.cash += r.vCash || 0;
    if (r.cost != null) {
      t.withCost++; t.cost += r.cost;
      if (r.vSteam != null) t.unrealizedSteam += r.vSteam - r.cost;
      if (r.vCash != null) t.unrealizedCash += r.vCash - r.cost;
    } else t.withoutCost++;
    const k = t.byKind[r.kind] || (t.byKind[r.kind] = { steam: 0, cash: 0, qty: 0 });
    k.steam += r.vSteam || 0; k.cash += r.vCash || 0; k.qty += r.qty;
  }
  t.realized = 0; t.realizedSteam = 0; t.realizedCash = 0; t.fees = 0;
  for (const p of pos.values()) { t.realized += p.realized; t.realizedSteam += p.realizedSteam; t.realizedCash += p.realizedCash; t.fees += p.fees; }
  return t;
}
