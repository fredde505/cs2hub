import { parseMoney, inputMoney, curSym, esc, parseDec, imgUrl, kr, krm, pct, cls, usd2sek, modal, toast, uid, $, fmtDate, fmtDateTime, WEAR_LONG, WEARS, MISSING, confirmBox, fx, sparkline, dec } from "../util.js";
import { all, put, putMany, del } from "../store.js";
import { D, lookup, bestUsd, mhnFor, refreshLive, loadHistory, historyFor } from "../data.js";
import { pageHead, itemPicker, emptyState } from "./common.js";
import { watchBanner } from "../upkeep.js";
import { getPrefs } from "../prefs.js";
import { analysePrice } from "../pricing.js";
import { evaluate, isStale, describeTarget, groupWatches, summarize, normalizeWatch } from "../watch-core.js";

const ageMs = () => (D.priceAge ? Date.now() - D.priceAge : 0);
const evalW = w => evaluate(w, bestUsd(w.mhn), fx.rate);
const quality = w => analysePrice(D.P.p[w.mhn] || null, { ageMs: ageMs(), mhn: w.mhn });

export async function checkAlerts() {
  const ws = await all("watch");
  return ws.filter(w => evalW(w).hit);
}

/** Webbläsarnotiser: kontrollerar bevakningar regelbundet medan sidan är öppen och aviserar nya träffar en gång. Pausade bevakningar aviserar aldrig. */
export async function notifyNewHits() {
  if (!getPrefs().notifications) return 0; // notiser avstängda i Inställningar: varken banner eller webbläsarnotis
  const ws = await all("watch"), fresh = []; let changed = false;
  for (const w of ws) {
    const h = evalW(w).hit; // pausade ger aldrig träff
    if (h && !w.notified) { w.notified = Date.now(); fresh.push(w); changed = true; }
    else if (!h && w.notified) { w.notified = null; changed = true; } // återställ så att nästa träff aviseras igen
  }
  if (changed) await putMany("watch", ws);
  if (!fresh.length) return 0;
  watchBanner(fresh);
  if ("Notification" in window && Notification.permission === "granted") {
    for (const w of fresh.slice(0, 3)) {
      const ev = evalW(w), q = quality(w);
      new Notification("Målpris nått", { body: `${w.mhn}: ${kr(ev.curKr)} (mål ${describeTarget(w, ev, kr)})${q.level === "uncertain" || q.level === "stale" ? " – osäkert/gammalt pris, kontrollera listningen" : ""}`, tag: "w" + w.id });
    }
  }
  return fresh.length;
}
let pollTimer = null;
export function startWatchPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => { await refreshLive(() => { }, true).catch(() => { }); notifyNewHits(); }, 15 * 60e3);
}

const QUICK = [-5, -10, -20, 10, 20];

