import { $, $$, esc, imgUrl, kr, dec, MISSING, usd2sek, uid, toast, WEARS, WEAR_LONG, WEAR_RANGE, wearFromFloat } from "../util.js";
import { put } from "../store.js";
import { D, mhnFor, bestUsd, MARKETS, priceRow } from "../data.js";
import { decodeInspect } from "../inspect-decode.js";
import { pageHead } from "./common.js";

const DOPPLER = { 415: "Ruby", 416: "Sapphire", 417: "Black Pearl", 418: "Phase 1", 419: "Phase 2", 420: "Phase 3", 421: "Phase 4", 568: "Emerald", 569: "Phase 1", 570: "Phase 2", 571: "Phase 3", 572: "Phase 4" };
let index = null;
function findSkin(def, paint) {
  if (!index) { index = new Map(); for (const s of D.skins) index.set(s.wi + "_" + (s.pi || 0), s); }
  return index.get(def + "_" + paint) || (paint === 0 ? [...index.values()].find(s => s.wi === def && !s.p) : null);
}

export function renderInspect(root, args = []) {
  root.innerHTML = `${pageHead("Inspect & Float", "Avkoda inspect-länkar direkt i webbläsaren och justera float och seed interaktivt.")}
  <div class="panel" style="margin-bottom:14px"><h2>Inspect Link Decoder</h2>
    <textarea class="inp" id="lnk" rows="2" style="width:100%" placeholder="steam://rungame/730/…/+csgo_econ_action_preview%20001807… (klistra in länk eller hex)"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn" id="dec">Avkoda</button><span class="muted small" id="err"></span></div>
    <p class="muted small" style="margin-bottom:0">Tips: i CS2-inventoryt, högerklicka ett föremål → Inspect → kopiera länken. Allt avkodas lokalt – inget skickas någonstans.</p></div>
  <div id="out"></div>`;
  $("#dec", root).addEventListener("click", () => {
    try { $("#err", root).textContent = ""; show(root, decodeInspect($("#lnk", root).value)); } catch (e) { $("#err", root).textContent = e.message; }
  });
  if (args[0] && D.byId.get(args[0])) { const s = D.byId.get(args[0]); show(root, { defIndex: s.wi, paintIndex: +s.pi || 0, float: s.f ? (s.f[0] + s.f[1]) / 2 : 0.1, seed: 0, stickers: [], charms: [], stattrak: null, nametag: "", manual: s }); }
}

