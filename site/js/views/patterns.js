import { $, $$, esc, dec } from "../util.js";
import { D } from "../data.js";
import { pageHead } from "./common.js";

const BLUE_NAMES = { ak47: "AK-47", bayonet: "Bayonet", bowie: "Bowie Knife", butterfly: "Butterfly Knife", classic: "Classic Knife", deagle: "Desert Eagle", falchion: "Falchion Knife", fiveseven: "Five-SeveN", flip: "Flip Knife", gut: "Gut Knife", huntsman: "Huntsman Knife", karambit: "Karambit", kukri: "Kukri Knife", m9_bayonet: "M9 Bayonet", mac10: "MAC-10", navaja: "Navaja Knife", nomad: "Nomad Knife", paracord: "Paracord Knife", shadow: "Shadow Daggers", skeleton: "Skeleton Knife", stiletto: "Stiletto Knife", survival: "Survival Knife", talon: "Talon Knife", ursus: "Ursus Knife" };
const SIDE = { top: "Ovansida", magazine: "Magasinsida", playside: "Playside", backside: "Backside" };
const VAR = { ch: "Case Hardened", ht: "Heat Treated" };
const DOPPLER = [["Doppler", [[415, "Ruby", "Mycket sällsynt – röd"], [416, "Sapphire", "Mycket sällsynt – blå"], [417, "Black Pearl", "Sällsynt – svart/lila"], [418, "Phase 1", "Mörk, lila och rosa"], [419, "Phase 2", "Rosa och blå"], [420, "Phase 3", "Grön och blå"], [421, "Phase 4", "Blå och rosa"]]],
  ["Gamma Doppler", [[568, "Emerald", "Mycket sällsynt – grön"], [569, "Phase 1", "Blå/grön"], [570, "Phase 2", "Blå/grön"], [571, "Phase 3", "Blå/grön"], [572, "Phase 4", "Blå/grön"]]]];
const S = { tab: "ch", wk: "ak47", vk: "ch", sk: "top", fw: "Karambit", q: "", shown: 25, cmp: { ch: [], fade: [] } };
let P = null;

export async function renderPatterns(root, args = []) {
  if (!P) { root.innerHTML = `<div class="muted">Laddar mönsterdata…</div>`; P = await fetch("data/patterns.json").then(r => r.json()); }
  // djuplänk från föremålssidan: #/patterns/<ch|fade|dop>/<vapen>
  if (["ch", "fade", "dop"].includes(args[0])) {
    S.tab = args[0]; S.shown = 25; S.q = "";
    const w = args[1] || "";
    if (S.tab === "ch") { const k = Object.entries(BLUE_NAMES).find(([, n]) => n === w)?.[0]; if (k) { S.wk = k; S.vk = Object.keys(P.blue[k])[0]; } }
    if (S.tab === "fade" && P.fade[w]) S.fw = w;
  }
  draw(root);
}

function draw(root) {
  root.innerHTML = `${pageHead("Pattern Explorer", "Sök seeds och jämför mönster för Case Hardened, Fade och Doppler.")}
  <div class="tabs">${[["ch", "Case Hardened"], ["fade", "Fade"], ["dop", "Doppler"]].map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? "on" : ""}">${l}</button>`).join("")}</div><div id="body"></div>`;
  $$(".tabs button", root).forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.t; S.shown = 25; S.q = ""; draw(root); }));
  const body = $("#body", root);
  if (S.tab === "ch") blueTab(body); else if (S.tab === "fade") fadeTab(body); else dopplerTab(body);
  const how = { ch: "<b>Blå/lila/guld-procent</b> är andelen pixlar av respektive färg i mönstrets bild (bildanalys av alla 1 001 seeds) – en etablerad extern beräkning, inte vår egen uppskattning. <b>Rank</b> sorterar seeds efter blå andel för vald sida. Källa: csgo-blue-gem-calculator (MIT), samma värden som Skinport och CSGOSKINS.GG.", fade: "<b>Fade-procent</b> (80–100 %) beräknas från seedens rotation med en öppen algoritm – en etablerad extern ranking som samma sajter använder (Skinport, CSFloat m.fl.), inte vår egen. Seeds med samma procent delar rank. Källa: csgo-fade-percentage-calculator (MIT).", dop: "Doppler-fasen bestäms av paint index, inte seed. Tabellen är en förklaring, ingen ranking." }[S.tab];
  body.insertAdjacentHTML("beforeend", `<div class="panel" style="margin-top:14px"><h2>Så beräknas det</h2><p class="muted small" style="margin:0">${how} Vi visar inga bilder av enskilda seeds eftersom ingen fri bilddatabas finns.</p></div>`);
}

const bar = (b, p, g) => `<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--line);min-width:120px"><i style="width:${b}%;background:#4b69ff"></i><i style="width:${p}%;background:#8847ff"></i><i style="width:${g}%;background:#e4ae39"></i></div>`;
const fadeBar = v => `<div style="height:6px;border-radius:3px;background:var(--line);min-width:120px"><i style="display:block;height:6px;border-radius:3px;width:${(v - 80) * 5}%;background:linear-gradient(90deg,#e4ae39,#d0457a,#6a54d6)"></i></div>`;

