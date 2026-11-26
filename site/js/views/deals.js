import { $, esc, imgUrl, kr, usd2sek, pct, cls, parseMoney, inputMoney, curSym } from "../util.js";
import { D, MARKETS, lookup, loadHistory, historyFor, historyNames, historyDays, lowestExternalSrc, marketUrl, priceInfo } from "../data.js";
import { loadState, buildRows } from "../finance.js";
import { pageHead, emptyState } from "./common.js";
import { getPrefs } from "../prefs.js";

/** Dagens fynd: föremål som är ovanligt billiga jämfört med (A) vår egen prishistorik, (B) andra marknader och (C) vad du själv betalat. */
const P = { min: "30", kind: "" };
const SRC = ["skinport", "csfloat", "csmoney", "swapgg"];
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const skip = mhn => mhn.startsWith("Souvenir") || /Doppler|Marble Fade|Case Hardened|Fade/.test(mhn); // pris beror på fas/mönster → jämförelsen är missvisande

export async function renderDeals(root) {
  if (!P._init) { P._init = true; const m = getPrefs().minKr; P.min = inputMoney(m != null ? m : 30, m != null ? 2 : 0); /* standard 30 kr, omräknat till visningsvalutan */ } // standard lägsta pris från Inställningar
  root.innerHTML = `${pageHead("Dagens fynd", "Föremål som är ovanligt billiga just nu – jämfört med prishistoriken, med andra marknader och med vad du själv betalat.")}
    <div class="toolbar"><label class="muted small">Lägsta pris (${curSym()}) <input class="inp" id="dmin" type="text" inputmode="decimal" value="${esc(P.min)}" style="width:90px"></label>
    <select class="inp" id="dkind" aria-label="Typ"><option value="">Alla typer</option><option value="weapon">Vapen</option><option value="knife">Knivar</option><option value="glove">Handskar</option></select></div>
    <div id="dout"><div class="muted small" style="padding:10px 0">Letar efter fynd…</div></div>
    <p class="muted small" style="margin-top:14px">Priserna är utropspriser (listningar), inte genomförda försäljningar – kontrollera alltid listningen innan du köper. Ett lågt pris kan bero på dåligt float, fel variant eller att någon prissatt fel. Föremål där pris beror på fas eller mönster (Doppler, Fade, Case Hardened, Marble Fade) och Souvenir jämförs inte.</p>`;
  $("#dkind", root).value = P.kind;
  const go = () => { P.min = $("#dmin", root).value; P.kind = $("#dkind", root).value; paint(root); };
  $("#dmin", root).addEventListener("change", go); $("#dkind", root).addEventListener("change", go);
  await loadHistory();
  paint(root);
}

