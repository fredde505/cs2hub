import { $, $$, esc, imgUrl, kr, krm, dec, usd2sek, toast, WEAR_LONG, modal, uid, confirmBox, copyText, MISSING } from "../util.js";
import { getKV, setKV } from "../store.js";
import { D, mhnFor, bestUsd, priceInfo } from "../data.js";
import { pageHead, itemPicker, dispName } from "./common.js";

// Fyra förinställda stickerplatser längs vapnet (procent av bilden) – dras fritt i förhandsvisningen.
const SLOT_POS = [[30, 52], [44, 52], [58, 52], [72, 52]];
const CHARM_POS = { x: 13, y: 66 };
let S = null; // {skin, wear, st:[{id,x,y,r,sc,w}], ch:{id,x,y}|null, zoom, flip}
let crafts = [], cur = { id: null, name: "Ny craft" };

const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dec_ = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))));
const priceSek = e => { const i = e ? priceInfo(e.mh) : null; return i ? usd2sek(i.usd) : null; };
const skinPrice = () => { const s = D.byId.get(S.skin); if (!s) return null; const i = priceInfo(mhnFor(s, S.wear)); return i ? usd2sek(i.usd) : null; };

// Grov tumregel – inget exakt pris: dyra stickers ger relativt större tillägg, slitage minskar, identiska stickers ("pure craft") ger bonus.
function premium() {
  const items = S.st.map(a => ({ a, e: D.byId.get("sticker-" + a.id) })).filter(x => x.e);
  let add = 0;
  for (const { a, e } of items) {
    const p = priceSek(e) ?? 0, f = p < 20 ? 0.02 : p < 200 ? 0.08 : p < 2000 ? 0.15 : 0.25;
    add += p * f * (1 - a.w);
  }
  const ids = items.map(x => x.a.id);
  if (items.length >= 3 && new Set(ids).size === 1) add *= 1.5;
  return Math.min(add, Math.max((skinPrice() ?? 0) * 3, 0));
}

/** Länkdata är opålitlig: tvätta till tal inom giltiga intervall (värdena hamnar i style-attribut). */
function clean(d) {
  const n = (v, lo, hi, def) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  return {
    skin: typeof d?.skin === "string" ? d.skin : null, wear: typeof d?.wear === "string" ? d.wear : "FT",
    st: (Array.isArray(d?.st) ? d.st : []).slice(0, 4).map((a, i) => ({ id: Math.floor(n(a?.id, 0, 1e7, 0)), x: n(a?.x, 0, 100, SLOT_POS[i][0]), y: n(a?.y, 0, 100, 52), r: n(a?.r, -180, 180, 0), sc: n(a?.sc, 0.6, 2.2, 1), w: n(a?.w, 0, 1, 0) })),
    ch: d?.ch && typeof d.ch === "object" ? { id: Math.floor(n(d.ch.id, 0, 1e7, 0)), x: n(d.ch.x, 0, 100, CHARM_POS.x), y: n(d.ch.y, 0, 100, CHARM_POS.y) } : null,
    zoom: n(d?.zoom, 1, 2.6, 1), flip: !!d?.flip,
  };
}

export async function renderWorkshop(root, args = []) {
  crafts = await getKV("crafts", []);
  if (args[0]) { try { const d = dec_(args[0]); S = clean({ skin: d.s, wear: d.w, st: d.st, ch: d.ch, zoom: d.z, flip: d.f }); cur = { id: null, name: "Delad craft" }; } catch { /* ignorera trasig länk */ } }
  S = clean(S || { skin: null, wear: "FT", st: [], ch: null });
  draw(root);
}