function toolbar(body, { selects, onChange }) {
  const wrap = document.createElement("div"); wrap.className = "toolbar"; wrap.innerHTML = selects + `<input class="inp" id="sq" type="number" min="0" max="1000" placeholder="Sök seed (0–1000)" value="${esc(S.q)}" style="width:170px">`;
  body.appendChild(wrap);
  wrap.querySelectorAll("select").forEach(s => s.addEventListener("change", () => { onChange(s.id, s.value); }));
  wrap.querySelector("#sq").addEventListener("change", e => { S.q = e.target.value; onChange("q"); });
}

/* ------------------------------ Case Hardened ------------------------------ */
function blueTab(body) {
  const wks = Object.keys(P.blue);
  const vks = Object.keys(P.blue[S.wk]); if (!vks.includes(S.vk)) S.vk = vks[0];
  const sks = Object.keys(P.blue[S.wk][S.vk]); if (!sks.includes(S.sk)) S.sk = sks[0];
  const data = P.blue[S.wk][S.vk][S.sk];
  const sel = (id, opts, val, lab) => `<select class="inp" id="${id}">${opts.map(o => `<option value="${o}" ${o === val ? "selected" : ""}>${esc(lab(o))}</option>`).join("")}</select>`;
  toolbar(body, {
    selects: sel("wk", wks, S.wk, k => BLUE_NAMES[k] || k) + (vks.length > 1 ? sel("vk", vks, S.vk, k => VAR[k]) : "") + sel("sk", sks, S.sk, k => SIDE[k] || k),
    onChange: (id, v) => { if (id === "wk") { S.wk = v; S.shown = 25; } if (id === "vk") S.vk = v; if (id === "sk") S.sk = v; redraw(); },
  });
  const rank = new Map(); [...data.keys()].sort((a, b) => data[b][0] - data[a][0]).forEach((s, i) => rank.set(s, i + 1));
  const cmp = S.cmp.ch;
  const seedRow = s => { const [b, p, g] = data[s]; return `<tr><td class="num"><b>${s}</b></td><td class="r num">#${rank.get(s)}</td><td>${bar(b, p, g)}</td><td class="r num">${dec(b, 1)} %</td><td class="r num hide-m">${dec(p, 1)} %</td><td class="r num hide-m">${dec(g, 1)} %</td><td class="r"><button class="btn ghost sm" data-c="${s}">Jämför</button></td></tr>`; };
  const q = S.q !== "" && +S.q >= 0 && +S.q <= 1000 ? +S.q : null;
  const order = [...data.keys()].sort((a, b) => data[b][0] - data[a][0]);
  const html = `${q !== null ? `<div class="panel" style="margin-bottom:12px"><h2>Seed ${q}</h2><table class="tbl"><tbody>${seedRow(q)}</tbody></table></div>` : ""}
    ${cmp.length ? `<div class="panel" style="margin-bottom:12px"><div class="row spread"><h2 style="margin:0">Jämförelse (${esc(BLUE_NAMES[S.wk])} · ${esc(VAR[S.vk])} · ${esc(SIDE[S.sk])})</h2><button class="btn ghost sm" id="cc">Töm</button></div><table class="tbl"><thead><tr><th>Seed</th><th class="r">Rank</th><th>Mönster</th><th class="r">Blå</th><th class="r hide-m">Lila</th><th class="r hide-m">Guld</th><th></th></tr></thead><tbody>${cmp.map(seedRow).join("")}</tbody></table></div>` : ""}
    <div class="panel scroll-x" style="padding:0"><table class="tbl"><thead><tr><th>Seed</th><th class="r">Rank</th><th>Blå / lila / guld</th><th class="r">Blå</th><th class="r hide-m">Lila</th><th class="r hide-m">Guld</th><th></th></tr></thead><tbody>${order.slice(0, S.shown).map(seedRow).join("")}</tbody></table></div>
    ${S.shown < order.length ? `<button class="btn ghost more" id="more">Visa fler</button>` : ""}
    <p class="muted small">Blå-procent = andel blå pixlar i mönstret (bildanalys). Rankning bland 1001 seeds för vald sida. Data: csgo-blue-gem-calculator (MIT).</p>`;
  const box = document.createElement("div"); box.innerHTML = html; body.appendChild(box);
  box.querySelector("#more")?.addEventListener("click", () => { S.shown += 25; redraw(); });
  box.querySelector("#cc")?.addEventListener("click", () => { S.cmp.ch = []; redraw(); });
  box.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => { const s = +b.dataset.c; const l = S.cmp.ch; if (!l.includes(s)) { l.push(s); if (l.length > 4) l.shift(); } redraw(); }));
  function redraw() { const root = body.parentElement; draw(root); }
}

