import { $, $$, esc, imgUrl, kr, krm, dec, usd2sek, modal, toast, uid, WEARS, WEAR_LONG, COLORS, COLOR_LABEL, debounce, confirmBox, copyText, MISSING } from "../util.js";
import { all, put, del } from "../store.js";
import { D, mhnFor, bestUsd, priceInfo, priceTip } from "../data.js";
import { pageHead, dispName, emptyState, priceNote } from "./common.js";
import { encodeShare, decodeShare } from "./share.js";
import { openCardModal } from "./card.js";

/* Riktiga CS2-platser: varje vapen har sin egen skin per sida. Kniv, handskar och agent är egna platser. */
const SIDE = { ct: "counter-terrorists", t: "terrorists" };
const SIDE_LABEL = { ct: "Counter-Terrorist", t: "Terrorist" };
const GROUPS = {
  ct: [["Kniv, handskar & agent", ["knife", "glove", "agent"]],
    ["Pistoler", ["P2000", "USP-S", "P250", "Five-SeveN", "CZ75-Auto", "Desert Eagle", "R8 Revolver", "Dual Berettas"]],
    ["SMG", ["MP9", "MP7", "MP5-SD", "UMP-45", "P90", "PP-Bizon"]],
    ["Tunga vapen", ["Nova", "XM1014", "MAG-7", "M249", "Negev"]],
    ["Gevär", ["M4A4", "M4A1-S", "FAMAS", "AUG", "SSG 08", "AWP", "SCAR-20"]],
    ["Utrustning", ["Zeus x27"]]],
  t: [["Kniv, handskar & agent", ["knife", "glove", "agent"]],
    ["Pistoler", ["Glock-18", "P250", "Tec-9", "CZ75-Auto", "Desert Eagle", "R8 Revolver", "Dual Berettas"]],
    ["SMG", ["MAC-10", "MP7", "MP5-SD", "UMP-45", "P90", "PP-Bizon"]],
    ["Tunga vapen", ["Nova", "XM1014", "Sawed-Off", "M249", "Negev"]],
    ["Gevär", ["AK-47", "Galil AR", "SG 553", "SSG 08", "AWP", "G3SG1"]],
    ["Utrustning", ["Zeus x27"]]],
};
const SPECIAL = { knife: "Kniv", glove: "Handskar", agent: "Agent" };
const slotLabel = k => SPECIAL[k] || k;
const slotsOf = side => GROUPS[side].flatMap(g => g[1]);
// Hur mycket av en budget varje plats får i Budget Challenge (relativ vikt)
const WEIGHT = { knife: 26, glove: 18, "AK-47": 10, "M4A4": 7, "M4A1-S": 7, AWP: 10, "Desert Eagle": 4, "USP-S": 3, "Glock-18": 3, "P2000": 2, agent: 2 };
const wt = k => WEIGHT[k] ?? 1;

let cur = null, saved = [], items = [], root, ownedMhn = new Set(), ownedSkin = new Set();
const fresh = side => ({ id: uid(), name: "Ny loadout", side, slots: {}, theme: "", created: Date.now() });
const defWear = s => s.wr.includes("FT") ? "FT" : s.wr.find(w => bestUsd(mhnFor(s, w))) || s.wr[0] || null;
const entryOf = sel => sel && D.byId.get(sel.id);
const mhnOf = (e, sel) => e.wr ? mhnFor(e, sel.wear, { st: !!sel.st }) : e.mh;

function poolFor(slot, side) {
  if (slot === "agent") return D.other.filter(o => o.ty === "agent" && o.t === SIDE[side]);
  if (slot === "knife") return D.skins.filter(s => s.k === "knife");
  if (slot === "glove") return D.skins.filter(s => s.k === "glove");
  return D.skins.filter(s => s.w === slot && s.k === "weapon" && (s.t === "both" || s.t === SIDE[side]));
}

