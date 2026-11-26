import { $, $$, esc, dec } from "../util.js";
import { D } from "../data.js";
import { pageHead } from "./common.js";
import { parseSeeds, competitionRanks, histogram, explainBlue, explainFade, filterBlue, filterFade, similarBlue, similarFade, SIDE_NOTE, SIDE_HELP } from "../pattern-core.js";

const BLUE_NAMES = { ak47: "AK-47", bayonet: "Bayonet", bowie: "Bowie Knife", butterfly: "Butterfly Knife", classic: "Classic Knife", deagle: "Desert Eagle", falchion: "Falchion Knife", fiveseven: "Five-SeveN", flip: "Flip Knife", gut: "Gut Knife", huntsman: "Huntsman Knife", karambit: "Karambit", kukri: "Kukri Knife", m9_bayonet: "M9 Bayonet", mac10: "MAC-10", navaja: "Navaja Knife", nomad: "Nomad Knife", paracord: "Paracord Knife", shadow: "Shadow Daggers", skeleton: "Skeleton Knife", stiletto: "Stiletto Knife", survival: "Survival Knife", talon: "Talon Knife", ursus: "Ursus Knife" };
const SIDE = SIDE_NOTE;
const VAR = { ch: "Case Hardened", ht: "Heat Treated" };
const DOPPLER = [["Doppler", [[415, "Ruby", "Mycket sällsynt – röd"], [416, "Sapphire", "Mycket sällsynt – blå"], [417, "Black Pearl", "Sällsynt – svart/lila"], [418, "Phase 1", "Mörk, lila och rosa"], [419, "Phase 2", "Rosa och blå"], [420, "Phase 3", "Grön och blå"], [421, "Phase 4", "Blå och rosa"]]],
  ["Gamma Doppler", [[568, "Emerald", "Mycket sällsynt – grön"], [569, "Phase 1", "Blå/grön"], [570, "Phase 2", "Blå/grön"], [571, "Phase 3", "Blå/grön"], [572, "Phase 4", "Blå/grön"]]]];
const S = { tab: "ch", wk: "ak47", vk: "ch", sk: "top", fw: "Karambit", seeds: "", shown: 25, cmp: { ch: [], fade: [] }, sort: "blue", sortF: "fade", min: "", max: "", minP: "", minG: "" };
let P = null;
const C = { blue: "#4b69ff", purple: "#8847ff", gold: "#e4ae39", other: "#4a4f58" };

export async function renderPatterns(root, args = []) {
  if (!P) { root.innerHTML = `<div class="muted">Laddar mönsterdata…</div>`; P = await fetch("data/patterns.json").then(r => r.json()); }
  // djuplänk: #/patterns/<ch|fade|dop>/<vapen>/<seed>  (t.ex. från Inspect & Float)
  if (["ch", "fade", "dop"].includes(args[0])) {
    S.tab = args[0]; S.shown = 25; S.seeds = "";
    const w = args[1] || "";
    if (S.tab === "ch") { const k = Object.entries(BLUE_NAMES).find(([, n]) => n === w)?.[0]; if (k) { S.wk = k; S.vk = P.blue[k].ch ? "ch" : Object.keys(P.blue[k])[0]; } }
    if (S.tab === "fade" && P.fade[w]) S.fw = w;
    if (args[2] != null && /^\d{1,4}$/.test(args[2]) && +args[2] <= 1000) S.seeds = args[2];
  }
  draw(root);
}

