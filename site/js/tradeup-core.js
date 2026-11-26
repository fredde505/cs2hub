// Trade-up: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.
//
// Regler som modelleras (CS2, standardkontrakt):
//  - 10 skins av SAMMA rarity. Utfallet är en skin av nästa rarity-nivå.
//  - Alla input-skins ska vara StatTrak™ eller inga. Souvenir kan inte användas.
//  - Utfallspoolen är skinsen av nästa nivå i de samlingar inputsen kommer från. Chansen för en samling = antal input från den / 10,
//    och den delas lika mellan samlingens skins av nästa nivå.
//  - Output-float = lägsta + (snittet av inputs normaliserade float) × (högsta − lägsta) för just den utfalls-skinen.
//    Normaliserad float för en input = (float − skinets lägsta) / (skinets högsta − lägsta).
//  - En skin vars samling saknar nästa nivå (högsta nivån i sin samling) kan inte användas.
//
// Covert → kniv/handske (5 skins, sedan 22 oktober 2025), som UPPSKATTNING. Valve publicerar inga odds. Modellen följer tredjepartsguider (CSDB, Strafe)
// och är INTE bekräftad av Valve:
//  - 5 Covert-skins från vapenfall-samlingar (kart-, Armory- och souvenirsamlingar saknar knivar och kan inte användas).
//  - Utfallet är en kniv/handske ur FALLET som hör till en input-skins samling. Samlingens chans = antal input från den / 5.
//  - Chansen delas lika mellan fallets modeller × finish ("grupper"). Doppler-faser räknas inom sin grupp (Phase 1–4 delar lika). Sällsynta faser
//    (Ruby, Sapphire, Black Pearl, Emerald) KAN förekomma men deras chans är okänd, så de ingår INTE i förväntat värde (värdet är en nedre gräns).
//  - Alla-StatTrak™ ger StatTrak™-kniv (handskar finns inte som StatTrak™). StatTrak™ och vanliga får inte blandas.
//  - Float = snitt av normaliserade input-floats, skalat till utfallets eget intervall (samma som vanliga kontrakt; exakt formel ej bekräftad).

export const NEXT = { "Consumer Grade": "Industrial Grade", "Industrial Grade": "Mil-Spec Grade", "Mil-Spec Grade": "Restricted", "Restricted": "Classified", "Classified": "Covert" };
export const COVERT = "Covert", KNIFE_NEXT = "Kniv/handske";
/** Antal skins i kontraktet: 5 för Covert → kniv/handske, annars 10. */
export const sizeOf = rarity => (rarity === COVERT ? 5 : 10);
/** Nästa nivå (för Covert: kniv/handske) eller null om det inte finns något kontrakt. */
export const nextOf = rarity => NEXT[rarity] || (rarity === COVERT ? KNIFE_NEXT : null);
/** Doppler-faser som kan droppas men vars chans inte är känd (ingår inte i förväntat värde): Ruby, Sapphire, Black Pearl, Emerald samt faser utan känt namn (t.ex. "#617"). Bara "Phase 1–4" och skins utan fas räknas som vanliga. */
export const RARE_PHASES = new Set(["Ruby", "Sapphire", "Black Pearl", "Emerald"]);
export const isCommonPhase = ph => !ph || /^Phase \d$/.test(ph);

/**
 * Kopplar samlingar till de fall vars knivar/handskar kan bli utfall. cases: [{ ci:[skinId], cx:[skinId] }] (cx = särskilda föremål).
 * Ett fall hör till den samling som innehåller minst minCover av fallets skins. Returnerar Map(samlings-id → unika id:n för knivar/handskar).
 */
export function caseIndex(cases, skinOf, minCover = 0.9) {
  const out = new Map();
  for (const c of cases || []) {
    if (!Array.isArray(c?.cx) || !c.cx.length || !Array.isArray(c.ci) || !c.ci.length) continue;
    const tally = new Map();
    for (const id of c.ci) for (const cid of skinOf(id)?.col || []) tally.set(cid, (tally.get(cid) || 0) + 1);
    let best = null; for (const [cid, k] of tally) if (!best || k > best[1]) best = [cid, k];
    if (!best || best[1] / c.ci.length < minCover) continue;
    const set = out.get(best[0]) || new Set(); for (const id of c.cx) set.add(id); out.set(best[0], set);
  }
  return new Map([...out].map(([cid, set]) => [cid, [...set]]));
}

