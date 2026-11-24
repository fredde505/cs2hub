import { $, $$, esc, imgUrl, kr, krUsd, usd2sek, dec, COLORS, COLOR_LABEL, WEARS, WEAR_LONG, debounce, MISSING } from "../util.js";
import { D, bestUsd, mhnFor } from "../data.js";
import { itemCard, pageHead, itemPicker, emptyState, priceNote } from "./common.js";

const F0 = () => ({ colors: new Set(), c2: "", multi: false, cover: 0, cat: "", wear: "", pmin: "", pmax: "", q: "", sort: "price", kind: "", hex: "", priced: false });
const F = F0();
/** Förinställer filtren (används av smart sökning, t.ex. "blå kniv under 3000 kr"). */
export function presetColors({ colors = [], kind = "", pmin = null, pmax = null, q = "" } = {}) {
  Object.assign(F, F0(), { colors: new Set(colors), kind, pmin: pmin ?? "", pmax: pmax ?? "", q });
}
const PAGE = 60;
const CHIP_COLORS = ["red", "orange", "gold", "green", "cyan", "blue", "purple", "pink", "brown", "black", "white", "gray"];

function priceFor(e, wear = F.wear) {
  if (wear) return e.wr.includes(wear) ? bestUsd(mhnFor(e, wear)) : null;
  const arr = (e.wr.length ? e.wr : [null]).map(w => bestUsd(mhnFor(e, w))).filter(Boolean);
  return arr.length ? Math.min(...arr) : null;
}
/** Hur mycket av vapnet som har någon av de valda färgerna (procent). */
const coverage = (e, cols) => (cols.has(e.c1) ? e.p1 || 0 : 0) + (e.c2 && cols.has(e.c2) ? e.p2 || 0 : 0);

const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); const n = m ? parseInt(m[1], 16) : 0x888888; return [n >> 16, (n >> 8) & 255, n & 255]; };
/** Upplevd färgskillnad (”redmean”, bättre än rak RGB-avstånd). Ger 0–100 % likhet. */
function hexSim(a, b) {
  const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b), rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.max(0, 100 * (1 - Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 400));
}
/** Liten färgstapel som visar hur vapnet är fördelat mellan färgerna. */
function colorBar(s) {
  const p1 = s.p1 || 0, p2 = s.c2 ? s.p2 || 0 : 0, rest = Math.max(0, 100 - p1 - p2);
  if (!s.c1 || !p1) return "";
  return `<div class="cbar" title="${esc(COLOR_LABEL[s.c1] || "")} ${p1} %${p2 ? " · " + esc(COLOR_LABEL[s.c2] || "") + " " + p2 + " %" : ""}" style="display:flex;height:5px;border-radius:3px;overflow:hidden;margin-top:6px;background:var(--line2)"><i style="width:${p1}%;background:${COLORS[s.c1] || "#888"}"></i>${p2 ? `<i style="width:${p2}%;background:${COLORS[s.c2] || "#888"}"></i>` : ""}<i style="width:${rest}%"></i></div>`;
}
/** Färgmatchning mellan två skins i procent (färgnamn + hur lika dominerande färgen är). */
export function matchScore(a, b) {
  let s = 0;
  if (a.c1 === b.c1) s += 50; else if (a.c1 === b.c2 || a.c2 === b.c1) s += 25;
  if (a.c2 && (a.c2 === b.c2 || a.c2 === b.c1)) s += 15;
  if (a.mc && b.mc) s += 5;
  const [r1, g1, b1] = hexRgb(a.hx), [r2, g2, b2] = hexRgb(b.hx);
  s += (1 - Math.hypot(r1 - r2, g1 - g2, b1 - b2) / 441) * 30;
  return Math.max(0, Math.min(100, s));
}