function draw(root) {
  root.innerHTML = `${pageHead("Pattern Explorer", "Sök seeds, se varför de rankas som de gör och jämför mönster för Case Hardened (Blue Gem), Heat Treated, Fade och Doppler.")}
  <div class="tabs">${[["ch", "Case Hardened / Blue Gem"], ["fade", "Fade"], ["dop", "Doppler"]].map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? "on" : ""}">${l}</button>`).join("")}</div><div id="body"></div>`;
  $$(".tabs button", root).forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.t; S.shown = 25; S.seeds = ""; S.min = S.max = S.minP = S.minG = ""; draw(root); }));
  const body = $("#body", root);
  if (S.tab === "ch") blueTab(body); else if (S.tab === "fade") fadeTab(body); else dopplerTab(body);
  const how = { ch: "<b>Blå/lila/guld-procent</b> är andelen pixlar av respektive färg i mönstrets bild på den angivna sidan (bildanalys av alla 1 001 seeds) – en etablerad extern beräkning, inte vår egen uppskattning. <b>Rank</b> sorterar seeds efter blå andel för vald sida; seeds med samma värde delar rank. Lila och guld påverkar inte rankingen. Källa: csgo-blue-gem-calculator (MIT), samma värden som Skinport och CSGOSKINS.GG. Ett högt blått värde är ett mått på mönstret, inte ett pris eller en garanti för värde.", fade: "<b>Fade-procent</b> (80–100 %) beräknas från seedens rotation med en öppen algoritm – en etablerad extern ranking som samma sajter använder (Skinport, CSFloat m.fl.), inte vår egen. Seeds med samma procent delar rank. Källa: csgo-fade-percentage-calculator (MIT).", dop: "Doppler-fasen bestäms av paint index, inte seed. Tabellen är en förklaring, ingen ranking." }[S.tab];
  body.insertAdjacentHTML("beforeend", `<div class="panel" style="margin-top:14px"><h2>Så beräknas det</h2><p class="muted small" style="margin:0">${how} Vi visar inga bilder av enskilda seeds: vi har inte hittat någon fri och tydligt licensierad bilddatabas för seeds, och bilder hos andra sajter får inte återanvändas utan tillstånd.</p></div>`);
}

const stack = ([b, p, g], h = 10) => { const o = Math.max(0, 100 - b - p - g); return `<div style="display:flex;height:${h}px;border-radius:3px;overflow:hidden;background:var(--line);min-width:120px" role="img" aria-label="Blå ${b} %, lila ${p} %, guld ${g} %, övrigt ${dec(o, 1)} %"><i style="width:${b}%;background:${C.blue}"></i><i style="width:${p}%;background:${C.purple}"></i><i style="width:${g}%;background:${C.gold}"></i><i style="width:${o}%;background:${C.other}"></i></div>`; };
const fadeBar = v => `<div style="height:6px;border-radius:3px;background:var(--line);min-width:120px"><i style="display:block;height:6px;border-radius:3px;width:${(v - 80) * 5}%;background:linear-gradient(90deg,#e4ae39,#d0457a,#6a54d6)"></i></div>`;
const pc = v => dec(v, 1) + " %";

/** Stapeldiagram över fördelningen av alla seeds, med markering för en seed. */
function distChart(values, lo, hi, mark, color, label) {
  const H = histogram(values, lo, hi, 10), mb = mark != null ? H.binOf(mark) : -1;
  return `<div style="margin-top:8px"><div class="muted small" style="margin-bottom:4px">${esc(label)} – så många seeds finns i varje intervall; din seed är markerad</div><div style="display:flex;align-items:flex-end;gap:3px;height:56px">${H.bins.map((b, i) => `<div title="${dec(b.from, 0)}–${dec(b.to, 0)} %: ${b.count} seeds" style="flex:1;height:${Math.max(2, b.count / H.max * 100)}%;background:${i === mb ? color : "#3a3e45"};border-radius:2px 2px 0 0"></div>`).join("")}</div><div class="fscale"><span>${lo} %</span><span>${hi} %</span></div></div>`;
}

function toolbar(body, selects) {
  const wrap = document.createElement("div"); wrap.className = "toolbar"; wrap.innerHTML = selects;
  body.appendChild(wrap); return wrap;
}
const sel = (id, opts, val, lab) => `<select class="inp" id="${id}" aria-label="${esc(id)}">${opts.map(o => `<option value="${esc(o)}" ${o === val ? "selected" : ""}>${esc(lab(o))}</option>`).join("")}</select>`;

/* ------------------------------ Case Hardened / Blue Gem ------------------------------ */
function blueTab(body) {
  const wks = Object.keys(P.blue);
  const vks = Object.keys(P.blue[S.wk]); if (!vks.includes(S.vk)) S.vk = vks[0];
  const sks = Object.keys(P.blue[S.wk][S.vk]); if (!sks.includes(S.sk)) S.sk = sks[0];
  const data = P.blue[S.wk][S.vk][S.sk];
  const redraw = () => { if (body.parentElement) draw(body.parentElement); };
  const wrap = toolbar(body, sel("wk", wks, S.wk, k => BLUE_NAMES[k] || k) + (vks.length > 1 ? sel("vk", vks, S.vk, k => VAR[k]) : "") + sel("sk", sks, S.sk, k => SIDE[k] || k) +
    `<select class="inp" id="so" aria-label="Sortera">${[["blue", "Blå ↓ (rank)"], ["blueAsc", "Blå ↑"], ["purple", "Lila ↓"], ["gold", "Guld ↓"], ["seed", "Seed ↑"]].map(([v, l]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>Sortera: ${l}</option>`).join("")}</select>
    <input class="inp" id="sq" placeholder="Seeds, t.ex. 661, 12-15" value="${esc(S.seeds)}" style="width:190px" aria-label="Sök seeds">`);
  const filt = document.createElement("div"); filt.className = "toolbar"; filt.innerHTML = `<span class="muted small">Filter:</span>${[["min", "Blå ≥ %"], ["max", "Blå ≤ %"], ["minP", "Lila ≥ %"], ["minG", "Guld ≥ %"]].map(([k, l]) => `<input class="inp" data-f="${k}" type="number" min="0" max="100" placeholder="${l}" value="${esc(S[k])}" style="width:110px" aria-label="${l}">`).join("")}<button class="btn ghost sm" id="fclr">Rensa filter</button>`;
  body.appendChild(filt);
  wrap.querySelectorAll("select").forEach(s => s.addEventListener("change", () => { const id = s.id; if (id === "wk") { S.wk = s.value; S.shown = 25; S.seeds = ""; } if (id === "vk") S.vk = s.value; if (id === "sk") S.sk = s.value; if (id === "so") S.sort = s.value; redraw(); }));
  wrap.querySelector("#sq").addEventListener("change", e => { S.seeds = e.target.value; S.shown = 25; redraw(); });
  filt.querySelectorAll("[data-f]").forEach(i => i.addEventListener("change", () => { S[i.dataset.f] = i.value; S.shown = 25; redraw(); }));
  filt.querySelector("#fclr").addEventListener("click", () => { S.min = S.max = S.minP = S.minG = ""; redraw(); });

  const blues = data.map(t => (t ? t[0] : null)), R = competitionRanks(blues, true);
  const rk = s => R.rankOf(s), cmp = S.cmp.ch;
  const { seeds: asked, bad } = parseSeeds(S.seeds);
  const ids = filterBlue(data, { minBlue: S.min, maxBlue: S.max, minPurple: S.minP, minGold: S.minG, sort: S.sort });
  const seedRow = s => { const [b, p, g] = data[s]; return `<tr><td class="num"><b>${s}</b></td><td class="r num">#${rk(s)}</td><td>${stack([b, p, g], 8)}</td><td class="r num">${pc(b)}</td><td class="r num hide-m">${pc(p)}</td><td class="r num hide-m">${pc(g)}</td><td class="r"><button class="btn ghost sm" data-c="${s}">Jämför</button></td></tr>`; };
  const head = `<thead><tr><th>Seed</th><th class="r">Rank</th><th>Blå / lila / guld / övrigt</th><th class="r">Blå</th><th class="r hide-m">Lila</th><th class="r hide-m">Guld</th><th></th></tr></thead>`;
  const legend = `<div class="small" style="display:flex;gap:12px;flex-wrap:wrap;margin:8px 0">${[["blue", "Blå"], ["purple", "Lila"], ["gold", "Guld"], ["other", "Övrigt"]].map(([k, l]) => `<span><i class="dot" style="background:${C[k]}"></i> ${l}</span>`).join("")}</div>`;

  // förklaring per sökt seed (max 4)
  const explain = asked.slice(0, 4).map(s => {
    const ex = explainBlue(data, s);
    if (!ex) return `<div class="panel" style="margin-bottom:12px"><b>Seed ${s}</b> <span class="muted small">finns inte för det här vapnet.</span></div>`;
    const sides = sks.map(k => { const d = P.blue[S.wk][S.vk][k], t = d[s], r = competitionRanks(d.map(x => (x ? x[0] : null)), true).rankOf(s); return `<tr style="${k === S.sk ? "font-weight:700" : ""}"><td>${esc(SIDE[k] || k)}${k === S.sk ? " ◀" : ""}</td><td class="r num">#${r}</td><td>${stack(t, 8)}</td><td class="r num">${pc(t[0])}</td></tr>`; }).join("");
    const sim = similarBlue(data, s, 5);
    return `<div class="panel" style="margin-bottom:12px"><div class="row spread"><h2 style="margin:0">Seed ${s} · ${esc(BLUE_NAMES[S.wk])} · ${esc(VAR[S.vk])}</h2><span class="chip on">Sida: ${esc(SIDE[S.sk] || S.sk)}</span></div>
      <div style="margin:10px 0">${stack(data[s], 16)}</div>${legend}
      <div class="small" style="line-height:1.7">${ex.sentences.map(t => `<div>• ${esc(t)}</div>`).join("")}</div>
      ${distChart(blues, 0, 100, data[s][0], C.blue, "Fördelning av blå andel (alla seeds på sidan)")}
      ${sks.length > 1 ? `<h3 style="margin:14px 0 4px;font-size:13px">Samma seed på alla sidor</h3><table class="tbl"><thead><tr><th>Sida</th><th class="r">Rank</th><th>Mönster</th><th class="r">Blå</th></tr></thead><tbody>${sides}</tbody></table><p class="muted small" style="margin:6px 0 0">${esc(SIDE_HELP)}</p>` : `<p class="muted small" style="margin:10px 0 0">${esc(SIDE_HELP)}</p>`}
      ${sim.length ? `<h3 style="margin:14px 0 4px;font-size:13px">Seeds med liknande färgfördelning</h3><div class="chips">${sim.map(x => `<button class="chip" data-go="${x.seed}" title="Blå ${pc(x.t[0])}, lila ${pc(x.t[1])}, guld ${pc(x.t[2])}">${x.seed} · ${dec(x.t[0], 0)} % blå</button>`).join("")}</div>` : ""}
      <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-c="${s}">+ Jämför</button></div></div>`;
  }).join("");

  const shownIds = asked.length ? ids.filter(s => asked.includes(s)) : ids;
  const box = document.createElement("div");
  box.innerHTML = `${bad.length ? `<p class="small" style="color:#d9b36a">Ogiltigt: ${esc(bad.join(", "))} (ange seeds 0–1000, t.ex. 661 eller 12-15).</p>` : ""}
    <div class="muted small" style="margin:2px 0 10px"><b>Analyserad sida: ${esc(SIDE[S.sk] || S.sk)}</b> · ${R.n} seeds · ${esc(SIDE_HELP)}</div>
    ${explain}
    ${cmp.length ? `<div class="panel scroll-x" style="margin-bottom:12px;padding:0"><div class="row spread" style="padding:10px 12px 0"><h2 style="margin:0">Jämförelse (${esc(BLUE_NAMES[S.wk])} · ${esc(VAR[S.vk])} · ${esc(SIDE[S.sk] || S.sk)})</h2><button class="btn ghost sm" id="cc">Töm</button></div><table class="tbl">${head}<tbody>${cmp.map(seedRow).join("")}</tbody></table></div>` : ""}
    <div class="muted small" style="margin-bottom:6px">${shownIds.length} av ${R.n} seeds matchar${asked.length ? " dina seeds och filter" : " filtren"}.</div>
    <div class="panel scroll-x" style="padding:0"><table class="tbl">${head}<tbody>${shownIds.slice(0, S.shown).map(seedRow).join("")}</tbody></table></div>
    ${S.shown < shownIds.length ? `<button class="btn ghost more" id="more">Visa fler</button>` : ""}${!shownIds.length ? `<div class="empty small">Inga seeds matchar. Ändra eller rensa filtren.</div>` : ""}
    <p class="muted small">Blå-procent = andel blå pixlar i mönstret (bildanalys). Rankning bland ${R.n} seeds för vald sida. Data: csgo-blue-gem-calculator (MIT).</p>`;
  body.appendChild(box);
  box.querySelector("#more")?.addEventListener("click", () => { S.shown += 25; redraw(); });
  box.querySelector("#cc")?.addEventListener("click", () => { S.cmp.ch = []; redraw(); });
  box.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => { const s = +b.dataset.c, l = S.cmp.ch; if (!l.includes(s)) { l.push(s); if (l.length > 6) l.shift(); } redraw(); }));
  box.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { S.seeds = b.dataset.go; redraw(); }));
}

