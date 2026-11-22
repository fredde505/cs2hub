import { $, esc, imgUrl, krUsd, usd2sek, kr, krm, dec, MISSING, WEARS, WEAR_LONG, WEAR_RANGE, COLORS, COLOR_LABEL, rarityOrder, debounce, lineChart, pct, cls, fmtDate, fmtDateTime, ago } from "../util.js";
import { D, MARKETS, fromPrice, mhnFor, priceRow, pricesByWear, bestUsd, steamUsd, cashUsd, marketUrl, priceInfo, priceTip } from "../data.js";
import { itemCard, pageHead, KINDS, KIND_LABEL, priceNote, emptyState } from "./common.js";
import { addItemModal } from "./inventory.js";
import { addWatch } from "./watchlist.js";
import { addToCompare } from "./compare.js";

const PAGE = 60;
const F = { kind: "weapon", q: "", weapon: "", rarity: "", tour: "", pmin: "", pmax: "", st: false, sv: false, priced: "", sort: "name" };

function pool(kind) {
  if (kind === "collection") return D.collections;
  return D.catalog.filter(e => e.kind === kind);
}

/** Global sök: nollställ filter och hoppa till första kategorin som har träffar. */
export function searchDatabase(q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  Object.assign(F, { q, weapon: "", rarity: "", tour: "", pmin: "", pmax: "", st: false, sv: false, priced: "" });
  const hit = KINDS.find(k => k.k !== "collection" && D.catalog.some(e => e.kind === k.k && terms.every(t => (e.n + " " + (e.w || "")).toLowerCase().includes(t))))
    || (D.collections.some(c => terms.every(t => c.n.toLowerCase().includes(t))) ? { k: "collection" } : null);
  F.kind = hit ? hit.k : "weapon";
  if (location.hash.startsWith("#/database")) { location.hash = "#/database/" + F.kind; window.dispatchEvent(new HashChangeEvent("hashchange")); }
  else location.hash = "#/database/" + F.kind;
}

