import { $, $$, esc, imgUrl, kr, usd2sek, parseMoney, curSym, uid, COLORS, COLOR_LABEL, toast, copyText } from "../util.js";
import { D, bestUsd, mhnFor } from "../data.js";
import { getKV, setKV } from "../store.js";
import { pageHead, itemPicker, emptyState, priceNote } from "./common.js";
import { matchScore } from "./colors.js";
import { THEMES, colorScore, findCombos, numericId } from "../sticker-core.js";
import { buildCandidates, enumerateCombos, pickVariety, loadoutFromCombo, workshopLink, cleanColorThemes } from "../combo-core.js";
import { encodeShare } from "./share.js";

/** Combo Finder: bygger kompletta set (kniv, handskar, vapen, stickers, charm) i matchande färger inom en budget.
 *  Logiken (kandidater, kombinationer, budget, Loadout/Workshop-länkar) ligger i combo-core.js (testad). */
const SLOTS = [
  { id: "knife", label: "Kniv", on: true, pred: s => s.k === "knife" },
  { id: "glove", label: "Handskar", on: true, pred: s => s.k === "glove" },
  { id: "rifle", label: "Gevär (AK-47 / M4)", on: true, pred: s => ["AK-47", "M4A4", "M4A1-S"].includes(s.w) },
  { id: "awp", label: "AWP", on: false, pred: s => s.w === "AWP" },
  { id: "pistol", label: "Pistol (Deagle / USP-S / Glock)", on: false, pred: s => ["Desert Eagle", "USP-S", "Glock-18"].includes(s.w) },
];
const S = { base: null, colors: [], budget: "", slots: new Set(SLOTS.filter(s => s.on).map(s => s.id)), stickers: "0", charm: false, themeName: "" };

const skinCost = s => { let b = null; for (const w of (s.wr?.length ? s.wr : [null])) { const p = bestUsd(mhnFor(s, w)); if (p && (!b || p < b.p)) b = { p, w }; } return b; }; // billigaste slitaget med pris
const themeColors = () => (S.base ? [S.base.c1, S.base.c2].filter(Boolean) : S.colors);
const hasTheme = () => !!S.base || S.colors.length > 0;
const itemPriceUsd = e => (e.mh ? bestUsd(e.mh) : null);

