import { $, esc, toast, kr, modal, download } from "../util.js";
import { getKV } from "../store.js";
import { STEAM_PROXY } from "../config.js";

/** Delbart bildkort (PNG). Visar ALDRIG inköpspris, vinst eller transaktioner – bara föremål och (valfritt) marknadsvärde. */
const W = 1200, PAD = 40, GAP = 20, COLS = 4, TILE_H = 236, IMG_H = 150;
const FONT = `"Inter","Segoe UI",system-ui,-apple-system,sans-serif`;
const imgCache = new Map();

async function proxyBase() { return ((await getKV("proxyUrl", "")) || STEAM_PROXY || "").replace(/\/$/, ""); }
/** Hämtar en skinbild via proxyn (Steams CDN saknar CORS). Ger null om det inte går – kortet ritas då utan bild. */
async function loadImg(url, base) {
  if (!url || !base) return null;
  if (imgCache.has(url)) return imgCache.get(url);
  const p = (async () => {
    try {
      const r = await fetch(`${base}/img?u=${encodeURIComponent(url)}`); if (!r.ok) return null;
      return await createImageBitmap(await r.blob());
    } catch { return null; }
  })();
  imgCache.set(url, p); return p;
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fit(ctx, text, maxW) { // kapar texten med … så den ryms
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "#666a72";

export async function drawCard(canvas, { title, entries, total, showPrices, showTotal, count }) {
  const base = await proxyBase();
  const list = entries.slice(0, count), rows = Math.max(1, Math.ceil(list.length / COLS));
  const H = PAD + 92 + rows * (TILE_H + GAP) - GAP + 24 + 44 + PAD / 2;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#17191d"); bg.addColorStop(1, "#0d0e10");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // Rubrik
  ctx.fillStyle = "#23262b"; rr(ctx, PAD, PAD, 52, 52, 12); ctx.fill();
  ctx.fillStyle = "#eceef1"; ctx.font = `700 22px ${FONT}`; ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillText("CS2", PAD + 26, PAD + 27);
  ctx.textAlign = "left"; ctx.font = `700 34px ${FONT}`; ctx.fillStyle = "#eceef1"; ctx.fillText(fit(ctx, title || "Mitt inventory", showTotal ? 640 : 1000), PAD + 70, PAD + 20);
  ctx.font = `400 17px ${FONT}`; ctx.fillStyle = "#9ba2ac"; ctx.fillText(`${entries.length} föremål`, PAD + 70, PAD + 52);
  if (showTotal && total != null) {
    ctx.textAlign = "right"; ctx.font = `700 34px ${FONT}`; ctx.fillStyle = "#eceef1"; ctx.fillText(kr(total), W - PAD, PAD + 20);
    ctx.font = `400 15px ${FONT}`; ctx.fillStyle = "#9ba2ac"; ctx.fillText("uppskattat marknadsvärde", W - PAD, PAD + 52); ctx.textAlign = "left";
  }
  const imgs = await Promise.all(list.map(e => loadImg(e.img, base)));
  const tw = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
  list.forEach((e, i) => {
    const col = i % COLS, row = Math.floor(i / COLS), x = PAD + col * (tw + GAP), y = PAD + 92 + row * (TILE_H + GAP);
    ctx.fillStyle = "#1c1e23"; rr(ctx, x, y, tw, TILE_H, 14); ctx.fill();
    ctx.strokeStyle = "#2a2d33"; ctx.lineWidth = 1; rr(ctx, x + .5, y + .5, tw - 1, TILE_H - 1, 14); ctx.stroke();
    // bild (ritas i 4:3 inom tile-bredden)
    const im = imgs[i], ih = IMG_H, iw = Math.min(tw - 24, ih * 4 / 3), ix = x + (tw - iw) / 2, iy = y + 10;
    if (im) ctx.drawImage(im, ix, iy, iw, ih);
    else { ctx.fillStyle = "#23262b"; rr(ctx, x + 12, iy, tw - 24, ih, 10); ctx.fill(); ctx.fillStyle = "#4a4f58"; ctx.font = `600 16px ${FONT}`; ctx.textAlign = "center"; ctx.fillText(fit(ctx, e.name1 || "", tw - 40), x + tw / 2, iy + ih / 2); ctx.textAlign = "left"; }
    // raritetsfärg
    ctx.fillStyle = safeColor(e.rc); ctx.fillRect(x + 14, y + IMG_H + 16, tw - 28, 3);
    // text
    ctx.textBaseline = "alphabetic";
    ctx.font = `500 13px ${FONT}`; ctx.fillStyle = "#9ba2ac"; ctx.fillText(fit(ctx, e.tag || e.name1 || "", tw - 28), x + 14, y + IMG_H + 40);
    ctx.font = `700 17px ${FONT}`; ctx.fillStyle = "#eceef1"; ctx.fillText(fit(ctx, e.name2 || e.name1 || "", tw - 28), x + 14, y + IMG_H + 62);
    if (showPrices) {
      ctx.font = `600 16px ${FONT}`; ctx.fillStyle = "#cfd3d9"; ctx.textAlign = "right";
      ctx.fillText(e.price != null ? kr(e.price) : "–", x + tw - 14, y + IMG_H + 62 + 0); ctx.textAlign = "left";
    }
    ctx.textBaseline = "middle";
  });
  if (entries.length > list.length) { ctx.font = `400 15px ${FONT}`; ctx.fillStyle = "#9ba2ac"; ctx.textAlign = "right"; ctx.fillText(`+ ${entries.length - list.length} till`, W - PAD, H - PAD / 2 - 40); ctx.textAlign = "left"; }
  ctx.font = `400 14px ${FONT}`; ctx.fillStyle = "#6c727c"; ctx.textBaseline = "middle"; ctx.fillText("Skapad med CS2 Hub · " + new Date().toLocaleDateString("sv-SE"), PAD, H - PAD / 2 - 14);
  return { hadImages: imgs.filter(Boolean).length, wanted: list.length };
}

/** Öppnar dialogen där man justerar och laddar ner/kopierar kortet. entries: [{name1, name2, tag, price, img, rc}] */
export function openCardModal({ title, entries, total, defCount = 12, filename = "cs2hub-kort" }) {
  if (!entries.length) return toast("Det finns inget att visa på kortet än");
  const counts = [4, 8, 12, 16, 20].filter(n => n < entries.length).concat([Math.min(entries.length, 20)]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const start = counts.includes(Math.min(defCount, entries.length)) ? Math.min(defCount, entries.length) : counts[counts.length - 1];
  modal(`<h3>Dela som bild</h3>
    <div class="form"><label class="full">Titel<input class="inp" id="ct" maxlength="40" value="${esc(title)}"></label>
      <label>Antal föremål<select class="inp" id="cn">${counts.map(n => `<option value="${n}" ${n === start ? "selected" : ""}>${n}${n === entries.length ? " (alla)" : ""}</option>`).join("")}</select></label>
      <label class="full" style="grid-auto-flow:column;justify-content:start;align-items:center;gap:8px"><input type="checkbox" id="cp" checked> Visa värde per föremål</label>
      <label class="full" style="grid-auto-flow:column;justify-content:start;align-items:center;gap:8px"><input type="checkbox" id="cs" checked> Visa totalt värde</label></div>
    <div style="margin-top:12px"><canvas id="cv" style="width:100%;height:auto;border-radius:10px;border:1px solid var(--line2);background:#111"></canvas></div>
    <div class="muted small" id="cmsg" role="status" style="margin-top:6px">Ritar kortet…</div>
    <p class="muted small" style="margin:6px 0 0">Inköpspriser, vinst och transaktioner visas aldrig på kortet.</p>
    <div class="row" style="margin-top:14px;justify-content:flex-end;flex-wrap:wrap"><button class="btn ghost" data-close>Stäng</button><button class="btn ghost" id="ccp">Kopiera bild</button><button class="btn" id="cdl">Ladda ner PNG</button></div>`, {
    wide: true,
    onMount: m => {
      const cv = $("#cv", m); let busy = 0;
      const redraw = async () => {
        const my = ++busy;
        const r = await drawCard(cv, { title: $("#ct", m).value.trim(), entries, total, showPrices: $("#cp", m).checked, showTotal: $("#cs", m).checked, count: +$("#cn", m).value });
        if (my !== busy) return;
        $("#cmsg", m).textContent = r.hadImages === r.wanted ? "" : r.hadImages === 0 ? "Bilderna kunde inte hämtas (proxyn svarar inte eller är inte uppdaterad) – kortet ritas utan bilder." : `${r.wanted - r.hadImages} av ${r.wanted} bilder kunde inte hämtas.`;
      };
      const rd = (() => { let t; return () => { clearTimeout(t); t = setTimeout(redraw, 150); }; })();
      ["ct", "cn", "cp", "cs"].forEach(id => $("#" + id, m).addEventListener(id === "ct" ? "input" : "change", rd));
      const blob = () => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("tom")), "image/png"));
      $("#cdl", m).addEventListener("click", async () => { try { await redraw(); const b = await blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = filename + ".png"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast("Bilden sparades"); } catch { toast("Kunde inte skapa bilden"); } });
      $("#ccp", m).addEventListener("click", async () => { try { if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw 0; await navigator.clipboard.write([new ClipboardItem({ "image/png": blob() })]); toast("Bilden kopierad – klistra in i Discord"); } catch { toast("Kopiering stöds inte här – använd Ladda ner PNG"); } });
      redraw();
    },
  });
}