export function renderColors(root) {
  const cats = [...new Set(D.skins.map(s => s.c))].sort();
  const chip = (c, set) => `<button class="chip ${(set === "c1" ? F.colors.has(c) : F.c2 === c) ? "on" : ""}" data-set="${set}" data-c="${c}" aria-pressed="${set === "c1" ? F.colors.has(c) : F.c2 === c}"><i class="dot" style="background:${COLORS[c]}"></i>${COLOR_LABEL[c]}</button>`;
  root.innerHTML = `${pageHead("Color Explorer", "Alla skinbilder är färganalyserade i förväg. Välj en eller flera färger, bestäm hur stor del av vapnet som ska ha färgen, och kombinera med pris, slitage och vapentyp.")}
    <div class="panel" style="margin-bottom:14px"><div class="row" style="margin-bottom:10px;align-items:flex-start"><span class="muted small" style="width:96px">Färger (välj flera)</span><div class="chips">${CHIP_COLORS.map(c => chip(c, "c1")).join("")}<button class="chip ${F.multi ? "on" : ""}" id="multi" aria-pressed="${F.multi}">🌈 Multicolor</button></div></div>
    <div class="row" style="margin-bottom:10px;align-items:flex-start"><span class="muted small" style="width:96px">Sekundär</span><div class="chips">${CHIP_COLORS.map(c => chip(c, "c2")).join("")}</div></div>
    <div class="row" style="margin-bottom:10px"><span class="muted small" style="width:96px">Täckning</span><input type="range" id="cover" min="0" max="60" step="5" value="${F.cover}" style="width:220px;max-width:100%" aria-label="Minsta täckning"><span class="small" id="coverTxt"></span></div>
    <div class="row" style="flex-wrap:wrap"><span class="muted small" style="width:96px">Exakt färg</span><input type="color" id="hexpick" value="${esc(F.hex || "#c0392b")}" style="width:44px;height:32px;padding:0;border:1px solid var(--line2);border-radius:6px;background:none;cursor:pointer" aria-label="Välj exakt färg"><button class="btn sm" id="hexgo">Hitta närmast</button><button class="btn ghost sm" id="hexoff" ${F.hex ? "" : "hidden"}>Ta bort</button><span class="muted small" id="hexTxt"></span></div></div>
    <div class="toolbar"><input class="inp" id="q" placeholder="Sök…" value="${esc(F.q)}" aria-label="Sök"><select class="inp" id="cat" aria-label="Vapentyp"><option value="">Alla vapentyper</option>${cats.map(c => `<option ${c === F.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <select class="inp" id="kind" aria-label="Typ"><option value="">Alla typer</option><option value="weapon" ${F.kind === "weapon" ? "selected" : ""}>Vapen</option><option value="knife" ${F.kind === "knife" ? "selected" : ""}>Knivar</option><option value="glove" ${F.kind === "glove" ? "selected" : ""}>Handskar</option></select>
    <select class="inp" id="wear" aria-label="Slitage"><option value="">Alla slitage</option>${WEARS.map(w => `<option value="${w}" ${w === F.wear ? "selected" : ""}>${WEAR_LONG[w]}</option>`).join("")}</select>
    <input class="inp" id="pmin" type="number" placeholder="Min kr" style="width:92px" value="${esc(F.pmin)}"><input class="inp" id="pmax" type="number" placeholder="Budget max kr" style="width:120px" value="${esc(F.pmax)}">
    <select class="inp" id="sort" aria-label="Sortera"><option value="price" ${F.sort === "price" ? "selected" : ""}>Dyrast först</option><option value="cheap" ${F.sort === "cheap" ? "selected" : ""}>Billigast först</option><option value="cover" ${F.sort === "cover" ? "selected" : ""}>Mest av vald färg</option><option value="near" ${F.sort === "near" ? "selected" : ""}>Närmast exakt färg</option></select>
    <label class="chip ${F.priced ? "on" : ""}" style="cursor:pointer"><input type="checkbox" id="priced" ${F.priced ? "checked" : ""} style="margin:0"> Bara med pris</label>
    <button class="btn ghost sm" id="reset">Rensa</button></div>
    <div class="panel" style="margin-bottom:14px"><h2>Match My Skin</h2><p class="muted small" style="margin-top:0">Välj en kniv, ett par handskar eller ett vapenskin – så hittar sidan skins i samma färger, sorterade efter hur väl de matchar.</p>
      <div class="row" style="align-items:flex-start"><div id="mm" style="flex:1;min-width:220px"></div><input class="inp" id="mmb" type="number" min="0" placeholder="Budget per föremål (kr)" style="width:200px" aria-label="Budget per föremål"></div><div id="mmOut"></div></div>
    <div class="muted small" id="count" style="margin-bottom:10px" role="status"></div><div class="cards" id="grid"></div><button class="btn ghost more" id="more" hidden>Visa fler</button>
    <p class="muted small" style="margin-top:14px">Färgerna är beräknade från skinbilderna (andel av vapnets pixlar) – en uppskattning, inte en exakt färgtabell. ${esc(priceNote())}</p>`;
  let shown = PAGE, list = [];
  const coverTxt = () => $("#coverTxt", root).textContent = F.cover ? `minst ${F.cover} % av vapnet` : "valfri andel";
  $$(".chip[data-set]", root).forEach(b => b.addEventListener("click", () => {
    if (b.dataset.set === "c1") { F.colors.has(b.dataset.c) ? F.colors.delete(b.dataset.c) : F.colors.add(b.dataset.c); b.classList.toggle("on", F.colors.has(b.dataset.c)); }
    else { F.c2 = F.c2 === b.dataset.c ? "" : b.dataset.c; $$('.chip[data-set="c2"]', root).forEach(x => x.classList.toggle("on", x.dataset.c === F.c2)); }
    draw();
  }));
  $("#multi", root).addEventListener("click", e => { F.multi = !F.multi; e.currentTarget.classList.toggle("on", F.multi); draw(); });
  $("#cover", root).addEventListener("input", e => { F.cover = +e.target.value; coverTxt(); draw(); });
  const bind = (id, key, ev = "input") => $("#" + id, root).addEventListener(ev, debounce(e => { F[key] = e.target.value; draw(); }, 140));
  bind("q", "q"); bind("cat", "cat", "change"); bind("kind", "kind", "change"); bind("wear", "wear", "change"); bind("pmin", "pmin"); bind("pmax", "pmax"); bind("sort", "sort", "change");
  $("#priced", root).addEventListener("change", e => { F.priced = e.target.checked; e.target.closest(".chip").classList.toggle("on", F.priced); draw(); });
  const hexTxt = () => { $("#hexTxt", root).textContent = F.hex ? "Sorterat efter närmast vald färg (likhet visas på korten)" : ""; $("#hexoff", root).hidden = !F.hex; };
  $("#hexgo", root).addEventListener("click", () => { F.hex = $("#hexpick", root).value; F.sort = "near"; $("#sort", root).value = "near"; hexTxt(); draw(); });
  $("#hexpick", root).addEventListener("input", e => { if (F.hex) { F.hex = e.target.value; draw(); } });
  $("#hexoff", root).addEventListener("click", () => { F.hex = ""; if (F.sort === "near") { F.sort = "price"; $("#sort", root).value = "price"; } hexTxt(); draw(); });
  $("#reset", root).addEventListener("click", () => { Object.assign(F, F0()); renderColors(root); });
  $("#more", root).addEventListener("click", () => { shown += PAGE; paint(); });

  function draw() {
    shown = PAGE;
    const q = F.q.toLowerCase().split(/\s+/).filter(Boolean);
    const pmin = F.pmin !== "" ? +F.pmin / usd2sek(1) : null, pmax = F.pmax !== "" ? +F.pmax / usd2sek(1) : null;
    list = [];
    for (const s of D.skins) {
      if (F.colors.size && !F.colors.has(s.c1) && !(s.c2 && F.colors.has(s.c2))) continue;
      if (F.c2 && s.c2 !== F.c2) continue;
      if (F.multi && !s.mc) continue;
      if (F.cover && F.colors.size && coverage(s, F.colors) < F.cover) continue;
      if (F.cat && s.c !== F.cat) continue;
      if (F.kind && s.k !== F.kind) continue;
      if (q.length && !q.every(t => (s.n + " " + (s.ph || "")).toLowerCase().includes(t))) continue;
      const p = priceFor(s);
      if ((F.wear || F.priced) && p == null) continue;
      if ((pmin != null || pmax != null) && (p == null || (pmin != null && p < pmin) || (pmax != null && p > pmax))) continue;
      list.push([s, p, F.colors.size ? coverage(s, F.colors) : 0, F.hex ? hexSim(F.hex, s.hx) : 0]);
    }
    list.sort((a, b) => F.sort === "near" && F.hex ? b[3] - a[3] : F.sort === "cover" && F.colors.size ? b[2] - a[2] || (b[1] ?? -1) - (a[1] ?? -1) : F.sort === "cheap" ? (a[1] ?? 1e12) - (b[1] ?? 1e12) : (b[1] ?? -1) - (a[1] ?? -1));
    paint();
  }
  function paint() {
    $("#count", root).textContent = `${list.length.toLocaleString("sv-SE")} skins`;
    const g = $("#grid", root);
    g.innerHTML = list.length ? list.slice(0, shown).map(([s, p, cv, sim]) => itemCard(s, { price: p, extra: `<div class="small faint" style="margin-top:3px">${esc(COLOR_LABEL[s.c1] || "")}${s.p1 ? " " + s.p1 + " %" : ""}${s.c2 ? " + " + esc(COLOR_LABEL[s.c2]) + (s.p2 ? " " + s.p2 + " %" : "") : ""}${s.mc ? " · multi" : ""}${F.colors.size && F.sort === "cover" ? ` · täckning ${cv} %` : ""}${F.hex ? ` · <b>${Math.round(sim)} %</b> lik` : ""}</div>${colorBar(s)}` })).join("") : emptyState("Inga skins matchar", "Prova färre filter eller en lägre täckning.");
    $("#more", root).hidden = shown >= list.length;
  }

  // Match My Skin
  itemPicker($("#mm", root), s => matchOut(root, s), { kinds: ["weapon", "knife", "glove"], placeholder: "Sök ditt skin, kniv eller handskar…" });
  coverTxt(); hexTxt(); draw();
}

function matchOut(root, base) {
  const out = $("#mmOut", root), budget = $("#mmb", root).value !== "" ? +$("#mmb", root).value / usd2sek(1) : null;
  const run = () => {
    const group = (title, pred) => {
      const l = D.skins.filter(s => s.id !== base.id && s.c1 && pred(s)).map(s => ({ s, m: matchScore(base, s), p: priceFor(s, "") })).filter(x => x.m >= 45 && (budget == null || (x.p != null && x.p <= budget)))
        .sort((a, b) => b.m - a.m || (b.p ?? 1e12) - (a.p ?? 1e12)).slice(0, 8);
      return l.length ? `<h2 style="margin:16px 0 8px">${title}</h2><div class="cards">${l.map(x => itemCard(x.s, { price: x.p, extra: `<div class="small" style="margin-top:3px"><b>${Math.round(x.m)} %</b> <span class="muted">färgmatchning</span></div>` })).join("")}</div>` : "";
    };
    out.innerHTML = `<div class="row" style="margin-top:14px"><img src="${esc(imgUrl(base.img, "128fx96f"))}" style="width:84px" alt=""><div><b>${esc(base.n + (base.ph ? " · " + base.ph : ""))}</b><div class="muted small"><i class="dot" style="background:${esc(base.hx)}"></i> ${esc(COLOR_LABEL[base.c1] || "")}${base.p1 ? " " + base.p1 + " %" : ""}${base.c2 ? " + " + esc(COLOR_LABEL[base.c2]) : ""}</div></div></div>
      ${group("Matchande knivar", s => s.k === "knife")}${group("Matchande handskar", s => s.k === "glove")}${group("Matchande vapenskins", s => s.k === "weapon")}`;
    if (!out.querySelector(".cards")) out.insertAdjacentHTML("beforeend", emptyState("Inga bra matchningar", "Prova en högre budget eller ett annat skin."));
  };
  $("#mmb", root).onchange = () => matchOut(root, base);
  run();
}