function show(root, r) {
  const s = r.manual || findSkin(r.defIndex, r.paintIndex);
  const out = $("#out", root);
  const lo = s?.f?.[0] ?? 0, hi = s?.f?.[1] ?? 1;
  const st = r.stattrak != null, sv = r.quality === 12;
  let fl = r.float ?? (lo + hi) / 2, seed = r.seed;
  const stk = [...r.stickers.map(a => ({ ...a, k: "Sticker", e: D.byId.get("sticker-" + a.id) })), ...r.charms.map(a => ({ ...a, k: "Charm", e: D.byId.get("keychain-" + a.id) }))];
  const stkVal = stk.reduce((t, a) => t + (a.e ? (bestUsd(a.e.mh) || 0) : 0), 0);

  out.innerHTML = `<div class="grid split" style="grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:start">
    <div><div class="hero-img"><img id="pic" src="${esc(s ? imgUrl(s.img, "512fx384f") : "")}" alt=""></div>
      <div class="muted small" style="margin-top:6px">Bilden är skinets standardbild; slitaget är en visuell simulering.</div></div>
    <div><div class="muted small">${esc(s?.w || "Okänt vapen (defindex " + r.defIndex + ")")}${st ? " · StatTrak™" : ""}${sv ? " · Souvenir" : ""}</div>
      <h1 style="font-size:22px">${esc(s ? (s.p ? `${s.w} | ${s.p}` : s.n) : "Okänt föremål")}${DOPPLER[r.paintIndex] ? ` <span class="muted">· ${DOPPLER[r.paintIndex]}</span>` : ""}</h1>
      ${s ? `<span class="chip on" style="border-color:${esc(s.rc)}"><i class="dot" style="background:${esc(s.rc)}"></i>${esc(s.r)}</span> <a class="muted small" href="#/item/${esc(s.id)}" style="text-decoration:underline">Databassida</a>` : `<p class="muted">Skinet finns inte i databasen (kan vara nytt).</p>`}
      <div class="panel" id="srcBox" style="margin-top:12px;font-size:13px">${r.manual
        ? `<b>✎ Simulering</b><div class="muted small">Inget är avkodat ur en länk. Float och seed är värden du själv väljer – exempel på hur skinet kan se ut och vad det kan vara värt.</div>`
        : `<b class="pos">✔ Avkodat ur inspect-länken</b><div class="muted small">Skin, float, paint seed, paint index${st ? ", StatTrak-räknare" : ""}${r.nametag ? ", namntag" : ""}${stk.length ? ", stickers/charms" : ""} kommer direkt ur länken. <span id="chg"></span></div>`}</div>
      <div class="panel" style="margin-top:12px"><div class="row spread"><b>Float</b><b class="num" id="fv"></b></div>
        <input type="range" id="fs" min="0" max="1" step="0.00001" style="width:100%;margin-top:8px">
        <div class="fbar"><i id="fmark" style="width:3px"></i></div><div class="fscale"><span>0,00</span><span>0,07</span><span>0,15</span><span>0,38</span><span>0,45</span><span>1,00</span></div>
        <div class="muted small" id="fnote" style="margin-top:8px"></div>
        <div class="form" style="margin-top:10px"><label>Float (exakt)<input class="inp" id="fi" type="number" step="0.00000001" min="0" max="1"></label><label>Paint seed<input class="inp" id="sd" type="number" min="0" max="1000" value="${seed}"></label></div></div>
      <dl class="kv panel" style="margin:12px 0" id="kv"></dl>
      ${stk.length ? `<div class="panel"><h2>Stickers & charms</h2>${stk.map(a => `<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row" style="flex-wrap:nowrap">${a.e ? `<img src="${esc(imgUrl(a.e.img, "64fx48f"))}" style="width:44px" alt="">` : ""}<div><div>${esc(a.e?.n || a.k + " #" + a.id)}</div><div class="muted small">${a.k === "Sticker" ? `Plats ${a.slot + 1} · slitage ${a.wear ? dec(a.wear * 100, 0) + " %" : "0 %"}` : `Charm${a.pattern != null ? " · pattern #" + a.pattern : ""}`}</div></div></div><span class="num">${a.e && bestUsd(a.e.mh) ? kr(usd2sek(bestUsd(a.e.mh))) : MISSING}</span></div>`).join("")}
        <div class="row spread" style="margin-top:8px"><span class="muted small">Summa (marknadspris, utan sticker-premium)</span><b class="num">${kr(usd2sek(stkVal))}</b></div></div>` : ""}
      <div class="row" style="margin-top:12px"><button class="btn" id="add" ${s ? "" : "disabled"}>+ Lägg i inventory med float & seed</button></div></div></div>`;

  const refresh = () => {
    const w = wearFromFloat(fl), mhn = s?.wr ? mhnFor(s, s.wr.includes(w) ? w : null, { st, sv }) : null;
    const u = mhn ? bestUsd(mhn) : null, [a, b] = WEAR_RANGE[w];
    $("#fv", out).textContent = dec(fl, 8) + " · " + WEAR_LONG[w];
    $("#fs", out).value = fl; $("#fi", out).value = +fl.toFixed(8);
    const m = $("#fmark", out); m.style.left = `calc(${fl * 100}% - 1px)`;
    $("#fnote", out).textContent = `${dec(((fl - a) / (b - a)) * 100, 1)} % in i ${w}-bandet (${dec(a, 2)}–${dec(b, 2)}). Skinets float-intervall: ${dec(lo, 2)}–${dec(hi, 2)}.` + (s && (fl < lo || fl > hi) ? " ⚠ Utanför skinets möjliga intervall." : "");
    const pic = $("#pic", out); if (pic) pic.style.filter = `saturate(${1 - fl * 0.55}) brightness(${1 - fl * 0.28}) contrast(${1 + fl * 0.15})`;
    const row = mhn && priceRow(mhn);
    const changed = !r.manual && (Math.abs(fl - (r.float ?? fl)) > 1e-9 || seed !== r.seed);
    const tag = (txt, sim) => `${txt} <span class="faint small">${r.manual || sim ? "simulerat" : "avkodat"}</span>`;
    const chg = $("#chg", out); if (chg) chg.innerHTML = changed ? `<b class="neg">Du har ändrat float/seed – det du ser nu är en simulering, inte originalet.</b> <button class="btn ghost sm" id="rst">Återställ originalvärden</button>` : "";
    $("#rst", out)?.addEventListener("click", () => { fl = r.float; seed = r.seed; refresh(); });
    $("#kv", out).innerHTML = [
      ["Slitage", tag(WEAR_LONG[w], changed)], ["Paint seed", tag(seed, changed)], ["Paint index", r.manual ? (r.paintIndex || "–") : tag(r.paintIndex || "–")], st ? ["StatTrak-räknare", tag(r.stattrak)] : null,
      r.nametag ? ["Namntag", tag(`"${esc(r.nametag)}"`)] : null, r.itemId ? ["Item-ID", tag(r.itemId)] : null,
      ["Lägsta pris (" + w + ")", u ? kr(usd2sek(u)) : MISSING],
      ...(row ? MARKETS.filter(x => row[x.key]).map(x => ["&nbsp;&nbsp;" + x.name, kr(usd2sek(row[x.key]))]) : []),
    ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd class="num">${v}</dd>`).join("");
    out._mhn = mhn;
  };
  $("#fs", out).addEventListener("input", e => { fl = +e.target.value; refresh(); });
  $("#fi", out).addEventListener("input", e => { const v = parseFloat(e.target.value); if (v >= 0 && v <= 1) { fl = v; refresh(); } });
  $("#sd", out).addEventListener("input", e => { seed = +e.target.value || 0; refresh(); });
  $("#add", out).addEventListener("click", async e => {
    const btn = e.currentTarget; if (btn.disabled) return; btn.disabled = true; setTimeout(() => btn.disabled = false, 1500); // skydd mot dubbelklick
    await put("items", { id: uid(), mhn: out._mhn || mhnFor(s, null), qty: 1, float: +fl.toFixed(8), seed, nametag: r.nametag || "", stickers: r.stickers, source: "inspect", added: Date.now() });
    toast("Tillagd i inventory");
  });
  refresh();
}
