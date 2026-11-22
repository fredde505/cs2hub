import { $, $$, esc, imgUrl, kr, krm, dec, signKr, pct, cls, fmtDate, modal, toast, uid, lineChart, COLORS, COLOR_LABEL, WEAR_LONG, rarityOrder, debounce, usd2sek, download, confirmBox, MISSING } from "../util.js";
import { all, put, putMany, del, exportAll, importAll } from "../store.js";
import { lookup, mhnFor, bestUsd, priceTip } from "../data.js";
import { loadState, buildRows, totals, posKey } from "../finance.js";
import { pageHead, stat, itemPicker, KIND_LABEL, emptyState, priceNote } from "./common.js";
import { shareModal } from "./share.js";
import { steamImportModal } from "./steam-import.js";
import { backupNow } from "../upkeep.js";

const V = { tab: "holdings", mode: "cash", view: "cards", fOpen: false, q: "", kind: "", cat: "", rarity: "", color: "", pmin: "", pmax: "", fmin: "", fmax: "", cost: "", fav: false, hidden: false, sort: "value" };
const sel = new Set(); // markerade föremål (masshantering)
let rerender = () => { };

export async function recordSnapshot() {
  const { items, trades } = await loadState();
  if (!items.length) return;
  const { rows, pos } = buildRows(items, trades);
  const t = totals(rows, pos);
  const snaps = await all("snapshots");
  const last = snaps.length ? Math.max(...snaps.map(s => s.ts)) : 0;
  if (Date.now() - last > 6 * 3600e3 && t.steam > 0) await put("snapshots", { ts: Date.now(), steam: t.steam, cash: t.cash, cost: t.cost });
}