/* ------------------------------ Fade ------------------------------ */
function fadeTab(body) {
  const ws = Object.keys(P.fade); if (!ws.includes(S.fw)) S.fw = ws[0];
  const data = P.fade[S.fw];
  toolbar(body, { selects: `<select class="inp" id="fw">${ws.map(w => `<option ${w === S.fw ? "selected" : ""}>${esc(w)}</option>`).join("")}</select>`, onChange: (id, v) => { if (id === "fw") { S.fw = v; S.shown = 25; } redraw(); } });
  const order = [...data.keys()].filter(k => data[k] != null).sort((a, b) => data[b] - data[a]); // knivar saknar seed 1000
  const rank = s => 1 + order.findIndex(o => data[o] === data[s]);
  const cmp = S.cmp.fade;
  const row = s => data[s] == null ? `<tr><td class="num"><b>${s}</b></td><td colspan="4" class="muted">Seeden finns inte för det här vapnet.</td></tr>` : `<tr><td class="num"><b>${s}</b></td><td class="r num">#${rank(s)}</td><td>${fadeBar(data[s])}</td><td class="r num">${dec(data[s], 1)} %</td><td class="r"><button class="btn ghost sm" data-c="${s}">Jämför</button></td></tr>`;
  const q = S.q !== "" && +S.q >= 0 && +S.q <= 1000 ? +S.q : null;
  const skin = D.skins.find(s => s.w === S.fw && s.p === "Fade");
  const box = document.createElement("div");
  box.innerHTML = `${q !== null ? `<div class="panel" style="margin-bottom:12px"><h2>Seed ${q}</h2><table class="tbl"><tbody>${row(q)}</tbody></table></div>` : ""}
    ${cmp.length ? `<div class="panel" style="margin-bottom:12px"><div class="row spread"><h2 style="margin:0">Jämförelse · ${esc(S.fw)}</h2><button class="btn ghost sm" id="cc">Töm</button></div><table class="tbl"><tbody>${cmp.map(row).join("")}</tbody></table></div>` : ""}
    <div class="panel scroll-x" style="padding:0"><table class="tbl"><thead><tr><th>Seed</th><th class="r">Rank</th><th>Fade</th><th class="r">Fade %</th><th></th></tr></thead><tbody>${order.slice(0, S.shown).map(row).join("")}</tbody></table></div>
    ${S.shown < order.length ? `<button class="btn ghost more" id="more">Visa fler</button>` : ""}
    <p class="muted small">Fade-procent 80–100 % beräknas från seedens rotation (öppen algoritm, samma värden som Skinport och CSFloat). ${skin ? `<a href="#/item/${esc(skin.id)}" style="text-decoration:underline">${esc(S.fw)} | Fade i databasen</a>.` : ""} Data: csgo-fade-percentage-calculator (MIT).</p>`;
  body.appendChild(box);
  box.querySelector("#more")?.addEventListener("click", () => { S.shown += 25; redraw(); });
  box.querySelector("#cc")?.addEventListener("click", () => { S.cmp.fade = []; redraw(); });
  box.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => { const s = +b.dataset.c; const l = S.cmp.fade; if (!l.includes(s)) { l.push(s); if (l.length > 4) l.shift(); } redraw(); }));
  function redraw() { draw(body.parentElement); }
}

/* ------------------------------ Doppler ------------------------------ */
function dopplerTab(body) {
  const box = document.createElement("div");
  box.innerHTML = DOPPLER.map(([name, ph]) => {
    const knives = D.skins.filter(s => s.p === name && s.k === "knife").length;
    return `<div class="panel" style="margin-bottom:12px"><div class="row spread"><h2 style="margin:0">${name}</h2><a class="muted small" style="text-decoration:underline" href="#/database/knife" title="Sök '${name}'">${knives} knivar i databasen</a></div>
      <table class="tbl"><thead><tr><th>Fas</th><th class="r">Paint index</th><th>Utseende</th></tr></thead><tbody>${ph.map(([i, n, d]) => `<tr><td><b>${n}</b></td><td class="r num">${i}</td><td class="muted">${d}</td></tr>`).join("")}</tbody></table></div>`;
  }).join("") + `<p class="muted small">Doppler-fasen avgörs av skinets paint index, inte seed. Paint index syns i Inspect &amp; Float efter att du avkodat en länk – där visas fasen automatiskt. Seed påverkar bara hur mönstret sitter.</p>`;
  body.appendChild(box);
}
