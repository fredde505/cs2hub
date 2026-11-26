import { $, $$, esc, imgUrl, kr, dec, MISSING, usd2sek, uid, toast, WEAR_LONG, WEAR_RANGE, wearFromFloat } from "../util.js";
import { put, getKV, setKV } from "../store.js";
import { D, mhnFor, bestUsd, MARKETS, priceRow } from "../data.js";
import { decodeInspect, extractHex, decodeHex } from "../inspect-decode.js";
import { floatPosition, boundaryInfo, wearTable, compareDecoded, cleanSavedInspect, wearOf } from "../inspect-core.js";
import { pageHead } from "./common.js";

const DOPPLER = { 415: "Ruby", 416: "Sapphire", 417: "Black Pearl", 418: "Phase 1", 419: "Phase 2", 420: "Phase 3", 421: "Phase 4", 568: "Emerald", 569: "Phase 1", 570: "Phase 2", 571: "Phase 3", 572: "Phase 4" };
let index = null;
function findSkin(def, paint) {
  if (!index) { index = new Map(); for (const s of D.skins) index.set(s.wi + "_" + (s.pi || 0), s); }
  return index.get(def + "_" + paint) || (paint === 0 ? [...index.values()].find(s => s.wi === def && !s.p) : null);
}
const skinOf = r => r.manual || findSkin(r.defIndex, r.paintIndex);
const stickersOf = r => [...r.stickers.map(a => ({ ...a, k: "Sticker", e: D.byId.get("sticker-" + a.id) })), ...r.charms.map(a => ({ ...a, k: "Charm", e: D.byId.get("keychain-" + a.id) }))];
const stkValue = stk => stk.reduce((t, a) => t + (a.e ? (bestUsd(a.e.mh) || 0) : 0), 0);
const priceAtFloat = (s, fl, st, sv) => { const w = wearFromFloat(fl); return s?.wr ? bestUsd(mhnFor(s, s.wr.includes(w) ? w : null, { st, sv })) : null; };