/** Lägg till bevakning. Flera slitagegrader kan bevakas i ett svep (med procentmål); målpris i kronor gäller ett slitage i taget. */
export async function addWatch(mhn, done) {
  const ref = lookup(mhn), e = ref?.e;
  const groups = [...new Set((await all("watch")).map(w => w.group).filter(Boolean))].sort();
  const hasWears = !!e?.wr?.length, defWear = ref?.wear || (hasWears ? (e.wr.includes("FT") ? "FT" : e.wr[0]) : null);
  const cur = usd2sek(bestUsd(mhn));
  modal(`<h3 style="margin-top:0">Bevaka pris</h3>
    <div class="form"><label class="full">Föremål<input class="inp" id="wm" value="${esc(e ? e.n + (e.ph ? " · " + e.ph : "") : mhn)}" readonly></label>
    ${hasWears ? `<div class="full"><div class="muted small" style="margin-bottom:4px">Slitage (välj ett eller flera)</div><div class="chips" id="wws">${e.wr.map(w => `<label class="chip ${w === defWear ? "on" : ""}" style="cursor:pointer"><input type="checkbox" value="${w}" ${w === defWear ? "checked" : ""} hidden>${WEAR_LONG[w]}</label>`).join("")}</div></div>
      ${e.st || e.sv ? `<label>Variant<select class="inp" id="wv"><option value="">Normal</option>${e.st ? `<option value="st" ${ref?.st ? "selected" : ""}>StatTrak™</option>` : ""}${e.sv ? `<option value="sv" ${ref?.sv ? "selected" : ""}>Souvenir</option>` : ""}</select></label>` : ""}` : ""}
    <div class="full seg" id="wmode"><button type="button" data-m="price" class="on">Målpris i kronor</button><button type="button" data-m="pct">Procent från dagens pris</button></div>
    <div class="full row" id="wprice" style="gap:10px"><label style="flex:1">Avisera när priset är<select class="inp" id="wd"><option value="below">under eller lika med</option><option value="above">över eller lika med</option></select></label><label style="flex:1">Målpris (${curSym()})<input class="inp" id="wt" type="text" inputmode="decimal" placeholder="t.ex. 150" value="${cur != null ? inputMoney(cur * 0.9, 0) : ""}"></label></div>
    <div class="full" id="wpct" hidden><div class="chips" style="margin-bottom:8px">${QUICK.map(q => `<button type="button" class="chip" data-q="${q}">${q > 0 ? "+" : "−"}${Math.abs(q)} %</button>`).join("")}</div>
      <label>Förändring i % (negativt = faller, positivt = stiger)<input class="inp" id="wp" type="text" inputmode="decimal" value="-10"></label></div>
    <label>Grupp (valfritt)<input class="inp" id="wg" list="wgl" placeholder="t.ex. Knivar, Köp snart" maxlength="40"><datalist id="wgl">${groups.map(g => `<option value="${esc(g)}">`).join("")}</datalist></label><label>Notering (valfritt)<input class="inp" id="wn2" maxlength="200"></label></div>
    <p class="muted small" id="wn" style="margin:8px 0 0"></p>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn ghost" data-close>Avbryt</button><button class="btn" id="ws">Spara</button></div>`, {
    wide: true,
    onMount: (m, close) => {
      let mode = "price";
      const wears = () => hasWears ? [...m.querySelectorAll("#wws input:checked")].map(i => i.value) : [null];
      const variant = () => m.querySelector("#wv")?.value || "";
      const nameFor = w => hasWears ? mhnFor(e, w, { st: variant() === "st", sv: variant() === "sv" }) : mhn;
      const upd = () => {
        const ws = wears(), lines = ws.map(w => { const n = nameFor(w), c = usd2sek(bestUsd(n)); const p = parseDec(m.querySelector("#wp").value); return `${hasWears ? WEAR_LONG[w] + ": " : ""}${c != null ? "nu " + kr(c) : "pris saknas"}${mode === "pct" && c != null && p != null ? ` → mål ${kr(c * (1 + p / 100))}` : ""}`; });
        m.querySelector("#wn").innerHTML = lines.join("<br>") || "Välj minst ett slitage.";
        if (mode === "price" && ws.length === 1) { const c = usd2sek(bestUsd(nameFor(ws[0]))); if (c != null && !m._touched) m.querySelector("#wt").value = inputMoney(c * 0.9, 0); }
      };
      m.querySelector("#wt").addEventListener("input", () => { m._touched = true; });
      m.querySelectorAll("#wws label").forEach(l => l.addEventListener("click", ev => { ev.preventDefault(); const i = l.querySelector("input"); i.checked = !i.checked; l.classList.toggle("on", i.checked); upd(); }));
      m.querySelector("#wv")?.addEventListener("change", upd); m.querySelector("#wp").addEventListener("input", upd);
      m.querySelectorAll("#wmode button").forEach(b => b.addEventListener("click", () => { mode = b.dataset.m; m.querySelectorAll("#wmode button").forEach(x => x.classList.toggle("on", x === b)); m.querySelector("#wprice").hidden = mode !== "price"; m.querySelector("#wpct").hidden = mode !== "pct"; upd(); }));
      m.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => { m.querySelector("#wp").value = b.dataset.q; upd(); }));
      upd();
      let busy = false;
      m.querySelector("#ws").addEventListener("click", async () => {
        if (busy) return; // skydd mot dubbelklick
        const ws = wears(); if (!ws.length) return toast("Välj minst ett slitage");
        const group = m.querySelector("#wg").value.trim().slice(0, 40), note = m.querySelector("#wn2").value.slice(0, 200), made = [];
        let skipped = 0;
        if (mode === "price") {
          if (ws.length > 1) return toast("Målpris i kronor gäller ett slitage i taget – välj ett, eller använd procent från dagens pris.");
          const target = parseMoney(m.querySelector("#wt").value); if (!(target > 0)) return toast("Ange ett målpris, t.ex. 150");
          const n = nameFor(ws[0]); made.push({ id: uid(), mhn: n, mode: "price", target, dir: m.querySelector("#wd").value, pct: null, created: Date.now(), startUsd: bestUsd(n) ?? null, paused: false, group, note, notified: null });
        } else {
          const p = parseDec(m.querySelector("#wp").value); if (p == null || p === 0 || p <= -100 || p > 1000) return toast("Ange en förändring mellan −99 och +1000 %, t.ex. −10");
          for (const w of ws) { const n = nameFor(w), start = bestUsd(n); if (!start) { skipped++; continue; } made.push({ id: uid(), mhn: n, mode: "pct", pct: p, dir: p < 0 ? "below" : "above", target: usd2sek(start * (1 + p / 100)), created: Date.now(), startUsd: start, paused: false, group, note, notified: null }); }
          if (!made.length) return toast("Inget av de valda slitagena har ett pris att utgå från.");
        }
        busy = true; await putMany("watch", made); startWatchPolling(); /* kontrollen startas även om det var första bevakningen */
        close(); toast(`${made.length} bevakning${made.length === 1 ? "" : "ar"} tillagd${made.length === 1 ? "" : "a"}${skipped ? ` (${skipped} saknade pris och hoppades över)` : ""}`); done && done();
        if ("Notification" in window && Notification.permission === "default") toast("Tips: aktivera webbläsarnotiser på Watchlist-sidan.");
      });
    },
  });
}

