import { $, $$, esc, imgUrl, kr, dec, MISSING, usd2sek, pct, cls, WEARS, WEAR_LONG, WEAR_RANGE, COLOR_LABEL, toast } from "../util.js";
import { getKV, setKV } from "../store.js";
import { D, MARKETS, mhnFor, priceRow, bestUsd, cashUsd } from "../data.js";
import { pageHead, itemPicker, KIND_LABEL, emptyState, priceNote } from "./common.js";

const MAX = 4;
// Vilka grupper av egenskaper som visas (användaren kan dölja sådant som inte är relevant)
const SHOW = { info: true, wears: true, st: true, net: true, trend: true };
const GROUP_LABEL = { info: "Egenskaper", wears: "Pris per slitage", st: "StatTrak™", net: "Netto", trend: "Prisutveckling" };

export async function addToCompare(id) {
  const l = await getKV("compare", []);
  if (!l.includes(id)) { l.push(id); if (l.length > MAX) l.shift(); }
  await setKV("compare", l);
  location.hash = "#/compare/" + l.join("/");
}

// Billigaste marknad för en prissrad (BUFF163 utelämnas – svårtillgänglig)
function cheapest(row) {
  let b = null;
  if (row) for (const m of MARKETS) if (m.key !== "buff163" && m.key !== "steam" && row[m.key] && (!b || row[m.key] < b.usd)) b = { usd: row[m.key], m: m.name };
  return b;
}

export async function renderCompare(root, args = []) {
  let ids = args.filter(a => D.byId.has(a)).slice(0, MAX);
  if (!args.length) ids = (await getKV("compare", [])).filter(a => D.byId.has(a));
  await setKV("compare", ids);
  const items = ids.map(id => D.byId.get(id));
  root.innerHTML = `${pageHead("Skin Comparison", "Ställ upp till fyra föremål sida vid sida. Det bästa värdet i varje rad markeras med fet stil.")}
  <div class="panel" style="margin-bottom:14px"><div id="pk"></div>${items.length >= MAX ? `<div class="muted small" style="margin-top:6px">Max ${MAX} föremål – ta bort något för att lägga till fler.</div>` : ""}</div>
  ${items.length ? `<div class="row" style="margin-bottom:10px"><span class="muted small">Visa:</span><div class="chips">${Object.keys(SHOW).map(k => `<button class="chip ${SHOW[k] ? "on" : ""}" data-g="${k}" aria-pressed="${SHOW[k]}">${GROUP_LABEL[k]}</button>`).join("")}</div></div>${table(items)}<p class="muted small" style="margin-top:10px">Fet stil = bästa värdet i raden (lägst pris, högst netto). ${esc(priceNote())}</p>` : emptyState("Inga föremål att jämföra", 'Sök ovan för att lägga till föremål, eller använd "Jämför" på ett föremåls sida.')}`;
  $$("[data-g]", root).forEach(b => b.addEventListener("click", () => { SHOW[b.dataset.g] = !SHOW[b.dataset.g]; renderCompare(root, args); }));
  const set = l => { location.hash = "#/compare" + (l.length ? "/" + l.join("/") : ""); if (!l.length) renderCompare(root, []); };
  if (items.length < MAX) itemPicker($("#pk", root), e => { if (!ids.includes(e.id)) set([...ids, e.id]); }, { kinds: ["weapon", "knife", "glove", "sticker", "charm", "agent", "case", "capsule", "music", "patch", "graffiti"], placeholder: "Sök föremål att jämföra…" });
  else $("#pk", root).innerHTML = "";
  $$("[data-x]", root).forEach(b => b.addEventListener("click", async () => { const l = ids.filter(i => i !== b.dataset.x); await setKV("compare", l); set(l); }));
}