export async function renderInspect(root, args = []) {
  let saved = cleanSavedInspect(await getKV("inspectSaved", null));
  root.innerHTML = `${pageHead("Inspect & Float", "Avkoda inspect-länkar direkt i webbläsaren, se var floaten ligger, jämför två länkar och spara intressanta resultat.")}
  <div class="panel" style="margin-bottom:14px"><h2>Inspect Link Decoder</h2>
    <textarea class="inp" id="lnk" rows="2" style="width:100%" placeholder="steam://rungame/730/…/+csgo_econ_action_preview%20001807… (klistra in länk eller hex)" aria-label="Inspect-länk A"></textarea>
    <details id="cmpBox" style="margin-top:8px"><summary class="muted small" style="cursor:pointer;width:max-content">Jämför med en andra länk</summary>
      <textarea class="inp" id="lnkB" rows="2" style="width:100%;margin-top:6px" placeholder="Länk B (valfritt)" aria-label="Inspect-länk B"></textarea></details>
    <div class="row" style="margin-top:8px"><button class="btn" id="dec">Avkoda</button><span class="small" id="err" role="alert" style="color:#e8857a"></span></div>
    <p class="muted small" style="margin-bottom:0">Tips: i CS2-inventoryt, högerklicka ett föremål → Inspect → kopiera länken. Allt avkodas lokalt – inget skickas någonstans. Avkodningen kontrollerar att länken går att tolka och ger rimliga värden, men länkens egen kontrollsumma verifieras inte.</p></div>
  <div id="cmp"></div><div id="out"></div><div id="outB"></div><div id="savedList"></div>`;

  const decodeOne = (text, label) => { try { return { r: decodeInspect(text) }; } catch (e) { return { err: (label ? `Länk ${label}: ` : "") + e.message }; } };
  const go = () => {
    const a = $("#lnk", root).value, b = $("#lnkB", root).value.trim(), err = $("#err", root);
    err.textContent = ""; $("#cmp", root).innerHTML = ""; $("#outB", root).innerHTML = "";
    const A = decodeOne(a, b ? "A" : ""); if (A.err) { err.textContent = A.err; $("#out", root).innerHTML = ""; return; }
    let B = null;
    if (b) { B = decodeOne(b, "B"); if (B.err) { err.textContent = B.err; B = null; } }
    show($("#out", root), A.r, { label: B ? "A" : "", hex: extractHex(a), onSave });
    if (B) { show($("#outB", root), B.r, { label: "B", hex: extractHex(b), onSave }); compare($("#cmp", root), A.r, B.r); }
  };
  $("#dec", root).addEventListener("click", go);
  const simulate = (skin, float, seed, label = "") => show($("#out", root), { defIndex: skin.wi, paintIndex: +skin.pi || 0, float, seed, stickers: [], charms: [], stattrak: null, nametag: "", warnings: [], manual: skin }, { label, hex: null, onSave });
  if (args[0] && D.byId.get(args[0])) { const s = D.byId.get(args[0]); simulate(s, s.f ? (s.f[0] + s.f[1]) / 2 : 0.1, 0); }

  // ----- sparade resultat -----
  async function onSave(r, ctx, fl, seed) {
    const s = skinOf(r), name = `${s ? (s.p ? `${s.w} | ${s.p}` : s.n) : "Okänt föremål"} · float ${dec(fl, 4)}`;
    const entry = { id: uid(), name, hex: ctx.hex || null, sim: ctx.hex ? null : { skin: r.manual?.id, float: +fl.toFixed(8), seed }, created: Date.now() };
    saved = cleanSavedInspect([entry, ...saved]); await setKV("inspectSaved", saved); toast("Resultatet sparat"); paintSaved();
  }
  function paintSaved() {
    const host = $("#savedList", root);
    if (!saved.length) { host.innerHTML = ""; return; }
    host.innerHTML = `<div class="panel" style="margin-top:14px"><h2>Sparade resultat (${saved.length})</h2>${saved.map((c, i) => `<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--line);gap:8px"><span class="small" style="min-width:0">${esc(c.name)} <span class="faint">${c.hex ? "· avkodad länk" : "· simulering"}</span></span><span style="white-space:nowrap"><button class="btn ghost sm" data-open="${i}">Öppna</button> <button class="btn ghost sm" data-b="${i}" ${c.hex ? "" : "disabled"} title="Använd som länk B för jämförelse">Som B</button> <button class="btn ghost sm danger" data-del="${i}" aria-label="Ta bort">✕</button></span></div>`).join("")}<p class="muted small" style="margin:8px 0 0">Sparas bara i den här webbläsaren. Avkodade länkar sparas som sin hex-kod och avkodas på nytt när du öppnar dem.</p></div>`;
    host.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
      const c = saved[+b.dataset.open]; $("#lnkB", root).value = ""; $("#cmp", root).innerHTML = ""; $("#outB", root).innerHTML = "";
      if (c.hex) { $("#lnk", root).value = c.hex; go(); } else { const s = D.byId.get(c.sim.skin); if (s) simulate(s, c.sim.float, c.sim.seed); else $("#err", root).textContent = "Skinet i det sparade resultatet finns inte längre i databasen."; }
      scrollTo(0, 0);
    }));
    host.querySelectorAll("[data-b]").forEach(b => b.addEventListener("click", () => { $("#lnkB", root).value = saved[+b.dataset.b].hex; $("#cmpBox", root).open = true; toast("Inlagd som länk B – tryck Avkoda"); }));
    host.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { saved.splice(+b.dataset.del, 1); await setKV("inspectSaved", saved); paintSaved(); }));
  }
  paintSaved();
}

