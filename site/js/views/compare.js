import { $, $$, esc, imgUrl, kr, dec, MISSING, usd2sek, pct, cls, uid, WEARS, WEAR_LONG, COLOR_LABEL, toast } from "../util.js";
import { getKV, setKV } from "../store.js";
import { D, MARKETS, mhnFor, priceRow, bestUsd, cashUsd } from "../data.js";
import { pageHead, itemPicker, KIND_LABEL, emptyState, priceNote } from "./common.js";
import { analysePrice } from "../pricing.js";
import { trendChanges, bestFlags, verdicts, cleanSavedCompares } from "../compare-core.js";

const MAX = 4;
// Vilka grupper av egenskaper som visas (användaren kan dölja sådant som inte är relevant)
const SHOW = { info: true, wears: true, st: true, markets: true, net: true, trend: true };
const GROUP_LABEL = { info: "Egenskaper", wears: "Pris per slitage", st: "StatTrak™ & Souvenir", markets: "Marknader", net: "Netto", trend: "Prisutveckling" };
const MARKET_ORDER = ["skinport", "csfloat", "csmoney", "swapgg", "buff163", "steam"];
let WEAR = "auto"; // slitage som marknader, netto, status och utveckling gäller för ("auto" = FT eller närmaste)

export async function addToCompare(id) {
  const l = await getKV("compare", []);
  if (!l.includes(id)) { l.push(id); if (l.length > MAX) l.shift(); }
  await setKV("compare", l);
  location.hash = "#/compare/" + l.join("/");
}

// Billigaste marknad för en prisrad (BUFF163 utelämnas – svårtillgänglig)
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
  let saved = cleanSavedCompares(await getKV("savedCompares", null));
  const anySkin = items.some(e => e.wr), cols = columns(items);
  root.innerHTML = `${pageHead("Skin Comparison", "Ställ upp till fyra föremål sida vid sida – pris, slitage, float, marknader, netto och prisutveckling. Det bästa värdet i varje rad markeras.")}
  <div class="panel" style="margin-bottom:14px"><div id="pk"></div>${items.length >= MAX ? `<div class="muted small" style="margin-top:6px">Max ${MAX} föremål – ta bort något för att lägga till fler.</div>` : ""}
    <div id="savedBox" style="margin-top:${saved.length || items.length >= 2 ? 10 : 0}px"></div></div>
  ${items.length ? `${items.length >= 2 ? summaryHtml(cols) : ""}<div class="row" style="margin-bottom:10px;flex-wrap:wrap"><span class="muted small">Visa:</span><div class="chips">${Object.keys(SHOW).map(k => `<button class="chip ${SHOW[k] ? "on" : ""}" data-g="${k}" aria-pressed="${SHOW[k]}">${GROUP_LABEL[k]}</button>`).join("")}</div>
    ${anySkin ? `<label class="muted small" style="margin-left:auto">Slitage för marknader/netto/utveckling <select class="inp" id="cw"><option value="auto">Automatiskt (FT)</option>${WEARS.map(w => `<option value="${w}" ${WEAR === w ? "selected" : ""}>${WEAR_LONG[w]}</option>`).join("")}</select></label>` : ""}</div>${table(cols)}
    <p class="muted small" style="margin-top:10px">Fet stil = bästa värdet i raden (lägst pris, högst netto, högst utveckling, lägst möjlig float). Skiljer sig inte värdena markeras inget. Prisutvecklingen bygger på Steams snittpriser (24 h, 7, 30 och 90 dagar) – inte på marknadspriset. ${esc(priceNote())}</p>` : emptyState("Inga föremål att jämföra", 'Sök ovan för att lägga till föremål, eller använd "Jämför" på ett föremåls sida.')}`;
  $$("[data-g]", root).forEach(b => b.addEventListener("click", () => { SHOW[b.dataset.g] = !SHOW[b.dataset.g]; renderCompare(root, args); }));
  $("#cw", root)?.addEventListener("change", e => { WEAR = e.target.value; renderCompare(root, args); });
  const set = l => { location.hash = "#/compare" + (l.length ? "/" + l.join("/") : ""); if (!l.length) renderCompare(root, []); };
  if (items.length < MAX) itemPicker($("#pk", root), e => { if (!ids.includes(e.id)) set([...ids, e.id]); }, { kinds: ["weapon", "knife", "glove", "sticker", "charm", "agent", "case", "capsule", "music", "patch", "graffiti"], placeholder: "Sök föremål att jämföra…" });
  else $("#pk", root).innerHTML = "";
  $$("[data-x]", root).forEach(b => b.addEventListener("click", async () => { const l = ids.filter(i => i !== b.dataset.x); await setKV("compare", l); set(l); }));

  // Sparade jämförelser (lokalt, ingår i backup)
  const paintSaved = () => {
    const host = $("#savedBox", root);
    host.innerHTML = `${items.length >= 2 ? `<div class="row" style="gap:8px"><input class="inp" id="sname" placeholder="Namn på jämförelsen" style="max-width:240px" aria-label="Namn på jämförelsen"><button class="btn ghost sm" id="ssave">Spara jämförelse</button></div>` : ""}
      ${saved.length ? `<div class="chips" style="margin-top:8px"><span class="muted small" style="align-self:center">Sparade:</span>${saved.map((c, i) => `<span class="chip"><a href="#/compare/${c.ids.map(esc).join("/")}" style="text-decoration:none" title="${esc(c.ids.map(id => D.byId.get(id)?.n || id).join(" · "))}">${esc(c.name)}</a> <button class="linkbtn" data-sdel="${i}" aria-label="Ta bort ${esc(c.name)}">✕</button></span>`).join("")}</div>` : ""}`;
    $("#ssave", host)?.addEventListener("click", async () => {
      const name = ($("#sname", host).value.trim() || items.map(e => e.p || e.n).join(" vs ")).slice(0, 80);
      saved = [{ id: uid(), name, ids: [...ids], created: Date.now() }, ...saved].slice(0, 100);
      await setKV("savedCompares", saved); toast("Jämförelsen sparad"); paintSaved();
    });
    host.querySelectorAll("[data-sdel]").forEach(b => b.addEventListener("click", async () => { saved.splice(+b.dataset.sdel, 1); await setKV("savedCompares", saved); paintSaved(); }));
  };
  paintSaved();
}