function row(d) {
  const e = d.e, link = d.src && marketUrl(d.src.key, d.mhn);
  return `<tr><td><div class="nm">${e ? `<img loading="lazy" src="${esc(imgUrl(e.img, "96fx72f"))}" alt="" width="56" height="42">` : ""}<div><a class="n2" href="${e ? "#/item/" + esc(e.id) : "#"}">${esc(d.mhn)}</a><div class="n1">${esc(d.why)}</div></div></div></td>
    <td class="r num"><b>${kr(usd2sek(d.now))}</b><div class="small">${d.src ? (link ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="text-decoration:underline">${esc(d.src.name)} ↗</a>` : esc(d.src.name)) : ""}</div></td>
    <td class="r num hide-m">${kr(usd2sek(d.ref))}<div class="small faint">${esc(d.refLabel)}</div></td>
    <td class="r num"><b class="pos">−${Math.round(d.disc * 100)} %</b></td></tr>`;
}
const table = list => `<div class="panel scroll-x" style="padding:0;margin-bottom:18px"><table class="tbl"><thead><tr><th>Föremål</th><th class="r">Pris nu</th><th class="r hide-m">Jämförpris</th><th class="r">Billigare</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table></div>`;

async function paint(root) {
  const out = $("#dout", root), minUsd = (parseMoney(P.min) || 0) / usd2sek(1);
  // Stickers, charms m.m. har få försäljningar och orimliga prisskillnader mellan marknaderna → tas inte med i fynd
  const kindOk = mhn => { const k = lookup(mhn)?.e?.kind; return P.kind ? k === P.kind : ["weapon", "knife", "glove", "case"].includes(k); };
  const ok = (mhn, now) => !skip(mhn) && D.mhn.has(mhn) && now >= Math.max(minUsd, 0.5) && kindOk(mhn);

  // A. mot egen historik
  const A = [];
  for (const mhn of historyNames()) {
    const row = D.P.p[mhn]; if (!row) continue;
    const src = lowestExternalSrc(row); if (!src || !ok(mhn, src.usd)) continue;
    const pts = historyFor(mhn)?.map(p => p.y); if (!pts || pts.length < 4) continue;
    const ref = median(pts.slice(0, -1)); const disc = 1 - src.usd / ref;
    if (disc >= 0.08 && disc <= 0.5) A.push({ mhn, e: lookup(mhn)?.e, now: src.usd, ref, disc, src, refLabel: `median ${pts.length - 1} dagar`, why: `${Math.round(disc * 100)} % under medianpriset de senaste ${pts.length - 1} dagarna` });
  }
  // B. mot andra marknader
  const B = [];
  for (const [mhn, row] of Object.entries(D.P.p)) {
    const vals = SRC.map(k => { const m = MARKETS.find(x => x.key === k); return row[m.i] ? { k, p: row[m.i], name: m.name } : null; }).filter(Boolean);
    if (vals.length < 3) continue;
    vals.sort((a, b) => a.p - b.p); const low = vals[0], others = vals.slice(1).map(v => v.p), ref = median(others);
    if (!ok(mhn, low.p)) continue;
    const disc = 1 - low.p / ref; if (disc < 0.1 || disc > 0.3) continue; // över 30 % är oftast en föråldrad eller felaktig listning
    B.push({ mhn, e: lookup(mhn)?.e, now: low.p, ref, disc, src: low, refLabel: "median övriga marknader", why: `${Math.round(disc * 100)} % billigare på ${low.name} än på övriga marknader` });
  }
  // C. mot det du betalat
  const C = [];
  try {
    const { items, trades } = await loadState(); const { rows } = buildRows(items, trades), seen = new Set();
    for (const r of rows) {
      if (seen.has(r.mhn) || r.unitCost == null || r.unitCost <= 0 || r.it.hidden) continue; seen.add(r.mhn);
      const info = priceInfo(r.mhn); if (!info) continue; const nowKr = usd2sek(info.usd), disc = 1 - nowKr / r.unitCost;
      if (disc >= 0.1 && skip(r.mhn) === false) C.push({ mhn: r.mhn, e: r.e, now: info.usd, ref: r.unitCost / usd2sek(1), disc, src: info, refLabel: "ditt snittpris", why: `Du betalade i snitt ${kr(r.unitCost)} – nu ${Math.round(disc * 100)} % lägre. Köper du fler sänks ditt snitt.` });
    }
  } catch { /* inget inventory */ }
  const top = l => l.sort((a, b) => b.disc - a.disc).slice(0, 25);
  const days = historyDays();
  const secA = A.length ? table(top(A)) : `<div class="panel muted small" style="margin-bottom:18px">${days < 4 ? `Prishistoriken har bara ${days || "0"} dag${days === 1 ? "" : "ar"} än – jämförelsen mot historiken kräver minst fyra dagar. Den fylls på automatiskt (ett värde per dag).` : "Inga föremål är ovanligt billiga mot sin egen historik just nu (med ditt prisfilter)."}</div>`;
  out.innerHTML = `<h2 style="margin:6px 0 8px">Billigare än vanligt (mot historiken)</h2>${secA}
    <h2 style="margin:6px 0 8px">Billigt på en marknad (mot övriga marknader)</h2>${B.length ? table(top(B)) : `<div class="panel muted small" style="margin-bottom:18px">Inga tydliga prisskillnader mellan marknaderna med dina filter.</div>`}
    ${C.length ? `<h2 style="margin:6px 0 8px">I ditt inventory: billigare än du betalade</h2>${table(top(C))}` : ""}`;
}
