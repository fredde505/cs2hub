import { $, $$, esc, imgUrl, kr, usd2sek, dec, parseDec, COLORS, COLOR_LABEL, toast } from "../util.js";
import { D, bestUsd, mhnFor } from "../data.js";
import { pageHead, itemPicker, emptyState, priceNote } from "./common.js";
import { matchScore } from "./colors.js";

/** Combo Finder: bygger kompletta set (kniv + handskar + vapen) i matchande färger inom en budget. */
const SLOTS = [
  { id: "knife", label: "Kniv", on: true, pred: s => s.k === "knife" },
  { id: "glove", label: "Handskar", on: true, pred: s => s.k === "glove" },
  { id: "rifle", label: "Gevär (AK-47 / M4)", on: true, pred: s => ["AK-47", "M4A4", "M4A1-S"].includes(s.w) },
  { id: "awp", label: "AWP", on: false, pred: s => s.w === "AWP" },
  { id: "pistol", label: "Pistol (Deagle / USP-S / Glock)", on: false, pred: s => ["Desert Eagle", "USP-S", "Glock-18"].includes(s.w) },
];
const S = { base: null, color: "", budget: "", slots: new Set(SLOTS.filter(s => s.on).map(s => s.id)) };

const priceOf = s => { // billigaste slitaget med pris (USD)
  const arr = (s.wr?.length ? s.wr : [null]).map(w => bestUsd(mhnFor(s, w))).filter(Boolean);
  return arr.length ? Math.min(...arr) : null;
};
const theme = () => S.base ? S.base : S.color ? { c1: S.color, c2: "", hx: COLORS[S.color], p1: 50, p2: 0, mc: false } : null;