function table(items) {
  const cols = items.map(e => {
    const skin = !!e.wr, wears = {};
    if (skin) for (const w of WEARS) if (e.wr.includes(w)) { const row = priceRow(mhnFor(e, w)); wears[w] = cheapest(row); }
    const from = skin ? Object.values(wears).filter(Boolean).sort((a, b) => a.usd - b.usd)[0] : cheapest(priceRow(e.mh));
    const mid = skin ? (e.wr.includes("FT") ? "FT" : e.wr[0]) : null;
    const tr = D.trend.get(skin ? mhnFor(e, mid) : e.mh);
    const ch7 = tr && tr[1] ? ((tr[0] ?? tr[1]) / tr[1] - 1) * 100 : null;
    const stFrom = skin && e.st ? (() => { const v = e.wr.map(w => bestUsd(mhnFor(e, w, { st: true }))).filter(Boolean); return v.length ? Math.min(...v) : null; })() : null;
    const cash = skin ? cashUsd(mhnFor(e, mid)) : cashUsd(e.mh);
    return { e, skin, wears, from, ch7, stFrom, cash, mid };
  });
  const best = (fn, low = true) => { const v = cols.map(fn); const f = v.filter(x => x != null && isFinite(x)); const t = f.length > 1 ? (low ? Math.min(...f) : Math.max(...f)) : null; return v.map(x => x != null && x === t); };
  const row = (label, cells, hl = []) => `<tr><th style="white-space:nowrap">${label}</th>${cells.map((c, i) => `<td style="${hl[i] ? "font-weight:700" : ""}">${c}</td>`).join("")}</tr>`;
  const priceCell = p => p ? `<span class="num">${kr(usd2sek(p.usd))}</span><div class="muted small" style="font-weight:400">${esc(p.m)}</div>` : MISSING;
  const fromBest = best(c => c.from?.usd);
  const R = [];
  R.push(row("Billigast (marknad)", cols.map(c => priceCell(c.from)), fromBest));
  if (SHOW.info) {
    R.push(row("Rarity", cols.map(c => c.e.r ? `<span class="chip" style="border-color:${esc(c.e.rc)}"><i class="dot" style="background:${esc(c.e.rc)}"></i>${esc(c.e.r)}</span>` : "–")));
    R.push(row("Typ", cols.map(c => esc((c.e.w ? c.e.w + " · " : "") + (KIND_LABEL[c.e.kind] || "")))));
    R.push(row("Färg", cols.map(c => c.e.c1 ? `<i class="dot" style="background:${esc(c.e.hx)}"></i> ${esc(COLOR_LABEL[c.e.c1])}${c.e.p1 ? " " + c.e.p1 + " %" : ""}${c.e.c2 ? " + " + esc(COLOR_LABEL[c.e.c2]) : ""}${c.e.mc ? " (multi)" : ""}` : "–")));
    R.push(row("Samling", cols.map(c => c.e.cn?.length ? esc(c.e.cn[0]) : c.e.tn ? esc(c.e.tn) : "–")));
    R.push(row("Float-intervall", cols.map(c => c.e.f ? `<span class="num">${dec(c.e.f[0], 2)} – ${dec(c.e.f[1], 2)}</span><div class="fbar" style="margin:6px 0 0"><i style="left:${c.e.f[0] * 100}%;width:${Math.max((c.e.f[1] - c.e.f[0]) * 100, 1)}%"></i></div>` : "–")));
  }
  if (SHOW.wears) for (const w of WEARS) {
    const hl = best(c => c.wears[w]?.usd);
    R.push(row(WEAR_LONG[w], cols.map(c => c.skin ? (c.e.wr.includes(w) ? priceCell(c.wears[w]) : '<span class="faint">finns inte</span>') : "–"), hl));
  }
  if (SHOW.st) {
    R.push(row("StatTrak™ finns", cols.map(c => c.skin ? (c.e.st ? "Ja" : "Nej") : "–")));
    R.push(row("StatTrak™ från", cols.map(c => c.stFrom ? `<span class="num">${kr(usd2sek(c.stFrom))}</span>` : "–"), best(c => c.stFrom)));
  }
  if (SHOW.net) R.push(row("Du får ut (netto)", cols.map(c => c.cash ? `<span class="num">${kr(usd2sek(c.cash))}</span><div class="muted small" style="font-weight:400">efter avgift${c.mid ? ", " + c.mid : ""}</div>` : "–"), best(c => c.cash, false)));
  if (SHOW.trend) R.push(row("Prisutveckling 7 d", cols.map(c => c.ch7 != null ? `<span class="num ${cls(c.ch7)}">${pct(c.ch7)}</span><div class="muted small" style="font-weight:400">Steam-trend</div>` : "–")));
  R.push(row("", cols.map(c => `<a class="btn ghost sm" href="#/item/${esc(c.e.id)}">Öppna</a> <button class="btn ghost sm danger" data-x="${esc(c.e.id)}">Ta bort</button>`)));
  return `<div class="panel scroll-x" style="padding:0"><table class="tbl" style="min-width:${180 + cols.length * 190}px"><thead><tr><th></th>${cols.map(c => `<th style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--text);vertical-align:bottom"><div class="hero-img" style="aspect-ratio:4/3;margin-bottom:8px"><img src="${esc(imgUrl(c.e.img, "256fx192f"))}" alt=""></div>${esc(c.e.n + (c.e.ph ? " · " + c.e.ph : ""))}</th>`).join("")}</tr></thead><tbody>${R.join("")}</tbody></table></div>`;
}