/** Data per kolumn: priser per slitage, marknader för valt slitage, netto, utveckling, float, status. */
function columns(items) {
  return items.map(e => {
    const skin = !!e.wr, wears = {};
    if (skin) for (const w of WEARS) if (e.wr.includes(w)) wears[w] = cheapest(priceRow(mhnFor(e, w)));
    const from = skin ? Object.values(wears).filter(Boolean).sort((a, b) => a.usd - b.usd)[0] : cheapest(priceRow(e.mh));
    const mid = skin ? (WEAR !== "auto" && e.wr.includes(WEAR) ? WEAR : e.wr.includes("FT") ? "FT" : e.wr[Math.floor(e.wr.length / 2)] || e.wr[0]) : null;
    const mhn = skin ? mhnFor(e, mid) : e.mh, row = priceRow(mhn), tc = trendChanges(D.trend.get(mhn));
    const minOf = opt => { const v = (e.wr || []).map(w => bestUsd(mhnFor(e, w, opt))).filter(Boolean); return v.length ? Math.min(...v) : null; };
    return {
      e, skin, wears, from, mid, mhn, row, tc, name: e.p ? `${e.w} | ${e.p}` : e.n,
      stFrom: skin && e.st ? minOf({ st: true }) : null, svFrom: skin && e.sv ? minOf({ sv: true }) : null,
      cash: cashUsd(mhn), floatMin: e.f ? e.f[0] : null, status: analysePrice(D.P.p[mhn] || null, { ageMs: D.priceAge ? Date.now() - D.priceAge : 0, mhn }),
    };
  });
}

