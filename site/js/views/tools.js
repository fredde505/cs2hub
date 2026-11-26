import { $, esc, kr, dec, usd2sek, pct, cls, signKr, imgUrl, toast, moneyFromNum, curSym } from "../util.js";
import { D, MARKETS, lookup, bestUsd, lowestExternal, settings, saveSettings, DEFAULT_FEES } from "../data.js";
import { pageHead, emptyState } from "./common.js";

export function renderTools(root) {
  root.innerHTML = `${pageHead("Tools", "Kalkylatorer och analysverktyg.")}
  <div class="panel"><h2>Sell Calculator</h2><p class="muted small" style="margin-top:0">Se exakt vad du får ut efter marknadsavgifter – och vilket pris du ska lista för att få önskat nettobelopp. Avgifterna ändras ibland, så du kan justera dem själv; dina värden sparas i webbläsaren och används även för nettovärdena på resten av sidan.</p>
    <div class="form" style="max-width:560px"><label>Försäljningspris (${curSym()})<input class="inp" id="gross" type="number" min="0" step="0.01" placeholder="t.ex. 250"></label>
    <label>Önskat nettobelopp (${curSym()})<input class="inp" id="net" type="number" min="0" step="0.01" placeholder="t.ex. 200"></label></div>
    <div class="scroll-x" style="margin-top:14px"><table class="tbl" id="sellTbl"><thead><tr><th>Marknad</th><th class="r">Avgift (%)</th><th class="r">Du får (netto)</th><th class="r">Lista för att få önskat netto</th><th>Vad pengarna blir</th></tr></thead><tbody></tbody></table></div>
    <div class="row" style="margin-top:12px"><label class="muted small">Steam-krediter räknas som <input class="inp" id="c2c" type="number" min="1" max="100" step="1" style="width:70px;display:inline-block"> % av riktiga pengar</label><button class="btn ghost sm" id="reset">Återställ standardavgifter</button></div>
    <div class="muted small" style="margin-top:8px"><b>Steam-plånbok ≠ riktiga pengar.</b> Pengar du får på Steam Market blir krediter som bara kan användas på Steam (spel, föremål). Externa marknadsplatser betalar ut riktiga pengar. Omräkningen ovan är en uppskattning av vad krediter är värda jämfört med riktiga pengar. Avgifterna är uppskattningar och varierar med belopp och betalmetod.</div></div>`;
  const pctIn = m => `<input class="inp" data-fee="${m.key}" type="number" min="0" max="50" step="0.1" value="${(m.fee * 100).toFixed(1)}" style="width:84px" aria-label="Avgift ${esc(m.name)}">`;
  const calc = () => {
    const g = moneyFromNum($("#gross", root).value) || 0, n = moneyFromNum($("#net", root).value) || 0; // visningsvalutan -> kronor
    $("#sellTbl tbody", root).innerHTML = MARKETS.map(m => `<tr><td>${m.name}</td><td class="r">${pctIn(m)}</td>
      <td class="r num">${g ? kr(g * (1 - m.fee)) : "–"}</td><td class="r num">${n ? kr(n / (1 - m.fee)) : "–"}</td>
      <td>${m.real ? "Riktiga pengar" : `<span class="muted">Steam-krediter${g ? ` (≈ ${kr(g * (1 - m.fee) * settings.creditToCash)} i riktiga pengar)` : ""}</span>`}</td></tr>`).join("");
    root.querySelectorAll("[data-fee]").forEach(i => i.addEventListener("change", async () => {
      const m = MARKETS.find(x => x.key === i.dataset.fee), v = parseFloat(String(i.value).replace(",", "."));
      if (Number.isFinite(v) && v >= 0 && v <= 50) { m.fee = v / 100; await saveSettings(); calc(); toast("Avgift sparad"); } else toast("Ange en avgift mellan 0 och 50 %");
    }));
  };
  const c2c = $("#c2c", root); c2c.value = Math.round(settings.creditToCash * 100);
  c2c.addEventListener("change", async () => { const v = +c2c.value; if (v >= 1 && v <= 100) { settings.creditToCash = v / 100; await saveSettings(); calc(); toast("Sparat"); } });
  $("#reset", root).addEventListener("click", async () => { MARKETS.forEach(m => m.fee = DEFAULT_FEES[m.key]); settings.creditToCash = 0.7; c2c.value = 70; await saveSettings(); calc(); toast("Standardavgifter återställda"); });
  root.querySelectorAll("#gross,#net").forEach(i => i.addEventListener("input", calc)); calc();
}