export async function renderCombo(root) {
  let themes = cleanColorThemes(await getKV("colorThemes", null));
  const hasStickerColors = D.stickers.some(s => s.c1), charms = D.other.filter(o => o.kind === "charm" || o.ty === "charm"), hasCharmColors = charms.some(c => c.c1);
  root.innerHTML = `${pageHead("Combo Finder", "Välj ett skin eller ett färgtema – få kompletta set (kniv, handskar, vapen, stickers och charm) som matchar i färg, inom din budget.")}
    <div class="panel" style="margin-bottom:14px">
      <div class="row" style="align-items:flex-start;margin-bottom:12px"><span class="muted small" style="width:110px">Utgå från skin</span><div id="cb" style="flex:1;min-width:220px"></div></div>
      <div class="row" style="align-items:flex-start;margin-bottom:12px"><span class="muted small" style="width:110px">…eller färgtema</span><div style="flex:1"><div class="chips" id="cthemes">${Object.entries(THEMES).map(([k, [l]]) => `<button class="chip" data-t="${k}">${esc(l)}</button>`).join("")}</div>
        <div class="chips" id="ccolors" style="margin-top:6px"><span class="muted small" style="align-self:center">eller välj upp till 3 färger:</span>${Object.keys(COLORS).map(c => `<button class="chip" data-c="${c}"><i class="dot" style="background:${COLORS[c]}"></i>${COLOR_LABEL[c]}</button>`).join("")}</div>
        <div class="chips" id="csaved" style="margin-top:6px"></div>
        <div class="row" style="margin-top:6px;gap:6px"><input class="inp" id="tname" placeholder="Namn på färgtema" style="max-width:200px" aria-label="Namn på färgtema"><button class="btn ghost sm" id="tsave">Spara färgtema</button></div></div></div>
      <div class="row" style="margin-bottom:12px"><span class="muted small" style="width:110px">Ingår</span><div class="chips">${SLOTS.map(s => `<button class="chip ${S.slots.has(s.id) ? "on" : ""}" data-s="${s.id}" aria-pressed="${S.slots.has(s.id)}">${esc(s.label)}</button>`).join("")}
        <button class="chip ${S.charm ? "on" : ""}" id="ccharm" aria-pressed="${S.charm}" ${hasCharmColors ? "" : "disabled"} title="${hasCharmColors ? "Lägg till en charm i matchande färg" : "Charm-färger saknas: kör python tools/build_data.py --charms"}">Charm</button></div></div>
      <div class="row" style="margin-bottom:12px"><span class="muted small" style="width:110px">Stickers</span><select class="inp" id="cst" aria-label="Antal stickers" ${hasStickerColors ? "" : "disabled"}>${[0, 1, 2, 3, 4].map(n => `<option value="${n}" ${S.stickers === String(n) ? "selected" : ""}>${n === 0 ? "Inga stickers" : n + " stickers på vapnet"}</option>`).join("")}</select><span class="muted small">${hasStickerColors ? "" : "Stickerfärger saknas: kör python tools/build_data.py --stickers"}</span></div>
      <div class="row"><span class="muted small" style="width:110px">Budget totalt</span><input class="inp" id="bud" type="text" inputmode="decimal" placeholder="t.ex. 5 000 (${curSym()})" value="${esc(S.budget)}" style="width:170px"><button class="btn" id="go">Hitta combos</button></div>
    </div><div id="cbBase"></div><div id="out"></div><p class="muted small" style="margin-top:14px">Färgmatchningen bygger på färgerna i bilderna (en uppskattning av primär och sekundär färg) – inte en officiell färgsättning. Priserna är lägsta utropspris för billigaste slitaget, och stickers/charm är vanliga marknadspriser utan sticker-premium. ${esc(priceNote())}</p>`;

  const paintChips = () => {
    $$("#cthemes [data-t]", root).forEach(b => b.classList.toggle("on", !S.base && S.colors.join() === THEMES[b.dataset.t][1].join()));
    $$("#ccolors [data-c]", root).forEach(b => b.classList.toggle("on", !S.base && S.colors.includes(b.dataset.c) && !Object.values(THEMES).some(t => t[1].join() === S.colors.join())));
    $("#csaved", root).innerHTML = themes.length ? `<span class="muted small" style="align-self:center">Mina teman:</span>${themes.map((t, i) => `<span class="chip ${!S.base && S.colors.join() === t.colors.join() ? "on" : ""}"><a href="#" data-st="${i}" style="text-decoration:none">${esc(t.name)}</a> ${t.colors.map(c => `<i class="dot" style="background:${COLORS[c]}"></i>`).join("")} <button class="linkbtn" data-sd="${i}" aria-label="Ta bort ${esc(t.name)}">✕</button></span>`).join("")}` : "";
    $$("#csaved [data-st]", root).forEach(a => a.addEventListener("click", e => { e.preventDefault(); setColors(themes[+a.dataset.st].colors); }));
    $$("#csaved [data-sd]", root).forEach(b => b.addEventListener("click", async () => { themes.splice(+b.dataset.sd, 1); await setKV("colorThemes", themes); paintChips(); }));
  };
  const setColors = cols => { S.colors = [...cols]; S.base = null; showBase(); paintChips(); run(); };
  itemPicker($("#cb", root), s => { S.base = s; S.colors = []; showBase(); paintChips(); run(); }, { kinds: ["weapon", "knife", "glove"], placeholder: "Sök skin, kniv eller handskar…" });
  $$("#cthemes [data-t]", root).forEach(b => b.addEventListener("click", () => { const t = THEMES[b.dataset.t][1]; setColors(S.colors.join() === t.join() ? [] : t); }));
  $$("#ccolors [data-c]", root).forEach(b => b.addEventListener("click", () => { const c = b.dataset.c, inPreset = Object.values(THEMES).some(t => t[1].join() === S.colors.join()); const base = inPreset ? [] : S.colors; setColors(base.includes(c) ? base.filter(x => x !== c) : [...base, c].slice(-3)); }));
  $("#tsave", root).addEventListener("click", async () => {
    if (S.base || !S.colors.length) return toast("Välj ett färgtema (1–3 färger) att spara.");
    const name = ($("#tname", root).value.trim() || S.colors.map(c => COLOR_LABEL[c]).join(" + ")).slice(0, 60);
    themes = cleanColorThemes([{ id: uid(), name, colors: S.colors }, ...themes]); await setKV("colorThemes", themes); $("#tname", root).value = ""; toast("Färgtemat sparat"); paintChips();
  });
  $$(".chip[data-s]", root).forEach(b => b.addEventListener("click", () => { const id = b.dataset.s; S.slots.has(id) ? S.slots.delete(id) : S.slots.add(id); b.classList.toggle("on", S.slots.has(id)); b.setAttribute("aria-pressed", S.slots.has(id)); }));
  $("#ccharm", root).addEventListener("click", e => { S.charm = !S.charm; e.currentTarget.classList.toggle("on", S.charm); e.currentTarget.setAttribute("aria-pressed", S.charm); });
  $("#cst", root).addEventListener("change", e => { S.stickers = e.target.value; });
  $("#bud", root).addEventListener("input", e => S.budget = e.target.value);
  $("#bud", root).addEventListener("keydown", e => { if (e.key === "Enter") run(); });
  $("#go", root).addEventListener("click", run);

  function showBase() {
    const host = $("#cbBase", root);
    host.innerHTML = S.base
      ? `<div class="row" style="margin-bottom:12px"><img src="${esc(imgUrl(S.base.img, "128fx96f"))}" style="width:84px" alt=""><div><b>${esc(S.base.n + (S.base.ph ? " · " + S.base.ph : ""))}</b><div class="muted small"><i class="dot" style="background:${esc(S.base.hx)}"></i> ${esc(COLOR_LABEL[S.base.c1] || "")}${S.base.c2 ? " + " + esc(COLOR_LABEL[S.base.c2]) : ""}</div></div></div>`
      : S.colors.length ? `<div class="row" style="margin-bottom:12px">${S.colors.map(c => `<i class="dot" style="background:${COLORS[c]};width:18px;height:18px"></i>`).join("")}<b>Färgtema: ${esc(S.colors.map(c => COLOR_LABEL[c]).join(" + "))}</b></div>` : "";
  }

  function run() {
    S.budget = $("#bud", root).value; // läs alltid direkt ur fältet (även vid inklistring/autofyll)
    const out = $("#out", root), theme = themeColors();
    if (!hasTheme()) return void (out.innerHTML = emptyState("Välj ett skin eller ett färgtema", "Då bygger sidan set som matchar."));
    const nSt = +S.stickers || 0;
    if (!S.slots.size && !nSt && !S.charm) return void (out.innerHTML = emptyState("Välj minst en del", "Bocka i Kniv, Handskar, något vapen, stickers eller charm ovan."));
    const budgetKr = parseMoney(S.budget), budgetUsd = budgetKr != null && budgetKr > 0 ? budgetKr / usd2sek(1) : null;
    if (S.budget.trim() && budgetKr == null) return void toast("Budgeten ska vara ett tal, t.ex. 5000");
    const skinScore = s => (S.base ? matchScore(S.base, s) : colorScore(s, theme));
    const parts = [];
    for (const slot of SLOTS.filter(s => S.slots.has(s.id))) {
      const list = buildCandidates(D.skins.filter(s => s.c1 && s.id !== S.base?.id && slot.pred(s)), { score: skinScore, cost: s => skinCost(s)?.p ?? null }).map(c => ({ ...c, wear: skinCost(c.item)?.w ?? null, kind: "skin" }));
      parts.push({ id: slot.id, label: slot.label, list });
    }
    if (charm()) { const list = buildCandidates(charms.filter(c => c.c1), { score: c => colorScore(c, theme), cost: itemPriceUsd }).map(c => ({ ...c, kind: "charm" })); parts.push({ id: "charm", label: "Charm", list }); }
    if (nSt) {
      // stickerset: bäst matchande och billigaste uppsättningarna för temat (var och en är EN kandidat i kombinationen)
      const cost = s => { const p = itemPriceUsd(s); return p != null ? usd2sek(p) : null; };
      const sets = new Map();
      for (const sort of ["match", "cheap"]) for (const c of findCombos(D.stickers, cost, { count: nSt, theme, sort, duplicates: true, limit: 3 }).combos) sets.set(c.items.map(s => s.id).join(), c);
      const list = [...sets.values()].map(c => ({ item: { id: "st:" + c.items.map(s => s.id).join(), stickers: c.items }, cost: c.cost / usd2sek(1), score: c.score, kind: "stickers" }));
      parts.push({ id: "stickers", label: `${nSt} stickers`, list });
    }
    const empty = parts.find(p => !p.list.length);
    if (empty) return void (out.innerHTML = emptyState("Inga bra matchningar för " + empty.label.toLowerCase(), "Prova ett annat färgtema eller ta bort delen."));
    const R = enumerateCombos(parts, { budget: budgetUsd });
    if (!R.combos.length) return void (out.innerHTML = emptyState("Inget set ryms inom budgeten", "Höj budgeten eller ta bort en del. Billigaste matchande set kostar " + kr(usd2sek(R.minTotal))));
    const picked = pickVariety(R.combos, { n: 6, maxReuse: 2 });
    out.innerHTML = `<h2 style="margin:0 0 10px">${picked.length} förslag${budgetKr ? ` inom ${esc(kr(budgetKr))}` : ""}</h2>${R.truncated ? `<p class="muted small" style="margin-top:-4px">Antalet kombinationer är mycket stort – sökningen avbröts vid en gräns, så bättre set kan finnas.</p>` : ""}` + picked.map((x, i) => comboCard(x, i)).join("")
      + (picked.includes(R.cheapest) ? "" : `<h2 style="margin:18px 0 10px">Billigaste matchande set</h2>${comboCard(R.cheapest, -1)}`);
    out._picked = [...picked, R.cheapest];
    $$("[data-lo]", out).forEach(b => b.addEventListener("click", () => openLoadout(out._picked[+b.dataset.lo === -1 ? out._picked.length - 1 : +b.dataset.lo])));
    $$("[data-ws]", out).forEach(b => b.addEventListener("click", () => { const c = out._picked[+b.dataset.ws === -1 ? out._picked.length - 1 : +b.dataset.ws]; location.hash = wsLink(c); }));
    $$("[data-cp]", out).forEach(b => b.addEventListener("click", () => { const c = out._picked[+b.dataset.cp === -1 ? out._picked.length - 1 : +b.dataset.cp]; copyText(listText(c), "Inköpslistan kopierad"); }));
  }
  const charm = () => S.charm && hasCharmColors;

  async function openLoadout(c) {
    const lo = loadoutFromCombo(c.picks.filter(p => p.kind === "skin")), theme = S.base ? (S.base.c1 || "") : (S.colors[0] || "");
    const token = await encodeShare({ name: "Combo " + (theme ? COLOR_LABEL[theme] : "set"), side: lo.side, slots: lo.slots, theme });
    if (lo.dropped) toast(`${lo.dropped} del${lo.dropped > 1 ? "ar" : ""} passar inte ${lo.side === "t" ? "Terrorist" : "Counter-Terrorist"}-sidan och hoppades över.`);
    location.hash = "#/loadout/" + token;
  }
  function wsLink(c) {
    const skin = c.picks.find(p => p.kind === "skin" && p.item.k === "weapon"), st = c.picks.find(p => p.kind === "stickers"), ch = c.picks.find(p => p.kind === "charm");
    return workshopLink({ skin: skin?.item.id ?? null, wear: skin?.wear || "FT", stickers: st ? st.item.stickers.map(numericId) : [], charm: ch ? Number(String(ch.item.id).replace(/^keychain-/, "")) : null });
  }
  function listText(c) {
    const lines = c.picks.map(p => p.kind === "stickers" ? `- Stickers: ${p.item.stickers.map(s => s.mh || s.n).join(", ")} (${kr(usd2sek(p.cost))})` : `- ${p.item.n || p.item.mh}${p.wear ? " (" + p.wear + ")" : ""}: ${kr(usd2sek(p.cost))}`);
    return lines.join("\n") + `\nTotalt: ${kr(usd2sek(c.total))}`;
  }
  showBase(); paintChips(); if (hasTheme()) run();
}