/** Sammanfattning överst: vem som har bästa värdet i varje kategori. */
function summaryHtml(cols) {
  const v = verdicts(cols.map(c => ({ name: c.name, from: c.from?.usd, ch30: c.tc.d30, floatMin: c.floatMin, cash: c.cash })));
  const li = (label, x, extra = "") => x ? `<div><span class="muted small">${label}</span><div><b>${esc(x.name)}</b>${extra}</div></div>` : `<div><span class="muted small">${label}</span><div class="muted small">ingen tydlig vinnare</div></div>`;
  return `<div class="panel" style="margin-bottom:12px"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">${li("Billigast just nu", v.cheapest)}${li("Bäst utveckling (30 d)", v.trend30, v.trend30 ? ` <span class="small pos">${pct(cols[v.trend30.index].tc.d30)}</span>` : "")}${li("Lägst möjlig float", v.lowestFloat, v.lowestFloat ? ` <span class="small num">${dec(cols[v.lowestFloat.index].floatMin, 2)}</span>` : "")}${li("Högst netto vid försäljning", v.bestNet)}</div>
    <div class="muted small" style="margin-top:8px">Sammanfattningen visar bara vem som har det bästa värdet i varje kategori av de valda föremålen – det är ingen rekommendation att köpa. Utvecklingen är Steams snittpriser.</div></div>`;
}
function table(cols) {
  const hl = (fn, low = true) => bestFlags(cols.map(fn), low);
  const row = (label, cells, flags = []) => `<tr><th style="white-space:nowrap">${label}</th>${cells.map((c, i) => `<td style="${flags[i] ? "font-weight:700" : ""}">${c}</td>`).join("")}</tr>`;
  const priceCell = p => p ? `<span class="num">${kr(usd2sek(p.usd))}</span><div class="muted small" style="font-weight:400">${esc(p.m)}</div>` : MISSING;
  const pc = v => v != null ? `<span class="num ${cls(v)}">${pct(v)}</span>` : "–";
  const R = [];

  R.push(row("Billigast (marknad)", cols.map(c => priceCell(c.from)), hl(c => c.from?.usd)));
  R.push(row("Prisstatus", cols.map(c => { const col = { ok: "#7ec699", warn: "#d9b36a", bad: "#e8857a", miss: "#d9b36a" }[c.status.tone]; return `<span class="chip" style="border-color:${col};color:${col}" title="${esc(c.status.reasons.join(" "))}">${esc(c.status.label)}</span><div class="muted small" style="font-weight:400">${c.skin && c.mid ? esc(WEAR_LONG[c.mid]) + " · " : ""}${c.status.markets.filter(m => !m.hard).length} marknader</div>`; })));
  if (SHOW.info) {
    R.push(row("Rarity", cols.map(c => c.e.r ? `<span class="chip" style="border-color:${esc(c.e.rc)}"><i class="dot" style="background:${esc(c.e.rc)}"></i>${esc(c.e.r)}</span>` : "–")));
    R.push(row("Typ", cols.map(c => esc((c.e.w ? c.e.w + " · " : "") + (KIND_LABEL[c.e.kind] || "")))));
    R.push(row("Färg", cols.map(c => c.e.c1 ? `<i class="dot" style="background:${esc(c.e.hx)}"></i> ${esc(COLOR_LABEL[c.e.c1])}${c.e.p1 ? " " + c.e.p1 + " %" : ""}${c.e.c2 ? " + " + esc(COLOR_LABEL[c.e.c2]) : ""}${c.e.mc ? " (multi)" : ""}` : "–")));
    R.push(row("Samling", cols.map(c => c.e.cn?.length ? c.e.cn.map((n, i) => `<a href="#/collection/${esc(c.e.col[i])}" style="text-decoration:underline">${esc(n)}</a>`).join(", ") : c.e.tn ? esc(c.e.tn) : "–")));
    R.push(row("Paint index", cols.map(c => c.e.pi ? `<span class="num">${esc(c.e.pi)}</span>` : "–")));
    R.push(row("Float-intervall", cols.map(c => c.e.f ? `<span class="num">${dec(c.e.f[0], 2)} – ${dec(c.e.f[1], 2)}</span><div class="fbar" style="margin:6px 0 0"><i style="left:${c.e.f[0] * 100}%;width:${Math.max((c.e.f[1] - c.e.f[0]) * 100, 1)}%"></i></div>` : "–")));
    R.push(row("Lägsta möjliga float", cols.map(c => c.floatMin != null ? `<span class="num">${dec(c.floatMin, 2)}</span>` : "–"), hl(c => c.floatMin)));
  }
  if (SHOW.wears) for (const w of WEARS) {
    R.push(row(WEAR_LONG[w], cols.map(c => c.skin ? (c.e.wr.includes(w) ? priceCell(c.wears[w]) : '<span class="faint">finns inte</span>') : "–"), hl(c => c.wears[w]?.usd)));
  }
  if (SHOW.st) {
    R.push(row("StatTrak™ finns", cols.map(c => c.skin ? (c.e.st ? "Ja" : "Nej") : "–")));
    R.push(row("StatTrak™ från", cols.map(c => c.stFrom ? `<span class="num">${kr(usd2sek(c.stFrom))}</span>` : "–"), hl(c => c.stFrom)));
    R.push(row("Souvenir finns", cols.map(c => c.skin ? (c.e.sv ? "Ja" : "Nej") : "–")));
    if (cols.some(c => c.svFrom)) R.push(row("Souvenir från", cols.map(c => c.svFrom ? `<span class="num">${kr(usd2sek(c.svFrom))}</span>` : "–"), hl(c => c.svFrom)));
  }
  if (SHOW.markets) for (const k of MARKET_ORDER) {
    const m = MARKETS.find(x => x.key === k); if (!m) continue;
    R.push(row(`${esc(m.name)}${cols.some(c => c.skin && c.mid) ? "" : ""}`, cols.map(c => c.row?.[k] ? `<span class="num">${kr(usd2sek(c.row[k]))}</span>` : '<span class="faint">–</span>'), m.key === "steam" || m.key === "buff163" ? [] : hl(c => c.row?.[m.key])));
  }
  if (SHOW.net) {
    R.push(row("Du får ut (netto)", cols.map(c => c.cash ? `<span class="num">${kr(usd2sek(c.cash))}</span><div class="muted small" style="font-weight:400">efter avgift${c.mid ? ", " + c.mid : ""}</div>` : "–"), hl(c => c.cash, false)));
    R.push(row("Skillnad köp → sälj", cols.map(c => { const buy = c.row && cheapest(c.row)?.usd; return buy && c.cash ? `<span class="num ${cls(c.cash - buy)}">${pct((c.cash / buy - 1) * 100)}</span><div class="muted small" style="font-weight:400">netto mot billigast</div>` : "–"; }), hl(c => { const buy = c.row && cheapest(c.row)?.usd; return buy && c.cash ? c.cash / buy : null; }, false)));
  }
  if (SHOW.trend) {
    R.push(row("Utveckling 7 dagar", cols.map(c => pc(c.tc.d7)), hl(c => c.tc.d7, false)));
    R.push(row("Utveckling 30 dagar", cols.map(c => pc(c.tc.d30)), hl(c => c.tc.d30, false)));
    R.push(row("Utveckling 90 dagar", cols.map(c => pc(c.tc.d90) + (c.tc.d90 != null ? '<div class="muted small" style="font-weight:400">Steam-snitt</div>' : "")), hl(c => c.tc.d90, false)));
  }
  R.push(row("", cols.map(c => `<a class="btn ghost sm" href="#/item/${esc(c.e.id)}">Öppna</a> <button class="btn ghost sm danger" data-x="${esc(c.e.id)}">Ta bort</button>`)));

  return `<div class="panel scroll-x" style="padding:0"><table class="tbl" style="min-width:${180 + cols.length * 190}px"><thead><tr><th></th>${cols.map(c => `<th style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--text);vertical-align:bottom"><div class="hero-img" style="aspect-ratio:4/3;margin-bottom:8px"><img src="${esc(imgUrl(c.e.img, "256fx192f"))}" alt=""></div>${esc(c.e.n + (c.e.ph ? " · " + c.e.ph : ""))}</th>`).join("")}</tr></thead><tbody>${R.join("")}</tbody></table></div>`;
}
