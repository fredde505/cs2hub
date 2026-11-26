// Pattern Explorer: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.
// All data kommer från de externa beräkningarna i site/data/patterns.json (csgo-blue-gem-calculator och csgo-fade-percentage-calculator, MIT).
// Här tolkas, rankas, filtreras och förklaras den – inget värde hittas på.
//
// Blå data: array med 1001 poster [blå %, lila %, guld %] per seed. Fade-data: array med 1001 värden (Fade %) eller null där seeden saknas.

/** "661, 12-15, abc, 5000" -> { seeds: [661, 12, 13, 14, 15], bad: ["abc", "5000"] }. Dubbletter tas bort, max 500 seeds. */
export function parseSeeds(text, max = 1000) {
  const seeds = [], bad = [], seen = new Set();
  for (const tok of String(text ?? "").split(/[\s,;]+/).filter(Boolean)) {
    const r = tok.match(/^(\d{1,4})-(\d{1,4})$/), one = tok.match(/^\d{1,4}$/);
    let a, b;
    if (r) { a = +r[1]; b = +r[2]; if (a > b) [a, b] = [b, a]; } else if (one) a = b = +tok; else { bad.push(tok); continue; }
    if (b > max) { bad.push(tok); continue; }
    for (let s = a; s <= b && seeds.length < 500; s++) if (!seen.has(s)) { seen.add(s); seeds.push(s); }
  }
  return { seeds, bad };
}

/** Konkurrensrankning: seeds med samma värde delar rank (1, 2, 2, 4 …). values[seed]; null/undefined hoppas över. Returnerar { rankOf(seed), n }. */
export function competitionRanks(values, higherBetter = true) {
  const list = [];
  values.forEach((v, s) => { if (v != null && Number.isFinite(v)) list.push([s, v]); });
  list.sort((a, b) => (higherBetter ? b[1] - a[1] : a[1] - b[1]) || a[0] - b[0]);
  const rank = new Map(); let prev = null, r = 0;
  list.forEach(([s, v], i) => { if (v !== prev) { r = i + 1; prev = v; } rank.set(s, r); });
  return { rankOf: s => rank.get(s) ?? null, n: list.length, order: list.map(x => x[0]) };
}

/** Hur stor del (%) av de andra seedsen som har ett sämre värde än den här (0–100). */
export function betterThanPct(values, seed, higherBetter = true) {
  const v = values[seed]; if (v == null) return null;
  const all = values.filter(x => x != null && Number.isFinite(x)); if (all.length < 2) return null;
  const worse = all.filter(x => (higherBetter ? x < v : x > v)).length;
  return worse / (all.length - 1) * 100;
}

/** Histogram: antal värden per hink mellan lo och hi. Returnerar { bins:[{from,to,count}], max, binOf(v) }. */
export function histogram(values, lo, hi, nBins = 10) {
  const bins = Array.from({ length: nBins }, (_, i) => ({ from: lo + (hi - lo) * i / nBins, to: lo + (hi - lo) * (i + 1) / nBins, count: 0 }));
  const binOf = v => Math.max(0, Math.min(nBins - 1, Math.floor((v - lo) / (hi - lo) * nBins)));
  for (const v of values) if (v != null && Number.isFinite(v) && v >= lo && v <= hi) bins[binOf(v)].count++;
  return { bins, max: Math.max(1, ...bins.map(b => b.count)), binOf };
}

const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); // samma avrundning som visningen (inte toFixed, som ger 98,3 för 98,35)
const parts = ([b, p, g]) => ({ blue: b, purple: p, gold: g, other: Math.max(0, +(100 - b - p - g).toFixed(1)) });
export function dominantColor(t) {
  const x = parts(t); const e = Object.entries(x).sort((a, b) => b[1] - a[1]);
  return e[0][0];
}

/**
 * Förklarar varför en seed får sin rankning (Case Hardened / Blue Gem). data = array [blå, lila, guld] per seed.
 * Rankingen sorterar efter BLÅ andel på den valda sidan; lila och guld påverkar inte rankingen men beskrivs.
 */
export function explainBlue(data, seed) {
  const t = data[seed]; if (!t) return null;
  const blues = data.map(x => (x ? x[0] : null)), R = competitionRanks(blues, true), rank = R.rankOf(seed), top = R.order[0];
  const p = parts(t), better = betterThanPct(blues, seed, true), gap = blues[top] - t[0];
  const dom = dominantColor(t), name = { blue: "blå", purple: "lila", gold: "guld", other: "övriga färger" }[dom];
  const s = [];
  s.push(`Rank #${rank} av ${R.n} efter blå andel (${f1(t[0])} %).`);
  s.push(rank === 1 ? "Det här är seeden med högst blå andel på den här sidan." : `Toppseeden är ${top} med ${f1(blues[top])} % blå – ${f1(gap)} procentenheter mer.`);
  s.push(`Bättre än ca ${Math.round(better)} % av alla seeds på sidan.`);
  s.push(`Dominerande färg: ${name}${dom !== "blue" ? " – mönstret domineras inte av blått, så det rankas lägre än blåa seeds även om lila/guld är hög" : ""}.`);
  if (p.gold >= 15) s.push(`Hög guldandel (${f1(p.gold)} %) – påverkar inte rankingen, men syns tydligt i mönstret.`);
  return { seed, rank, n: R.n, top, topBlue: blues[top], gap, betterThan: better, parts: p, dominant: dom, tied: R.order.filter(x => blues[x] === blues[seed]).length, sentences: s };
}