/* ------------------------------ Fade ------------------------------ */
function fadeTab(body) {
  const ws = Object.keys(P.fade); if (!ws.includes(S.fw)) S.fw = ws[0];
  const data = P.fade[S.fw], redraw = () => { if (body.parentElement) draw(body.parentElement); };
  const wrap = toolbar(body, `<select class="inp" id="fw" aria-label="Vapen">${ws.map(w => `<option ${w === S.fw ? "selected" : ""}>${esc(w)}</option>`).join("")}</select>
    <select class="inp" id="so" aria-label="Sortera">${[["fade", "Fade % ↓ (rank)"], ["fadeAsc", "Fade % ↑"], ["seed", "Seed ↑"]].map(([v, l]) => `<option value="${v}" ${S.sortF === v ? "selected" : ""}>Sortera: ${l}</option>`).join("")}</select>
    <input class="inp" id="sq" placeholder="Seeds, t.ex. 661, 12-15" value="${esc(S.seeds)}" style="width:190px" aria-label="Sök seeds">
    <input class="inp" data-f="min" type="number" min="80" max="100" step="0.1" placeholder="Fade ≥ %" value="${esc(S.min)}" style="width:110px" aria-label="Lägsta Fade-procent"><input class="inp" data-f="max" type="number" min="80" max="100" step="0.1" placeholder="Fade ≤ %" value="${esc(S.max)}" style="width:110px" aria-label="Högsta Fade-procent">`);
  wrap.querySelector("#fw").addEventListener("change", e => { S.fw = e.target.value; S.shown = 25; S.seeds = ""; redraw(); });
  wrap.querySelector("#so").addEventListener("change", e => { S.sortF = e.target.value; redraw(); });
  wrap.querySelector("#sq").addEventListener("change", e => { S.seeds = e.target.value; S.shown = 25; redraw(); });
  wrap.querySelectorAll("[data-f]").forEach(i => i.addEventListener("change", () => { S[i.dataset.f] = i.value; S.shown = 25; redraw(); }));
  const R = competitionRanks(data, true), rk = s => R.rankOf(s), cmp = S.cmp.fade;
  const { seeds: asked, bad } = parseSeeds(S.seeds);
  const ids = filterFade(data, { min: S.min, max: S.max, sort: S.sortF });
  const row = s => `<tr><td class="num"><b>${s}</b></td><td class="r num">#${rk(s)}</td><td>${fadeBar(data[s])}</td><td class="r num">${pc(data[s])}</td><td class="r"><button class="btn ghost sm" data-c="${s}">Jämför</button></td></tr>`;
  const head = `<thead><tr><th>Seed</th><th class="r">Rank</th><th>Fade</th><th class="r">Fade %</th><th></th></tr></thead>`;
  const skin = D.skins.find(s => s.w === S.fw && s.p === "Fade");
  const explain = asked.slice(0, 4).map(s => {
    const ex = explainFade(data, s);
    if (!ex) return `<div class="panel" style="margin-bottom:12px"><b>Seed ${s}</b> <span class="muted small">finns inte för ${esc(S.fw)}.</span></div>`;
    const sim = similarFade(data, s, 5);
    return `<div class="panel" style="margin-bottom:12px"><div class="row spread"><h2 style="margin:0">Seed ${s} · ${esc(S.fw)} Fade</h2><b class="num">${pc(data[s])}</b></div><div style="margin:10px 0">${fadeBar(data[s])}</div>
      <div class="small" style="line-height:1.7">${ex.sentences.map(t => `<div>• ${esc(t)}</div>`).join("")}</div>
      ${distChart(data, 80, 100, data[s], "#d0457a", "Fördelning av Fade-procent (alla seeds för vapnet)")}
      ${sim.length ? `<h3 style="margin:14px 0 4px;font-size:13px">Seeds med liknande Fade-procent</h3><div class="chips">${sim.map(x => `<button class="chip" data-go="${x.seed}">${x.seed} · ${dec(x.v, 1)} %</button>`).join("")}</div>` : ""}
      <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-c="${s}">+ Jämför</button></div></div>`;
  }).join("");
  const shownIds = asked.length ? ids.filter(s => asked.includes(s)) : ids;
  const box = document.createElement("div");
  box.innerHTML = `${bad.length ? `<p class="small" style="color:#d9b36a">Ogiltigt: ${esc(bad.join(", "))} (ange seeds 0–1000).</p>` : ""}
    ${R.n < 1001 ? `<p class="muted small" style="margin:0 0 8px">${esc(S.fw)} har ${R.n} seeds i beräkningskällan (seeds som saknas visas inte).</p>` : ""}
    ${explain}
    ${cmp.length ? `<div class="panel scroll-x" style="margin-bottom:12px;padding:0"><div class="row spread" style="padding:10px 12px 0"><h2 style="margin:0">Jämförelse · ${esc(S.fw)}</h2><button class="btn ghost sm" id="cc">Töm</button></div><table class="tbl">${head}<tbody>${cmp.map(row).join("")}</tbody></table></div>` : ""}
    <div class="muted small" style="margin-bottom:6px">${shownIds.length} av ${R.n} seeds matchar${asked.length ? " dina seeds och filter" : " filtren"}.</div>
    <div class="panel scroll-x" style="padding:0"><table class="tbl">${head}<tbody>${shownIds.slice(0, S.shown).map(row).join("")}</tbody></table></div>
    ${S.shown < shownIds.length ? `<button class="btn ghost more" id="more">Visa fler</button>` : ""}${!shownIds.length ? `<div class="empty small">Inga seeds matchar. Ändra eller rensa filtren.</div>` : ""}
    <p class="muted small">Fade-procent 80–100 % beräknas från seedens rotation (öppen algoritm, samma värden som Skinport och CSFloat). ${skin ? `<a href="#/item/${esc(skin.id)}" style="text-decoration:underline">${esc(S.fw)} | Fade i databasen</a>.` : ""} Data: csgo-fade-percentage-calculator (MIT).</p>`;
  body.appendChild(box);
  box.querySelector("#more")?.addEventListener("click", () => { S.shown += 25; redraw(); });
  box.querySelector("#cc")?.addEventListener("click", () => { S.cmp.fade = []; redraw(); });
  box.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => { const s = +b.dataset.c, l = S.cmp.fade; if (!l.includes(s)) { l.push(s); if (l.length > 6) l.shift(); } redraw(); }));
  box.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { S.seeds = b.dataset.go; redraw(); }));
}

/* ------------------------------ Doppler ------------------------------ */
function dopplerTab(body) {
  const box = document.createElement("div");
  box.innerHTML = DOPPLER.map(([name, ph]) => {
    const knives = D.skins.filter(s => s.p === name && s.k === "knife").length;
    return `<div class="panel" style="margin-bottom:12px"><div class="row spread"><h2 style="margin:0">${name}</h2><a class="muted small" style="text-decoration:underline" href="#/database/knife" title="Sök '${name}'">${knives} knivar i databasen</a></div>
      <table class="tbl"><thead><tr><th>Fas</th><th class="r">Paint index</th><th>Utseende</th></tr></thead><tbody>${ph.map(([i, n, d]) => `<tr><td><b>${n}</b></td><td class="r num">${i}</td><td class="muted">${d}</td></tr>`).join("")}</tbody></table></div>`;
  }).join("") + `<p class="muted small">Doppler-fasen avgörs av skinets paint index, inte seed. Paint index syns i Inspect &amp; Float efter att du avkodat en länk – där visas fasen automatiskt. Seed påverkar bara hur mönstret sitter. Prisdatan skiljer inte på faser, så pris per fas visas inte här.</p>`;
  body.appendChild(box);
}
