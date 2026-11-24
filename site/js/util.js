export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const debounce = (fn, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export const IMG_BASE = "https://community.akamai.steamstatic.com/economy/image/";
export const imgUrl = (s, size = "256fx192f") => !s ? "" : s.startsWith("http") ? s : IMG_BASE + s + "/" + size;

export const WEARS = ["FN", "MW", "FT", "WW", "BS"];
export const WEAR_LONG = { FN: "Factory New", MW: "Minimal Wear", FT: "Field-Tested", WW: "Well-Worn", BS: "Battle-Scarred" };
export const WEAR_RANGE = { FN: [0, 0.07], MW: [0.07, 0.15], FT: [0.15, 0.38], WW: [0.38, 0.45], BS: [0.45, 1] };
export const wearFromFloat = f => f < 0.07 ? "FN" : f < 0.15 ? "MW" : f < 0.38 ? "FT" : f < 0.45 ? "WW" : "BS";

export const COLORS = {
  red: "#c8453d", orange: "#d9803a", gold: "#d6b04a", green: "#4f9c5c", cyan: "#3fb2b8", blue: "#3f74d1",
  purple: "#8a56c9", pink: "#d070a8", brown: "#7c5a3a", black: "#1e1f21", white: "#e8e8e6", gray: "#7a7f85",
};
export const COLOR_LABEL = { red: "Röd", orange: "Orange", gold: "Guld/Gul", green: "Grön", cyan: "Cyan", blue: "Blå", purple: "Lila", pink: "Rosa", brown: "Brun", black: "Svart", white: "Vit", gray: "Grå/Metall" };
export const rarityOrder = ["Consumer Grade", "Base Grade", "Industrial Grade", "Mil-Spec Grade", "High Grade", "Restricted", "Remarkable", "Classified", "Exotic", "Covert", "Extraordinary", "Contraband"];

/* ---- valuta (visar SEK; priskällorna är USD) ---- */
export const fx = { rate: 9.8, updated: null };
export function setRate(r) { if (r > 1) fx.rate = r; }
const nf0 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Svensk decimalformatering med komma (och tunt mellanslag som tusentalsavskiljare). */
export const dec = (v, d = 2) => v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
export const kr = v => v == null || isNaN(v) ? "–" : (Math.abs(v) >= 1000 ? nf0.format(v) : nf2.format(v)) + " kr";
export const usd2sek = v => v == null ? null : v * fx.rate;
export const krUsd = v => kr(usd2sek(v));
/** Pris eller tydlig "Pris saknas"-markering. Används överallt där ett saknat pris annars kunde se ut som 0 kr. */
export const MISSING = `<span class="miss" title="Det finns ingen prisdata för det här föremålet – det är inte gratis.">Pris saknas</span>`;
export const krm = v => v == null || isNaN(v) ? MISSING : kr(v);
export const krUsdm = v => krm(usd2sek(v));
export const pct = v => v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + dec(v, 1) + " %";
export const signKr = v => v == null || isNaN(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + kr(Math.abs(v));
export const cls = v => v > 0.005 ? "pos" : v < -0.005 ? "neg" : "";
const validTs = ts => ts != null && ts !== "" && isFinite(new Date(ts).getTime());
export const fmtDate = ts => validTs(ts) ? new Date(ts).toLocaleDateString("sv-SE") : "–";
export const fmtDateTime = ts => validTs(ts) ? new Date(ts).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "–";
export const num = (v, d = 4) => dec(v, d);
/** Läser tal som människor skriver dem: "1 234,50", "12.5 kr", "3,12". Ger null om det inte går att tolka. */
export function parseDec(s) {
  if (s == null) return null;
  let t = String(s).replace(/kr|sek|:-|\s| | /gi, "");
  if (!/^-?[\d.,]+$/.test(t)) return null;
  const lc = t.lastIndexOf(","), ld = t.lastIndexOf("."), last = Math.max(lc, ld);
  if (last >= 0) {
    const sep = t[last], other = sep === "," ? "." : ",";
    const after = t.length - last - 1, sepCount = t.split(sep).length - 1;
    // Sista tecknet är decimaltecken om det finns båda sorterna (3,595.74 / 3.595,74), eller om det är det enda tecknet och har högst 2 decimaler
    // ("3,5", "12.50"). Tre siffror efter ett ensamt tecken ("3,595") eller upprepade tecken ("1.234.567") är tusentalsavskiljare.
    const isDecimal = t.includes(other) ? t.lastIndexOf(sep) > t.lastIndexOf(other) && sepCount === 1 : sepCount === 1 && after > 0 && after <= 2;
    t = isDecimal ? t.slice(0, last).replace(/[.,]/g, "") + "." + t.slice(last + 1) : t.replace(/[.,]/g, "");
  }
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  const v = parseFloat(t); return isFinite(v) ? v : null;
}
/** "för 3 timmar sedan" */
export function ago(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 2) return "just nu";
  if (m < 90) return `för ${m} min sedan`;
  const h = Math.round(m / 60); if (h < 36) return `för ${h} tim sedan`;
  return `för ${Math.round(h / 24)} dagar sedan`;
}

export function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600);
}

