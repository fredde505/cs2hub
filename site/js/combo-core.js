// Combo Finder: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.
// Bygger kompletta set (kniv, handskar, vapen, stickers, charm) som matchar ett färgtema inom en budget.
// Färgerna är vår egen uppskattning från bilderna (primär/sekundär färg) – inte en officiell färgsättning.

const clean = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Kandidater för en del: de bäst matchande plus billigare alternativ (så att en snäv budget går att klara).
 * items: lista, score(item) -> 0–100|null, cost(item) -> USD|null (utan pris utesluts).
 */
export function buildCandidates(items, { score, cost, minScore = 40, top = 6, cheap = 4, cheapMin = 55 } = {}) {
  const c = [];
  for (const item of items) { const sc = score(item), p = cost(item); if (sc == null || p == null || !(p >= 0) || sc < minScore) continue; c.push({ item, cost: p, score: sc }); }
  const best = [...c].sort((a, b) => b.score - a.score || a.cost - b.cost).slice(0, top);
  const cheapest = c.filter(x => x.score >= cheapMin).sort((a, b) => a.cost - b.cost).slice(0, cheap);
  return [...new Map([...best, ...cheapest].map(x => [x.item.id ?? x.item, x])).values()];
}

/**
 * Alla kombinationer (en kandidat per del) inom budgeten, med total kostnad och snittmatchning.
 * parts: [{ id, label, list: [{item, cost, score}] }]. budget i samma enhet som cost (eller null).
 * Returnerar { combos (sorterade bäst matchning först), cheapest, minTotal, truncated }.
 */
export function enumerateCombos(parts, { budget = null, cap = 40000 } = {}) {
  if (!parts.length || parts.some(p => !p.list.length)) return { combos: [], cheapest: null, minTotal: null, truncated: false };
  // billigaste kombinationen oavsett budget (för besked när inget ryms)
  const minTotal = parts.reduce((t, p) => t + Math.min(...p.list.map(x => x.cost)), 0);
  const combos = []; let truncated = false, seen = 0;
  const rest = parts.map((_, i) => parts.slice(i + 1).reduce((t, p) => t + Math.min(...p.list.map(x => x.cost)), 0)); // billigaste möjliga resten (för budgetklippning)
  const picks = [];
  const rec = (i, total) => {
    if (seen >= cap) { truncated = true; return; }
    if (i === parts.length) { seen++; combos.push({ picks: picks.map((x, k) => ({ ...x, part: parts[k] })), total, score: picks.reduce((t, x) => t + x.score, 0) / picks.length }); return; }
    for (const x of parts[i].list) {
      const t = total + x.cost;
      if (budget != null && t + rest[i] > budget + 1e-9) continue;
      picks.push(x); rec(i + 1, t); picks.pop();
      if (truncated) return;
    }
  };
  rec(0, 0);
  combos.sort((a, b) => b.score - a.score || a.total - b.total);
  return { combos, cheapest: combos.length ? combos.reduce((a, b) => (b.total < a.total ? b : a)) : null, minTotal, truncated };
}

/** Variation: undvik att samma föremål återkommer i alla förslag (högst maxReuse gånger). Fyller upp med resten om det blir för få. */
export function pickVariety(combos, { n = 6, maxReuse = 2, idOf = x => x.item.id ?? x.item } = {}) {
  const picked = [], used = new Map();
  for (const c of combos) {
    if (picked.length >= n) break;
    if (c.picks.some(x => (used.get(idOf(x)) || 0) >= maxReuse)) continue;
    picked.push(c); c.picks.forEach(x => used.set(idOf(x), (used.get(idOf(x)) || 0) + 1));
  }
  if (picked.length < Math.min(3, combos.length)) for (const c of combos) { if (picked.length >= n) break; if (!picked.includes(c)) picked.push(c); }
  return picked;
}

const CT_ONLY = ["P2000", "USP-S", "Five-SeveN", "MP9", "MAG-7", "M4A4", "M4A1-S", "FAMAS", "AUG", "SCAR-20"];
const T_ONLY = ["Glock-18", "Tec-9", "MAC-10", "Sawed-Off", "AK-47", "Galil AR", "SG 553", "G3SG1"];
/**
 * Gör om en kombination till en Loadout-delning: { side, slots, dropped }.
 * picks: [{ item: skin med {id, k, w}, wear }] (bara skins; stickers och charm tillhör inte Loadout).
 * Sidan väljs efter vilka vapen som bara finns på ena sidan (AK-47/Glock = T, M4/USP-S = CT). Vapen som inte passar vald sida hoppas över (dropped).
 */
export function loadoutFromCombo(picks) {
  const skins = picks.map(p => p.item).filter(s => s && (s.k === "knife" || s.k === "glove" || s.k === "weapon"));
  let ct = 0, t = 0; for (const s of skins) { if (CT_ONLY.includes(s.w)) ct++; if (T_ONLY.includes(s.w)) t++; }
  const side = t > ct ? "t" : "ct", slots = {}; let dropped = 0;
  for (const p of picks) {
    const s = p.item; if (!s || !["knife", "glove", "weapon"].includes(s.k)) continue;
    if ((side === "ct" && T_ONLY.includes(s.w)) || (side === "t" && CT_ONLY.includes(s.w))) { dropped++; continue; }
    const key = s.k === "knife" ? "knife" : s.k === "glove" ? "glove" : s.w;
    if (slots[key]) { dropped++; continue; }
    slots[key] = { id: s.id, wear: p.wear || null, st: false };
  }
  return { side, slots, dropped };
}

/** Länk till Workshop med skin, slitage, stickers (numeriska id) och valfri charm (numeriskt id). */
export function workshopLink({ skin = null, wear = "FT", stickers = [], charm = null } = {}) {
  const o = { s: skin, w: wear, st: stickers.slice(0, 4).map(id => ({ id: Number(id) })), ch: charm != null ? { id: Number(charm) } : null };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "#/workshop/" + b64;
}

/** Tvättar sparade färgteman ([{id,name,colors:[färgnamn]}]) från lagring/backup. validColors = tillåtna färgnamn. */
const COLOR_NAMES = ["red", "orange", "gold", "green", "cyan", "blue", "purple", "pink", "brown", "black", "white", "gray"];
export function cleanColorThemes(v, valid = COLOR_NAMES) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const t of v.slice(0, 100)) {
    if (!t || typeof t !== "object" || typeof t.id !== "string") continue;
    const colors = [...new Set((Array.isArray(t.colors) ? t.colors : []).filter(c => typeof c === "string" && valid.includes(c)))].slice(0, 3);
    if (!colors.length) continue;
    out.push({ id: t.id.slice(0, 60), name: clean(t.name, 60) || "Färgtema", colors });
  }
  return out;
}
