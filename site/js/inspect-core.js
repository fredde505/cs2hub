// Inspect & Float: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.
const BANDS = [["FN", 0, 0.07], ["MW", 0.07, 0.15], ["FT", 0.15, 0.38], ["WW", 0.38, 0.45], ["BS", 0.45, 1]];
export const wearOf = f => (f < 0.07 ? "FN" : f < 0.15 ? "MW" : f < 0.38 ? "FT" : f < 0.45 ? "WW" : "BS");

/**
 * Var ligger floaten inom skinets möjliga intervall [lo, hi]?
 * pos = 0–100 (0 = lägsta möjliga, 100 = högsta). lowerThan = andel (%) av alla möjliga floats som är HÖGRE än den här, om floats antas vara
 * jämnt fördelade över intervallet (en förenkling – verkliga skins kan avvika). null om intervallet är ogiltigt. outside = utanför intervallet.
 */
export function floatPosition(fl, lo, hi) {
  if (![fl, lo, hi].every(Number.isFinite) || hi <= lo) return null;
  const pos = (fl - lo) / (hi - lo) * 100;
  return { pos: Math.max(0, Math.min(100, pos)), lowerThan: Math.max(0, Math.min(100, 100 - pos)), outside: fl < lo - 1e-9 || fl > hi + 1e-9 };
}

/** Närmaste slitagegräns och avstånd dit: { boundary, distance, side: "över"|"under", wear (nuvarande), neighbor (slitaget på andra sidan gränsen) }. */
export function boundaryInfo(fl) {
  if (!Number.isFinite(fl) || fl < 0 || fl > 1) return null;
  const edges = [0.07, 0.15, 0.38, 0.45];
  let best = null;
  for (const e of edges) { const d = Math.abs(fl - e); if (!best || d < best.distance) best = { boundary: e, distance: d }; }
  const wear = wearOf(fl), above = fl >= best.boundary;
  return { ...best, side: above ? "över" : "under", wear, neighbor: above ? wearOf(best.boundary - 1e-9) : wearOf(best.boundary) };
}

/** Slitagegrader som ryms i skinets intervall: [{ wear, from, to }] (bandet skuret mot [lo, hi]). */
export function wearTable(lo, hi, wears = null) {
  return BANDS.filter(([w]) => !wears || wears.includes(w)).map(([wear, a, b]) => ({ wear, from: Math.max(a, lo), to: Math.min(b, hi) })).filter(x => x.from < x.to || (x.from === x.to && x.to === hi && hi > 0));
}

/** Jämför två avkodade föremål. Returnerar { sameItem, floatDiff, lower: "A"|"B"|"lika"|null, relPct, sameSeed, sameWear }. */
export function compareDecoded(a, b) {
  const sameItem = a.defIndex === b.defIndex && a.paintIndex === b.paintIndex;
  const both = a.float != null && b.float != null;
  const diff = both ? b.float - a.float : null;
  return {
    sameItem, floatDiff: diff,
    lower: both ? (Math.abs(diff) < 1e-12 ? "lika" : diff > 0 ? "A" : "B") : null,
    relPct: both && a.float > 0 ? (b.float / a.float - 1) * 100 : null,
    sameSeed: a.seed === b.seed, sameWear: both ? wearOf(a.float) === wearOf(b.float) : null,
  };
}

/** Tvättar sparade inspect-resultat ([{id,name,hex|null,sim:{skin,float,seed}|null,created}]) från lagring/backup. */
export function cleanSavedInspect(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const c of v.slice(0, 200)) {
    if (!c || typeof c !== "object" || typeof c.id !== "string") continue;
    const hex = typeof c.hex === "string" && /^[0-9a-fA-F]{40,4000}$/.test(c.hex) && c.hex.length % 2 === 0 ? c.hex : null;
    const s = c.sim && typeof c.sim === "object" ? { skin: typeof c.sim.skin === "string" && /^[\w-]{1,60}$/.test(c.sim.skin) ? c.sim.skin : null, float: typeof c.sim.float === "number" ? c.sim.float : NaN, seed: typeof c.sim.seed === "number" ? Math.floor(c.sim.seed) : NaN } : null;
    const sim = s && s.skin && Number.isFinite(s.float) && s.float >= 0 && s.float <= 1 && Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 1000 ? s : null;
    if (!hex && !sim) continue;
    out.push({ id: c.id.slice(0, 60), name: typeof c.name === "string" ? c.name.slice(0, 80) : "Sparat resultat", hex, sim, created: Number.isFinite(c.created) ? c.created : 0 });
  }
  return out;
}