/** Jämförelse av två avkodade länkar. */
function compare(host, a, b) {
  const sa = skinOf(a), sb = skinOf(b), c = compareDecoded(a, b);
  const name = (s, r) => esc(s ? (s.p ? `${s.w} | ${s.p}` : s.n) : "Okänt föremål (defindex " + r.defIndex + ")");
  const pos = (s, r) => { const p = s?.f && r.float != null ? floatPosition(r.float, s.f[0], s.f[1]) : null; return p ? (p.outside ? `<span style="color:#d9b36a">utanför skinets intervall (${dec(s.f[0], 2)}–${dec(s.f[1], 2)})</span>` : `${dec(p.pos, 1)} % in i intervallet`) : "–"; };
  const stA = stickersOf(a), stB = stickersOf(b);
  const price = (s, r) => { const u = r.float != null ? priceAtFloat(s, r.float, r.stattrak != null, r.quality === 12) : null; return u ? kr(usd2sek(u)) : MISSING; };
  const hl = (cond) => (cond ? "font-weight:700" : "");
  const row = (label, x, y, bx = false, by = false) => `<tr><th style="white-space:nowrap">${label}</th><td style="${hl(bx)}">${x}</td><td style="${hl(by)}">${y}</td></tr>`;
  const fA = a.float, fB = b.float;
  const verdict = c.lower === null ? "Någon av länkarna saknar float – ingen float-jämförelse kan göras." : c.lower === "lika" ? "Floaten är identisk." : `<b>${c.lower}</b> har lägre float (skillnad ${dec(Math.abs(c.floatDiff), 8)}${c.relPct != null ? `, B är ${c.relPct > 0 ? "+" : "−"}${dec(Math.abs(c.relPct), 1)} % mot A` : ""}). ${c.sameWear ? "Samma slitagegrad." : "<b>Olika slitagegrad</b> (" + WEAR_LONG[wearOf(fA)] + " mot " + WEAR_LONG[wearOf(fB)] + ")."}`;
  host.innerHTML = `<div class="panel" style="margin-bottom:14px"><h2>Jämförelse A mot B</h2>
    ${c.sameItem ? "" : `<p class="small" style="color:#d9b36a;margin:0 0 8px">⚠ Det är inte samma skin – floaten jämförs ändå, men säger inget om vilket som är mest värt.</p>`}
    <div class="scroll-x"><table class="tbl"><thead><tr><th></th><th>A</th><th>B</th></tr></thead><tbody>
      ${row("Skin", name(sa, a), name(sb, b))}
      ${row("Float", fA != null ? `<span class="num">${dec(fA, 8)}</span>` : "–", fB != null ? `<span class="num">${dec(fB, 8)}</span>` : "–", c.lower === "A", c.lower === "B")}
      ${row("Slitage", fA != null ? WEAR_LONG[wearOf(fA)] : "–", fB != null ? WEAR_LONG[wearOf(fB)] : "–")}
      ${row("Plats i skinets intervall", pos(sa, a), pos(sb, b))}
      ${row("Paint seed", a.seed, b.seed)}${row("Paint index", a.paintIndex || "–", b.paintIndex || "–")}
      ${row("StatTrak™", a.stattrak != null ? "Ja (" + a.stattrak + ")" : "Nej", b.stattrak != null ? "Ja (" + b.stattrak + ")" : "Nej")}
      ${row("Stickers / charms", stA.length ? stA.map(x => esc(x.e?.n || x.k + " #" + x.id)).join("<br>") : "–", stB.length ? stB.map(x => esc(x.e?.n || x.k + " #" + x.id)).join("<br>") : "–")}
      ${row("Sticker-summa (marknadspris)", stA.length ? kr(usd2sek(stkValue(stA))) : "–", stB.length ? kr(usd2sek(stkValue(stB))) : "–")}
      ${row("Lägsta pris för slitaget", price(sa, a), price(sb, b))}</tbody></table></div>
    <p class="small" style="margin:10px 0 0">${verdict}</p>
    <p class="muted small" style="margin:6px 0 0">Priset är lägsta utropspris för slitaget – det tar inte hänsyn till exakt float, seed eller stickers.</p></div>`;
}