/** Grupperar knivar/handskar per modell × finish. { s: representant, variants, rare }. StatTrak™ → bara knivar som finns som StatTrak™. */
export function groupSpecials(skins, stattrak) {
  const by = new Map();
  for (const s of skins || []) {
    if (!s || (stattrak && !(s.st && s.k === "knife"))) continue;
    (by.get(s.n) || by.set(s.n, []).get(s.n)).push(s);
  }
  return [...by.values()].map(v => { const common = v.filter(s => isCommonPhase(s.ph)); return { s: (common[0] || v[0]), variants: v, rare: v.filter(s => !isCommonPhase(s.ph)), common }; });
}
/** Möjliga utfall (grupper) för en samling. rarity = INPUTENS rarity. Vanliga kontrakt: varje skin av nästa nivå är en grupp. Covert: kniv/handske-grupper ur fallet. */
export function groupsOf(ctx, cid, rarity, stattrak) {
  if (rarity === COVERT) return groupSpecials(ctx.special ? ctx.special(cid) : [], stattrak);
  return poolOf(ctx, cid, NEXT[rarity], stattrak).map(s => ({ s, variants: [s], rare: [], common: [s] }));
}
export const WEAR_EDGES = [0.07, 0.15, 0.38, 0.45];
export const wearOf = f => (f < 0.07 ? "FN" : f < 0.15 ? "MW" : f < 0.38 ? "FT" : f < 0.45 ? "WW" : "BS");

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** Normaliserad float: var i skinets eget intervall (0–1). */
export const normFloat = (fl, lo, hi) => (hi > lo ? clamp((fl - lo) / (hi - lo), 0, 1) : 0);
/** Output-float för en utfalls-skin med float-intervall [lo, hi]. */
export const outputFloat = (avgNorm, lo, hi) => lo + avgNorm * (hi - lo);
/** Snitt av normaliserade input-floats (vägt med antal). entries: [{ count, norm }] */
export const avgNorm = entries => { const n = entries.reduce((t, e) => t + e.count, 0); return n ? entries.reduce((t, e) => t + e.count * e.norm, 0) / n : 0; };

/**
 * Kontrollerar kontraktet mot reglerna. contract: { entries:[{id, float, count}], stattrak }.
 * ctx: { skin(id) -> skin|null, collection(cid) -> {items:[id]}|null }.
 * Returnerar [{ ok, text, hard }] – hard=false är en varning som inte hindrar beräkning.
 */
export function checkRules(contract, ctx) {
  const entries = contract.entries || [], skins = entries.map(e => ctx.skin(e.id)).filter(Boolean), n = entries.reduce((t, e) => t + (Math.floor(e.count) || 0), 0);
  const rar = new Set(skins.map(s => s.r)), first = skins[0], r = [], size = sizeOf(first?.r), covert = first?.r === COVERT, colOf = s => (ctx.colOf ? ctx.colOf(s) : s.col?.[0]);
  r.push({ ok: n === size, hard: true, text: `Exakt ${size} skins (${n}/${size})${covert ? " – Covert → kniv/handske" : ""}` });
  r.push({ ok: !skins.length || rar.size === 1, hard: true, text: "Alla skins har samma rarity" + (first ? ` (${first.r})` : "") });
  const top = first && !nextOf(first.r);
  r.push({ ok: !skins.length || !top, hard: true, text: top ? `Rarity ${first.r} kan inte användas i ett kontrakt` : covert ? "Covert-skins ger en kniv eller handske (uppskattning, se nedan)" : "Rarity är lägre än Covert (det finns en nivå över)" });
  r.push({ ok: !contract.stattrak || skins.every(s => s.st), hard: true, text: contract.stattrak ? "Alla skins finns som StatTrak™" + (covert ? " (utfall: bara StatTrak™-knivar, handskar finns inte som StatTrak™)" : "") : "Inga StatTrak™-skins blandas in" });
  r.push({ ok: skins.every(s => s.col && s.col.length > 0), hard: true, text: "Alla skins tillhör en samling" });
  // varje inputs samling måste ha minst en skin på nästa nivå (annars är input högsta nivån i sin samling)
  const next = first && nextOf(first.r);
  if (next) {
    const noNext = [...new Set(skins.filter(s => s.col?.length).filter(s => !groupsOf(ctx, colOf(s), first.r, contract.stattrak).length).map(s => colOf(s)))];
    r.push({ ok: noNext.length === 0, hard: true, text: noNext.length ? (covert ? `${noNext.length} samling${noNext.length > 1 ? "ar" : ""} har inget vapenfall med ${contract.stattrak ? "StatTrak™-knivar" : "knivar/handskar"} (kart-, Armory- och souvenirsamlingar kan inte användas) – input därifrån kan inte användas` : `${noNext.length} samling${noNext.length > 1 ? "ar" : ""} saknar ${next}${contract.stattrak ? " med StatTrak™" : ""}-skins – input därifrån kan inte användas`) : (covert ? "Alla samlingar har ett vapenfall med kniv/handske att få som utfall" : `Alla samlingar har ${next}-skins att få som utfall`) });
  }
  const outside = entries.filter(e => { const s = ctx.skin(e.id); return s?.f && (e.float < s.f[0] - 1e-9 || e.float > s.f[1] + 1e-9); }).length;
  r.push({ ok: outside === 0, hard: false, text: outside ? `${outside} input har en float utanför skinets möjliga intervall (värdet kläms till intervallet i beräkningen)` : "Alla floats ligger inom skinets intervall" });
  return r;
}

