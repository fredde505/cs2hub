// Watchlist: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.
//
// En bevakning: { id, mhn, mode: "price"|"pct", dir: "below"|"above", target (kr), pct (±%, bara mode "pct"), startUsd, created, paused, group, note, notified }
//  - price: målpris i kronor. Avisera när priset är under/över målet.
//  - pct:   procentuell förändring från priset när bevakningen skapades (startUsd). pct < 0 = faller minst så mycket, pct > 0 = stiger minst så mycket.

export const STALE_HOURS = 36;

/** Räknar ut läget för en bevakning. curUsd = nuvarande pris i USD (eller null), rate = USD→SEK. */
export function evaluate(w, curUsd, rate) {
  const mode = w.mode === "pct" ? "pct" : "price";
  const dir = mode === "pct" ? (w.pct < 0 ? "below" : "above") : (w.dir === "above" ? "above" : "below");
  const r = { mode, dir, state: "watching", hit: false, curKr: null, targetKr: null, distance: null, sinceStart: null, targetUsd: null, valid: true };
  if (mode === "pct") {
    if (!(w.startUsd > 0) || !Number.isFinite(w.pct)) { r.valid = false; r.state = "invalid"; return r; }
    r.targetUsd = w.startUsd * (1 + w.pct / 100); r.targetKr = r.targetUsd * rate;
  } else r.targetKr = w.target;
  if (w.startUsd > 0 && curUsd > 0) r.sinceStart = (curUsd / w.startUsd - 1) * 100;
  if (w.paused) { r.state = "paused"; if (curUsd > 0) r.curKr = curUsd * rate; return r; }
  if (!(curUsd > 0)) { r.state = "waiting"; return r; }
  r.curKr = curUsd * rate;
  const cur = mode === "pct" ? curUsd : r.curKr, target = mode === "pct" ? r.targetUsd : w.target;
  r.hit = dir === "below" ? cur <= target : cur >= target;
  // Avstånd kvar till målet i % av målet: 0 eller negativt = nått
  r.distance = dir === "below" ? (cur / target - 1) * 100 : (target / cur - 1) * 100;
  r.state = r.hit ? "hit" : "watching";
  return r;
}

/** Är prisdatan gammal (snapshoten äldre än STALE_HOURS)? */
export const isStale = (ageMs, hours = STALE_HOURS) => ageMs > hours * 3600e3;

/** Läsbar beskrivning av målet, t.ex. "≤ 150 kr" eller "−10 % (≤ 135 kr)". fmtKr formaterar kronor. */
export function describeTarget(w, ev, fmtKr) {
  if (ev.mode === "pct") return `${w.pct > 0 ? "+" : "−"}${Math.abs(w.pct)} % (${ev.dir === "below" ? "≤" : "≥"} ${fmtKr(ev.targetKr)})`;
  return `${ev.dir === "below" ? "≤" : "≥"} ${fmtKr(w.target)}`;
}

/** Grupperar bevakningar per grupp (tom grupp = "Ej grupperade", sist). Bevakar inom en grupp sorteras som angivet (standard nyast först). */
export function groupWatches(ws, sortFn = (a, b) => b.created - a.created) {
  const m = new Map();
  for (const w of ws) { const g = (w.group || "").trim(); if (!m.has(g)) m.set(g, []); m.get(g).push(w); }
  const names = [...m.keys()].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
  return names.map(g => ({ group: g, items: m.get(g).sort(sortFn) }));
}

/** Sammanfattning för sidhuvudet. evs: [{w, ev, stale}] */
export function summarize(evs) {
  const s = { total: evs.length, hit: 0, paused: 0, watching: 0, waiting: 0, stale: 0 };
  for (const { w, ev, stale } of evs) { if (ev.state === "hit") s.hit++; else if (ev.state === "paused") s.paused++; else if (ev.state === "waiting" || ev.state === "invalid") s.waiting++; else s.watching++; if (stale && ev.state !== "paused") s.stale++; }
  return s;
}

/** Tvättar en bevakning (används vid inläsning av egna ändringar). Ogiltiga fält ersätts med säkra standardvärden. */
export function normalizeWatch(w) {
  if (!w || typeof w !== "object") w = {};
  const mode = w.mode === "pct" ? "pct" : "price";
  const pct = mode === "pct" && Number.isFinite(+w.pct) ? Math.max(-99, Math.min(1000, +w.pct)) : null;
  return { ...w, mode, pct, dir: mode === "pct" ? (pct < 0 ? "below" : "above") : (w.dir === "above" ? "above" : "below"), paused: !!w.paused, group: typeof w.group === "string" ? w.group.trim().slice(0, 40) : "", note: typeof w.note === "string" ? w.note.slice(0, 200) : "" };
}