export function renderMarket(root) {
  // Steams prishistorik är brusig för sällsynta föremål (få försäljningar ger orimliga hopp). Därför visas bara föremål som
  // är likvida: lägsta externa pris ≥ $8, finns hos minst 3 marknadsplatser, Steam-priset ligger nära marknaden, inga Souvenir.
  const moves = [];
  for (const [mhn, t] of D.trend) {
    const [d1, d7, d30] = t; const steam = d1 ?? d7;
    const row = D.P.p[mhn];
    if (!steam || !d7 || !d30 || !row || !D.mhn.has(mhn) || mhn.startsWith("Souvenir")) continue;
    const ext = lowestExternal(row);
    if (!ext || ext < 8 || [1, 2, 3, 4, 5].filter(i => row[i]).length < 3) continue;
    if (steam / ext > 3 || steam / ext < 0.8) continue;
    const ch7 = (steam / d7 - 1) * 100, ch30 = (steam / d30 - 1) * 100;
    if (Math.abs(ch7) > 60) continue; // sannolikt brus
    moves.push({ mhn, now: ext, ch7, ch30 });
  }
  const up = [...moves].sort((a, b) => b.ch7 - a.ch7).slice(0, 15), down = [...moves].sort((a, b) => a.ch7 - b.ch7).slice(0, 15);
  const tbl = rows => `<div class="scroll-x"><table class="tbl"><thead><tr><th>Föremål</th><th class="r">Pris</th><th class="r" title="Steams senaste 24 h-snitt mot 7-dagarssnittet">Mot 7 d-snitt</th><th class="r hide-m" title="Steams senaste 24 h-snitt mot 30-dagarssnittet">Mot 30 d-snitt</th></tr></thead><tbody>${rows.map(r => {
    const e = lookup(r.mhn)?.e;
    return `<tr><td><div class="nm">${e ? `<img loading="lazy" src="${esc(imgUrl(e.img, "96fx72f"))}" alt="" width="56" height="42">` : ""}<a class="n2" href="${e ? "#/item/" + esc(e.id) : "#"}">${esc(r.mhn)}</a></div></td><td class="r num">${kr(usd2sek(r.now))}</td><td class="r num ${cls(r.ch7)}">${pct(r.ch7)}</td><td class="r num hide-m ${cls(r.ch30)}">${pct(r.ch30)}</td></tr>`;
  }).join("")}</tbody></table></div>`;
  root.innerHTML = `${pageHead("Market & Prices", "Prisrörelser för likvida föremål. Priset är det lägsta utropspriset på riktiga marknadsplatser, procenten är Steam-trenden (7 och 30 dagar). Prisjämförelse mellan marknadsplatser finns på varje föremåls sida.")}
  ${moves.length ? `<div class="grid cols-2 keep1" style="grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))"><div class="panel"><h2>Stiger mest (7 d)</h2>${tbl(up)}</div><div class="panel"><h2>Faller mest (7 d)</h2>${tbl(down)}</div></div>
    <p class="muted small">Endast föremål från ca ${kr(usd2sek(8))} som finns hos minst tre marknadsplatser. Souvenir och orimliga hopp (över 60 % på en vecka) är bortfiltrerade eftersom de oftast beror på få försäljningar.</p>`
    : emptyState("Inga prisrörelser att visa", "Prisrörelser visas när det finns prishistorik för likvida föremål.")}`;
}