/* ============================ Huvudvy ============================ */
export async function renderInventory(root, tab) {
  if (tab) V.tab = tab;
  rerender = () => renderInventory(root);
  const [{ items, trades }, snaps] = await Promise.all([loadState(), all("snapshots")]);
  const { rows, pos } = buildRows(items, trades);
  const t = totals(rows, pos);
  const steamMode = V.mode === "steam";
  const val = steamMode ? t.steam : t.cash;
  const unreal = steamMode ? t.unrealizedSteam : t.unrealizedCash;
  const hasSales = [...pos.values()].some(p => p.sold > 0);
  const totalPL = (t.withCost ? unreal : 0) + (hasSales ? t.realized : 0);
  const pts = snaps.sort((a, b) => a.ts - b.ts).map(s => ({ x: s.ts, y: steamMode ? s.steam : s.cash }));
  const unique = new Set(rows.filter(r => !r.it.hidden).map(r => r.mhn)).size;
  const best = rows.filter(r => r.cost && (steamMode ? r.plSteam : r.plCash) != null).map(r => ({ r, pc: (steamMode ? r.plSteam : r.plCash) / r.cost * 100 })).sort((a, b) => b.pc - a.pc)[0];
  const showPL = t.withCost || hasSales;
  const charts = `<div class="grid split" style="margin-bottom:18px">
      <div class="panel"><h2>Värdeutveckling</h2>${lineChart(pts, { fmt: v => kr(v), since: snaps[0]?.ts })}</div>
      <div class="panel"><h2>Värde per kategori</h2>${categoryBars(t, steamMode)}</div></div>`;

  root.innerHTML = `<div class="row spread" style="align-items:flex-start"><div>${pageHead("My Inventory", "Värde, inköp och vinst – allt sparas lokalt i din webbläsare.")}</div>
    <div class="row"><button class="btn ghost" id="bShare">Dela</button><button class="btn ghost" id="bImport">Hämta Steam-inventory</button><button class="btn" id="bAdd">+ Lägg till föremål</button></div></div>
    <div class="kpis">
      <div class="panel stat"><div class="row spread" style="flex-wrap:nowrap"><span class="lbl">Totalt värde</span><div class="seg sm" id="modeSeg"><button data-m="cash" class="${!steamMode ? "on" : ""}" title="Netto efter marknadsavgift – vad du får ut">Riktiga pengar</button><button data-m="steam" class="${steamMode ? "on" : ""}" title="Steam Market-pris – krediter som inte går att ta ut">Steam</button></div></div>
        <div class="val num">${kr(val)}</div><div class="sub">${steamMode ? "Steam-krediter, går inte att ta ut" : "netto efter marknadsavgift"}</div></div>
      ${stat("Vinst / förlust", showPL ? signKr(totalPL) : "–", showPL ? `${t.withCost ? "orealiserad " + signKr(unreal) : ""}${t.withCost && hasSales ? " · " : ""}${hasSales ? "realiserad " + signKr(t.realized) : ""}` : "Registrera inköp för att se vinst", cls(totalPL))}
      ${stat("Investerat", t.withCost ? kr(t.cost) : "–", `${t.withCost} av ${t.withCost + t.withoutCost} har inköpspris${best ? ` · bäst: ${esc(best.r.e?.p || best.r.name)} ${pct(best.pc)}` : ""}`)}
      ${stat("Föremål", `${t.count}`, `${unique} olika${t.unpricedItems ? ` · <span class="miss" title="Saknar prisdata och ingår inte i värdet">${t.unpricedItems} utan pris</span>` : ""}${t.notSellable ? ` · ${t.notSellable} ej säljbara` : ""}`)}
    </div>
    <details class="muted small" style="margin:-4px 0 14px"><summary style="cursor:pointer;width:max-content">Så räknas siffrorna – uppskattat eller registrerat?</summary>
      <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7"><li><b>Totalt värde</b> är en <b>uppskattning</b> från marknadspriser (netto efter avgift, eller Steam-pris om du valt det) – inte något du fått betalt.</li>
      <li><b>Investerat</b> är det du själv <b>registrerat</b> som köp (inklusive avgifter). Föremål utan registrerat köp ingår inte.</li>
      <li><b>Orealiserad vinst</b> = uppskattat värde minus din registrerade kostnad. Den ändras med marknaden tills du säljer.</li>
      <li><b>Realiserad vinst</b> bygger bara på försäljningar du <b>registrerat</b> (pris minus avgift minus snittkostnad).</li>
      <li><b>≈ vid snittinköp</b> betyder att köpet registrerades utan float, så snittet för skinet används – inte exakt för just det exemplaret.</li>
      <li><b>Doppler-faser</b> prissätts inte per fas i vår prisdata – se märket "fas ej prissatt".</li></ul></details>
    <div class="tabs">${[["holdings", "Innehav"], ["trades", "Transaktioner"], ["profit", "Vinst per föremål"], ["analysis", "Analys"]].map(([k, l]) => `<button data-t="${k}" class="${V.tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="tabBody"></div>
    <p class="muted small" style="margin-top:14px">${esc(priceNote())}</p>`;
  $("#bAdd", root).addEventListener("click", () => addItemModal({}));
  $("#bShare", root).addEventListener("click", () => rows.length ? shareModal(rows) : toast("Lägg till föremål först"));
  $("#bImport", root).addEventListener("click", () => steamImportModal(rerender));
  $$("#modeSeg button", root).forEach(b => b.addEventListener("click", () => { V.mode = b.dataset.m; rerender(); }));
  $$(".tabs button", root).forEach(b => b.addEventListener("click", () => { V.tab = b.dataset.t; rerender(); }));
  const body = $("#tabBody", root);
  if (V.tab === "holdings") holdingsTab(body, rows);
  else if (V.tab === "trades") tradesTab(body, trades);
  else if (V.tab === "profit") profitTab(body, rows, pos, steamMode);
  else analysisTab(body, rows, t, steamMode, charts);
}

function categoryBars(t, steamMode) {
  const entries = Object.entries(t.byKind).map(([k, v]) => [k, steamMode ? v.steam : v.cash, v.qty]).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
  const tot = entries.reduce((s, e) => s + e[1], 0);
  if (!entries.length) return `<div class="muted small">Inget värderat innehav än.</div>`;
  return entries.map(([k, v, q]) => `<div style="margin-bottom:9px"><div class="row spread small"><span>${esc(KIND_LABEL[k] || k)} <span class="faint">· ${q} st</span></span><span class="num">${kr(v)} <span class="faint">${dec(v / tot * 100, 0)} %</span></span></div>
    <div style="height:4px;background:var(--line);border-radius:2px;margin-top:4px"><div style="height:4px;width:${(v / tot * 100).toFixed(1)}%;background:#8a9099;border-radius:2px"></div></div></div>`).join("");
}

/* ============================ Innehav ============================ */
const activeFilters = () => [V.kind, V.cat, V.rarity, V.color, V.cost, V.pmin, V.pmax, V.fmin, V.fmax, V.fav ? "1" : "", V.hidden ? "1" : ""].filter(x => x !== "").length;

/** Flytande ••• -meny (position:fixed så den inte klipps av tabellens scrollyta). */
function openMenu(btn, items) {
  document.querySelectorAll(".menu-pop").forEach(m => m.remove());
  const m = document.createElement("div"); m.className = "menu-pop"; m.setAttribute("role", "menu");
  m.innerHTML = items.map((it, i) => it.href ? `<a role="menuitem" href="${esc(it.href)}">${esc(it.label)}</a>` : `<button role="menuitem" data-i="${i}" class="${it.danger ? "danger" : ""}">${esc(it.label)}</button>`).join("");
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + "px";
  m.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + "px";
  const close = () => { m.remove(); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", esc_); removeEventListener("scroll", close, true); };
  const outside = e => { if (!m.contains(e.target)) close(); }, esc_ = e => e.key === "Escape" && close();
  setTimeout(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", esc_); addEventListener("scroll", close, true); });
  m.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { close(); items[+b.dataset.i].run(); }));
  m.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
}

/** Snabbregistrera inköpspris utan att öppna den stora transaktionsrutan. */
function quickCostModal(r, done) {
  modal(`<h3>Vad betalade du?</h3><p class="muted small" style="margin-top:0">${esc(r.mhn)}${r.float != null ? " · float " + dec(r.float, 4) : ""}</p>
    <div class="form"><label>Pris per st (kr)<input class="inp" id="qp" type="number" min="0" step="0.01" placeholder="${r.unit != null ? dec(r.unit, 2) : ""}"></label><label>Antal<input class="inp" id="qq" type="number" min="1" value="${r.qty}"></label>
    <label>Datum<input class="inp" id="qd" type="date" value="${today()}"></label><label>Avgift totalt (kr)<input class="inp" id="qf" type="number" min="0" step="0.01" value="0"></label></div>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-close>Avbryt</button><button class="btn" id="qs">Spara</button></div>`, {
    onMount: (m, close) => {
      m.querySelector("#qp").focus();
      m.querySelector("#qs").addEventListener("click", async () => {
        const price = m.querySelector("#qp").value;
        if (price === "" || !(+price >= 0)) return toast("Ange pris per st");
        await put("trades", { id: uid(), type: "buy", mhn: r.mhn, qty: Math.max(1, Math.floor(+m.querySelector("#qq").value) || 1), price: +price, fee: +m.querySelector("#qf").value || 0, date: new Date(m.querySelector("#qd").value).getTime() || Date.now(), market: "", pay: "cash", float: r.float, seed: r.seed, note: "", created: Date.now() });
        close(); toast("Inköpspris sparat"); done();
      });
    },
  });
}

function holdingsTab(body, allRows) {
  const cats = [...new Set(allRows.map(r => r.e?.c).filter(Boolean))].sort();
  const rars = [...new Set(allRows.map(r => r.rarity).filter(Boolean))].sort((a, b) => rarityOrder.indexOf(a) - rarityOrder.indexOf(b));
  const kinds = [...new Set(allRows.map(r => r.kind))];
  const opt = (id, label, opts, val, lab = x => x) => `<select class="inp" id="${id}" aria-label="${esc(label)}"><option value="">${label}</option>${opts.map(o => `<option value="${esc(o)}" ${o === val ? "selected" : ""}>${esc(lab(o))}</option>`).join("")}</select>`;
  const n = activeFilters();
  body.innerHTML = `<div class="toolbar">
    <input class="inp" id="q" type="search" placeholder="Sök i inventory…" value="${esc(V.q)}" style="flex:1;min-width:160px;max-width:340px" aria-label="Sök i inventory">
    <select class="inp" id="sort" aria-label="Sortera">${[["value", "Värde ↓"], ["name", "Namn"], ["pl", "Vinst ↓"], ["plr", "Förlust ↓"], ["float", "Float ↑"]].map(([v, l]) => `<option value="${v}" ${V.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <div class="seg" id="viewSeg">${[["cards", "Bildkort"], ["table", "Tabell"]].map(([v, l]) => `<button data-v="${v}" class="${V.view === v ? "on" : ""}">${l}</button>`).join("")}</div>
    <button class="btn ghost ${n ? "on-filter" : ""}" id="fbtn" aria-expanded="${!!V.fOpen}">Filter (${n})</button></div>
    <div class="panel" id="fpanel" style="margin-bottom:12px" ${V.fOpen ? "" : "hidden"}><div class="fgrid">
      ${opt("kind", "Alla typer", kinds, V.kind, k => KIND_LABEL[k] || k)}${cats.length ? opt("cat", "Alla vapentyper", cats, V.cat) : ""}${opt("rar", "Alla rarities", rars, V.rarity)}${opt("col", "Alla färger", Object.keys(COLORS), V.color, c => COLOR_LABEL[c])}
      <select class="inp" id="cost" aria-label="Inköpspris"><option value="">Inköpspris: alla</option><option value="has" ${V.cost === "has" ? "selected" : ""}>Har inköpspris</option><option value="none" ${V.cost === "none" ? "selected" : ""}>Saknar inköpspris</option></select>
      <div class="row" style="flex-wrap:nowrap"><input class="inp" id="pmin" type="number" placeholder="Min kr" value="${esc(V.pmin)}" aria-label="Lägsta värde"><input class="inp" id="pmax" type="number" placeholder="Max kr" value="${esc(V.pmax)}" aria-label="Högsta värde"></div>
      <div class="row" style="flex-wrap:nowrap"><input class="inp" id="fmin" type="number" step="0.01" min="0" max="1" placeholder="Float ≥" value="${esc(V.fmin)}" aria-label="Lägsta float"><input class="inp" id="fmax" type="number" step="0.01" min="0" max="1" placeholder="Float ≤" value="${esc(V.fmax)}" aria-label="Högsta float"></div>
      <div class="row"><label class="chip ${V.fav ? "on" : ""}" id="fav">★ Favoriter</label><label class="chip ${V.hidden ? "on" : ""}" id="hid">Visa dolda</label><button class="btn ghost sm" id="fclear" style="margin-left:auto">Rensa filter</button></div></div></div>
    <div id="bulk"></div><div id="list"></div>`;
  const bind = (id, key, ev = "input") => { const el = $("#" + id, body); el && el.addEventListener(ev, debounce(() => { V[key] = el.value; draw(); updBtn(); }, 140)); };
  const updBtn = () => { const k = activeFilters(); $("#fbtn", body).textContent = `Filter (${k})`; $("#fbtn", body).classList.toggle("on-filter", k > 0); };
  bind("q", "q"); bind("kind", "kind", "change"); bind("cat", "cat", "change"); bind("rar", "rarity", "change"); bind("col", "color", "change"); bind("cost", "cost", "change");
  bind("pmin", "pmin"); bind("pmax", "pmax"); bind("fmin", "fmin"); bind("fmax", "fmax"); bind("sort", "sort", "change");
  $("#fbtn", body).addEventListener("click", e => { V.fOpen = !V.fOpen; $("#fpanel", body).hidden = !V.fOpen; e.currentTarget.setAttribute("aria-expanded", V.fOpen); });
  $("#fav", body).addEventListener("click", e => { V.fav = !V.fav; e.currentTarget.classList.toggle("on", V.fav); draw(); updBtn(); });
  $("#hid", body).addEventListener("click", e => { V.hidden = !V.hidden; e.currentTarget.classList.toggle("on", V.hidden); draw(); updBtn(); });
  $("#fclear", body).addEventListener("click", () => { Object.assign(V, { kind: "", cat: "", rarity: "", color: "", cost: "", pmin: "", pmax: "", fmin: "", fmax: "", fav: false, hidden: false }); rerender(); });
  $$("#viewSeg button", body).forEach(b => b.addEventListener("click", () => { V.view = b.dataset.v; $$("#viewSeg button", body).forEach(x => x.classList.toggle("on", x === b)); draw(); }));

  const steamMode = V.mode === "steam";
  let shown = [];
  const unit = r => steamMode ? r.steam : r.cash;
  const value = r => steamMode ? r.vSteam : r.vCash;
  const pl = r => steamMode ? r.plSteam : r.plCash;
  function draw() {
    const q = V.q.toLowerCase().split(/\s+/).filter(Boolean);
    let rows = allRows.filter(r => {
      if (!V.hidden && r.it.hidden) return false;
      if (V.fav && !r.it.fav) return false;
      if (V.kind && r.kind !== V.kind) return false;
      if (V.cat && r.e?.c !== V.cat) return false;
      if (V.rarity && r.rarity !== V.rarity) return false;
      if (V.color && r.c1 !== V.color && r.c2 !== V.color) return false;
      if (V.cost === "has" && r.cost == null) return false;
      if (V.cost === "none" && r.cost != null) return false;
      if (q.length && !q.every(t => (r.name + " " + r.mhn + " " + (r.it.nametag || "")).toLowerCase().includes(t))) return false;
      if (V.pmin !== "" && (unit(r) ?? 0) < +V.pmin) return false;
      if (V.pmax !== "" && (unit(r) ?? 1e12) > +V.pmax) return false;
      if (V.fmin !== "" && (r.float == null || r.float < +V.fmin)) return false;
      if (V.fmax !== "" && (r.float == null || r.float > +V.fmax)) return false;
      return true;
    });
    const s = V.sort, v = r => value(r) ?? -1;
    rows.sort((a, b) => s === "name" ? a.name.localeCompare(b.name) : s === "pl" ? (pl(b) ?? -1e12) - (pl(a) ?? -1e12) : s === "plr" ? (pl(a) ?? 1e12) - (pl(b) ?? 1e12) : s === "float" ? (a.float ?? 9) - (b.float ?? 9) : v(b) - v(a));
    shown = rows.slice(0, V.view === "cards" ? 120 : 300);
    const host = $("#list", body);
    if (!allRows.length) { host.innerHTML = emptyState("Ditt inventory är tomt", "Hämta ditt publika Steam-inventory eller lägg till föremål manuellt. Registrera sedan vad du betalade, så räknar sidan ut vinst och förlust.", `<button class="btn" id="e1">Hämta Steam-inventory</button> <button class="btn ghost" id="e2">+ Lägg till föremål</button>`); $("#e1", host).onclick = () => steamImportModal(rerender); $("#e2", host).onclick = () => addItemModal({}); bulk(); return; }
    if (!rows.length) { host.innerHTML = emptyState("Inga föremål matchar", "Prova att ta bort något filter.", `<button class="btn ghost" id="e3">Rensa filter</button>`); $("#e3", host).onclick = () => $("#fclear", body).click(); bulk(); return; }
    host.innerHTML = (V.view === "cards" ? cardsView(shown) : tableView(shown)) + (rows.length > shown.length ? `<div class="muted small" style="margin-top:8px">Visar ${shown.length} av ${rows.length}. Använd sök och filter för att begränsa.</div>` : "");
    const byId = id => allRows.find(x => x.it.id === id);
    host.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", async () => {
      const r = byId(b.dataset.id); if (!r) return;
      if (b.dataset.a === "fav") { r.it.fav = !r.it.fav; await put("items", r.it); rerender(); }
      else if (b.dataset.a === "cost") quickCostModal({ ...r, unit: unit(r) }, rerender);
      else if (b.dataset.a === "menu") openMenu(b, [
        { label: "Sälj", run: () => tradeModal({ mhn: r.mhn, type: "sell", item: r.it, onDone: rerender }) },
        { label: "Redigera", run: () => editItemModal(r.it, rerender) },
        { label: r.it.hidden ? "Visa" : "Dölj", run: async () => { r.it.hidden = !r.it.hidden; await put("items", r.it); rerender(); } },
        ...(r.e?.wr?.length ? [{ label: "Inspect & Float", href: "#/inspect/" + r.e.id }] : []),
        ...(r.e ? [{ label: "Öppna i databasen", href: "#/item/" + r.e.id }] : []),
      ]);
    }));
    host.querySelectorAll("[data-sel]").forEach(c => c.addEventListener("change", () => { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); bulk(); }));
    const all_ = host.querySelector("#selAll"); if (all_) all_.addEventListener("change", () => { shown.forEach(r => all_.checked ? sel.add(r.it.id) : sel.delete(r.it.id)); host.querySelectorAll("[data-sel]").forEach(c => c.checked = all_.checked); bulk(); });
    bulk();
  }
  function bulk() {
    const n = [...sel].filter(id => allRows.some(r => r.it.id === id)).length;
    const bar = $("#bulk", body);
    if (!n) { bar.innerHTML = ""; return; }
    bar.innerHTML = `<div class="bulkbar"><b>${n} markerade</b><button class="btn ghost sm" data-b="fav">★ Favoritmarkera</button><button class="btn ghost sm" data-b="unfav">Ta bort favorit</button><button class="btn ghost sm" data-b="hide">Dölj</button><button class="btn ghost sm" data-b="show">Visa</button><button class="btn ghost sm danger" data-b="del">Ta bort</button><button class="btn ghost sm" data-b="none" style="margin-left:auto">Avmarkera</button></div>`;
    bar.querySelectorAll("[data-b]").forEach(b => b.addEventListener("click", async () => {
      const chosen = allRows.filter(r => sel.has(r.it.id)).map(r => r.it); const a = b.dataset.b;
      if (a === "none") { sel.clear(); return draw(); }
      if (a === "del") { if (!await confirmBox(`Ta bort ${chosen.length} föremål från inventory? Transaktioner behålls.`, { ok: "Ta bort", danger: true })) return; for (const it of chosen) await del("items", it.id); sel.clear(); toast("Borttagna"); return rerender(); }
      for (const it of chosen) { if (a === "fav") it.fav = true; if (a === "unfav") it.fav = false; if (a === "hide") it.hidden = true; if (a === "show") it.hidden = false; }
      await putMany("items", chosen); toast("Uppdaterat"); rerender();
    }));
  }

  const title = r => esc((r.e?.p || r.e?.n.replace(/^(Sticker|Charm|Patch) \| /, "") || r.name) + (r.e?.ph ? " · " + r.e.ph : ""));
  const sub = r => `${esc(r.e?.w || KIND_LABEL[r.kind] || "")}${r.wear ? " · " + r.wear : ""}${r.st ? " · ST™" : ""}${r.c1 ? ` <i class="dot" style="background:${esc(r.e.hx)}"></i>` : ""}`;
  const nameBlock = r => `<div style="min-width:0"><div class="n1">${sub(r)}${r.it.fav ? ' <span style="color:#e8c26a">★</span>' : ""}</div><div class="n2">${title(r)}</div>${r.it.nametag ? `<div class="n1">"${esc(r.it.nametag)}"</div>` : ""}</div>`;
  const plCell = r => { const p = pl(r); return p != null ? `${signKr(p)}<div class="small">${r.cost ? pct(p / r.cost * 100) : ""}</div>` : '<span class="faint">–</span>'; };
  const costCell = r => r.unitCost != null ? (r.costApprox ? `<span title="Snitt av dina köp utan float – inte exakt för just det här exemplaret.">≈ ${kr(r.unitCost)}</span>` : kr(r.unitCost)) : `<button class="linkbtn" data-a="cost" data-id="${esc(r.it.id)}">+ Lägg till</button>`;
  const valCell = r => { const v = value(r); return `<span title="${r.notSellable ? "Det här föremålet går inte att sälja på någon marknad." : esc(priceTip(r.mhn))}">${v != null ? kr(v) : r.notSellable ? '<span class="faint">Ej säljbar</span>' : MISSING}</span>${r.qty > 1 && unit(r) != null ? `<div class="faint small">${r.qty} st · ${kr(unit(r))}/st</div>` : r.qty > 1 ? `<div class="faint small">${r.qty} st</div>` : ""}${/^(Gamma )?Doppler$/.test(r.e?.p || "") ? '<div class="faint small" title="Prisdata skiljer inte på Doppler-faser. Priset är lägsta för modellen; Ruby, Sapphire, Black Pearl och Emerald är ofta värda mycket mer.">fas ej prissatt</div>' : ""}`; };
  const menuBtn = r => `<button class="btn ghost sm" data-a="menu" data-id="${esc(r.it.id)}" aria-haspopup="menu" aria-label="Fler åtgärder">•••</button>`;
  const starBtn = r => `<button class="btn ghost sm" data-a="fav" data-id="${esc(r.it.id)}" aria-label="Favorit" style="${r.it.fav ? "color:#e8c26a" : ""}">★</button>`;
  function tableView(rows) {
    const anyFloat = rows.some(r => r.float != null || r.seed != null); // dölj tom kolumn
    return `<div class="panel scroll-x" style="padding:0"><table class="tbl"><thead><tr><th class="sel-col"><input type="checkbox" id="selAll" aria-label="Markera alla"></th><th>Föremål</th>${anyFloat ? '<th class="r hide-m">Float / seed</th>' : ""}<th class="r hide-m">Snittinköp</th><th class="r">Värde</th><th class="r">Vinst/förlust</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr style="${r.it.hidden ? "opacity:.45" : ""}"><td class="sel-col"><input type="checkbox" data-sel="${esc(r.it.id)}" ${sel.has(r.it.id) ? "checked" : ""} aria-label="Markera"></td>
      <td><div class="nm"><span class="rar" style="--rc:${esc(r.rc)}"></span><img loading="lazy" src="${esc(imgUrl(r.img, "128fx96f"))}" alt="" width="56" height="42">${nameBlock(r)}</div></td>
      ${anyFloat ? `<td class="r num hide-m">${r.float != null ? dec(r.float, 4) : '<span class="faint">–</span>'}${r.seed != null ? `<div class="faint small">seed ${r.seed}</div>` : ""}</td>` : ""}<td class="r num hide-m">${costCell(r)}</td>
      <td class="r num">${valCell(r)}</td><td class="r num ${cls(pl(r))}">${plCell(r)}</td><td class="r" style="white-space:nowrap">${starBtn(r)} ${menuBtn(r)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function cardsView(rows) {
    return `<div class="cards">${rows.map(r => { const p = pl(r); return `<div class="card inv-card" style="--rc:${esc(r.rc)};${r.it.hidden ? "opacity:.5" : ""}">
      <div class="im"><img loading="lazy" src="${esc(imgUrl(r.img, "256fx192f"))}" alt="" width="256" height="192">
        <label class="ck"><input type="checkbox" data-sel="${esc(r.it.id)}" ${sel.has(r.it.id) ? "checked" : ""} aria-label="Markera"></label>
        <span class="corner tl">${r.wear ? esc(r.wear) : ""}${r.st ? " ST™" : ""}${r.qty > 1 ? `${r.wear ? " · " : ""}×${r.qty}` : ""}</span>
        ${p != null ? `<span class="corner br ${cls(p)}">${signKr(p)}</span>` : ""}</div><div class="bar"></div>
      <div class="bd">${nameBlock(r)}<div class="pr num">${valCell(r)}</div><div class="row spread" style="margin-top:6px;gap:4px"><span class="small">${r.unitCost == null ? `<button class="linkbtn" data-a="cost" data-id="${esc(r.it.id)}">+ Inköpspris</button>` : `<span class="faint">inköpt ${kr(r.unitCost)}</span>`}</span><span style="white-space:nowrap">${starBtn(r)} ${menuBtn(r)}</span></div></div></div>`; }).join("")}</div>`;
  }
  draw();
}

/* ============================ Transaktioner ============================ */
const csvCell = v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function tradesToCsv(trades) {
  const head = ["datum", "typ", "föremål", "antal", "pris_per_st", "avgift", "marknad", "betalning", "float", "seed", "notering"];
  const rows = [...trades].sort((a, b) => a.date - b.date).map(t => [new Date(t.date).toISOString().slice(0, 10), t.type === "buy" ? "köp" : "sälj", t.mhn, t.qty, String(t.price).replace(".", ","), String(t.fee || 0).replace(".", ","), t.market || "", t.pay === "steam" ? "steam" : "riktiga pengar", t.float ?? "", t.seed ?? "", t.note || ""]);
  return "﻿" + [head, ...rows].map(r => r.map(csvCell).join(";")).join("\r\n");
}
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const delim = (text.split("\n")[0].match(/;/g) || []).length >= (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const out = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === delim) { row.push(cur); cur = ""; } else if (c === "\n") { row.push(cur.replace(/\r$/, "")); out.push(row); row = []; cur = ""; } else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, "")); out.push(row); }
  return out.filter(r => r.some(x => x.trim()));
}
const numSv = v => { const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
async function importCsv(text) {
  const rows = parseCsv(text); if (rows.length < 2) throw new Error("Filen innehåller inga rader.");
  const head = rows[0].map(h => h.trim().toLowerCase()); const idx = n => head.indexOf(n);
  const need = ["datum", "typ", "föremål", "antal", "pris_per_st"]; const miss = need.filter(n => idx(n) < 0);
  if (miss.length) throw new Error("Saknar kolumner: " + miss.join(", "));
  const trades = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const g = n => r[idx(n)]?.trim() ?? "";
    const date = new Date(g("datum")).getTime(), price = numSv(g("pris_per_st")), qty = Math.floor(numSv(g("antal")) || 0), type = /^s[äa]lj|sell/i.test(g("typ")) ? "sell" : /^k[öo]p|buy/i.test(g("typ")) ? "buy" : null;
    if (!g("föremål") || !Number.isFinite(date) || price == null || price < 0 || qty < 1 || !type) { skipped++; continue; }
    const fl = numSv(g("float")), sd = numSv(g("seed"));
    trades.push({ id: uid(), type, mhn: g("föremål").slice(0, 200), qty, price, fee: numSv(g("avgift")) || 0, date, market: g("marknad").slice(0, 40), pay: /steam/i.test(g("betalning")) ? "steam" : "cash", float: fl, seed: sd, note: g("notering").slice(0, 200), created: Date.now() });
  }
  if (trades.length) await putMany("trades", trades);
  return { added: trades.length, skipped };
}

function tradesTab(body, trades) {
  const sorted = [...trades].sort((a, b) => b.date - a.date || b.created - a.created);
  body.innerHTML = `<div class="row spread" style="margin-bottom:12px"><span class="muted small">Varje köp och försäljning är en egen händelse. Flera köp av samma skin till olika priser ger automatiskt ett genomsnittligt inköpspris. Föremål med egen float/seed räknas separat.</span>
    <div class="row"><button class="btn ghost" id="tb">+ Köp</button><button class="btn ghost" id="ts">+ Sälj</button></div></div>
    ${sorted.length ? `<div class="panel scroll-x" style="padding:0"><table class="tbl"><thead><tr><th>Datum</th><th>Typ</th><th>Föremål</th><th class="r">Antal</th><th class="r">À-pris</th><th class="r hide-m">Avgift</th><th class="hide-m">Marknad</th><th class="hide-m">Betalning</th><th class="hide-m">Notering</th><th></th></tr></thead><tbody>
    ${sorted.map(t => `<tr><td class="num">${fmtDate(t.date)}</td><td>${t.type === "buy" ? "Köp" : "Sälj"}</td><td>${esc(t.mhn)}${t.float != null ? `<div class="faint small">float ${dec(t.float, 4)}${t.seed != null ? " · seed " + t.seed : ""}</div>` : ""}</td><td class="r num">${t.qty}</td><td class="r num">${kr(t.price)}</td><td class="r num hide-m">${t.fee ? kr(t.fee) : "–"}</td>
      <td class="hide-m">${esc(t.market || "–")}</td><td class="hide-m">${t.pay === "steam" ? "Steam-krediter" : "Riktiga pengar"}</td><td class="hide-m muted">${esc(t.note || "")}</td><td class="r"><button class="btn ghost sm danger" data-del="${esc(t.id)}" aria-label="Ta bort transaktion">✕</button></td></tr>`).join("")}</tbody></table></div>`
      : emptyState("Inga transaktioner än", "Registrera vad du köpt eller sålt för att få vinstspårning.", `<button class="btn" id="e1">+ Registrera köp</button>`)}
    <div class="row" style="margin-top:20px"><button class="btn ghost sm" id="expCsv">Exportera transaktioner (CSV)</button><label class="btn ghost sm" style="cursor:pointer">Importera CSV<input type="file" id="impCsv" accept=".csv,text/csv" hidden></label>
      <button class="btn ghost sm" id="exp">Exportera allt (backup)</button><label class="btn ghost sm" style="cursor:pointer">Importera backup<input type="file" id="imp" accept=".json" hidden></label>
      <span class="muted small">All data finns bara i din webbläsare – ta backup ibland.</span></div>`;
  $("#tb", body).addEventListener("click", () => tradeModal({ type: "buy", onDone: rerender }));
  $("#ts", body).addEventListener("click", () => tradeModal({ type: "sell", onDone: rerender }));
  $("#e1", body)?.addEventListener("click", () => tradeModal({ type: "buy", onDone: rerender }));
  body.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { if (await confirmBox("Ta bort transaktionen? Vinstberäkningen räknas om.", { ok: "Ta bort", danger: true })) { await del("trades", b.dataset.del); rerender(); } }));
  $("#expCsv", body).addEventListener("click", () => trades.length ? download("cs2hub-transaktioner.csv", tradesToCsv(trades), "text/csv;charset=utf-8") : toast("Inga transaktioner att exportera"));
  $("#impCsv", body).addEventListener("change", async e => { try { const r = await importCsv(await e.target.files[0].text()); toast(`${r.added} transaktioner importerade${r.skipped ? `, ${r.skipped} rader hoppades över` : ""}`); rerender(); } catch (err) { toast("Kunde inte läsa CSV: " + err.message); } });
  $("#exp", body).addEventListener("click", async () => { await backupNow(); toast("Backup sparad som fil"); });
  $("#imp", body).addEventListener("change", async e => {
    try { const data = JSON.parse(await e.target.files[0].text()); if (!await confirmBox("Detta ersätter all lokal data (inventory, transaktioner, loadouts m.m.). Fortsätta?", { ok: "Ersätt", danger: true })) return; await importAll(data); toast("Backup återställd"); rerender(); } catch (err) { toast("Kunde inte läsa filen: " + err.message); }
  });
}

/* ============================ Vinst per föremål ============================ */
function profitTab(body, rows, pos, steamMode) {
  const held = new Map();
  rows.forEach(r => { const h = held.get(r.key) || { qty: 0, vS: 0, vC: 0 }; h.qty += r.qty; h.vS += r.vSteam || 0; h.vC += r.vCash || 0; held.set(r.key, h); });
  const list = [...pos.values()].map(p => {
    const h = held.get(p.key), qty = h?.qty || 0, v = steamMode ? h?.vS : h?.vC;
    const unreal = p.avg != null && p.bought && v != null && qty ? v - p.avg * qty : null;
    return { p, qty, avg: p.avg, unreal, e: lookup(p.mhn)?.e };
  }).sort((a, b) => (b.p.realized + (b.unreal || 0)) - (a.p.realized + (a.unreal || 0)));
  body.innerHTML = list.length ? `<div class="panel scroll-x" style="padding:0"><table class="tbl"><thead><tr><th>Föremål</th><th class="r">Köpt</th><th class="r">Sålt</th><th class="r">Kvar</th><th class="r">Snittinköp</th><th class="r">Realiserat</th><th class="r">Orealiserat</th><th class="r">Totalt</th></tr></thead><tbody>
    ${list.map(x => { const tot = x.p.realized + (x.unreal || 0); return `<tr><td><div class="nm"><span class="rar" style="--rc:${esc(x.e?.rc || "#666")}"></span><div><div class="n2">${esc(x.p.mhn)}</div>${x.p.float != null ? `<div class="n1">float ${dec(x.p.float, 4)}${x.p.seed != null ? " · seed " + x.p.seed : ""}</div>` : ""}</div></div></td><td class="r num">${x.p.bought}</td><td class="r num">${x.p.sold}</td><td class="r num">${x.qty}</td>
      <td class="r num">${x.avg != null && x.qty > 0 ? kr(x.avg) : "–"}</td><td class="r num ${cls(x.p.realized)}">${x.p.sold ? signKr(x.p.realized) : "–"}</td><td class="r num ${cls(x.unreal)}">${x.unreal != null ? signKr(x.unreal) : "–"}</td><td class="r num ${cls(tot)}"><b>${signKr(tot)}</b></td></tr>`; }).join("")}</tbody></table></div>
    <div class="muted small" style="margin-top:8px">Orealiserat räknas mot ${steamMode ? "Steam Market-pris" : "nettoutbetalning i riktiga pengar"}. Snittinköp = glidande genomsnitt över alla köp inklusive avgifter. Realiserat är efter försäljningsavgifter.</div>`
    : emptyState("Ingen vinstdata än", "Registrera köp under fliken Transaktioner, så visas vinst och förlust här.");
}

/* ============================ Analys ============================ */
function analysisTab(body, rows, t, steamMode, charts = "") {
  const vis = rows.filter(r => !r.it.hidden);
  const val = r => (steamMode ? r.vSteam : r.vCash) ?? 0, pl = r => steamMode ? r.plSteam : r.plCash;
  const total = vis.reduce((s, r) => s + val(r), 0);
  if (!vis.length || !total) { body.innerHTML = charts + emptyState("Inget att analysera än", "Analysen visas när du har värderade föremål i ditt inventory."); return; }
  const top = [...vis].sort((a, b) => val(b) - val(a)), top5 = top.slice(0, 5).reduce((s, r) => s + val(r), 0);
  const bar = (label, v, sub = "") => `<div style="margin-bottom:9px"><div class="row spread small"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span><span class="num">${kr(v)} <span class="faint">${dec(v / total * 100, 1)} %</span></span></div><div style="height:4px;background:var(--line);border-radius:2px;margin-top:4px"><div style="height:4px;width:${Math.min(100, v / total * 100).toFixed(1)}%;background:#8a9099;border-radius:2px"></div></div>${sub}</div>`;
  const withCost = vis.filter(r => r.cost && pl(r) != null).map(r => ({ r, p: pl(r), pc: pl(r) / r.cost * 100 }));
  const win = [...withCost].sort((a, b) => b.pc - a.pc).slice(0, 5), lose = [...withCost].sort((a, b) => a.pc - b.pc).slice(0, 5);
  const byRar = {}; vis.forEach(r => { const k = r.rarity || "Okänd"; byRar[k] = (byRar[k] || 0) + val(r); });
  const line = x => `<div class="row spread small" style="padding:5px 0;border-bottom:1px solid var(--line)"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.r.e?.p || x.r.name)}</span><span class="num ${cls(x.p)}">${signKr(x.p)} <span class="faint">${pct(x.pc)}</span></span></div>`;
  body.innerHTML = charts + `<div class="grid cols-2 keep1" style="grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))">
    <div class="panel"><h2>Vad står för värdet?</h2><p class="muted small" style="margin-top:0">De fem största innehaven är <b>${dec(top5 / total * 100, 0)} %</b> av hela värdet (${kr(total)}).</p>${top.slice(0, 10).map(r => bar(esc((r.e?.p || r.name) + (r.qty > 1 ? ` ×${r.qty}` : "")), val(r))).join("")}</div>
    <div class="panel"><h2>Värde per rarity</h2>${Object.entries(byRar).sort((a, b) => b[1] - a[1]).map(([k, v]) => bar(esc(k), v)).join("")}</div>
    <div class="panel"><h2>Bästa investeringar</h2>${win.length ? win.map(line).join("") : '<div class="muted small">Registrera inköp för att se vinst per föremål.</div>'}</div>
    <div class="panel"><h2>Sämsta investeringar</h2>${lose.length ? lose.map(line).join("") : '<div class="muted small">Registrera inköp för att se förlust per föremål.</div>'}</div>
    </div>${t.unpricedItems ? `<div class="panel" style="margin-top:12px"><h2>Saknar prisdata (${t.unpricedItems})</h2><div class="muted small">${vis.filter(r => r.noPrice).slice(0, 30).map(r => esc(r.name)).join(" · ")}</div></div>` : ""}`;
}

/* ============================ Modaler ============================ */
const MARKET_OPTS = ["Steam Market", "Skinport", "CSFloat", "BUFF163", "CS.MONEY", "Swap.gg", "Trade/byte", "Annat"];
const today = () => new Date().toISOString().slice(0, 10);
const numOrNull = v => v === "" || v == null ? null : (Number.isFinite(+v) ? +v : null);

export function addItemModal({ entry = null, mhn = null, onDone = null }) {
  let e = entry || (mhn ? lookup(mhn)?.e : null);
  const done = onDone || rerender;
  modal(`<h3>Lägg till föremål</h3><div id="pk" ${e ? "hidden" : ""}></div><div id="fm"></div>`, {
    wide: true,
    onMount: (m, close) => {
      const form = m.querySelector("#fm");
      const show = () => {
        if (!e) { form.innerHTML = ""; return; }
        const hasWear = !!e.wr?.length;
        form.innerHTML = `<div class="row" style="margin-bottom:12px"><img src="${esc(imgUrl(e.img, "128fx96f"))}" style="width:64px" alt=""><div><b>${esc(e.n + (e.ph ? " · " + e.ph : ""))}</b><div class="muted small" id="px"></div></div><button class="btn ghost sm" id="chg" style="margin-left:auto">Byt</button></div>
        <div class="form">${hasWear ? `<label>Slitage<select class="inp" id="wear">${e.wr.map(w => `<option value="${w}" ${w === "FT" ? "selected" : ""}>${WEAR_LONG[w]}</option>`).join("")}</select></label>` : ""}
        ${e.st || e.sv ? `<label>Variant<select class="inp" id="var"><option value="">Normal</option>${e.st ? '<option value="st">StatTrak™</option>' : ""}${e.sv ? '<option value="sv">Souvenir</option>' : ""}</select></label>` : ""}
        ${hasWear && e.f ? `<label>Float (valfritt)<input class="inp" id="fl" type="number" step="0.00001" min="0" max="1"></label><label>Paint seed (valfritt)<input class="inp" id="sd" type="number" min="0" max="1000"></label>` : ""}
        <label>Antal<input class="inp" id="qty" type="number" min="1" value="1"></label>
        <label class="full" style="grid-auto-flow:column;justify-content:start;align-items:center;gap:8px"><input type="checkbox" id="buy" checked> Registrera inköp samtidigt</label>
        <label class="b">Inköpspris per st (kr)<input class="inp" id="pr" type="number" min="0" step="0.01"></label><label class="b">Datum<input class="inp" id="dt" type="date" value="${today()}"></label>
        <label class="b">Marknadsplats<select class="inp" id="mk">${MARKET_OPTS.map(o => `<option>${o}</option>`).join("")}</select></label><label class="b">Avgift (kr)<input class="inp" id="fee" type="number" min="0" step="0.01" value="0"></label>
        <label class="b">Betalat med<select class="inp" id="pay"><option value="cash">Riktiga pengar</option><option value="steam">Steam-krediter</option></select></label><label class="b">Notering<input class="inp" id="note" placeholder="t.ex. byte mot …"></label></div>
        <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-close>Avbryt</button><button class="btn" id="save">Spara</button></div>`;
        const cur = () => { const v = form.querySelector("#var")?.value; return mhnFor(e, form.querySelector("#wear")?.value || null, { st: v === "st", sv: v === "sv" }); };
        const px = () => { const u = bestUsd(e.wr ? cur() : e.mh); form.querySelector("#px").innerHTML = u ? "Marknadspris: " + kr(usd2sek(u)) : "Marknadspris: " + MISSING; };
        form.querySelectorAll("#wear,#var").forEach(x => x.addEventListener("change", px)); px();
        form.querySelector("#chg").addEventListener("click", () => { e = null; m.querySelector("#pk").hidden = false; show(); });
        form.querySelector("#buy").addEventListener("change", ev => form.querySelectorAll(".b").forEach(x => x.style.display = ev.target.checked ? "" : "none"));
        form.querySelector("#save").addEventListener("click", async () => {
          const name = e.wr ? cur() : e.mh;
          const qty = Math.max(1, Math.floor(+form.querySelector("#qty").value) || 1);
          const fl = numOrNull(form.querySelector("#fl")?.value), sd = numOrNull(form.querySelector("#sd")?.value);
          if (fl != null && e.f && (fl < e.f[0] - 1e-9 || fl > e.f[1] + 1e-9)) return toast(`Floaten måste ligga mellan ${dec(e.f[0], 2)} och ${dec(e.f[1], 2)} för det här skinet.`);
          const items = await all("items");
          let it = items.find(i => i.mhn === name && i.float == null && fl == null && i.source !== "steam");
          if (it) it.qty = (it.qty || 1) + qty;
          else it = { id: uid(), mhn: name, qty: fl != null ? 1 : qty, float: fl, seed: sd, source: "manual", added: Date.now() };
          await put("items", it);
          if (form.querySelector("#buy").checked) {
            const price = +form.querySelector("#pr").value;
            if (price > 0) await put("trades", { id: uid(), type: "buy", mhn: name, qty: fl != null ? 1 : qty, price, fee: +form.querySelector("#fee").value || 0, date: new Date(form.querySelector("#dt").value).getTime() || Date.now(), market: form.querySelector("#mk").value, pay: form.querySelector("#pay").value, float: fl, seed: sd, note: form.querySelector("#note").value, created: Date.now() });
          }
          close(); toast("Tillagd i inventory"); done();
        });
      };
      itemPicker(m.querySelector("#pk"), x => { e = x; m.querySelector("#pk").hidden = true; show(); }).focus();
      show();
    },
  });
}

export async function editItemModal(it, done = rerender) {
  modal(`<h3>Redigera föremål</h3><p class="muted small" style="margin-top:0">${esc(it.mhn)}</p>
    <div class="form"><label>Antal<input class="inp" id="qty" type="number" min="1" value="${it.qty || 1}"></label><label>Float<input class="inp" id="fl" type="number" step="0.00001" value="${it.float ?? ""}"></label>
    <label>Paint seed<input class="inp" id="sd" type="number" value="${it.seed ?? ""}"></label><label>Namntag<input class="inp" id="nt" value="${esc(it.nametag || "")}"></label>
    <label class="full">Anteckning<input class="inp" id="nn" value="${esc(it.note || "")}"></label></div>
    <p class="muted small">Tips: ändrar du float eller seed hör inköp som registrerats utan float inte längre ihop med det här exemplaret. Registrera då ett nytt köp med float.</p>
    <div class="row spread" style="margin-top:16px"><div class="row"><button class="btn ghost danger" id="rm">Ta bort</button><button class="btn ghost" id="hd">${it.hidden ? "Visa" : "Dölj"}</button></div>
    <div class="row"><button class="btn ghost" data-close>Avbryt</button><button class="btn" id="sv">Spara</button></div></div>`, {
    onMount: (m, close) => {
      m.querySelector("#sv").addEventListener("click", async () => { it.qty = Math.max(1, Math.floor(+m.querySelector("#qty").value) || 1); it.float = numOrNull(m.querySelector("#fl").value); it.seed = numOrNull(m.querySelector("#sd").value); it.nametag = m.querySelector("#nt").value; it.note = m.querySelector("#nn").value; await put("items", it); close(); done(); });
      m.querySelector("#hd").addEventListener("click", async () => { it.hidden = !it.hidden; await put("items", it); close(); done(); });
      m.querySelector("#rm").addEventListener("click", async () => { if (await confirmBox("Ta bort föremålet från inventory? Transaktioner behålls.", { ok: "Ta bort", danger: true })) { await del("items", it.id); close(); done(); } });
    },
  });
}

export function tradeModal({ mhn = null, type = "buy", item = null, onDone = null } = {}) {
  let name = mhn;
  const done = onDone || rerender;
  const unit = name ? usd2sek(bestUsd(name)) : null;
  modal(`<h3>${type === "buy" ? "Registrera köp" : "Registrera försäljning"}</h3><div id="pk" ${name ? "hidden" : ""}></div><div id="fm"></div>`, {
    wide: true,
    onMount: (m, close) => {
      const form = m.querySelector("#fm");
      const show = () => {
        if (!name) { form.innerHTML = ""; return; }
        form.innerHTML = `<div class="muted small" style="margin-bottom:10px"><b>${esc(name)}</b> · marknadspris ${unit != null || bestUsd(name) ? kr(usd2sek(bestUsd(name))) : "–"}${bestUsd(name) ? "" : " " + MISSING}</div>
        <div class="form"><label>Typ<select class="inp" id="tp"><option value="buy" ${type === "buy" ? "selected" : ""}>Köp</option><option value="sell" ${type === "sell" ? "selected" : ""}>Sälj</option></select></label><label>Antal<input class="inp" id="qty" type="number" min="1" value="1"></label>
        <label>Pris per st (kr)<input class="inp" id="pr" type="number" min="0" step="0.01" value="${type === "sell" && unit ? unit.toFixed(2) : ""}"></label><label>Avgift totalt (kr)<input class="inp" id="fee" type="number" min="0" step="0.01" value="0"></label>
        <label>Datum<input class="inp" id="dt" type="date" value="${today()}"></label><label>Marknadsplats<select class="inp" id="mk">${MARKET_OPTS.map(o => `<option>${o}</option>`).join("")}</select></label>
        <label>${type === "sell" ? "Fick betalt i" : "Betalade med"}<select class="inp" id="pay"><option value="cash">Riktiga pengar</option><option value="steam">Steam-krediter</option></select></label>
        <label>Notering (t.ex. byten)<input class="inp" id="note"></label>
        <label>Float (om unikt exemplar)<input class="inp" id="fl" type="number" step="0.00001" min="0" max="1" value="${item?.float ?? ""}"></label><label>Paint seed<input class="inp" id="sd" type="number" min="0" max="1000" value="${item?.seed ?? ""}"></label>
        <label class="full" style="grid-auto-flow:column;justify-content:start;align-items:center;gap:8px"><input type="checkbox" id="sync" checked> Uppdatera inventory (lägg till/ta bort föremålet)</label></div>
        <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-close>Avbryt</button><button class="btn" id="save">Spara</button></div>`;
        form.querySelector("#save").addEventListener("click", async () => {
          const tp = form.querySelector("#tp").value, qty = Math.max(1, Math.floor(+form.querySelector("#qty").value) || 1), price = +form.querySelector("#pr").value;
          if (form.querySelector("#pr").value === "" || !(price >= 0)) return toast("Ange pris");
          const fl = numOrNull(form.querySelector("#fl").value), sd = numOrNull(form.querySelector("#sd").value);
          await put("trades", { id: uid(), type: tp, mhn: name, qty, price, fee: +form.querySelector("#fee").value || 0, date: new Date(form.querySelector("#dt").value).getTime() || Date.now(), market: form.querySelector("#mk").value, pay: form.querySelector("#pay").value, float: fl, seed: sd, note: form.querySelector("#note").value, created: Date.now() });
          if (form.querySelector("#sync").checked) {
            const items = await all("items");
            if (tp === "buy") {
              const it = items.find(i => i.mhn === name && posKey(name, i.float, i.seed) === posKey(name, fl, sd) && i.source !== "steam");
              if (it) { it.qty = (it.qty || 1) + qty; await put("items", it); } else await put("items", { id: uid(), mhn: name, qty, float: fl, seed: sd, source: "manual", added: Date.now() });
            } else {
              let left = qty;
              const mine = (item ? [items.find(i => i.id === item.id)] : []).concat(items.filter(i => i.mhn === name && (!item || i.id !== item.id))).filter(Boolean);
              for (const it of mine) { if (left <= 0) break; const take = Math.min(left, it.qty || 1); left -= take; if ((it.qty || 1) - take <= 0) await del("items", it.id); else { it.qty -= take; await put("items", it); } }
            }
          }
          close(); toast("Transaktion sparad"); done();
        });
      };
      itemPicker(m.querySelector("#pk"), x => { name = x.wr ? mhnFor(x, x.wr.includes("FT") ? "FT" : x.wr[0] || null) : x.mh; m.querySelector("#pk").hidden = true; show(); }).focus();
      show();
    },
  });
}

export { steamImportModal };