/** Skins av en viss rarity i en samling (valfritt: bara de som finns som StatTrak™). */
export function poolOf(ctx, cid, rarity, stattrak) {
  const col = ctx.collection(cid);
  return (col?.items || []).map(i => ctx.skin(i)).filter(s => s && s.f && s.r === rarity && (!stattrak || s.st));
}

/**
 * Räknar på ett komplett kontrakt (kräver att reglerna är uppfyllda).
 * ctx dessutom: price(skin, float) -> kr|null (listpris), net(skin, float) -> kr|null (efter avgift), flag(skin, float) -> {level,label,reasons}|null
 */
export function analyze(contract, ctx) {
  const entries = contract.entries.map(e => { const s = ctx.skin(e.id), fl = clamp(+e.float || 0, s.f[0], s.f[1]); return { e, s, fl, count: e.count, norm: normFloat(fl, s.f[0], s.f[1]), unit: Number.isFinite(e.price) ? e.price : ctx.price(s, fl), manual: Number.isFinite(e.price) }; });
  const rarity = entries[0].s.r, covert = rarity === COVERT, n = entries.reduce((t, x) => t + x.count, 0), an = avgNorm(entries), next = nextOf(rarity);
  const cost = entries.reduce((t, x) => t + (x.unit ?? 0) * x.count, 0), missingInputs = entries.filter(x => x.unit == null).length;
  const colOf = s => (ctx.colOf ? ctx.colOf(s) : s.col[0]);
  const perCol = new Map();
  for (const x of entries) perCol.set(colOf(x.s), (perCol.get(colOf(x.s)) || 0) + x.count);
  const outcomes = [], collections = []; let rareGroups = 0;
  for (const [cid, cnt] of perCol) {
    const pool = groupsOf(ctx, cid, rarity, contract.stattrak), col = ctx.collection(cid);
    collections.push({ cid, name: col?.n || cid, inputs: cnt, share: cnt / n, poolSize: pool.length, perOutcome: pool.length ? cnt / n / pool.length : 0 });
    for (const g of pool) {
      const s = g.s, hasF = !!(s.f && s.f[0] != null && s.f[1] != null), fl = hasF ? outputFloat(an, s.f[0], s.f[1]) : null;
      if (g.rare.length) rareGroups++;
      outcomes.push({ s, cid, col, prob: cnt / n / pool.length, fl, wear: fl != null ? wearOf(fl) : null, price: ctx.price(s, fl), net: ctx.net(s, fl), flag: ctx.flag ? ctx.flag(s, fl) : null, edge: fl != null ? nearestEdge(fl) : null, rare: g.rare.map(x => x.ph), phases: g.common.length > 1 ? g.common.map(x => x.ph).filter(Boolean) : [] });
    }
  }
  outcomes.sort((a, b) => b.prob - a.prob || (b.price ?? 0) - (a.price ?? 0));
  const priced = outcomes.filter(o => o.price != null), cover = priced.reduce((t, o) => t + o.prob, 0);
  const ev = outcomes.reduce((t, o) => t + o.prob * (o.price ?? 0), 0), evNet = outcomes.reduce((t, o) => t + o.prob * (o.net ?? 0), 0);
  const winProb = outcomes.filter(o => (o.price ?? 0) > cost).reduce((t, o) => t + o.prob, 0), winProbNet = outcomes.filter(o => (o.net ?? 0) > cost).reduce((t, o) => t + o.prob, 0);
  // risk: spridning bland de utfall som har pris (omnormaliserat)
  let risk = null;
  if (priced.length && cover > 0) {
    const m = priced.reduce((t, o) => t + o.prob / cover * o.price, 0), sd = Math.sqrt(priced.reduce((t, o) => t + o.prob / cover * (o.price - m) ** 2, 0));
    const lossHalf = priced.filter(o => o.price < cost * 0.5).reduce((t, o) => t + o.prob, 0), lossAny = priced.filter(o => o.price < cost).reduce((t, o) => t + o.prob, 0);
    risk = { min: Math.min(...priced.map(o => o.price)), max: Math.max(...priced.map(o => o.price)), stdev: sd, mean: m, coverage: cover, lossHalf, lossAny, mostLikely: priced.slice().sort((a, b) => b.prob - a.prob || b.price - a.price)[0] };
  }
  return {
    lines: entries, n, avgNorm: an, next, cost, missingInputs, collections, outcomes, ev, evNet, profit: ev - cost, profitNet: evNet - cost,
    roi: cost > 0 ? (ev / cost - 1) * 100 : null, roiNet: cost > 0 ? (evNet / cost - 1) * 100 : null, winProb, winProbNet,
    breakEven: ev, breakEvenNet: evNet, missingOutcomes: outcomes.filter(o => o.price == null).length, missingProb: outcomes.filter(o => o.price == null).reduce((t, o) => t + o.prob, 0),
    coverage: cover, risk, top: [...priced].sort((a, b) => b.price - a.price).slice(0, 5),
    covert, estimate: covert, rareGroups, rareProb: outcomes.filter(o => o.rare.length).reduce((t, o) => t + o.prob, 0),
  };
}