function calc(lo) {
  let total = 0, toBuy = 0, ownedVal = 0, filled = 0, missingPrice = 0, ownedCount = 0, themed = 0, themable = 0;
  const rows = slotsOf(lo.side).map(k => {
    const sel = lo.slots[k], e = entryOf(sel);
    if (!e) return { k };
    filled++;
    const mhn = mhnOf(e, sel), info = priceInfo(mhn), p = info ? usd2sek(info.usd) : null, has = ownedMhn.has(mhn);
    if (p == null) missingPrice++; else { total += p; if (has) ownedVal += p; else toBuy += p; }
    if (has) ownedCount++;
    if (lo.theme && k !== "agent") { themable++; if (e.c1 === lo.theme || e.c2 === lo.theme) themed++; }
    return { k, sel, e, mhn, p, info, has, otherWear: !has && ownedSkin.has(e.id) };
  });
  return { rows, total, toBuy, ownedVal, filled, missingPrice, ownedCount, themed, themable, slots: rows.length };
}

export async function renderLoadout(host, args = []) {
  root = host;
  const [loadouts, its] = await Promise.all([all("loadouts"), all("items")]);
  saved = loadouts.sort((a, b) => b.created - a.created); items = its;
  ownedMhn = new Set(its.map(i => i.mhn));
  ownedSkin = new Set(its.map(i => D.mhn.get(i.mhn)?.e?.id).filter(Boolean));
  if (args[0]) { try { cur = cleanShared(await decodeShare(args[0])); toast("Delad loadout öppnad – spara om du vill behålla den."); } catch { toast("Länken till loadouten är trasig."); } }
  if (!cur) cur = saved[0] ? structuredClone(saved[0]) : fresh("ct");
  draw();
}

/** Delad data är opålitlig: tvätta till giltiga typer. */
function cleanShared(d) {
  const side = d?.side === "t" ? "t" : "ct", slots = {}, valid = new Set(slotsOf(side));
  for (const [k, v] of Object.entries(d?.slots || {})) {
    if (!valid.has(k) || !v || typeof v.id !== "string" || !D.byId.has(v.id)) continue;
    slots[k] = { id: v.id, wear: WEARS.includes(v.wear) ? v.wear : null, st: !!v.st };
  }
  return { id: uid(), name: typeof d?.name === "string" ? d.name.slice(0, 60) : "Delad loadout", side, slots, theme: COLORS[d?.theme] ? d.theme : "", created: Date.now() };
}