export function renderList(root, params = {}) {
  if (params.kind) F.kind = params.kind;
  if (params.q !== undefined) F.q = params.q;
  root.innerHTML = `${pageHead("Database", "Hela CS2:s item-schema – skins, knivar, handskar, stickers, charms, agents, cases, capsules, music kits, patches, graffiti och samlingar.")}
  <div class="tabs" id="kt">${KINDS.map(k => `<button data-k="${k.k}" class="${F.kind === k.k ? "on" : ""}">${k.label}</button>`).join("")}</div>
  <div class="toolbar" id="filters"></div>
  <div class="muted small" id="count" style="margin-bottom:10px"></div>
  <div class="cards" id="grid"></div><button class="btn ghost more" id="more" hidden>Visa fler</button>
  <p class="muted small" style="margin-top:14px">${esc(priceNote())} "från" = billigaste slitaget.</p>`;
  root.querySelectorAll("#kt button").forEach(b => b.addEventListener("click", () => { F.kind = b.dataset.k; F.weapon = F.rarity = F.tour = F.pmin = F.pmax = F.priced = ""; F.st = F.sv = false; renderList(root); }));
  const fl = $("#filters", root);
  const items = pool(F.kind);
  const weapons = [...new Set(items.map(e => e.w).filter(Boolean))].sort();
  const rarities = [...new Set(items.map(e => e.r).filter(Boolean))].sort((a, b) => rarityOrder.indexOf(a) - rarityOrder.indexOf(b));
  const tours = F.kind === "sticker" ? [...new Set(items.map(e => e.tn).filter(Boolean))].sort().reverse() : [];
  const sel = (id, label, opts, val) => `<select class="inp" id="${id}"><option value="">${label}</option>${opts.map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  if (F.kind === "collection") {
    fl.innerHTML = `<input class="inp" id="fq" placeholder="Sök samling…" value="${esc(F.q)}">`;
  } else {
    fl.innerHTML = `<input class="inp" id="fq" placeholder="Sök namn…" value="${esc(F.q)}">
      ${weapons.length > 1 ? sel("fw", "Alla vapen", weapons, F.weapon) : ""}${rarities.length > 1 ? sel("fr", "Alla rarities", rarities, F.rarity) : ""}${tours.length ? sel("ft", "Alla turneringar", tours, F.tour) : ""}
      <input class="inp" id="fpmin" type="number" min="0" placeholder="Min kr" style="width:92px" value="${esc(F.pmin)}"><input class="inp" id="fpmax" type="number" min="0" placeholder="Max kr" style="width:92px" value="${esc(F.pmax)}">
      ${["weapon", "knife", "glove"].includes(F.kind) ? `<label class="chip ${F.st ? "on" : ""}" id="fst">StatTrak™</label>` : ""}${F.kind === "weapon" ? `<label class="chip ${F.sv ? "on" : ""}" id="fsv">Souvenir</label>` : ""}
      <select class="inp" id="fpr" aria-label="Prisstatus"><option value="">Alla (med och utan pris)</option><option value="has" ${F.priced === "has" ? "selected" : ""}>Har prisdata</option><option value="none" ${F.priced === "none" ? "selected" : ""}>Saknar prisdata</option></select>
      <select class="inp" id="fs" aria-label="Sortera">${[["name", "Namn A–Ö"], ["pa", "Billigast först"], ["pd", "Dyrast först"], ["rar", "Rarity (högst först)"]].map(([v, l]) => `<option value="${v}" ${F.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  }
  const bind = (id, key, ev = "input") => { const el = $("#" + id, root); el && el.addEventListener(ev, debounce(() => { F[key] = el.value; draw(); }, 140)); };
  bind("fq", "q"); bind("fw", "weapon", "change"); bind("fr", "rarity", "change"); bind("ft", "tour", "change"); bind("fpmin", "pmin"); bind("fpmax", "pmax"); bind("fs", "sort", "change"); bind("fpr", "priced", "change");
  const st = $("#fst", root); st && st.addEventListener("click", () => { F.st = !F.st; st.classList.toggle("on", F.st); draw(); });
  const sv = $("#fsv", root); sv && sv.addEventListener("click", () => { F.sv = !F.sv; sv.classList.toggle("on", F.sv); draw(); });

  let shown = PAGE, list = [];
  function draw() {
    shown = PAGE;
    const q = F.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pmin = F.pmin !== "" ? +F.pmin / usd2sek(1) : null, pmax = F.pmax !== "" ? +F.pmax / usd2sek(1) : null;
    list = items.filter(e => {
      if (q.length) { const s = (e.n + " " + (e.w || "") + " " + (e.tn || "")).toLowerCase(); if (!q.every(t => s.includes(t))) return false; }
      if (F.weapon && e.w !== F.weapon) return false;
      if (F.rarity && e.r !== F.rarity) return false;
      if (F.tour && e.tn !== F.tour) return false;
      if (F.st && !e.st) return false;
      if (F.sv && !e.sv) return false;
      if (F.priced) { const has = fromPrice(e) != null; if ((F.priced === "has") !== has) return false; }
      if (pmin != null || pmax != null) { const p = fromPrice(e); if (p == null) return false; if (pmin != null && p < pmin) return false; if (pmax != null && p > pmax) return false; }
      return true;
    });
    const key = F.sort;
    if (key === "pa" || key === "pd") list.sort((a, b) => ((fromPrice(a) ?? (key === "pa" ? 1e9 : -1)) - (fromPrice(b) ?? (key === "pa" ? 1e9 : -1))) * (key === "pa" ? 1 : -1));
    else if (key === "rar") list.sort((a, b) => rarityOrder.indexOf(b.r) - rarityOrder.indexOf(a.r) || a.n.localeCompare(b.n));
    else list.sort((a, b) => a.n.localeCompare(b.n, "en"));
    paint();
  }
  function paint() {
    $("#count", root).textContent = `${list.length.toLocaleString("sv-SE")} föremål`;
    const g = $("#grid", root);
    g.innerHTML = list.length ? list.slice(0, shown).map(e => F.kind === "collection" ? collectionCard(e) : itemCard(e)).join("") : `<div style="grid-column:1/-1">${emptyState("Inga föremål matchar", "Prova att ta bort något filter eller söka på något annat.")}</div>`;
    $("#more", root).hidden = shown >= list.length;
  }
  $("#more", root).addEventListener("click", () => { shown += PAGE; paint(); });
  draw();
}

function collectionCard(c) {
  const skins = c.items.map(id => D.byId.get(id)).filter(Boolean);
  const imgs = skins.slice(0, 3).map(s => `<img loading="lazy" src="${esc(imgUrl(s.img, "128fx96f"))}" style="width:33%;height:60px;object-fit:contain" alt="">`).join("");
  return `<a class="card" href="#/collection/${esc(c.id)}"><div class="im" style="aspect-ratio:auto;padding:14px 8px;display:flex">${imgs || ""}</div><div class="bar" style="--rc:#555"></div><div class="bd"><div class="t1">${c.items.length} föremål</div><div class="t2">${esc(c.n)}</div><div class="pr faint">${esc(c.rd || "")}</div></div></a>`;
}

/* ------------------------------ Detaljsida ------------------------------ */
export function renderItem(root, id) {
  const e = D.byId.get(id);
  if (!e) { root.innerHTML = `<div class="empty">Föremålet hittades inte. <a href="#/database" style="text-decoration:underline">Till databasen</a></div>`; return; }
  const isSkin = !!e.wr;
  const back = `<a class="muted small" href="#/database/${e.kind}">← ${esc(KIND_LABEL[e.kind] || "Database")}</a>`;
  const head = `<div class="detail-grid grid" style="grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:20px;align-items:start">
    <div><div class="hero-img"><img src="${esc(imgUrl(e.img, "512fx384f"))}" alt="${esc(e.n)}"></div></div>
    <div>
      <div class="muted small">${esc(e.w || KIND_LABEL[e.kind] || "")}</div>
      <h1 style="font-size:24px;margin-bottom:6px">${esc((e.p ? `${e.w} | ${e.p}` : e.n) + (e.ph ? " · " + e.ph : ""))}</h1>
      <div class="row" style="margin-bottom:12px"><span class="chip on" style="border-color:${esc(e.rc)};color:var(--text)"><i class="dot" style="background:${esc(e.rc)}"></i>${esc(e.r || "–")}</span>
        ${e.st ? `<span class="chip">StatTrak™ finns</span>` : ""}${e.sv ? `<span class="chip">Souvenir finns</span>` : ""}
        ${e.c1 ? `<span class="chip"><i class="dot" style="background:${esc(e.hx)}"></i>${esc(COLOR_LABEL[e.c1])}${e.c2 ? " / " + esc(COLOR_LABEL[e.c2]) : ""}${e.mc ? " · multicolor" : ""}</span>` : ""}</div>
      ${e.d ? `<p class="muted" style="margin:0 0 14px;white-space:pre-line">${esc(e.d.replace(/<[^>]+>/g, ""))}</p>` : ""}
      ${priceOverview(e)}
      ${isSkin && e.f ? floatBlock(e) : ""}
      <dl class="kv panel" style="margin:12px 0">${detailRows(e)}</dl>
      <div class="row"><button class="btn" id="addInv">+ Lägg i inventory</button><button class="btn ghost" id="addWatch">☆ Bevaka pris</button><button class="btn ghost" id="addCmp">⇄ Jämför</button>${isSkin ? `<a class="btn ghost" href="#/inspect/${esc(e.id)}">◎ Float-simulator</a>${e.wr.length ? `<a class="btn ghost" href="#/workshop/${esc(wsToken(e))}">✦ Testa stickers</a>` : ""}` : ""}</div>
    </div></div>`;
  let body = "";
  body += isSkin ? priceSection(e) : simplePrice(e);
  body += contentsSection(e);
  body += relatedSection(e);
  root.innerHTML = `${back}<div style="height:10px"></div>${head}<hr>${body}`;
  $("#addInv", root).addEventListener("click", () => addItemModal({ entry: e }));
  $("#addCmp", root).addEventListener("click", () => addToCompare(e.id));
  $("#addWatch", root).addEventListener("click", () => addWatch(isSkin ? mhnFor(e, e.wr[2] || e.wr[0] || null) : e.mh));
  const tg = root.querySelectorAll("[data-st]");
  tg.forEach(b => b.addEventListener("click", () => { root.querySelector("#priceBox").innerHTML = priceTable(e, b.dataset.st === "1"); tg.forEach(x => x.classList.toggle("on", x === b)); }));
}

const wsToken = e => btoa(unescape(encodeURIComponent(JSON.stringify({ s: e.id, w: e.wr.includes("FT") ? "FT" : e.wr[0], st: [] })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const PATTERN_TAB = { "Case Hardened": ["ch", "Blue Gem-procent per seed"], "Heat Treated": ["ch", "Blue Gem-procent per seed"], Fade: ["fade", "Fade-procent per seed"], "Amber Fade": ["fade", "Fade-procent per seed"], "Acid Fade": ["fade", "Fade-procent per seed"], Doppler: ["dop", "fasen avgörs av paint index"], "Gamma Doppler": ["dop", "fasen avgörs av paint index"] };

/** Samlad prisöversikt: billigast, Steam, netto och hur gammal prisdatan är. */
function priceOverview(e) {
  const variants = e.wr ? (e.wr.length ? e.wr : [null]).map(w => mhnFor(e, w)) : [e.mh];
  let best = null, steam = null;
  for (const mhn of variants) {
    const i = priceInfo(mhn); if (i && (!best || i.usd < best.i.usd)) best = { i, mhn };
    const s = steamUsd(mhn); if (s && (steam == null || s < steam)) steam = s;
  }
  const stMin = e.wr && e.st ? Math.min(...e.wr.map(w => bestUsd(mhnFor(e, w, { st: true }))).filter(Boolean), Infinity) : Infinity;
  const svMin = e.wr && e.sv ? Math.min(...e.wr.map(w => bestUsd(mhnFor(e, w, { sv: true }))).filter(Boolean), Infinity) : Infinity;
  const net = best ? cashUsd(best.mhn) : null;
  const stale = D.priceAge && Date.now() - D.priceAge > 36 * 3600e3;
  const when = D.priceAge ? `${fmtDateTime(D.priceAge)} (${ago(D.priceAge)})` : "okänt";
  const mini = (l, v, s = "") => `<div><div class="muted small">${l}</div><div class="num" style="font-size:17px;font-weight:600">${v}</div>${s ? `<div class="muted small">${s}</div>` : ""}</div>`;
  return `<div class="panel" style="margin:12px 0"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px">
    ${mini("Billigast just nu", best ? krUsd(best.i.usd) : MISSING, best ? `${esc(best.i.name)}${e.wr?.length > 1 ? " · lägsta slitage-pris" : ""}` : "ingen prisdata")}
    ${mini("Du får ut (netto)", net ? krUsd(net) : "–", "efter avgift, riktiga pengar")}
    ${mini("Steam Market", steam ? krUsd(steam) : "–", "Steam-krediter")}
    ${stMin < Infinity ? mini("StatTrak™ från", krUsd(stMin)) : ""}${svMin < Infinity ? mini("Souvenir från", krUsd(svMin)) : ""}</div>
    <div class="muted small" style="margin-top:10px">Pris = lägsta utropspris (listning), inte genomförd försäljning. Prisdata från ${esc(when)}.${stale ? ' <b class="neg">Priserna kan vara gamla.</b>' : ""}</div></div>`;
}

function detailRows(e) {
  const rows = [];
  if (e.f) rows.push(["Float-intervall", `${dec(e.f[0], 2)} – ${dec(e.f[1], 2)}`]);
  if (PATTERN_TAB[e.p]) { const [t, d] = PATTERN_TAB[e.p]; rows.push(["Mönster", `<a href="#/patterns/${t}/${encodeURIComponent(e.w || "")}" style="text-decoration:underline">Öppna i Pattern Explorer</a> <span class="faint small">(${d})</span>`]); }
  if (e.wr?.length) rows.push(["Slitagegrader", e.wr.join(" · ")]);
  if (e.cn?.length) rows.push(["Samling", e.col.map((id, i) => `<a href="#/collection/${esc(id)}" style="text-decoration:underline">${esc(e.cn[i])}</a>`).join(", ")]);
  if (e.t) rows.push(["Team", { both: "Båda", terrorists: "Terrorist", counter_terrorists: "Counter-Terrorist" }[e.t] || e.t]);
  if (e.pi) rows.push(["Paint index", e.pi]);
  if (e.tn) rows.push(["Turnering", esc(e.tn)]);
  if (e.ct) rows.push(["Typ", esc(e.ct)]);
  if (e.fs) rows.push(["Första försäljning", esc(e.fs)]);
  return rows.map(([k, v]) => `<dt>${k}</dt><dd class="num">${v}</dd>`).join("") || `<dt>ID</dt><dd>${esc(e.id)}</dd>`;
}

function floatBlock(e) {
  const [mn, mx] = e.f;
  const bands = WEARS.filter(w => e.wr.includes(w));
  return `<div class="panel"><div class="row spread"><b>Float</b><span class="muted small num">${mn} – ${mx}</span></div>
    <div class="fbar"><i style="left:${mn * 100}%;width:${Math.max((mx - mn) * 100, 0.8)}%"></i></div>
    <div class="fscale"><span>0,00</span><span>0,07</span><span>0,15</span><span>0,38</span><span>0,45</span><span>1,00</span></div>
    <div class="chips" style="margin-top:10px">${bands.map(w => { const [a, b] = WEAR_RANGE[w]; return `<span class="chip">${w} ${dec(Math.max(a, mn), 2)}–${dec(Math.min(b, mx), 2)}</span>`; }).join("")}</div></div>`;
}

const MARKET_ORDER = ["skinport", "csfloat", "csmoney", "buff163", "swapgg", "steam"]; // Steam sist – det är oftast dyrast
function priceTable(e, st) {
  const rows = pricesByWear(e, { st });
  const ms = MARKET_ORDER.map(k => MARKETS.find(m => m.key === k));
  return `<div class="scroll-x"><table class="tbl"><thead><tr><th>Slitage</th><th class="r">Billigast</th>${ms.map(m => `<th class="r">${m.name}</th>`).join("")}<th class="r">Du får ut (netto)</th></tr></thead><tbody>
    ${rows.map(r => {
      const vals = ms.map(m => r.row?.[m.key]);
      let best = null; // billigast bland marknader man faktiskt kan köpa på (BUFF163 utelämnas)
      ms.forEach((m, i) => { if (m.real && m.key !== "buff163" && vals[i] && (!best || vals[i] < best.p)) best = { p: vals[i], m }; });
      const link = best && marketUrl(best.m.key, r.mhn);
      const cheapest = best ? `<b>${krUsd(best.p)}</b><div class="small">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="text-decoration:underline">${esc(best.m.name)} ↗</a>` : esc(best.m.name)}</div>` : MISSING;
      return `<tr><td><b>${r.wear ? WEAR_LONG[r.wear] : "–"}</b></td><td class="r num">${cheapest}</td>${vals.map((v, i) => `<td class="r num" style="${best && v === best.p && ms[i] === best.m ? "font-weight:700" : ""}${ms[i].key === "steam" ? ";color:var(--muted)" : ""}">${v ? krUsd(v) : '<span class="faint">–</span>'}</td>`).join("")}<td class="r num">${krUsd(cashUsd(r.mhn))}</td></tr>`;
    }).join("")}</tbody></table></div><div class="muted small" style="margin-top:8px">Billigast = lägsta pris bland riktiga marknadsplatser (BUFF163 räknas inte, svårtillgänglig). Steam-priset är oftast högst eftersom Steam-krediter inte går att ta ut. Netto = vad du får efter avgift när du säljer på Skinport eller CSFloat.</div>`;
}

function priceSection(e) {
  const mid = e.wr.includes("FT") ? "FT" : e.wr[Math.floor(e.wr.length / 2)] || null; // vanilla-knivar saknar slitage
  const mhn = mhnFor(e, mid);
  const tr = D.trend.get(mhn);
  const chart = tr ? lineChart([{ x: Date.now() - 90 * 864e5, y: tr[3] }, { x: Date.now() - 30 * 864e5, y: tr[2] }, { x: Date.now() - 7 * 864e5, y: tr[1] }, { x: Date.now(), y: tr[0] ?? tr[1] }].filter(p => p.y != null).map(p => ({ x: p.x, y: usd2sek(p.y) })), { fmt: v => kr(v) }) : `<div class="empty small">Steam-historik laddas när live-priser hämtats.</div>`;
  return `<div class="grid cols-2 keep1" style="grid-template-columns:minmax(0,1fr)"><div class="panel"><div class="row spread"><h2 style="margin:0">Prisjämförelse</h2>
    ${e.st ? `<div class="seg"><button class="on" data-st="0">Normal</button><button data-st="1">StatTrak™</button></div>` : ""}</div><div style="height:10px"></div><div id="priceBox">${priceTable(e, false)}</div></div>
    <div class="panel"><h2>Prisutveckling · ${mid ? WEAR_LONG[mid] : esc(e.n)} (Steam, 90 dagar)</h2>${chart}</div></div>`;
}

function simplePrice(e) {
  const row = priceRow(e.mh);
  if (!row) return `<div class="panel"><h2>Pris</h2><div class="muted">Ingen prisdata hittades för detta föremål.</div></div>`;
  return `<div class="panel"><h2>Prisjämförelse</h2><table class="tbl"><tbody>${MARKETS.map(m => `<tr><td>${m.name}</td><td class="r num">${row[m.key] ? krUsd(row[m.key]) : "–"}</td></tr>`).join("")}</tbody></table></div>`;
}

function contentsSection(e) {
  if (e.kind !== "case" && e.kind !== "capsule") return "";
  const ids = [...(e.ci || []), ...(e.cx || [])];
  if (!ids.length) return "";
  const items = ids.map(id => D.byId.get(id)).filter(Boolean);
  const rare = (e.cx || []).length;
  return `<h2 style="margin-top:22px">Innehåll (${ids.length})</h2><div class="cards">${items.slice(0, 80).map(x => itemCard(x)).join("")}</div>${rare ? `<p class="muted small">Inkluderar ${rare} sällsynta föremål (knivar/handskar).</p>` : ""}`;
}

function relatedSection(e) {
  let rel = [];
  if (e.col?.length) { const c = D.colById.get(e.col[0]); rel = (c?.items || []).map(id => D.byId.get(id)).filter(x => x && x.id !== e.id); }
  if (e.wr && rel.length < 6) rel = rel.concat(D.skins.filter(s => s.w === e.w && s.id !== e.id && !rel.includes(s)).slice(0, 12));
  if (!rel.length) return "";
  return `<h2 style="margin-top:22px">Relaterade föremål</h2><div class="cards">${rel.slice(0, 12).map(x => itemCard(x)).join("")}</div>`;
}

/* ------------------------------ Samling ------------------------------ */
export function renderCollection(root, id) {
  const c = D.colById.get(id);
  if (!c) { root.innerHTML = `<div class="empty">Samlingen hittades inte.</div>`; return; }
  const items = c.items.map(i => D.byId.get(i)).filter(Boolean);
  const order = r => rarityOrder.indexOf(r);
  items.sort((a, b) => order(b.r) - order(a.r) || a.n.localeCompare(b.n));
  root.innerHTML = `<a class="muted small" href="#/database/collection">← Samlingar</a>${pageHead(c.n, `${items.length} föremål${c.rd ? " · " + c.rd : ""}`)}<div class="cards">${items.map(x => itemCard(x)).join("")}</div>`;
}
