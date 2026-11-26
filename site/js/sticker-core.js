// Sticker Combination Finder: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.
// Färgerna kommer från vår egen bildanalys av varje stickerbild (tools/build_data.py --stickers) – en uppskattning, inte en officiell färgsättning.

export const ACHROMATIC = ["black", "white", "gray"];
export const THEMES = {
  blue: ["Blått", ["blue", "cyan"]], red: ["Rött", ["red"]], gold: ["Svart och guld", ["black", "gold"]], purple: ["Lila", ["purple", "pink"]],
  green: ["Grönt", ["green"]], orange: ["Orange", ["orange", "gold"]], pink: ["Rosa", ["pink"]], bw: ["Svartvitt", ["black", "white"]],
};
/** Plockar ut vem/vad en sticker föreställer ur namnet: { who, event, kind } där kind = player | team | event | other. */
export function stickerMeta(s) {
  const parts = String(s.n || "").replace(/^Sticker \| /, "").split(" | ");
  const clean = t => String(t || "").replace(/\s*\((Holo|Foil|Gold|Glitter|Lenticular|Embroidered|Champion)[^)]*\)/gi, "").trim();
  const kind = s.ty === "Autograph" ? "player" : s.ty === "Team" ? "team" : s.ty === "Event" ? "event" : "other";
  return { who: clean(parts[0]), event: parts.length > 1 ? clean(parts[parts.length - 1]) : "", kind };
}

/**
 * Hur väl en stickers färg matchar ett tema (lista med färgnamn). 0–100, eller null om stickern saknar färgdata.
 * Primärfärg i temat 70, bara sekundärfärg i temat 35; +15 om båda färgerna ingår; upp till +15 efter hur stor del av bilden primärfärgen täcker;
 * −10 för flerfärgade (multicolor).
 */
export function colorScore(s, theme) {
  if (!s || !s.c1) return null;
  if (!theme || !theme.length) return 100;
  const t = new Set(theme);
  let sc = 0;
  if (t.has(s.c1)) {
    sc = 70; if (s.c2 && t.has(s.c2)) sc += 15;
    sc += Math.min(15, (s.p1 || 0) / 100 * 15);
    if (s.mc) sc -= 10;
  } else if (s.c2 && t.has(s.c2)) sc = 35;
  return Math.max(0, Math.min(100, Math.round(sc)));
}

/** Hur lika varandra stickerna i en kombination är i färg, 0–100 (andel av färg-"rösterna" som går till den vanligaste färgen). Primär = 1 röst, sekundär = ½. */
export function cohesion(list) {
  const votes = {}; let total = 0;
  for (const s of list) { if (!s.c1) continue; votes[s.c1] = (votes[s.c1] || 0) + 1; total += 1; if (s.c2) { votes[s.c2] = (votes[s.c2] || 0) + 0.5; total += 0.5; } }
  if (!total) return null;
  return Math.round(Math.max(...Object.values(votes)) / total * 100);
}

/**
 * Hittar kombinationer av stickers.
 * stickers: [{id, n, c1, c2, p1, mc, tn, ty, ...}]; costOf(s) = pris i kr eller null (utan pris kan man inte köpa den och den utesluts).
 * opt: { count 1–4, budget (kr eller null), theme [färgnamn]|null, minScore (standard 60 när tema finns), sort "match"|"cheap"|"dear",
 *        duplicates (samma sticker flera gånger), poolSize (hur många kandidater som kombineras), limit }
 * Returnerar { combos:[{items:[s], cost, score}], poolCount, candidates, examined, capped }.
 */
export function findCombos(stickers, costOf, opt = {}) {
  const count = Math.max(1, Math.min(4, Math.floor(opt.count) || 4)), budget = Number.isFinite(opt.budget) ? opt.budget : null;
  const theme = opt.theme && opt.theme.length ? opt.theme : null, minScore = Number.isFinite(opt.minScore) ? opt.minScore : (theme ? 60 : 0);
  const sort = ["match", "cheap", "dear"].includes(opt.sort) ? opt.sort : "match", dup = !!opt.duplicates, limit = Math.max(1, Math.min(50, opt.limit || 12));
  const P = Math.max(count, Math.min(60, opt.poolSize || 40));
  let cands = [];
  for (const s of stickers) {
    const cost = costOf(s); if (!Number.isFinite(cost) || cost < 0) continue;
    const sc = theme ? colorScore(s, theme) : (s.c1 ? 100 : null);
    if (sc == null || sc < minScore) continue;
    if (budget != null && cost > budget) continue;
    cands.push({ s, cost, sc });
  }
  const candidates = cands.length;
  // Kandidatpoolen: för "match" de bäst matchande (billigast först vid lika), annars de billigaste/dyraste
  cands.sort(sort === "dear" ? (a, b) => b.cost - a.cost || b.sc - a.sc : sort === "cheap" ? (a, b) => a.cost - b.cost || b.sc - a.sc : (a, b) => b.sc - a.sc || a.cost - b.cost);
  const pool = cands.slice(0, P).sort((a, b) => a.cost - b.cost); // billigast först så att budgeten kan klippa grenar
  const found = []; let examined = 0; const CAP = 400000, picked = [];
  const rec = (start, cost) => {
    if (examined >= CAP) return;
    if (picked.length === count) {
      examined++;
      const items = picked.map(x => x.s);
      found.push({ items, cost, score: theme ? Math.round(picked.reduce((t, x) => t + x.sc, 0) / count) : (cohesion(items) ?? 0) });
      return;
    }
    for (let i = start; i < pool.length; i++) {
      const c = cost + pool[i].cost;
      if (budget != null && c > budget + 1e-9) break; // poolen är sorterad stigande på pris: resten blir dyrare
      picked.push(pool[i]); rec(dup ? i : i + 1, c); picked.pop();
    }
  };
  rec(0, 0);
  found.sort(sort === "cheap" ? (a, b) => a.cost - b.cost || b.score - a.score : sort === "dear" ? (a, b) => b.cost - a.cost || b.score - a.score : (a, b) => b.score - a.score || a.cost - b.cost);
  return { combos: found.slice(0, limit), poolCount: pool.length, candidates, examined, capped: examined >= CAP };
}

/** Länk till Workshop med stickers förladdade (samma format som Workshopens delningslänkar). ids = numeriska sticker-id (utan "sticker-"). */
export function workshopHash(stickerIds) {
  const o = { s: null, w: "FT", st: stickerIds.slice(0, 4).map(id => ({ id: Number(id) })) };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "#/workshop/" + b64;
}
export const numericId = s => Number(String(s.id).replace(/^sticker-/, ""));

/** Tvättar sparade kombinationer ([{id,name,ids:[nummer],created}]) från lagring/backup. */
export function cleanCombos(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 200).filter(c => c && typeof c === "object").map(c => ({
    id: typeof c.id === "string" ? c.id.slice(0, 60) : "", name: typeof c.name === "string" ? c.name.slice(0, 80) : "Kombination",
    ids: Array.isArray(c.ids) ? c.ids.map(Number).filter(n => Number.isInteger(n) && n > 0 && n < 1e8).slice(0, 4) : [],
    created: Number.isFinite(c.created) ? c.created : 0,
  })).filter(c => c.id && c.ids.length);
}
