// Ren logik för inventory (utan DOM och lagring) så att den går att testa: filter och hur en försäljning tas ur lagret.
import { PATTERN_PRICED } from "./pricing.js";

/** Standardvärden för alla inventory-filter. Tom sträng / false = filtret är av. */
export const FILTER_DEFAULTS = { q: "", kind: "", cat: "", rarity: "", color: "", cost: "", pmin: "", pmax: "", bmin: "", bmax: "", fmin: "", fmax: "", seed: "", profit: "", real: "", variant: "", noprice: false, rare: false, fav: false, hidden: false };
export const FILTER_KEYS = Object.keys(FILTER_DEFAULTS).filter(k => k !== "q");

/** Hur många filter som är aktiva (sök räknas inte). */
export const countFilters = V => FILTER_KEYS.filter(k => (typeof FILTER_DEFAULTS[k] === "boolean" ? !!V[k] : V[k] !== "" && V[k] != null)).length;

const num = v => (v === "" || v == null ? null : Number.isFinite(+v) ? +v : null);

/** "Ovanlig variant": Souvenir, eller skin där priset beror på fas/mönster (Doppler, Fade, Case Hardened, Marble Fade). */
export const isRare = r => !!r.ref?.sv || PATTERN_PRICED.test(r.mhn || "") || /Souvenir/.test(r.mhn || "");

/**
 * Passar raden filtren? Alla aktiva filter måste stämma (kombineras med OCH).
 * opt: { unit(r) = värde per st, pl(r) = orealiserad vinst i kr }
 */
export function rowMatches(r, V, { unit, pl }) {
  if (!V.hidden && r.it.hidden) return false;
  if (V.fav && !r.it.fav) return false;
  if (V.kind && r.kind !== V.kind) return false;
  if (V.cat && r.e?.c !== V.cat) return false;
  if (V.rarity && r.rarity !== V.rarity) return false;
  if (V.color && r.c1 !== V.color && r.c2 !== V.color) return false;
  if (V.cost === "has" && r.cost == null) return false;
  if (V.cost === "none" && r.cost != null) return false;
  if (V.noprice && !r.noPrice) return false;
  if (V.variant === "st" && !r.st) return false;
  if (V.variant === "sv" && !r.ref?.sv) return false;
  if (V.variant === "normal" && (r.st || r.ref?.sv)) return false;
  if (V.rare && !isRare(r)) return false;
  const p = pl(r);
  if (V.profit === "gain" && !(p != null && p > 0)) return false;
  if (V.profit === "loss" && !(p != null && p < 0)) return false;
  if (V.real === "gain" && !(r.sold > 0 && r.realized > 0)) return false;
  if (V.real === "loss" && !(r.sold > 0 && r.realized < 0)) return false;
  const q = String(V.q || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (q.length && !q.every(t => (r.name + " " + r.mhn + " " + (r.it.nametag || "")).toLowerCase().includes(t))) return false;
  const pmin = num(V.pmin), pmax = num(V.pmax), bmin = num(V.bmin), bmax = num(V.bmax), fmin = num(V.fmin), fmax = num(V.fmax), seed = num(V.seed);
  if (pmin != null && (unit(r) ?? 0) < pmin) return false;
  if (pmax != null && (unit(r) ?? 1e12) > pmax) return false;
  if (bmin != null && (r.unitCost == null || r.unitCost < bmin)) return false;
  if (bmax != null && (r.unitCost == null || r.unitCost > bmax)) return false;
  if (fmin != null && (r.float == null || r.float < fmin)) return false;
  if (fmax != null && (r.float == null || r.float > fmax)) return false;
  if (seed != null && r.seed !== seed) return false;
  return true;
}

/** Hur många exemplar av ett marknadsnamn som finns i inventory. */
export const ownedCount = (items, mhn) => items.filter(i => i.mhn === mhn).reduce((s, i) => s + Math.max(1, Math.floor(+i.qty) || 1), 0);

/**
 * Tar `qty` exemplar av `mhn` ur inventory. preferId = det föremål som ska tas först (t.ex. det man högerklickade på).
 * Returnerar { updates: [föremål med nytt antal], deletes: [id], shortfall: hur många som saknades, owned }.
 * Rör inte indatan.
 */
export function sellFromItems(items, mhn, qty, preferId = null) {
  const own = items.filter(i => i.mhn === mhn).map(i => ({ ...i }));
  if (preferId) own.sort((a, b) => (b.id === preferId) - (a.id === preferId));
  const owned = own.reduce((s, i) => s + Math.max(1, Math.floor(+i.qty) || 1), 0);
  let left = Math.max(0, Math.floor(qty) || 0); const updates = [], deletes = [];
  for (const it of own) {
    if (left <= 0) break;
    const have = Math.max(1, Math.floor(+it.qty) || 1), take = Math.min(left, have); left -= take;
    if (have - take <= 0) deletes.push(it.id); else { it.qty = have - take; updates.push(it); }
  }
  return { updates, deletes, shortfall: left, owned };
}