function draw() {
  const c = calc(cur), isSaved = saved.some(s => s.id === cur.id);
  root.innerHTML = `${pageHead("Loadout Builder", "Bygg en komplett utrustning med CS2:s riktiga vapenplatser för Counter-Terrorist och Terrorist. Se kostnad, vad du äger och vad som saknas.")}
  <div class="toolbar">
    <div class="seg" id="sideSeg"><button data-s="ct" class="${cur.side === "ct" ? "on" : ""}">Counter-Terrorist</button><button data-s="t" class="${cur.side === "t" ? "on" : ""}">Terrorist</button></div>
    <input class="inp" id="nm" value="${esc(cur.name)}" style="min-width:180px" aria-label="Namn på loadout">
    <select class="inp" id="sv" aria-label="Sparade loadouts"><option value="">Sparade loadouts (${saved.length})</option>${saved.map(s => `<option value="${esc(s.id)}" ${s.id === cur.id ? "selected" : ""}>${esc(s.name)} · ${s.side.toUpperCase()}</option>`).join("")}</select>
    <button class="btn" id="save">Spara</button><button class="btn ghost" id="new">Ny</button><button class="btn ghost" id="dup">Spara som kopia</button>${isSaved ? `<button class="btn ghost danger" id="rm">Ta bort</button>` : ""}<button class="btn ghost" id="shr">Dela</button><button class="btn ghost" id="shimg">Dela som bild</button>
  </div>
  <div class="grid split" style="grid-template-columns:minmax(0,3fr) minmax(0,1.25fr);align-items:start">
    <div id="slots">${GROUPS[cur.side].map(([title, keys]) => `<h2 style="margin:18px 0 8px">${esc(title)}</h2><div class="cards">${keys.map(k => slotCard(c.rows.find(r => r.k === k))).join("")}</div>`).join("")}</div>
    <div class="grid" style="position:sticky;top:70px">
      <div class="panel"><h2>Kostnad</h2>
        <dl class="kv"><dt>Utrustade platser</dt><dd class="num">${c.filled} / ${c.slots}</dd><dt>Totalt värde</dt><dd class="num"><b>${kr(c.total)}</b></dd><dt>Äger redan (${c.ownedCount})</dt><dd class="num pos">${kr(c.ownedVal)}</dd><dt>Att köpa</dt><dd class="num"><b>${kr(c.toBuy)}</b></dd>
        ${cur.theme ? `<dt>Färgmatchning</dt><dd class="num">${c.themable ? dec(c.themed / c.themable * 100, 0) + " %" : "–"} <span class="faint small">(${c.themed}/${c.themable})</span></dd>` : ""}</dl>
        ${c.missingPrice ? `<p class="small" style="margin:8px 0 0"><span class="miss">Pris saknas</span> <span class="muted">för ${c.missingPrice} plats${c.missingPrice > 1 ? "er" : ""} – de ingår inte i summan.</span></p>` : ""}
        <div class="row" style="margin-top:12px"><button class="btn ghost sm" id="list">Inköpslista</button><button class="btn ghost sm" id="cmp">Jämför</button><button class="btn ghost sm" id="clr">Töm</button></div></div>
      <div class="panel"><h2>Färgtema</h2><select class="inp" id="theme" style="width:100%" aria-label="Färgtema"><option value="">Inget tema</option>${Object.keys(COLORS).filter(k => !["black", "white", "gray", "brown"].includes(k)).map(k => `<option value="${k}" ${cur.theme === k ? "selected" : ""}>${COLOR_LABEL[k]}</option>`).join("")}</select>
        <p class="muted small" style="margin-bottom:0">Visar hur stor del av dina skins som matchar färgen.</p></div>
      <div class="panel"><h2>Budget Loadout Challenge</h2>
        <p class="muted small" style="margin-top:0">Fyll loadouten automatiskt med så fina skins i vald färg som budgeten räcker till – så komplett som möjligt.</p>
        <div class="form"><label>Färg<select class="inp" id="bc">${Object.keys(COLORS).filter(k => !["black", "white", "gray", "brown"].includes(k)).map(k => `<option value="${k}" ${k === (cur.theme || "blue") ? "selected" : ""}>${COLOR_LABEL[k]}</option>`).join("")}</select></label>
        <label>Budget (kr)<input class="inp" id="bb" type="number" min="100" value="2000"></label>
        <label class="full" style="grid-auto-flow:column;justify-content:start;align-items:center;gap:8px"><input type="checkbox" id="bo"> Räkna mina ägda skins som gratis</label></div>
        <button class="btn" id="go" style="margin-top:12px">Skapa loadout</button><div class="muted small" id="goRes" style="margin-top:8px" role="status"></div></div>
    </div></div>
  <p class="muted small" style="margin-top:14px">${esc(priceNote())}</p>`;
  $$("#sideSeg button", root).forEach(b => b.addEventListener("click", () => { if (cur.side === b.dataset.s) return; cur.side = b.dataset.s; const ok = new Set(slotsOf(cur.side)); for (const k of Object.keys(cur.slots)) { if (!ok.has(k)) { delete cur.slots[k]; continue; } const e = entryOf(cur.slots[k]); if (e && e.t && e.t !== "both" && e.t !== SIDE[cur.side]) delete cur.slots[k]; } draw(); }));
  $("#nm", root).addEventListener("input", e => cur.name = e.target.value);
  $("#sv", root).addEventListener("change", e => { const s = saved.find(x => x.id === e.target.value); if (s) { cur = structuredClone(s); draw(); } });
  $("#new", root).addEventListener("click", () => { cur = fresh(cur.side); draw(); });
  $("#save", root).addEventListener("click", persist);
  $("#dup", root).addEventListener("click", async () => { cur = { ...structuredClone(cur), id: uid(), name: cur.name + " (kopia)", created: Date.now() }; await persist(); });
  $("#rm", root)?.addEventListener("click", async () => { if (await confirmBox("Ta bort loadouten?", { ok: "Ta bort", danger: true })) { await del("loadouts", cur.id); saved = saved.filter(s => s.id !== cur.id); cur = saved[0] ? structuredClone(saved[0]) : fresh(cur.side); draw(); } });
  $("#shr", root).addEventListener("click", async () => { const url = location.origin + location.pathname + "#/loadout/" + await encodeShare({ name: cur.name, side: cur.side, slots: cur.slots, theme: cur.theme }); copyText(url, "Länk till loadouten kopierad"); });
  $("#shimg", root).addEventListener("click", () => {
    const entries = c.rows.filter(r => r.e).map(r => ({ name1: r.e.w || r.e.n, name2: (r.e.p || r.e.n) + (r.e.ph ? " · " + r.e.ph : ""), tag: slotLabel(r.k) + (r.sel?.wear ? " · " + r.sel.wear : ""), price: r.p, img: r.e.img ? imgUrl(r.e.img, "256fx192f") : "", rc: r.e.rc }));
    openCardModal({ title: cur.name || "Min loadout", entries, total: c.total, defCount: 12, filename: "cs2hub-loadout" });
  });
  $("#clr", root).addEventListener("click", () => { cur.slots = {}; draw(); });
  $("#theme", root).addEventListener("change", e => { cur.theme = e.target.value; draw(); });
  $("#list", root).addEventListener("click", () => shopList(c));
  $("#cmp", root).addEventListener("click", () => compare(c));
  $("#go", root).addEventListener("click", () => challenge($("#bc", root).value, +$("#bb", root).value || 2000, $("#bo", root).checked));
  $$("[data-pick]", root).forEach(b => b.addEventListener("click", () => pick(b.dataset.pick)));
  $$("[data-wear]", root).forEach(s => s.addEventListener("change", () => { cur.slots[s.dataset.wear].wear = s.value; draw(); }));
  $$("[data-st]", root).forEach(s => s.addEventListener("change", () => { cur.slots[s.dataset.st].st = s.checked; draw(); }));
  $$("[data-x]", root).forEach(b => b.addEventListener("click", () => { delete cur.slots[b.dataset.x]; draw(); }));
}