/** Detaljvy för ett avkodat (eller simulerat) föremål. */
function show(out, r, ctx = {}) {
  const s = skinOf(r);
  const lo = s?.f?.[0] ?? 0, hi = s?.f?.[1] ?? 1;
  const st = r.stattrak != null, sv = r.quality === 12;
  const noFloat = !r.manual && r.float == null; // länken saknar float: värdet nedan är bara ett exempel
  let fl = r.float ?? (lo + hi) / 2, seed = r.seed;
  const stk = stickersOf(r), stkVal = stkValue(stk);

  out.innerHTML = `<div class="grid split" style="grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:start;margin-bottom:14px">
    <div><div class="hero-img"><img id="pic" src="${esc(s ? imgUrl(s.img, "512fx384f") : "")}" alt=""></div>
      <div class="muted small" style="margin-top:6px">Bilden är skinets standardbild; slitaget är en visuell simulering.</div></div>
    <div>${ctx.label ? `<span class="chip on" style="margin-bottom:6px">Länk ${esc(ctx.label)}</span>` : ""}<div class="muted small">${esc(s?.w || "Okänt vapen (defindex " + r.defIndex + ")")}${st ? " · StatTrak™" : ""}${sv ? " · Souvenir" : ""}</div>
      <h1 style="font-size:22px">${esc(s ? (s.p ? `${s.w} | ${s.p}` : s.n) : "Okänt föremål")}${DOPPLER[r.paintIndex] ? ` <span class="muted">· ${DOPPLER[r.paintIndex]}</span>` : ""}</h1>
      ${s ? `<span class="chip on" style="border-color:${esc(s.rc)}"><i class="dot" style="background:${esc(s.rc)}"></i>${esc(s.r)}</span> <a class="muted small" href="#/item/${esc(s.id)}" style="text-decoration:underline">Databassida</a>` : `<p class="muted">Skinet finns inte i databasen (kan vara nytt).</p>`}
      <div class="panel srcBox" style="margin-top:12px;font-size:13px">${r.manual
        ? `<b>✎ Simulering</b><div class="muted small">Inget är avkodat ur en länk. Float och seed är värden du själv väljer – exempel på hur skinet kan se ut och vad det kan vara värt.</div>`
        : `<b class="pos">✔ Avkodat ur inspect-länken</b><div class="muted small">Skin, ${noFloat ? "" : "float, "}paint seed, paint index${st ? ", StatTrak-räknare" : ""}${r.nametag ? ", namntag" : ""}${stk.length ? ", stickers/charms" : ""} kommer direkt ur länken. <span class="chg"></span></div>`}
        ${(r.warnings || []).map(w => `<div class="small" style="color:#d9b36a;margin-top:4px">⚠ ${esc(w)}</div>`).join("")}</div>
      <div class="panel" style="margin-top:12px"><div class="row spread"><b>Float</b><b class="num fv"></b></div>
        <input type="range" class="fs" min="0" max="1" step="0.00001" style="width:100%;margin-top:8px" aria-label="Float">
        <div class="fbar"><i class="fmark" style="width:3px"></i></div><div class="fscale"><span>0,00</span><span>0,07</span><span>0,15</span><span>0,38</span><span>0,45</span><span>1,00</span></div>
        <div class="muted small fnote" style="margin-top:8px"></div>
        <div class="small rangeNote" style="margin-top:8px"></div>
        <div class="form" style="margin-top:10px"><label>Float (exakt)<input class="inp fi" type="number" step="0.00000001" min="0" max="1"></label><label>Paint seed<input class="inp sd" type="number" min="0" max="1000" value="${seed}"></label></div></div>
      <dl class="kv panel kvbox" style="margin:12px 0"></dl>
      <div class="panel wtab" style="margin-bottom:12px"></div>
      ${stk.length ? `<div class="panel"><h2>Stickers & charms</h2>${stk.map(a => `<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row" style="flex-wrap:nowrap">${a.e ? `<img src="${esc(imgUrl(a.e.img, "64fx48f"))}" style="width:44px" alt="">` : ""}<div><div>${esc(a.e?.n || a.k + " #" + a.id)}</div><div class="muted small">${a.k === "Sticker" ? `Plats ${a.slot + 1} · slitage ${a.wear ? dec(a.wear * 100, 0) + " %" : "0 %"}` : `Charm${a.pattern != null ? " · pattern #" + a.pattern : ""}`}</div></div></div><span class="num">${a.e && bestUsd(a.e.mh) ? kr(usd2sek(bestUsd(a.e.mh))) : MISSING}</span></div>`).join("")}
        <div class="row spread" style="margin-top:8px"><span class="muted small">Summa (marknadspris, utan sticker-premium)</span><b class="num">${kr(usd2sek(stkVal))}</b></div></div>` : ""}
      <div class="row" style="margin-top:12px"><button class="btn add" ${s ? "" : "disabled"}>+ Lägg i inventory med float & seed</button><button class="btn ghost sv" ${s && !noFloat ? "" : "disabled"}>Spara resultat</button></div></div></div>`;

  const q = c => out.querySelector(c);
  const refresh = () => {
    const w = wearFromFloat(fl), mhn = s?.wr ? mhnFor(s, s.wr.includes(w) ? w : null, { st, sv }) : null;
    const u = mhn ? bestUsd(mhn) : null, [a, b] = WEAR_RANGE[w];
    q(".fv").textContent = dec(fl, 8) + " · " + WEAR_LONG[w];
    q(".fs").value = fl; q(".fi").value = +fl.toFixed(8);
    q(".fmark").style.left = `calc(${fl * 100}% - 1px)`;
    q(".fnote").textContent = `${dec(((fl - a) / (b - a)) * 100, 1)} % in i ${w}-bandet (${dec(a, 2)}–${dec(b, 2)}). Skinets float-intervall: ${dec(lo, 2)}–${dec(hi, 2)}.` + (s && (fl < lo || fl > hi) ? " ⚠ Utanför skinets möjliga intervall." : "");
    // var ligger floaten i skinets möjliga intervall, och hur nära en slitagegräns?
    const fp = s?.f ? floatPosition(fl, lo, hi) : null, bi = boundaryInfo(fl);
    const patKind = s && ["Case Hardened", "Heat Treated"].includes(s.p) ? "ch" : s && s.p === "Fade" ? "fade" : null; // bara äkta Fade har beräknade procent (inte Amber/Acid Fade)
    q(".rangeNote").innerHTML = [patKind && s.w ? `<a href="#/patterns/${patKind}/${encodeURIComponent(s.w)}/${seed}" style="text-decoration:underline">Visa seed ${seed} i Pattern Explorer</a> <span class="faint small">(mönsterrank och procent)</span>` : "",fp && !fp.outside ? `📍 <b>${dec(fp.pos, 1)} %</b> in i skinets möjliga float-intervall – lägre än ungefär ${dec(fp.lowerThan, 0)} % av alla möjliga floats <span class="faint">(antar jämn fördelning, en förenkling)</span>.` : "", bi && bi.distance < 0.02 ? `Nära slitagegränsen ${dec(bi.boundary, 2)}: ${dec(bi.distance, 5)} ${bi.side} gränsen (${bi.side === "över" ? "precis ovanför" : "precis under"} ${WEAR_LONG[bi.neighbor]}).` : ""].filter(Boolean).join("<br>");
    const pic = q("#pic"); if (pic) pic.style.filter = `saturate(${1 - fl * 0.55}) brightness(${1 - fl * 0.28}) contrast(${1 + fl * 0.15})`;
    const row = mhn && priceRow(mhn);
    const changed = !r.manual && !noFloat && (Math.abs(fl - (r.float ?? fl)) > 1e-9 || seed !== r.seed);
    const tag = (txt, sim) => `${txt} <span class="faint small">${r.manual || sim ? "simulerat" : "avkodat"}</span>`;
    const chg = q(".chg"); if (chg) chg.innerHTML = changed ? `<b class="neg">Du har ändrat float/seed – det du ser nu är en simulering, inte originalet.</b> <button class="btn ghost sm rst">Återställ originalvärden</button>` : "";
    q(".rst")?.addEventListener("click", () => { fl = r.float; seed = r.seed; q(".sd").value = seed; refresh(); });
    q(".kvbox").innerHTML = [
      ["Slitage", noFloat ? `${WEAR_LONG[w]} <span class="faint small">exempel</span>` : tag(WEAR_LONG[w], changed)], ["Paint seed", tag(seed, changed)], ["Paint index", r.manual ? (r.paintIndex || "–") : tag(r.paintIndex || "–")], st ? ["StatTrak-räknare", tag(r.stattrak)] : null,
      r.nametag ? ["Namntag", tag(`"${esc(r.nametag)}"`)] : null, r.itemId ? ["Item-ID", tag(esc(r.itemId))] : null,
      ["Lägsta pris (" + w + ")", u ? kr(usd2sek(u)) : MISSING],
      ...(row ? MARKETS.filter(x => row[x.key]).map(x => ["&nbsp;&nbsp;" + x.name, kr(usd2sek(row[x.key]))]) : []),
    ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd class="num">${v}</dd>`).join("");
    // slitagegrader och pris: hur ändras värdet om floaten ändras?
    const wt = s?.wr ? wearTable(lo, hi, s.wr) : [];
    q(".wtab").innerHTML = wt.length ? `<h2 style="margin-top:0">Slitage och pris</h2><table class="tbl"><thead><tr><th>Slitage</th><th>Float-band</th><th class="r">Lägsta pris</th></tr></thead><tbody>${wt.map(x => { const p = bestUsd(mhnFor(s, x.wear, { st, sv })); return `<tr style="${x.wear === w ? "font-weight:700" : ""}"><td>${WEAR_LONG[x.wear]}${x.wear === w ? " ◀" : ""}</td><td class="num">${dec(x.from, 2)}–${dec(x.to, 2)}</td><td class="r num">${p ? kr(usd2sek(p)) : MISSING}</td></tr>`; }).join("")}</tbody></table><div class="muted small" style="margin-top:6px">Priset gäller slitagegraden i stort (lägsta utropspris), inte exakt float eller seed. Flytta reglaget ovan för att se när floaten byter slitage.</div>` : "";
    out._mhn = mhn;
  };
  q(".fs").addEventListener("input", e => { fl = +e.target.value; refresh(); });
  q(".fi").addEventListener("input", e => { const v = parseFloat(e.target.value); if (v >= 0 && v <= 1) { fl = v; refresh(); } });
  q(".sd").addEventListener("input", e => { seed = Math.max(0, Math.min(1000, Math.floor(+e.target.value) || 0)); refresh(); });
  q(".add").addEventListener("click", async e => {
    const btn = e.currentTarget; if (btn.disabled) return; btn.disabled = true; setTimeout(() => btn.disabled = false, 1500); // skydd mot dubbelklick
    await put("items", { id: uid(), mhn: out._mhn || mhnFor(s, null), qty: 1, float: noFloat ? null : +fl.toFixed(8), seed, nametag: r.nametag || "", stickers: r.stickers, source: "inspect", added: Date.now() });
    toast("Tillagd i inventory");
  });
  q(".sv").addEventListener("click", () => ctx.onSave && (r.manual ? ctx.onSave(r, ctx, fl, seed) : ctx.onSave(r, ctx, r.float ?? fl, r.seed))); // simuleringar sparas med de värden du valt, länkar med originalet
  refresh();
}