/** Närmaste slitagegräns för en output-float: { edge, distance } (distance = avstånd i float). */
export function nearestEdge(fl) {
  let best = null; for (const e of WEAR_EDGES) { const d = Math.abs(fl - e); if (!best || d < best.distance) best = { edge: e, distance: d }; }
  return best;
}

/**
 * Hur hög snitt-normaliserad float kan inputsen ha för att utfalls-skinen (intervall lo–hi) fortfarande ska hamna i ett visst slitage?
 * Returnerar { max } (högsta snitt-norm för att hålla sig under gränsen) eller null om slitaget inte går att nå.
 */
export function normLimitForWear(lo, hi, wear) {
  const idx = ["FN", "MW", "FT", "WW", "BS"].indexOf(wear); if (idx < 0 || hi <= lo) return null;
  const upper = idx < 4 ? WEAR_EDGES[idx] : 1, lower = idx > 0 ? WEAR_EDGES[idx - 1] : 0;
  if (lo >= upper) return null; // skinets lägsta float ligger redan över bandet
  const maxNorm = Math.min(1, (upper - lo) / (hi - lo)), minNorm = Math.max(0, (lower - lo) / (hi - lo));
  if (minNorm > 1) return null;
  return { min: minNorm, max: maxNorm };
}

/** Tvättar sparade kontrakt ([{id,name,stattrak,entries:[{id,float,count,price}],created}]) från lagring/backup. */
export function cleanSavedTradeups(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const c of v.slice(0, 100)) {
    if (!c || typeof c !== "object" || typeof c.id !== "string") continue;
    const entries = (Array.isArray(c.entries) ? c.entries : []).slice(0, 10).map(e => ({
      id: typeof e?.id === "string" && /^[\w-]{1,60}$/.test(e.id) ? e.id : null,
      float: typeof e?.float === "number" && Number.isFinite(e.float) ? clamp(e.float, 0, 1) : null,
      count: typeof e?.count === "number" && Number.isFinite(e.count) ? clamp(Math.floor(e.count), 1, 10) : null,
      price: typeof e?.price === "number" && Number.isFinite(e.price) && e.price >= 0 ? e.price : null,
    })).filter(e => e.id && e.float != null && e.count != null);
    if (!entries.length) continue;
    out.push({ id: c.id.slice(0, 60), name: typeof c.name === "string" ? c.name.slice(0, 80) : "Trade-up", stattrak: !!c.stattrak, entries, created: Number.isFinite(c.created) ? c.created : 0 });
  }
  return out;
}