async function persist() {
  await put("loadouts", cur); saved = (await all("loadouts")).sort((a, b) => b.created - a.created); toast("Loadout sparad"); draw();
}

function slotCard(r) {
  const k = r.k;
  if (!r.e) return `<div class="card slot-empty" style="--rc:#333"><button class="im" data-pick="${esc(k)}" style="border:0;cursor:pointer;color:var(--muted);width:100%" aria-label="Välj skin för ${esc(slotLabel(k))}"><span>+ ${esc(slotLabel(k))}</span></button><div class="bar"></div><div class="bd"><div class="t1">${esc(slotLabel(k))}</div><div class="t2 faint">Tom plats</div></div></div>`;
  const e = r.e;
  return `<div class="card" style="--rc:${esc(e.rc)}"><button class="im" data-pick="${esc(k)}" style="border:0;cursor:pointer;width:100%" aria-label="Byt skin för ${esc(slotLabel(k))}"><img src="${esc(imgUrl(e.img))}" alt="" width="256" height="192">
    <span class="tag">${r.has ? '<span class="pos">Äger</span>' : r.otherWear ? "Äger annat slitage" : "Saknas"}</span></button><div class="bar"></div>
    <div class="bd"><div class="t1">${esc(slotLabel(k))}</div><div class="t2" title="${esc(e.n)}">${esc((e.p || e.n) + (e.ph ? " · " + e.ph : ""))}</div>
    <div class="row" style="margin:4px 0 2px;flex-wrap:nowrap">${e.wr?.length ? `<select class="inp" data-wear="${esc(k)}" style="padding:2px 4px;font-size:12px" aria-label="Slitage">${e.wr.map(w => `<option value="${w}" ${w === r.sel.wear ? "selected" : ""}>${w}</option>`).join("")}</select>${e.st ? `<label class="small muted"><input type="checkbox" data-st="${esc(k)}" ${r.sel.st ? "checked" : ""}> ST™</label>` : ""}` : ""}<button class="btn ghost sm" data-x="${esc(k)}" style="margin-left:auto" aria-label="Ta bort">✕</button></div>
    <div class="pr" title="${esc(priceTip(r.mhn))}">${r.p != null ? kr(r.p) : MISSING}${r.p != null && r.p < 1 ? '<span class="faint small" title="Mycket lågt pris – kontrollera marknadspriset"> ⚠</span>' : ""}</div>
    ${r.info ? `<div class="faint small">${esc(r.info.name)}</div>` : ""}</div></div>`;
}