export function renderCombo(root) {
  root.innerHTML = `${pageHead("Combo Finder", "Välj ett skin eller en färg – få kompletta set (kniv, handskar, vapen) som matchar i färg, inom din budget.")}
    <div class="panel" style="margin-bottom:14px">
      <div class="row" style="align-items:flex-start;margin-bottom:12px"><span class="muted small" style="width:96px">Utgå från skin</span><div id="cb" style="flex:1;min-width:220px"></div></div>
      <div class="row" style="align-items:flex-start;margin-bottom:12px"><span class="muted small" style="width:96px">…eller färg</span><div class="chips">${Object.keys(COLORS).filter(c => c !== "black" || true).map(c => `<button class="chip ${S.color === c && !S.base ? "on" : ""}" data-c="${c}" aria-pressed="${S.color === c && !S.base}"><i class="dot" style="background:${COLORS[c]}"></i>${COLOR_LABEL[c]}</button>`).join("")}</div></div>
      <div class="row" style="margin-bottom:12px"><span class="muted small" style="width:96px">Ingår</span><div class="chips">${SLOTS.map(s => `<button class="chip ${S.slots.has(s.id) ? "on" : ""}" data-s="${s.id}" aria-pressed="${S.slots.has(s.id)}">${esc(s.label)}</button>`).join("")}</div></div>
      <div class="row"><span class="muted small" style="width:96px">Budget totalt</span><input class="inp" id="bud" type="text" inputmode="decimal" placeholder="t.ex. 5 000 (kr)" value="${esc(S.budget)}" style="width:170px"><button class="btn" id="go">Hitta combos</button></div>
    </div><div id="cbBase"></div><div id="out"></div><p class="muted small" style="margin-top:14px">Färgmatchningen bygger på färgerna i skinbilderna (uppskattning). Stickers ingår inte – de saknar färgdata. Priserna är lägsta marknadspris för billigaste slitaget. ${esc(priceNote())}</p>`;
  itemPicker($("#cb", root), s => { S.base = s; S.color = ""; $$(".chip[data-c]", root).forEach(x => x.classList.remove("on")); showBase(); run(); }, { kinds: ["weapon", "knife", "glove"], placeholder: "Sök skin, kniv eller handskar…" });
  $$(".chip[data-c]", root).forEach(b => b.addEventListener("click", () => { S.color = b.dataset.c; S.base = null; $$(".chip[data-c]", root).forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); }); showBase(); run(); }));
  $$(".chip[data-s]", root).forEach(b => b.addEventListener("click", () => { const id = b.dataset.s; S.slots.has(id) ? S.slots.delete(id) : S.slots.add(id); b.classList.toggle("on", S.slots.has(id)); b.setAttribute("aria-pressed", S.slots.has(id)); }));
  $("#bud", root).addEventListener("input", e => S.budget = e.target.value);
  $("#bud", root).addEventListener("keydown", e => { if (e.key === "Enter") run(); });
  $("#go", root).addEventListener("click", run);

  function showBase() {
    const t = theme(); const host = $("#cbBase", root);
    host.innerHTML = !t ? "" : S.base
      ? `<div class="row" style="margin-bottom:12px"><img src="${esc(imgUrl(S.base.img, "128fx96f"))}" style="width:84px" alt=""><div><b>${esc(S.base.n + (S.base.ph ? " · " + S.base.ph : ""))}</b><div class="muted small"><i class="dot" style="background:${esc(S.base.hx)}"></i> ${esc(COLOR_LABEL[S.base.c1] || "")}${S.base.c2 ? " + " + esc(COLOR_LABEL[S.base.c2]) : ""}</div></div></div>`
      : `<div class="row" style="margin-bottom:12px"><i class="dot" style="background:${COLORS[S.color]};width:18px;height:18px"></i><b>Färgtema: ${esc(COLOR_LABEL[S.color])}</b></div>`;
  }
  function run() {
    S.budget = $("#bud", root).value; // läs alltid direkt ur fältet (även vid inklistring/autofyll)
    const t = theme(), out = $("#out", root);
    if (!t) return void (out.innerHTML = emptyState("Välj ett skin eller en färg", "Då bygger sidan set som matchar."));
    if (!S.slots.size) return void (out.innerHTML = emptyState("Välj minst en del", "Bocka i Kniv, Handskar eller något vapen ovan."));
    const budgetKr = parseDec(S.budget), budgetUsd = budgetKr != null && budgetKr > 0 ? budgetKr / usd2sek(1) : null;
    if (S.budget.trim() && budgetKr == null) return void toast("Budgeten ska vara ett tal, t.ex. 5000");
    // För varje del: de bäst matchande skinsen (med pris). Fler alternativ när budgeten är snäv.
    const cols = SLOTS.filter(s => S.slots.has(s.id)).map(slot => {
      const cand = D.skins.filter(s => s.c1 && s.id !== S.base?.id && slot.pred(s)).map(s => ({ s, p: priceOf(s), m: S.base ? matchScore(S.base, s) : matchScore(t, s) })).filter(x => x.p != null && x.m >= 40)
        .sort((a, b) => b.m - a.m || a.p - b.p);
      // Behåll bäst matchande + billigare alternativ så att budgeten går att klara
      const top = cand.slice(0, 6), cheap = cand.filter(x => x.m >= 55).sort((a, b) => a.p - b.p).slice(0, 4);
      return { slot, list: [...new Map([...top, ...cheap].map(x => [x.s.id, x])).values()] };
    });
    const empty = cols.find(c => !c.list.length);
    if (empty) return void (out.innerHTML = emptyState("Inga bra matchningar för " + empty.slot.label.toLowerCase(), "Prova en annan färg eller ta bort delen."));
    // Alla kombinationer (begränsat antal) → filtrera på budget → sortera på snittmatchning
    let combos = [[]];
    for (const c of cols) { const next = []; for (const base of combos) for (const x of c.list) next.push([...base, { ...x, slot: c.slot }]); combos = next; if (combos.length > 40000) combos.length = 40000; }
    const scored = combos.map(c => ({ c, total: c.reduce((s, x) => s + x.p, 0), score: c.reduce((s, x) => s + x.m, 0) / c.length })).filter(x => budgetUsd == null || x.total <= budgetUsd);
    if (!scored.length) return void (out.innerHTML = emptyState("Inget set ryms inom budgeten", "Höj budgeten eller ta bort en del. Billigaste matchande set kostar " + kr(usd2sek(Math.min(...combos.map(c => c.reduce((s, x) => s + x.p, 0)))))));
    scored.sort((a, b) => b.score - a.score || a.total - b.total);
    // Variation: undvik att samma skin återkommer i alla förslag
    const picked = [], used = new Map();
    for (const x of scored) { if (picked.length >= 6) break; if (x.c.some(i => (used.get(i.s.id) || 0) >= 2)) continue; picked.push(x); x.c.forEach(i => used.set(i.s.id, (used.get(i.s.id) || 0) + 1)); }
    if (picked.length < 3) for (const x of scored) { if (picked.length >= 6) break; if (!picked.includes(x)) picked.push(x); }
    const cheapest = scored.reduce((a, b) => b.total < a.total ? b : a);
    out.innerHTML = `<h2 style="margin:0 0 10px">${picked.length} förslag${budgetKr ? ` inom ${esc(kr(budgetKr))}` : ""}</h2>` + picked.map((x, i) => comboCard(x, i)).join("")
      + (picked.includes(cheapest) ? "" : `<h2 style="margin:18px 0 10px">Billigaste matchande set</h2>${comboCard(cheapest, -1)}`);
  }
  showBase(); if (theme()) run();
}

function comboCard(x, i) {
  return `<div class="panel" style="margin-bottom:12px"><div class="row spread" style="margin-bottom:10px;flex-wrap:wrap"><b>${i >= 0 ? "Förslag " + (i + 1) : "Billigast"}</b><span><span class="muted small">Färgmatchning </span><b>${Math.round(x.score)} %</b> · <span class="muted small">Totalt </span><b class="num">${kr(usd2sek(x.total))}</b></span></div>
    <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${x.c.map(i2 => `<a class="card" href="#/item/${esc(i2.s.id)}" style="--rc:${esc(i2.s.rc || "#666")}"><div class="im"><img loading="lazy" src="${esc(imgUrl(i2.s.img, "256fx192f"))}" alt="${esc(i2.s.n)}"></div><div class="bd"><div class="small muted">${esc(i2.slot.label)}</div><div class="n2" style="font-size:13px">${esc(i2.s.p || i2.s.n)}${i2.s.ph ? " · " + esc(i2.s.ph) : ""}</div><div class="small"><span class="num"><b>${kr(usd2sek(i2.p))}</b></span> <span class="faint">· ${Math.round(i2.m)} %</span></div></div></a>`).join("")}</div></div>`;
}
