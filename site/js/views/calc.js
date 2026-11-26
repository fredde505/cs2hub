import { $, esc, kr, dec, parseDec, parseMoney, inputMoney, curSym, signKr, pct, cls, usd2sek, WEAR_LONG, toast } from "../util.js";
import { D, MARKETS, mhnFor, priceInfo, lookup } from "../data.js";
import { tradeMath, listForNet } from "../pricing.js";
import { pageHead, itemPicker } from "./common.js";
import { getPrefs } from "../prefs.js";

/** Advanced Price Calculator: räkna på köp och försäljning med avgifter, jämför två marknader och flera säljpriser. Allt i kronor. */
const S = { mhn: null, name: "", qty: "1", buy: "", sell: "", buyFee: "0", fixed: "0", a: "csfloat", b: "skinport", wears: [] };

export function renderCalc(root) {
  if (!S._init) { S._init = true; S.a = getPrefs().calcMarket; if (S.a === S.b) S.b = S.a === "skinport" ? "csfloat" : "skinport"; } // standardmarknad från Inställningar
  const opts = sel => MARKETS.map(m => `<option value="${m.key}" ${sel === m.key ? "selected" : ""}>${esc(m.name)} (${dec(m.fee * 100, 1)} %)</option>`).join("");
  root.innerHTML = `${pageHead("Price Calculator", "Räkna på ett köp och en försäljning: avgifter, nettobelopp, vinst och break-even – och jämför två marknader sida vid sida.")}
    <div class="panel" style="margin-bottom:14px"><h2>Föremål (valfritt)</h2><div id="cpick" style="max-width:520px"></div>
      <div class="row" style="margin-top:10px;align-items:center"><span id="cname" class="muted small">Inget föremål valt – du kan räkna med egna priser.</span><select class="inp" id="cwear" aria-label="Slitage" hidden></select></div></div>
    <div class="panel" style="margin-bottom:14px"><h2>Köp och försäljning</h2>
      <div class="form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
        <label>Antal<input class="inp" id="cq" inputmode="numeric" value="${esc(S.qty)}"></label>
        <label>Köppris per st (${curSym()})<input class="inp" id="cb" inputmode="decimal" value="${esc(S.buy)}" placeholder="t.ex. 150"></label>
        <label>Avgift vid köp (%)<input class="inp" id="cbf" inputmode="decimal" value="${esc(S.buyFee)}"></label>
        <label>Säljpris per st (${curSym()})<input class="inp" id="cs" inputmode="decimal" value="${esc(S.sell)}" placeholder="t.ex. 180"></label>
        <label>Fast avgift vid sälj (${curSym()})<input class="inp" id="cfx" inputmode="decimal" value="${esc(S.fixed)}"></label>
        <label>Marknad A<select class="inp" id="ma">${opts(S.a)}</select></label>
        <label>Marknad B<select class="inp" id="mb">${opts(S.b)}</select></label></div>
      <div class="row" style="margin-top:10px"><button class="btn ghost sm" id="useBuy" disabled>Använd marknadspris som köppris</button><button class="btn ghost sm" id="useSell" disabled>Använd marknadspris som säljpris</button></div></div>
    <div id="cout"></div>
    <p class="muted small" style="margin-top:14px">Avgifterna kommer från Inställningar (du kan ändra dem). Marknadspriset är lägsta utropspris, inte genomförd försäljning. Steam-försäljning ger Steam-krediter som inte går att ta ut. Nettot är före skatt – ta hänsyn till egna skatteregler vid vinst.</p>`;
  const dr = () => ({ q: Math.max(1, Math.floor(parseDec($("#cq", root).value) || 1)), buy: parseMoney($("#cb", root).value), sell: parseMoney($("#cs", root).value), bf: parseDec($("#cbf", root).value) || 0, fx: parseMoney($("#cfx", root).value) || 0 /* belopp skrivs i visningsvalutan och räknas om till kronor */ });
  const mk = k => MARKETS.find(m => m.key === k);
  const paint = () => {
    S.qty = $("#cq", root).value; S.buy = $("#cb", root).value; S.sell = $("#cs", root).value; S.buyFee = $("#cbf", root).value; S.fixed = $("#cfx", root).value; S.a = $("#ma", root).value; S.b = $("#mb", root).value;
    const d = dr(), out = $("#cout", root);
    if (d.buy == null || d.sell == null || d.buy < 0 || d.sell < 0) { out.innerHTML = `<div class="panel muted small">Ange köppris och säljpris för att se resultatet.</div>`; return; }
    if (d.bf < 0 || d.bf >= 100) { out.innerHTML = `<div class="panel neg small">Avgift vid köp måste vara mellan 0 och 100 %.</div>`; return; }
    const calc = m => ({ m, r: tradeMath({ buy: d.buy, sell: d.sell, qty: d.q, buyFeePct: d.bf, sellFeePct: m.fee * 100, fixedFee: d.fx }) });
    const A = calc(mk(S.a)), B = calc(mk(S.b));
    const col = x => `<div class="panel"><h2>${esc(x.m.name)} <span class="muted small" style="font-weight:400">avgift ${dec(x.m.fee * 100, 1)} %</span></h2>
      <dl class="kv"><dt>Köpkostnad (${d.q} st)</dt><dd class="num">${kr(x.r.cost)}</dd>
      <dt>Bruttointäkt</dt><dd class="num">${kr(x.r.gross)}</dd>
      <dt>Avgift</dt><dd class="num neg">−${kr(x.r.fee)}</dd>
      <dt>Du får ut (netto)</dt><dd class="num"><b>${kr(x.r.net)}</b></dd>
      <dt>Vinst / förlust</dt><dd class="num ${cls(x.r.profit)}"><b>${signKr(x.r.profit)}</b></dd>
      <dt>Avkastning</dt><dd class="num ${cls(x.r.roi)}">${x.r.roi == null ? "–" : pct(x.r.roi)}</dd>
      <dt>Break-even säljpris / st</dt><dd class="num">${kr(x.r.breakEven)}${x.r.breakEvenRise != null ? ` <span class="faint small">(${pct(x.r.breakEvenRise)} mot köppriset)</span>` : ""}</dd></dl>
      ${x.m.key === "steam" ? `<div class="small" style="color:#d9b36a">Steam-krediter går inte att ta ut som riktiga pengar.</div>` : ""}</div>`;
    const better = A.r.profit === B.r.profit ? "" : A.r.profit > B.r.profit ? A.m.name : B.m.name;
    const base = d.sell || d.buy, scen = [0.8, 0.9, 1, 1.1, 1.2, 1.5].map(f => base * f);
    out.innerHTML = `<div class="grid cols-2 keep1" style="grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));margin-bottom:14px">${col(A)}${col(B)}</div>
      ${better ? `<p class="small" style="margin:0 0 14px"><b>${esc(better)}</b> ger ${kr(Math.abs(A.r.profit - B.r.profit))} mer i vinst med de här priserna.</p>` : ""}
      <div class="panel scroll-x" style="padding:0;margin-bottom:14px"><table class="tbl"><thead><tr><th>Säljpris / st</th><th class="r">Netto ${esc(A.m.name)}</th><th class="r">Vinst ${esc(A.m.name)}</th><th class="r">Netto ${esc(B.m.name)}</th><th class="r">Vinst ${esc(B.m.name)}</th></tr></thead><tbody>
      ${scen.map(sp => { const a = tradeMath({ buy: d.buy, sell: sp, qty: d.q, buyFeePct: d.bf, sellFeePct: A.m.fee * 100, fixedFee: d.fx }), b = tradeMath({ buy: d.buy, sell: sp, qty: d.q, buyFeePct: d.bf, sellFeePct: B.m.fee * 100, fixedFee: d.fx }); return `<tr><td class="num">${kr(sp)}</td><td class="r num">${kr(a.net)}</td><td class="r num ${cls(a.profit)}">${signKr(a.profit)}</td><td class="r num">${kr(b.net)}</td><td class="r num ${cls(b.profit)}">${signKr(b.profit)}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="panel small"><b>Vill du få ut ett visst belopp?</b> För att få ${kr(d.buy)} netto per st behöver du lista för <b>${kr(listForNet(d.buy, A.m.fee * 100))}</b> på ${esc(A.m.name)} och <b>${kr(listForNet(d.buy, B.m.fee * 100))}</b> på ${esc(B.m.name)} (bara för att få tillbaka det du la ut, före köpavgift).</div>`;
  };
  ["#cq", "#cb", "#cs", "#cbf", "#cfx"].forEach(s => $(s, root).addEventListener("input", paint));
  ["#ma", "#mb"].forEach(s => $(s, root).addEventListener("change", paint));
  const price = () => { const i = S.mhn && priceInfo(S.mhn); return i ? usd2sek(i.usd) : null; };
  const setMhn = mhn => {
    S.mhn = mhn; const p = price(), has = p != null;
    $("#useBuy", root).disabled = $("#useSell", root).disabled = !has;
    $("#cname", root).innerHTML = mhn ? `<b>${esc(mhn)}</b> · ${has ? "marknadspris " + kr(p) : "pris saknas – ange egna priser"}` : "Inget föremål valt – du kan räkna med egna priser.";
  };
  const fill = (id, v) => { $(id, root).value = inputMoney(v); paint(); };
  $("#useBuy", root).addEventListener("click", () => { const p = price(); if (p != null) fill("#cb", p); });
  $("#useSell", root).addEventListener("click", () => { const p = price(); if (p != null) fill("#cs", p); });
  itemPicker($("#cpick", root), e => {
    const wsel = $("#cwear", root);
    if (e.wr?.length) {
      wsel.hidden = false; wsel.innerHTML = e.wr.map(w => `<option value="${w}">${WEAR_LONG[w]}</option>`).join(""); wsel.value = e.wr.includes("FT") ? "FT" : e.wr[0];
      const upd = () => setMhn(mhnFor(e, wsel.value)); wsel.onchange = upd; upd();
    } else { wsel.hidden = true; setMhn(e.mh || e.n); }
    if (price() != null && !$("#cb", root).value) fill("#cb", price());
    if (price() != null && !$("#cs", root).value) fill("#cs", price());
  }, { kinds: ["weapon", "knife", "glove", "case", "capsule", "sticker", "charm", "agent", "music", "patch", "graffiti"] });
  setMhn(S.mhn); paint();
}