/* ---- skinväljare per plats ---- */
function pick(slot) {
  const pool = poolFor(slot, cur.side);
  let own = "all", theme = cur.theme || "", sort = "pa", q = "", max = "";
  modal(`<div class="row spread"><h3 style="margin:0">Välj ${esc(slotLabel(slot).toLowerCase())} (${SIDE_LABEL[cur.side]}) <span class="muted small">· ${pool.length} skins</span></h3><button class="btn ghost sm" data-close>Stäng</button></div>
    <div class="toolbar" style="margin-top:10px"><input class="inp" id="q" placeholder="Sök…" style="flex:1;min-width:140px" aria-label="Sök skin">
      <select class="inp" id="own" aria-label="Äger"><option value="all">Alla</option><option value="own">Bara jag äger</option><option value="miss">Bara jag saknar</option></select>
      <select class="inp" id="th" aria-label="Färg"><option value="">Alla färger</option>${Object.keys(COLORS).map(k => `<option value="${k}" ${k === theme ? "selected" : ""}>${COLOR_LABEL[k]}</option>`).join("")}</select>
      <input class="inp" id="mx" type="number" min="0" placeholder="Max kr" style="width:90px" aria-label="Högsta pris">
      <select class="inp" id="so" aria-label="Sortera"><option value="pa">Pris ↑</option><option value="pd">Pris ↓</option><option value="n">Namn</option></select></div>
    <div class="muted small" id="cnt" style="margin-bottom:8px"></div><div class="cards compact" id="g"></div>`, {
    wide: true,
    onMount: m => {
      const g = $("#g", m);
      const run = () => {
        q = $("#q", m).value.toLowerCase(); own = $("#own", m).value; theme = $("#th", m).value; sort = $("#so", m).value; max = $("#mx", m).value;
        const t = q.split(/\s+/).filter(Boolean);
        let l = pool.map(e => { const w = e.wr ? defWear(e) : null, mhn = e.wr ? mhnFor(e, w) : e.mh, info = priceInfo(mhn); return { e, w, mhn, p: info ? usd2sek(info.usd) : null, has: ownedSkin.has(e.id) }; })
          .filter(x => t.every(s => (x.e.n + " " + (x.e.ph || "")).toLowerCase().includes(s)) && (own === "all" || (own === "own") === x.has) && (!theme || x.e.c1 === theme || x.e.c2 === theme) && (max === "" || (x.p != null && x.p <= +max)));
        const big = sort === "pa" ? 1e12 : -1;
        l.sort((a, b) => sort === "n" ? a.e.n.localeCompare(b.e.n) : (sort === "pa" ? 1 : -1) * ((a.p ?? big) - (b.p ?? big)));
        $("#cnt", m).textContent = `${l.length} träffar${l.length > 80 ? " (visar 80)" : ""}`;
        g.innerHTML = l.slice(0, 80).map((x, i) => `<div class="card" data-i="${i}" style="--rc:${esc(x.e.rc)};cursor:pointer"><div class="im"><img loading="lazy" src="${esc(imgUrl(x.e.img, "192fx144f"))}" alt="" width="192" height="144">${x.has ? '<span class="tag pos">Äger</span>' : ""}${x.e.c1 ? `<span class="tag" style="left:auto;right:8px"><i class="dot" style="background:${esc(x.e.hx)}"></i></span>` : ""}</div><div class="bar"></div><div class="bd"><div class="t1">${esc(x.e.w || "Agent")}</div><div class="t2">${esc((x.e.p || x.e.n) + (x.e.ph ? " · " + x.e.ph : ""))}</div><div class="pr">${x.p != null ? kr(x.p) : MISSING}</div></div></div>`).join("") || `<div class="muted" style="grid-column:1/-1">Inga träffar – prova färre filter.</div>`;
        g.querySelectorAll("[data-i]").forEach(c => c.addEventListener("click", () => { const x = l[+c.dataset.i]; cur.slots[slot] = { id: x.e.id, wear: x.w }; $("#modalRoot").innerHTML = ""; draw(); }));
      };
      const d = debounce(run, 120);
      $("#q", m).addEventListener("input", d); ["own", "th", "so", "mx"].forEach(id => $("#" + id, m).addEventListener(id === "mx" ? "input" : "change", d)); run(); $("#q", m).focus();
    },
  });
}