/** Redigera en befintlig bevakning (mål, grupp, notering, paus). */
function editWatch(w, groups, done) {
  const ev = evalW(w);
  modal(`<h3 style="margin-top:0">Redigera bevakning</h3><p class="muted small" style="margin-top:0">${esc(w.mhn)}</p>
    <div class="form">${ev.mode === "pct"
      ? `<label class="full">Förändring från startpriset (%) <span class="muted small">(startpris ${w.startUsd ? kr(usd2sek(w.startUsd)) : "–"})</span><input class="inp" id="ep" type="text" inputmode="decimal" value="${w.pct}"></label>`
      : `<label>Avisera när priset är<select class="inp" id="ed"><option value="below" ${w.dir !== "above" ? "selected" : ""}>under eller lika med</option><option value="above" ${w.dir === "above" ? "selected" : ""}>över eller lika med</option></select></label><label>Målpris (${curSym()})<input class="inp" id="et" type="text" inputmode="decimal" value="${esc(inputMoney(w.target))}"></label>`}
    <label>Grupp<input class="inp" id="eg" list="egl" value="${esc(w.group || "")}" maxlength="40"><datalist id="egl">${groups.map(g => `<option value="${esc(g)}">`).join("")}</datalist></label><label>Notering<input class="inp" id="en" value="${esc(w.note || "")}" maxlength="200"></label></div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" data-close>Avbryt</button><button class="btn" id="esv">Spara</button></div>`, {
    onMount: (m, close) => m.querySelector("#esv").addEventListener("click", async () => {
      const next = { ...w, group: m.querySelector("#eg").value.trim().slice(0, 40), note: m.querySelector("#en").value.slice(0, 200), notified: null };
      if (ev.mode === "pct") { const p = parseDec(m.querySelector("#ep").value); if (p == null || p === 0 || p <= -100 || p > 1000) return toast("Ange en förändring mellan −99 och +1000 %"); next.pct = p; next.dir = p < 0 ? "below" : "above"; next.target = usd2sek(w.startUsd * (1 + p / 100)); }
      else { const t = m.querySelector("#et").value === inputMoney(w.target) ? w.target : parseMoney(m.querySelector("#et").value); if (!(t > 0)) return toast("Ange ett målpris, t.ex. 150"); next.target = t; next.dir = m.querySelector("#ed").value; }
      await put("watch", next); close(); toast("Bevakningen sparad"); done();
    }),
  });
}

const S = { group: "all", status: "all" };