export function modal(html, { wide = false, onMount } = {}) {
  const root = $("#modalRoot");
  const opener = document.activeElement;
  root.innerHTML = `<div class="modal-back"><div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="Dialog">${html}</div></div>`;
  const back = root.firstElementChild, box = root.querySelector(".modal");
  const h = box.querySelector("h3"); if (h) box.setAttribute("aria-label", h.textContent);
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); try { opener?.isConnected && opener.focus?.({ preventScroll: true }); } catch { /* ignorera */ } };
  const onKey = e => {
    if (e.key === "Escape") return close();
    if (e.key !== "Tab") return; // fokusfälla: Tab stannar i dialogen
    const f = [...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey);
  back.addEventListener("mousedown", e => { if (e.target === back) close(); });
  root.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
  onMount && onMount(box, close);
  if (!box.contains(document.activeElement)) (box.querySelector("input:not([type=hidden]),select,button.btn:not(.ghost),button") || box).focus?.({ preventScroll: true });
  return close;
}

/* ---- svenska ersättare för webbläsarens egna dialoger (confirm/alert/prompt visar annars engelska knappar) ---- */
function overlay(html) {
  const el = document.createElement("div");
  el.className = "modal-back"; el.style.zIndex = 300;
  el.innerHTML = `<div class="modal" role="alertdialog" style="width:min(440px,100%)">${html}</div>`;
  document.body.appendChild(el);
  return el;
}
export function confirmBox(message, { ok = "Fortsätt", danger = false } = {}) {
  return new Promise(res => {
    const el = overlay(`<p style="margin-top:0">${esc(message)}</p><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" data-v="0">Avbryt</button><button class="btn ${danger ? "danger-solid" : ""}" data-v="1">${esc(ok)}</button></div>`);
    const done = v => { el.remove(); document.removeEventListener("keydown", onKey); res(v); };
    const onKey = e => e.key === "Escape" && done(false);
    document.addEventListener("keydown", onKey);
    el.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => done(b.dataset.v === "1")));
    el.querySelector("[data-v='1']").focus();
  });
}
export function notice(message) {
  return new Promise(res => {
    const el = overlay(`<p style="margin-top:0">${esc(message)}</p><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-v>Stäng</button></div>`);
    el.querySelector("[data-v]").addEventListener("click", () => { el.remove(); res(); }); el.querySelector("[data-v]").focus();
  });
}
/** Kopiera text; faller tillbaka på en ruta man kan markera själv om webbläsaren nekar. */
export async function copyText(text, okMsg = "Kopierat") {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; } catch { /* fall tillbaka */ }
  const el = overlay(`<p style="margin-top:0">Kopiera texten nedan (Ctrl+C):</p><textarea class="inp" rows="3" style="width:100%" readonly>${esc(text)}</textarea><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-v>Stäng</button></div>`);
  const ta = el.querySelector("textarea"); ta.focus(); ta.select();
  el.querySelector("[data-v]").addEventListener("click", () => el.remove());
  return false;
}