function shopList(c) {
  const miss = c.rows.filter(r => r.e && !r.has);
  const text = `${cur.name} (${SIDE_LABEL[cur.side]})\n` + miss.map(r => `- ${slotLabel(r.k)}: ${r.mhn} – ${r.p != null ? kr(r.p) : "pris saknas"}`).join("\n") + `\nTotalt att köpa: ${kr(c.toBuy)}`;
  modal(`<h3>Inköpslista</h3>${miss.length ? `<div class="scroll-x"><table class="tbl"><tbody>${miss.map(r => `<tr><td>${esc(slotLabel(r.k))}</td><td>${esc(r.mhn)}</td><td class="r num">${krm(r.p)}</td></tr>`).join("")}<tr><td colspan="2"><b>Totalt att köpa</b></td><td class="r num"><b>${kr(c.toBuy)}</b></td></tr></tbody></table></div>` : emptyState("Inget saknas", "Du äger allt i loadouten – eller så är den tom.")}
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" data-close>Stäng</button>${miss.length ? `<button class="btn" id="cp">Kopiera</button>` : ""}</div>`, {
    onMount: m => $("#cp", m)?.addEventListener("click", () => copyText(text, "Inköpslistan kopierad")),
  });
}

function compare() {
  const others = saved.filter(s => s.id !== cur.id);
  if (!others.length) return toast("Spara minst en annan loadout för att jämföra (t.ex. en CT och en T).");
  modal(`<h3>Jämför loadouts</h3><select class="inp" id="o" aria-label="Jämför med">${others.map(s => `<option value="${esc(s.id)}">${esc(s.name)} · ${s.side.toUpperCase()}</option>`).join("")}</select><div id="t" style="margin-top:12px"></div><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn ghost" data-close>Stäng</button></div>`, {
    wide: true,
    onMount: m => {
      const show = () => {
        const B = others.find(s => s.id === $("#o", m).value), b = calc(B), a = calc(cur);
        const keys = [...new Set([...slotsOf(cur.side), ...slotsOf(B.side)])].filter(k => cur.slots[k] || B.slots[k]);
        const cell = (lo, k) => { const e = entryOf(lo.slots[k]); if (!e) return '<span class="faint">–</span>'; const r = (lo === cur ? a : b).rows.find(x => x.k === k); return `${esc((e.p || e.n) + (e.ph ? " · " + e.ph : ""))}<div class="num small">${r?.p != null ? kr(r.p) : MISSING}</div>`; };
        const price = (lo, k) => (lo === cur ? a : b).rows.find(x => x.k === k)?.p ?? 0;
        $("#t", m).innerHTML = `<div class="scroll-x"><table class="tbl"><thead><tr><th>Plats</th><th>${esc(cur.name)} (${cur.side.toUpperCase()})</th><th>${esc(B.name)} (${B.side.toUpperCase()})</th><th class="r">Skillnad</th></tr></thead><tbody>${keys.map(k => `<tr><td>${esc(slotLabel(k))}</td><td>${cell(cur, k)}</td><td>${cell(B, k)}</td><td class="r num">${kr(price(cur, k) - price(B, k))}</td></tr>`).join("")}
          <tr><td><b>Totalt</b></td><td class="num"><b>${kr(a.total)}</b></td><td class="num"><b>${kr(b.total)}</b></td><td class="r num"><b>${kr(a.total - b.total)}</b></td></tr></tbody></table></div>`;
      };
      $("#o", m).addEventListener("change", show); show();
    },
  });
}

