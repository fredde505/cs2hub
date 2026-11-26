// Skin Comparison: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.

/**
 * Prisutveckling ur Steams snitt [24 h, 7 d, 30 d, 90 d]: förändring i % från varje snitt till nuläget (24 h-snittet, annars 7 d).
 * Det är en jämförelse av medelpriser på Steam – inte en dagskurva och inte marknadspriset. null där underlag saknas.
 */
export function trendChanges(tr) {
  if (!Array.isArray(tr)) return { d7: null, d30: null, d90: null };
  const now = tr[0] > 0 ? tr[0] : tr[1] > 0 ? tr[1] : null;
  const ch = base => (now != null && base > 0 ? (now / base - 1) * 100 : null);
  return { d7: ch(tr[1]), d30: ch(tr[2]), d90: ch(tr[3]) };
}

/** Index på det bästa värdet i en lista (null om färre än två jämförbara värden eller om alla är lika). low = lägst är bäst. */
export function bestIndex(values, low = true) {
  const f = values.map((v, i) => [v, i]).filter(([v]) => v != null && Number.isFinite(v));
  if (f.length < 2) return null;
  const t = low ? Math.min(...f.map(x => x[0])) : Math.max(...f.map(x => x[0]));
  const hits = f.filter(x => x[0] === t);
  return hits.length === 1 ? hits[0][1] : null; // lika värden ger ingen vinnare
}
/** Markerar bästa värdet (eller flera vid lika): [bool]. Kräver minst två jämförbara värden. */
export function bestFlags(values, low = true) {
  const f = values.filter(v => v != null && Number.isFinite(v));
  if (f.length < 2) return values.map(() => false);
  const t = low ? Math.min(...f) : Math.max(...f);
  if (f.every(v => v === t)) return values.map(() => false);
  return values.map(v => v != null && v === t);
}

/**
 * Sammanfattning: vem som är billigast, har bäst 30-dagarsutveckling, lägst möjlig float och högst netto.
 * cols: [{ name, from (usd), ch30, floatMin, cash }]
 */
export function verdicts(cols) {
  const pick = (fn, low) => { const i = bestIndex(cols.map(fn), low); return i == null ? null : { index: i, name: cols[i].name }; };
  return { cheapest: pick(c => c.from, true), trend30: pick(c => c.ch30, false), lowestFloat: pick(c => c.floatMin, true), bestNet: pick(c => c.cash, false) };
}

/** Tvättar sparade jämförelser ([{id,name,ids:[sträng]}]) från lagring/backup. */
export function cleanSavedCompares(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 100).filter(c => c && typeof c === "object").map(c => ({
    id: typeof c.id === "string" ? c.id.slice(0, 60) : "", name: typeof c.name === "string" ? c.name.slice(0, 80) : "Jämförelse",
    ids: Array.isArray(c.ids) ? [...new Set(c.ids.filter(x => typeof x === "string" && /^[\w-]{1,60}$/.test(x)))].slice(0, 4) : [],
    created: Number.isFinite(c.created) ? c.created : 0,
  })).filter(c => c.id && c.ids.length >= 2);
}