/* ---- SVG-linjegraf med hover-information ---- */
export function lineChart(points, { w = 640, h = 180, fmt = v => nf0.format(v), color = "#e7e9ec", fill = true, since = null } = {}) {
  if (!points || points.length < 2) {
    const first = points?.[0]?.x ?? since;
    return `<div class="empty small">${first ? `Historiken börjar ${fmtDate(first)}. ` : ""}Grafen visas när det finns minst två mätpunkter – en sparas automatiskt ungefär var 6:e timme du öppnar sidan.</div>`;
  }
  const pad = { l: 8, r: 8, t: 10, b: 20 };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const ys0 = y0 === y1 ? y0 - 1 : y0, ys1 = y0 === y1 ? y1 + 1 : y1;
  const X = x => pad.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const Y = y => pad.t + (1 - (y - ys0) / (ys1 - ys0)) * (h - pad.t - pad.b);
  const f1 = v => v.toFixed(1);
  const d = points.map((p, i) => (i ? "L" : "M") + f1(X(p.x)) + " " + f1(Y(p.y))).join("");
  const area = d + `L${f1(X(x1))} ${h - pad.b}L${f1(X(x0))} ${h - pad.b}Z`;
  const last = points[points.length - 1];
  const lbl = t => new Date(t).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  const step = Math.max(1, Math.ceil(points.length / 120));
  const dots = points.filter((_, i) => i % step === 0 || i === points.length - 1).map(p => `<circle class="hov" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="7"><title>${esc(fmtDateTime(p.x))}: ${esc(fmt(p.y))}</title></circle>`).join("");
  const change = last.y - points[0].y;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Värdeutveckling ${esc(lbl(x0))} till ${esc(lbl(x1))}">
    ${[0, .5, 1].map(f => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${pad.t + f * (h - pad.t - pad.b)}" y2="${pad.t + f * (h - pad.t - pad.b)}" stroke="#2a2d33"/>`).join("")}
    ${fill ? `<path d="${area}" fill="${color}" opacity=".07"/>` : ""}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="${X(last.x)}" cy="${Y(last.y)}" r="3" fill="${color}"/>${dots}
    <text x="${pad.l}" y="${h - 5}">${lbl(x0)}</text><text x="${w - pad.r}" y="${h - 5}" text-anchor="end">${lbl(x1)}</text>
    <text x="${w - pad.r}" y="${pad.t + 8}" text-anchor="end">${esc(fmt(ys1))}</text>
    <text x="${w - pad.r}" y="${h - pad.b - 3}" text-anchor="end">${esc(fmt(ys0))}</text>
  </svg><div class="muted small" style="margin-top:4px">Från ${fmtDate(x0)} · ${change >= 0 ? "+" : "−"}${esc(fmt(Math.abs(change)))} sedan start · håll muspekaren över en punkt för detaljer</div>`;
}

/** Graf med flera linjer och (valfritt) lodräta markeringar för t.ex. köp och försäljningar. series: [{name,color,dash?,pts:[{x,y}]}], marks: [{x,type:"buy"|"sell",tip}] */
export function multiChart(series, { w = 640, h = 210, fmt = v => nf0.format(v), marks = [], since = null } = {}) {
  const live = series.filter(s => s.pts && s.pts.length);
  const longest = Math.max(0, ...live.map(s => s.pts.length));
  if (longest < 2) return `<div class="empty small">${since ? `Historiken börjar ${fmtDate(since)}. ` : ""}Grafen visas när det finns minst två mätpunkter – en sparas automatiskt ungefär var 6:e timme du öppnar sidan.</div>`;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const xs = live.flatMap(s => s.pts.map(p => p.x)), ys = live.flatMap(s => s.pts.map(p => p.y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs); let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = (y1 - y0) || Math.max(1, Math.abs(y1) * 0.1); y0 -= span * 0.08; y1 += span * 0.08;
  const X = x => pad.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const Y = y => pad.t + (1 - (y - y0) / (y1 - y0)) * (h - pad.t - pad.b);
  const f1 = v => v.toFixed(1), lbl = t => new Date(t).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  const paths = live.map((s, k) => {
    const d = s.pts.map((p, i) => (i ? "L" : "M") + f1(X(p.x)) + " " + f1(Y(p.y))).join("");
    const step = Math.max(1, Math.ceil(s.pts.length / 100));
    const dots = k === 0 ? s.pts.filter((_, i) => i % step === 0 || i === s.pts.length - 1).map(p => `<circle class="hov" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="7"><title>${esc(fmtDateTime(p.x))}: ${esc(s.name)} ${esc(fmt(p.y))}</title></circle>`).join("") : "";
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${k === 0 ? 1.8 : 1.4}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} stroke-linejoin="round"/>${dots}`;
  }).join("");
  const mk = marks.filter(m => m.x >= x0 && m.x <= x1).map(m => `<line x1="${f1(X(m.x))}" x2="${f1(X(m.x))}" y1="${h - pad.b - 9}" y2="${h - pad.b}" stroke="${m.type === "sell" ? "#d8645a" : "#5fb06c"}" stroke-width="2"><title>${esc(m.tip || (m.type === "sell" ? "Försäljning" : "Köp"))}</title></line>`).join("");
  const legend = live.map(s => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px"><i style="display:inline-block;width:14px;height:0;border-top:2px ${s.dash ? "dashed" : "solid"} ${s.color}"></i>${esc(s.name)}</span>`).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(live.map(s => s.name).join(" och "))} över tid">
    ${[0, .5, 1].map(f => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${pad.t + f * (h - pad.t - pad.b)}" y2="${pad.t + f * (h - pad.t - pad.b)}" stroke="#2a2d33"/>`).join("")}
    ${paths}${mk}
    <text x="${pad.l}" y="${h - 5}">${lbl(x0)}</text><text x="${w - pad.r}" y="${h - 5}" text-anchor="end">${lbl(x1)}</text>
    <text x="${w - pad.r}" y="${pad.t + 8}" text-anchor="end">${esc(fmt(y1))}</text><text x="${w - pad.r}" y="${h - pad.b - 12}" text-anchor="end">${esc(fmt(y0))}</text></svg>
    <div class="muted small" style="margin-top:4px">${legend}${marks.length ? `<span style="color:#5fb06c">▎köp</span> <span style="color:#d8645a">▎sälj</span>` : ""}</div>`;
}

export function sparkline(vals, w = 90, h = 24, color = "#8a9099") {
  const v = vals.filter(x => x != null);
  if (v.length < 2) return "";
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const d = v.map((y, i) => (i ? "L" : "M") + (i / (v.length - 1) * w).toFixed(1) + " " + (h - 2 - (y - mn) / r * (h - 4)).toFixed(1)).join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.4"/></svg>`;
}

export function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