/* ---- Budget Loadout Challenge: komplett (eller så nära komplett som möjligt) loadout i vald färg ---- */
function challenge(color, budget, ownedFree) {
  const slots = {}, keys = slotsOf(cur.side).filter(k => k !== "agent" && k !== "Zeus x27");
  const cand = {};
  for (const k of keys) {
    cand[k] = poolFor(k, cur.side).filter(s => s.c1 === color || s.c2 === color).map(s => {
      const w = s.wr.length ? defWear(s) : null; if (s.wr.length && !w) return null;
      const info = priceInfo(s.wr.length ? mhnFor(s, w) : s.n), has = ownedSkin.has(s.id);
      const p = ownedFree && has ? 0 : info ? usd2sek(info.usd) : null;
      return p == null ? null : { s, w, p, has, strong: s.c1 === color };
    }).filter(Boolean);
  }
  const live = keys.filter(k => cand[k].length), totalW = live.reduce((t, k) => t + wt(k), 0);
  let left = budget, spent = 0;
  // 1) varje plats får en andel efter vikt – välj dyraste (finaste) som ryms, hellre primär färg
  for (const k of [...live].sort((a, b) => wt(b) - wt(a))) {
    const share = Math.min(left, budget * wt(k) / totalW);
    const best = cand[k].filter(x => x.p <= Math.max(share, 0)).sort((a, b) => (b.strong - a.strong) || (b.p - a.p))[0];
    if (best) { slots[k] = { id: best.s.id, wear: best.w }; left -= best.p; spent += best.p; }
  }
  // 2) fyll tomma platser med det billigaste som ryms i det som är kvar
  for (const k of live.filter(k => !slots[k]).sort((a, b) => wt(b) - wt(a))) {
    const best = cand[k].filter(x => x.p <= left).sort((a, b) => a.p - b.p)[0];
    if (best) { slots[k] = { id: best.s.id, wear: best.w }; left -= best.p; spent += best.p; }
  }
  // 3) uppgradera med överblivet: byt mot dyrare i samma färg så länge det ryms
  for (const k of [...live].sort((a, b) => wt(b) - wt(a))) {
    const curSel = slots[k]; if (!curSel) continue;
    const curP = cand[k].find(x => x.s.id === curSel.id)?.p ?? 0;
    const up = cand[k].filter(x => x.p > curP && x.p - curP <= left).sort((a, b) => b.p - a.p)[0];
    if (up) { slots[k] = { id: up.s.id, wear: up.w }; left -= up.p - curP; spent += up.p - curP; }
  }
  const filled = Object.keys(slots).length;
  cur.slots = slots; cur.theme = color; cur.name = `${COLOR_LABEL[color]} under ${Math.round(budget)} kr`;
  draw();
  const res = $("#goRes", root); if (res) res.textContent = `${filled} av ${keys.length} platser fyllda för ${kr(spent)} (${kr(Math.max(0, left))} kvar). ${filled < keys.length ? "Resten hade inget " + COLOR_LABEL[color].toLowerCase() + " skin inom budgeten." : "Komplett!"}`;
  toast(`${filled}/${keys.length} platser – ${kr(spent)} av ${kr(budget)}`);
}