/** Förklarar Fade-rankingen för en seed. data = array med Fade % (eller null). */
export function explainFade(data, seed) {
  const v = data[seed]; if (v == null) return null;
  const R = competitionRanks(data, true), rank = R.rankOf(seed), top = R.order[0], better = betterThanPct(data, seed, true);
  const tied = R.order.filter(x => data[x] === v).length;
  const s = [`Rank #${rank} av ${R.n} efter Fade-procent (${f1(v)} %).`];
  s.push(rank === 1 ? "Högst Fade-procent av alla seeds för det här vapnet." : `Högsta Fade-procenten är ${f1(data[top])} % (seed ${top}) – ${f1((data[top] - v))} procentenheter mer.`);
  s.push(`Bättre än ca ${Math.round(better)} % av alla seeds.`);
  if (tied > 1) s.push(`${tied} seeds har exakt samma procent och delar därför rank.`);
  s.push("Fade-procenten visar hur stor del av färggradienten (gul → rosa → lila) som visas enligt den öppna algoritmen – högre = mer av gradienten.");
  return { seed, rank, n: R.n, top, topValue: data[top], betterThan: better, tied, sentences: s };
}

/**
 * Filtrerar och sorterar seeds. opt: { minBlue, maxBlue, minPurple, minGold, seeds:[...]|null, sort, top }
 * sort: "blue" (blå ↓, standard), "blueAsc", "purple", "gold", "seed".
 */
export function filterBlue(data, opt = {}) {
  const num = v => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);
  const mnB = num(opt.minBlue), mxB = num(opt.maxBlue), mnP = num(opt.minPurple), mnG = num(opt.minGold), only = opt.seeds && opt.seeds.length ? new Set(opt.seeds) : null;
  let ids = [];
  data.forEach((t, s) => { if (!t) return; if (only && !only.has(s)) return; if (mnB != null && t[0] < mnB) return; if (mxB != null && t[0] > mxB) return; if (mnP != null && t[1] < mnP) return; if (mnG != null && t[2] < mnG) return; ids.push(s); });
  const by = { blue: (a, b) => data[b][0] - data[a][0] || a - b, blueAsc: (a, b) => data[a][0] - data[b][0] || a - b, purple: (a, b) => data[b][1] - data[a][1] || a - b, gold: (a, b) => data[b][2] - data[a][2] || a - b, seed: (a, b) => a - b };
  ids.sort(by[opt.sort] || by.blue);
  return opt.top ? ids.slice(0, opt.top) : ids;
}
export function filterFade(data, opt = {}) {
  const num = v => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);
  const mn = num(opt.min), mx = num(opt.max), only = opt.seeds && opt.seeds.length ? new Set(opt.seeds) : null;
  const ids = [];
  data.forEach((v, s) => { if (v == null) return; if (only && !only.has(s)) return; if (mn != null && v < mn) return; if (mx != null && v > mx) return; ids.push(s); });
  const by = { fade: (a, b) => data[b] - data[a] || a - b, fadeAsc: (a, b) => data[a] - data[b] || a - b, seed: (a, b) => a - b };
  ids.sort(by[opt.sort] || by.fade);
  return opt.top ? ids.slice(0, opt.top) : ids;
}

/** Seeds med liknande färgfördelning (avstånd i [blå, lila, guld]) på samma sida. */
export function similarBlue(data, seed, n = 5) {
  const t = data[seed]; if (!t) return [];
  const out = [];
  data.forEach((u, s) => { if (!u || s === seed) return; out.push({ seed: s, d: Math.hypot(u[0] - t[0], u[1] - t[1], u[2] - t[2]) }); });
  return out.sort((a, b) => a.d - b.d || a.seed - b.seed).slice(0, n).map(x => ({ seed: x.seed, distance: x.d, t: data[x.seed] }));
}
export function similarFade(data, seed, n = 5) {
  const v = data[seed]; if (v == null) return [];
  const out = []; data.forEach((u, s) => { if (u != null && s !== seed) out.push({ seed: s, d: Math.abs(u - v) }); });
  return out.sort((a, b) => a.d - b.d || a.seed - b.seed).slice(0, n).map(x => ({ seed: x.seed, distance: x.d, v: data[x.seed] }));
}

/** Sidnamn: vapen har ovansida/magasinsida, knivar playside/backside. */
export const SIDE_NOTE = { top: "Ovansida (top)", magazine: "Magasinsida (magazine)", playside: "Playside", backside: "Backside (motsatta sidan)" };
export const SIDE_HELP = "Samma seed ser olika ut på olika sidor av vapnet/kniven. Procenten gäller bara den sida som anges – kontrollera alltid sidan du köper (vapen: ovansida/magasinsida, knivar: playside/backside).";