function draw(root) {
  const skin = D.byId.get(S.skin);
  const stk = S.st.map(a => ({ a, e: D.byId.get("sticker-" + a.id) }));
  const charm = S.ch && D.byId.get("keychain-" + S.ch.id);
  const sp = skinPrice(), stkCost = stk.reduce((t, x) => t + (priceSek(x.e) ?? 0), 0), chCost = priceSek(charm) ?? 0, add = premium();
  const missing = stk.filter(x => x.e && priceSek(x.e) == null).length + (charm && priceSek(charm) == null ? 1 : 0) + (skin && sp == null ? 1 : 0);
  const f = S.flip ? -1 : 1;
  root.innerHTML = `${pageHead("Sticker & Charm Workshop", "Testa upp till fyra stickers med valfri placering och slitage plus en charm. Dra i bilden för att flytta, klicka på en sticker för att byta ut den.")}
  <div class="panel" style="margin-bottom:12px;border-color:#3b3f46"><span class="muted small"><b>Observera:</b> det här är en förenklad förhandsvisning – stickers ritas ovanpå skinets standardbild. Placering, storlek och slitage är en uppskattning och <b>inte</b> en garanterad bild av hur föremålet ser ut i spelet.</span></div>
  <div class="toolbar"><select class="inp" id="cl" aria-label="Sparade crafts"><option value="">Sparade crafts (${crafts.length})</option>${crafts.map(c => `<option value="${esc(c.id)}" ${c.id === cur.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
    <input class="inp" id="cn" value="${esc(cur.name)}" aria-label="Namn på craft" style="min-width:160px"><button class="btn" id="sv" ${skin ? "" : "disabled"}>Spara craft</button>${cur.id ? '<button class="btn ghost danger" id="dl">Ta bort</button>' : ""}<button class="btn ghost" id="nw">Ny</button></div>
  <div class="grid split" style="grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start">
    <div><div class="hero-img" id="stage" style="position:relative;overflow:hidden;touch-action:none;aspect-ratio:16/10">
      <div id="inner" style="position:absolute;inset:0;transform:scale(${S.zoom}) scaleX(${f});transform-origin:50% 55%;transition:transform .15s">
      ${skin ? `<img src="${esc(imgUrl(skin.img, "512fx384f"))}" alt="${esc(skin.n)}" draggable="false" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">` : ""}
      ${skin && charm ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"><line x1="14" y1="54" x2="${S.ch.x}" y2="${S.ch.y}" stroke="#9aa0a8" stroke-width=".35" stroke-dasharray="1 .7"/></svg>
        <img data-d="c" draggable="false" alt="${esc(charm.n)}" src="${esc(imgUrl(charm.img, "128fx96f"))}" style="position:absolute;left:${S.ch.x}%;top:${S.ch.y}%;width:12%;transform:translate(-50%,-50%) scaleX(${f});cursor:grab;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))">` : ""}
      ${skin ? stk.map((x, i) => x.e ? `<img data-d="s${i}" draggable="false" alt="${esc(x.e.n)}" src="${esc(imgUrl(x.e.img, "128fx96f"))}" style="position:absolute;left:${x.a.x}%;top:${x.a.y}%;width:${x.a.sc * 9}%;transform:translate(-50%,-50%) rotate(${x.a.r}deg) scaleX(${f});opacity:${(1 - x.a.w * 0.7).toFixed(2)};filter:saturate(${(1 - x.a.w * 0.7).toFixed(2)}) contrast(${(1 - x.a.w * 0.25).toFixed(2)}) blur(${(x.a.w * 0.6).toFixed(2)}px);cursor:grab;mix-blend-mode:normal">` : "").join("") : ""}
      </div>${skin ? "" : `<span class="muted">Välj ett vapenskin för att börja</span>`}</div>
      <div class="row" style="margin-top:10px"><label class="small muted">Zoom <input type="range" id="zm" min="1" max="2.6" step="0.1" value="${S.zoom}" style="vertical-align:middle;width:140px"></label>
        <button class="btn ghost sm" id="fl" aria-pressed="${S.flip}">⇋ Vänd (andra sidan)</button><button class="btn ghost sm" id="rp">Återställ platser</button>
        <button class="btn" id="share" ${skin ? "" : "disabled"}>Dela craft</button></div></div>
    <div class="grid">
      <div class="panel"><h2>Vapenskin</h2><div id="pkSkin"></div>${skin ? `<div class="row" style="margin-top:10px"><b style="flex:1">${esc(dispName(skin))}</b><select class="inp" id="wear" aria-label="Slitage">${skin.wr.map(w => `<option value="${w}" ${w === S.wear ? "selected" : ""}>${WEAR_LONG[w]}</option>`).join("")}</select></div>` : ""}</div>
      <div class="panel"><h2>Stickers (${S.st.length}/4)</h2>${S.st.length < 4 ? `<div id="pkSt"></div>` : ""}
        ${stk.map((x, i) => `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="row spread"><span>${i + 1}. ${esc(x.e?.n.replace("Sticker | ", "") || "Okänd sticker")}</span><span class="num small">${krm(priceSek(x.e))} <button class="btn ghost sm" data-sw="${i}">Byt</button> <button class="btn ghost sm danger" data-rm="${i}" aria-label="Ta bort sticker ${i + 1}">✕</button></span></div>
          <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(100px,1fr));margin-top:6px"><label>Slitage ${dec(x.a.w * 100, 0)} %<input type="range" min="0" max="1" step="0.01" value="${x.a.w}" data-k="w${i}"></label><label>Storlek<input type="range" min="0.6" max="2.2" step="0.05" value="${x.a.sc}" data-k="sc${i}"></label><label>Rotation<input type="range" min="-180" max="180" step="1" value="${x.a.r}" data-k="r${i}"></label></div></div>`).join("")}</div>
      <div class="panel"><h2>Charm</h2>${charm ? `<div class="row spread"><span>${esc(charm.n.replace("Charm | ", ""))}</span><span class="num small">${krm(priceSek(charm))} <button class="btn ghost sm" id="swCh">Byt</button> <button class="btn ghost sm danger" id="rmCh" aria-label="Ta bort charm">✕</button></span></div>` : `<div id="pkCh"></div>`}</div>
      <div class="panel"><h2>Kostnad</h2><dl class="kv"><dt>Skin</dt><dd class="num">${krm(sp)}</dd>${stk.map((x, i) => `<dt>Sticker ${i + 1}</dt><dd class="num">${krm(priceSek(x.e))}</dd>`).join("")}${charm ? `<dt>Charm</dt><dd class="num">${krm(priceSek(charm))}</dd>` : ""}
        <dt><b>Totalt bygge</b></dt><dd class="num"><b>${kr((sp ?? 0) + stkCost + chCost)}</b></dd><dt>Uppskattat värdetillägg</dt><dd class="num">≈ ${kr(add)}</dd><dt>Uppskattat värde</dt><dd class="num">≈ ${kr((sp ?? 0) + add + chCost * 0.5)}</dd></dl>
        ${missing ? `<p class="small" style="margin:8px 0 0"><span class="miss">Pris saknas</span> <span class="muted">för ${missing} del${missing > 1 ? "ar" : ""} – de ingår inte i summan.</span></p>` : ""}
        <p class="muted small" style="margin-bottom:0">Värdetillägget är en grov tumregel (dyra stickers och lågt slitage väger tyngre, identiska stickers ger bonus). Verkliga priser beror på köpare, placering och efterfrågan.</p></div>
    </div></div>`;

  const skinPick = $("#pkSkin", root); if (skinPick) itemPicker(skinPick, e => { S.skin = e.id; S.wear = e.wr.includes("FT") ? "FT" : e.wr[0]; draw(root); }, { kinds: ["weapon"], placeholder: skin ? "Byt skin…" : "Sök vapenskin (t.ex. AK-47 Redline)…" });
  const stPick = $("#pkSt", root); if (stPick) itemPicker(stPick, e => { const i = S.st.length; S.st.push({ id: +e.id.replace("sticker-", ""), x: SLOT_POS[i][0], y: SLOT_POS[i][1], r: 0, sc: 1, w: 0 }); draw(root); }, { kinds: ["sticker"], placeholder: "Sök sticker…" });
  const chPick = $("#pkCh", root); if (chPick) itemPicker(chPick, e => { S.ch = { id: +e.id.replace("keychain-", ""), x: CHARM_POS.x, y: CHARM_POS.y }; draw(root); }, { kinds: ["charm"], placeholder: "Sök charm…" });
  $("#wear", root)?.addEventListener("change", e => { S.wear = e.target.value; draw(root); });
  $$("[data-rm]", root).forEach(b => b.addEventListener("click", () => { S.st.splice(+b.dataset.rm, 1); draw(root); }));
  $$("[data-sw]", root).forEach(b => b.addEventListener("click", () => swap(root, +b.dataset.sw)));
  $("#swCh", root)?.addEventListener("click", () => { S.ch = null; draw(root); });
  $("#rmCh", root)?.addEventListener("click", () => { S.ch = null; draw(root); });
  $$("[data-k]", root).forEach(r => r.addEventListener("change", () => { const m = r.dataset.k.match(/^(w|sc|r)(\d+)$/); S.st[+m[2]][m[1]] = +r.value; draw(root); }));
  $("#zm", root).addEventListener("input", e => { S.zoom = +e.target.value; $("#inner", root).style.transform = `scale(${S.zoom}) scaleX(${S.flip ? -1 : 1})`; });
  $("#fl", root).addEventListener("click", () => { S.flip = !S.flip; draw(root); });
  $("#rp", root).addEventListener("click", () => { S.st.forEach((a, i) => { a.x = SLOT_POS[i][0]; a.y = SLOT_POS[i][1]; a.r = 0; }); if (S.ch) { S.ch.x = CHARM_POS.x; S.ch.y = CHARM_POS.y; } draw(root); });
  $("#share", root).addEventListener("click", () => copyText(location.origin + location.pathname + "#/workshop/" + enc({ s: S.skin, w: S.wear, st: S.st, ch: S.ch, z: S.zoom, f: S.flip }), "Länk till craften kopierad"));
  $("#cn", root).addEventListener("input", e => cur.name = e.target.value);
  $("#cl", root).addEventListener("change", e => { const c = crafts.find(x => x.id === e.target.value); if (c) { S = clean(c.state); cur = { id: c.id, name: c.name }; draw(root); } });
  $("#nw", root).addEventListener("click", () => { S = clean({ skin: null, wear: "FT" }); cur = { id: null, name: "Ny craft" }; draw(root); });
  $("#sv", root).addEventListener("click", async () => {
    const id = cur.id || uid(), rec = { id, name: cur.name || "Craft", state: JSON.parse(JSON.stringify(S)), created: Date.now() };
    crafts = [rec, ...crafts.filter(c => c.id !== id)]; cur.id = id; await setKV("crafts", crafts); toast("Craft sparad"); draw(root);
  });
  $("#dl", root)?.addEventListener("click", async () => { if (await confirmBox("Ta bort den sparade craften?", { ok: "Ta bort", danger: true })) { crafts = crafts.filter(c => c.id !== cur.id); await setKV("crafts", crafts); cur = { id: null, name: "Ny craft" }; draw(root); } });

  // Dra stickers/charm i förhandsvisningen; ett klick (utan drag) på en sticker öppnar byte
  const stage = $("#stage", root);
  $$("[data-d]", root).forEach(img => img.addEventListener("pointerdown", ev => {
    ev.preventDefault(); img.setPointerCapture(ev.pointerId);
    const tgt = img.dataset.d === "c" ? S.ch : S.st[+img.dataset.d.slice(1)];
    const r0 = stage.getBoundingClientRect(), sx = ev.clientX, sy = ev.clientY; let moved = false;
    const move = e => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 4) moved = true; if (!moved) return;
      const r = stage.getBoundingClientRect(), z = S.zoom;
      let px = ((e.clientX - r.left) / r.width - 0.5) / z * 100 * (S.flip ? -1 : 1) + 50, py = ((e.clientY - r.top) / r.height - 0.55) / z * 100 + 55;
      tgt.x = +Math.min(98, Math.max(2, px)).toFixed(1); tgt.y = +Math.min(98, Math.max(2, py)).toFixed(1); img.style.left = tgt.x + "%"; img.style.top = tgt.y + "%";
    };
    const up = () => { img.removeEventListener("pointermove", move); if (!moved && img.dataset.d !== "c") swap(root, +img.dataset.d.slice(1)); else if (moved) draw(root); };
    img.addEventListener("pointermove", move); img.addEventListener("pointerup", up, { once: true });
  }));
}

/** Byt ut en sticker på en given plats via sökning. */
function swap(root, i) {
  modal(`<div class="row spread"><h3 style="margin:0">Byt sticker ${i + 1}</h3><button class="btn ghost sm" data-close>Stäng</button></div><div id="pk" style="margin-top:10px"></div>`, {
    onMount: (m, close) => itemPicker($("#pk", m), e => { S.st[i].id = +e.id.replace("sticker-", ""); close(); draw(root); }, { kinds: ["sticker"], placeholder: "Sök ny sticker…" }).focus(),
  });
}