function comboCard(x, i) {
  const idx = i >= 0 ? i : -1;
  const hasWeapon = x.picks.some(p => p.kind === "skin" && p.item.k === "weapon"), hasSt = x.picks.some(p => p.kind === "stickers" || p.kind === "charm");
  return `<div class="panel" style="margin-bottom:12px"><div class="row spread" style="margin-bottom:10px;flex-wrap:wrap"><b>${i >= 0 ? "Förslag " + (i + 1) : "Billigast"}</b><span><span class="muted small">Färgmatchning </span><b>${Math.round(x.score)} %</b> · <span class="muted small">Totalt </span><b class="num">${kr(usd2sek(x.total))}</b></span></div>
    <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${x.picks.map(p => p.kind === "stickers"
      ? `<div class="card"><div class="im" style="display:flex;flex-wrap:wrap;align-content:center;gap:2px;padding:6px">${p.item.stickers.map(s => `<a href="#/item/${esc(s.id)}" title="${esc(s.n)}"><img loading="lazy" src="${esc(imgUrl(s.img, "96fx72f"))}" alt="${esc(s.n)}" style="width:48%"></a>`).join("")}</div><div class="bd"><div class="small muted">${esc(p.part.label)}</div><div class="small"><span class="num"><b>${kr(usd2sek(p.cost))}</b></span> <span class="faint">· ${Math.round(p.score)} %</span></div></div></div>`
      : `<a class="card" href="#/item/${esc(p.item.id)}" style="--rc:${esc(p.item.rc || "#666")}"><div class="im"><img loading="lazy" src="${esc(imgUrl(p.item.img, "256fx192f"))}" alt="${esc(p.item.n)}"></div><div class="bd"><div class="small muted">${esc(p.part.label)}</div><div class="n2" style="font-size:13px">${esc(p.item.p || p.item.n)}${p.item.ph ? " · " + esc(p.item.ph) : ""}</div><div class="small"><span class="num"><b>${kr(usd2sek(p.cost))}</b></span> <span class="faint">· ${Math.round(p.score)} %</span></div></div></a>`).join("")}</div>
    <div class="row" style="margin-top:10px;gap:6px"><button class="btn sm" data-lo="${idx}">Öppna i Loadout Builder</button>${hasWeapon && hasSt ? `<button class="btn ghost sm" data-ws="${idx}">Öppna stickers/charm i Workshop</button>` : ""}<button class="btn ghost sm" data-cp="${idx}">Kopiera inköpslista</button></div></div>`;
}