export async function renderWatchlist(root) {
  const ws = (await all("watch")).map(normalizeWatch);
  const canNotify = "Notification" in window, perm = canNotify ? Notification.permission : "unsupported";
  const age = D.priceAge ? fmtDateTime(D.priceAge) : "okänt", stale = isStale(ageMs());
  const evs = ws.map(w => ({ w, ev: evalW(w), q: quality(w), stale }));
  for (const x of evs) x.old = x.q.level === "stale" || x.q.level === "missing";
  const sum = summarize(evs.map(x => ({ w: x.w, ev: x.ev, stale: x.stale || x.q.level === "stale" })));
  const groups = [...new Set(ws.map(w => w.group).filter(Boolean))].sort();
  if (S.group !== "all" && S.group !== "" && !groups.includes(S.group)) S.group = "all";
  const statusOk = x => S.status === "all" || (S.status === "hit" && x.ev.state === "hit") || (S.status === "watching" && x.ev.state === "watching") || (S.status === "paused" && x.ev.state === "paused") || (S.status === "old" && (x.old || x.q.level === "uncertain" || x.stale));
  const shown = evs.filter(x => statusOk(x) && (S.group === "all" || (x.w.group || "") === S.group));
  const grouped = groupWatches(shown.map(x => x.w)), byId = new Map(shown.map(x => [x.w.id, x]));
  const chip = (k, label, cur, set) => `<button class="chip ${cur === k ? "on" : ""}" data-${set}="${esc(k)}">${esc(label)}</button>`;
  root.innerHTML = `${pageHead("Watchlist", "Bevaka priser – i kronor eller i procent från dagens pris – och få besked när målet nås. Du kan ha flera bevakningar per föremål, och bevaka flera slitage på en gång.")}
    ${stale ? `<div class="panel small" style="margin-bottom:12px;border-color:#6b5a2e">⚠ Prisdatan är äldre än ${36} timmar (${esc(age)}). Bevakningarna jämförs mot gamla priser och kan ge fel träffar.</div>` : ""}
    <div class="panel" style="margin-bottom:14px"><div id="pk"></div></div>
    <div class="row spread" style="margin-bottom:10px;flex-wrap:wrap"><span class="muted small">Senast kontrollerade priser: ${esc(age)}. Bevakningarna kontrolleras när sidan öppnas och var 15:e minut medan den är öppen – aviseringar kräver att sidan är öppen.</span>
      ${perm === "granted" ? '<span class="pos small">● Webbläsarnotiser är på</span>' : perm === "denied" ? '<span class="muted small">Notiser är blockerade i webbläsaren</span>' : canNotify ? '<button class="btn ghost sm" id="notif">Aktivera webbläsarnotiser</button>' : ""}</div>
    ${ws.length ? `<div class="row small" style="gap:16px;margin-bottom:10px;flex-wrap:wrap"><span><b>${sum.total}</b> bevakningar</span><span class="${sum.hit ? "pos" : "muted"}"><b>${sum.hit}</b> har nått målet</span><span class="muted"><b>${sum.watching}</b> bevakar</span><span class="muted"><b>${sum.paused}</b> pausade</span>${sum.stale ? `<span style="color:#d9b36a"><b>${sum.stale}</b> med gamla prisuppgifter</span>` : ""}${sum.waiting ? `<span class="muted"><b>${sum.waiting}</b> väntar på pris</span>` : ""}</div>
    <div class="toolbar" style="flex-wrap:wrap"><div class="chips">${chip("all", "Alla grupper", S.group, "g")}${groups.map(g => chip(g, g, S.group, "g")).join("")}${ws.some(w => !w.group) && groups.length ? chip("", "Ej grupperade", S.group, "g") : ""}</div>
      <select class="inp" id="fst" aria-label="Status">${[["all", "Alla"], ["hit", "Nått målet"], ["watching", "Bevakar"], ["paused", "Pausade"], ["old", "Gamla/osäkra priser"]].map(([v, l]) => `<option value="${v}" ${S.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>` : ""}
    ${shown.length ? grouped.map(g => `${groups.length || g.group ? `<h2 style="margin:16px 0 6px">${esc(g.group || "Ej grupperade")} <span class="muted small" style="font-weight:400">(${g.items.length})</span></h2>` : ""}
      <div class="panel scroll-x" style="padding:0;margin-bottom:12px"><table class="tbl"><thead><tr><th>Föremål</th><th class="r">Pris nu</th><th class="r">Mål</th><th class="r hide-m">Avstånd</th><th class="r hide-m">Sedan start</th><th>Status</th><th></th></tr></thead><tbody>
      ${g.items.map(w => row(byId.get(w.id))).join("")}</tbody></table></div>`).join("")
      : ws.length ? emptyState("Inga bevakningar matchar", "Ändra grupp- eller statusfiltret ovan.") : emptyState("Din bevakningslista är tom", "Sök ett föremål ovan eller använd ☆ på ett föremåls sida för att bevaka priset.")}`;
  function row({ w, ev, q, stale: st }) {
    const e = lookup(w.mhn)?.e, h = ev.state === "hit", paused = ev.state === "paused";
    const hp = historyFor(w.mhn)?.filter(p => p.x >= w.created - 864e5);
    const spark = hp && hp.length >= 2 ? `<div>${sparkline(hp.map(p => p.y), 70, 20, ev.sinceStart != null && ev.sinceStart < 0 ? "#e8857a" : "#7ec699")}</div>` : "";
    const warn = ev.state !== "paused" && (q.level === "stale" || q.level === "uncertain" || st) ? `<div><span class="miss" title="${esc(q.reasons.join(" ") || "Prisdatan är gammal")}">${st || q.level === "stale" ? "Gammalt pris" : "Osäkert pris"}</span></div>` : "";
    const status = h ? '<b class="pos">● Målpris nått</b>' : paused ? '<span class="muted">⏸ Pausad</span>' : ev.state === "waiting" ? '<span class="muted">Väntar på prisdata</span>' : ev.state === "invalid" ? '<span class="neg">Saknar startpris</span>' : '<span class="muted">Bevakar</span>';
    return `<tr style="${h ? "background:rgba(126,198,153,.07)" : ""}${paused ? ";opacity:.55" : ""}"><td><div class="nm"><span class="rar" style="--rc:${esc(e?.rc || "#666")}"></span>${e ? `<img loading="lazy" src="${esc(imgUrl(e.img, "96fx72f"))}" alt="" width="56" height="42">` : ""}<div><a class="n2" href="${e ? "#/item/" + esc(e.id) : "#"}">${esc(w.mhn)}</a><div class="n1">skapad ${fmtDate(w.created)}${w.note ? " · " + esc(w.note) : ""}</div></div></div></td>
      <td class="r num">${krm(ev.curKr)}${warn}</td><td class="r num">${esc(describeTarget(w, ev, kr))}</td><td class="r num hide-m">${ev.distance != null ? (ev.hit ? "nått" : pct(ev.distance)) : "–"}</td><td class="r num hide-m ${cls(ev.sinceStart)}">${ev.sinceStart != null ? pct(ev.sinceStart) : "–"}${spark}</td>
      <td>${status}</td><td class="r" style="white-space:nowrap"><button class="btn ghost sm" data-pause="${esc(w.id)}">${paused ? "Återuppta" : "Pausa"}</button> <button class="btn ghost sm" data-edit="${esc(w.id)}">Redigera</button> <button class="btn ghost sm danger" data-del="${esc(w.id)}" aria-label="Ta bort bevakning">✕</button></td></tr>`;
  }
  const redo = () => renderWatchlist(root);
  itemPicker($("#pk", root), e => addWatch(e.wr ? mhnFor(e, e.wr.includes("FT") ? "FT" : e.wr[0] || null) : e.mh, redo));
  root.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => { S.group = b.dataset.g; redo(); }));
  $("#fst", root)?.addEventListener("change", e => { S.status = e.target.value; redo(); });
  root.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { if (await confirmBox("Ta bort bevakningen?", { ok: "Ta bort", danger: true })) { await del("watch", b.dataset.del); redo(); } }));
  root.querySelectorAll("[data-pause]").forEach(b => b.addEventListener("click", async () => { const w = ws.find(x => x.id === b.dataset.pause); await put("watch", { ...w, paused: !w.paused, notified: null }); redo(); }));
  root.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editWatch(ws.find(x => x.id === b.dataset.edit), groups, redo)));
  $("#notif", root)?.addEventListener("click", async () => { const p = await Notification.requestPermission(); toast(p === "granted" ? "Notiser aktiverade" : "Notiser inte tillåtna"); redo(); });
  // egen prishistorik hämtas först nu (stor fil) och ger minigrafer sedan bevakningen skapades
  if (ws.length && !renderWatchlist._done) loadHistory().then(h => { if (h && !renderWatchlist._done) { renderWatchlist._done = true; if (root.isConnected && location.hash.startsWith("#/watchlist") && !document.querySelector(".modal")) redo(); } }); // en enda omritning när historiken kommit
}
