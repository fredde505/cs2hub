import { moneyFromNum, curSym, toDisp, $, $$, esc, imgUrl, kr, krm, dec, pct, cls, signKr, usd2sek, uid, toast, wearFromFloat, WEAR_LONG, notice, MISSING, confirmBox } from "../util.js";
import { D, mhnFor, priceInfo, cashUsd } from "../data.js";
import { getKV, setKV } from "../store.js";
import { analysePrice } from "../pricing.js";
import { pageHead, itemPicker, dispName, emptyState, priceNote } from "./common.js";
import { NEXT, checkRules, analyze, normLimitForWear, cleanSavedTradeups, normFloat, sizeOf, nextOf, caseIndex, COVERT } from "../tradeup-core.js";

// Trade-up-reglerna och formlerna ligger i tradeup-core.js (testade). Vyn visar och förklarar dem.
const st = { entries: [], stattrak: false, col: "", name: "" }; // entries: {id, float, count, price|null}
let saved = [];

/** Sammanhang för beräkningen: skins, samlingar och priser (per slitage/variant). */
/* Samling → knivar/handskar i fallet (för Covert → kniv/handske). Byggs en gång. */
let caseIdx = null;
const specials = () => caseIdx || (caseIdx = caseIndex(D.other.filter(o => o.ty === "crate" && o.ct === "Case"), id => D.byId.get(id)));
const sizeNow = () => (st.entries.length ? sizeOf(D.byId.get(st.entries[0].id)?.r) : 10);

function ctxFor(stattrak) {
  const mhn = (s, fl) => mhnFor(s, fl == null ? null : wearFromFloat(fl), { st: stattrak });
  const ageMs = D.priceAge ? Date.now() - D.priceAge : 0;
  return {
    skin: id => D.byId.get(id) || null, collection: cid => D.colById.get(cid) || null,
    special: cid => (specials().get(cid) || []).map(id => D.byId.get(id)).filter(Boolean), colOf: s => (s.col || []).find(c => specials().has(c)) ?? s.col?.[0],
    price: (s, fl) => { const i = priceInfo(mhn(s, fl)); return i ? usd2sek(i.usd) : null; },
    net: (s, fl) => { const c = cashUsd(mhn(s, fl)); return c ? usd2sek(c) : null; },
    flag: (s, fl) => { const m = mhn(s, fl), a = analysePrice(D.P.p[m] || null, { ageMs, mhn: m }); return a.level === "uncertain" || a.level === "stale" ? a : null; },
  };
}
const contractOf = () => ({ stattrak: st.stattrak, entries: st.entries.map(e => ({ id: e.id, float: e.float, count: e.count, price: e.price })) });
/** Belopp (kronor) som tal i visningsvalutan för number-fält (punkt som decimaltecken). */
const numMoney = sek => String(Math.round(toDisp(sek) * 100) / 100);
const total = () => st.entries.reduce((t, e) => t + e.count, 0);

export async function renderTradeup(root) {
  saved = cleanSavedTradeups(await getKV("tradeupSaved", null));
  draw(root);
}

function draw(root) {
  const ctx = ctxFor(st.stattrak), n = total(), contract = contractOf(), rl = checkRules(contract, ctx), size = sizeNow(), valid = rl.every(r => !r.hard || r.ok) && n === size;
  const A = valid ? analyze(contract, ctx) : null;
  const lines = st.entries.map(e => { const s = D.byId.get(e.id), p = e.price ?? ctx.price(s, Math.min(Math.max(e.float, s.f[0]), s.f[1])); return { e, s, p }; });
  const cost = lines.reduce((t, l) => t + (l.p ?? 0) * l.e.count, 0), missIn = lines.filter(l => l.p == null).length;
  const avgF = n ? st.entries.reduce((t, e) => t + e.count * e.float, 0) / n : 0;
  root.innerHTML = `${pageHead("Trade-up Calculator", "Välj 10 skins av samma rarity – eller 5 Covert-skins för en kniv/handske. Se möjliga utfall, sannolikheter, float, förväntat värde, risk och break-even – och spara och jämför kontrakt.")}
    <div class="grid split" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start">
      <div><div class="panel"><div class="row spread"><h2 style="margin:0">Input (${n}/${size})</h2><label class="chip ${st.stattrak ? "on" : ""}" id="stt">StatTrak™</label></div>
        <div style="margin:10px 0" id="pk"></div>
        ${st.entries.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Skin</th><th class="r">Float</th><th class="r">Antal</th><th class="r">Pris/st (${curSym()})</th><th class="r">Summa</th><th></th></tr></thead><tbody>${lines.map(({ e, s, p }, i) => `<tr><td><div class="n2">${esc(dispName(s))}</div><div class="muted small">${esc(s.r)} · ${esc(s.cn[0] || "")} · normaliserad float ${dec(normFloat(e.float, s.f[0], s.f[1]), 3)}</div></td>
          <td class="r"><input class="inp" data-f="${i}" type="number" step="0.001" min="${s.f[0]}" max="${s.f[1]}" value="${e.float}" style="width:84px" aria-label="Float"></td>
          <td class="r"><input class="inp" data-c="${i}" type="number" min="1" max="${size}" value="${e.count}" style="width:56px" aria-label="Antal"></td>
          <td class="r"><input class="inp" data-p="${i}" type="number" min="0" step="0.01" placeholder="${p != null ? numMoney(p) : "pris saknas"}" value="${e.price != null ? numMoney(e.price) : ""}" style="width:96px" aria-label="Pris per st"></td>
          <td class="r num">${p != null ? kr(p * e.count) : MISSING}</td>
          <td class="r"><button class="btn ghost sm danger" data-x="${i}" aria-label="Ta bort">✕</button></td></tr>`).join("")}</tbody></table></div>` : emptyState("Inga skins tillagda", "Sök och lägg till skins ovan. Alla 10 måste ha samma rarity (eller 5 Covert för kniv/handske).")}
        <div class="row spread" style="margin-top:12px"><span class="muted small">Snittfloat ${n ? dec(avgF, 4) : "–"}</span><b class="num">Kostnad: ${kr(cost)}</b></div>
        ${missIn ? `<div class="small" style="margin-top:6px"><span class="miss">Pris saknas</span> <span class="muted">för ${missIn} skin – fyll i pris själv så räknas det med (annars räknas kostnaden som noll för den raden).</span></div>` : ""}
        <div class="small" style="margin-top:12px"><b>Kontroll mot CS2:s regler</b>${rl.map(r => `<div class="${r.ok ? "pos" : r.hard ? "neg" : ""}" style="${!r.ok && !r.hard ? "color:#d9b36a" : ""}">${r.ok ? "✓" : r.hard ? "✗" : "⚠"} ${esc(r.text)}</div>`).join("")}</div>
        <button class="btn ghost sm" id="clr" style="margin-top:8px">Töm</button></div>
        <div class="panel" style="margin-top:14px"><h2>Spara och jämför</h2>
          <div class="row" style="gap:8px"><input class="inp" id="tname" placeholder="Namn på kontraktet" value="${esc(st.name)}" style="max-width:240px" aria-label="Namn"><button class="btn ghost sm" id="tsave" ${st.entries.length ? "" : "disabled"}>Spara kontrakt</button></div>
          ${saved.length ? savedHtml(saved) : `<p class="muted small" style="margin:8px 0 0">Spara kontrakt för att jämföra dem senare med dagens priser.</p>`}</div></div>
      <div class="panel"><h2>Resultat</h2>${A ? resultHtml(A, ctx) : emptyState(valid ? "" : "Kontraktet är inte komplett", n < size ? `Lägg till ${size - n} skins till för att se utfall.` : "Åtgärda punkterna med ✗ till vänster för att se utfall.")}</div></div>
    ${A ? explainHtml(A) : ""}
    <p class="muted small" style="margin-top:14px">${esc(priceNote())} Priserna är lägsta utropspris för utfallets slitage och räknar inte med exakt float, seed eller stickers. Förväntat värde är ett genomsnitt över alla möjliga utfall – ett enskilt kontrakt ger ett av dem, inte genomsnittet.</p>`;
  bind(root);
}

function resultHtml(A, ctx) {
  const covertNote = A.covert ? `<div class="small" style="margin-bottom:10px;padding:8px 10px;border:1px dashed var(--amber-bd,#8a6d2f);border-radius:8px;color:#d9b36a;line-height:1.5"><b>Uppskattning – inte officiella odds.</b> Valve publicerar inga odds för Covert → kniv/handske. Siffrorna bygger på en modell från tredjepartsguider (chans per samling = antal input / 5, delat lika mellan fallets modeller × finish) som inte är bekräftad av Valve. ${A.rareGroups ? `<br>Sällsynta eller omärkta faser (Ruby, Sapphire, Black Pearl, Emerald, fas #nnn) kan förekomma i ${A.rareGroups} av utfallen men deras chans är okänd och ingår <b>inte</b> i förväntat värde – det är därför en <b>nedre gräns</b>.` : ""}</div>` : "";
  const outs = st.col ? A.outcomes.filter(o => o.cid === st.col) : A.outcomes;
  const colShare = st.col ? A.collections.find(c => c.cid === st.col) : null;
  const r = A.risk;
  return `${covertNote}<div class="grid cols-2" style="margin-bottom:12px"><div><div class="muted small">Förväntat värde (marknadspris)${A.covert ? " – uppskattning" : ""}</div><div class="num" style="font-size:22px;font-weight:600">${kr(A.ev)}</div><div class="muted small">≈ ${kr(A.evNet)} netto efter avgift</div></div>
    <div><div class="muted small">Förväntad vinst</div><div class="num ${cls(A.profit)}" style="font-size:22px;font-weight:600">${signKr(A.profit)}</div><div class="small ${cls(A.roi)}">${pct(A.roi)} · netto ${signKr(A.profitNet)} (${pct(A.roiNet)})</div></div></div>
    <div class="grid cols-2" style="margin-bottom:10px"><div class="muted small">Break-even-kostnad<br><b class="num" style="color:var(--text)">${kr(A.breakEven)}</b> totalt (${kr(A.breakEven / A.n)} per skin)<br><span class="small">efter avgift: <b class="num" style="color:var(--text)">${kr(A.breakEvenNet)}</b></span></div>
      <div class="muted small">Chans till vinst<br><b class="num" style="color:var(--text)">${dec(A.winProb * 100, 1)} %</b> <span class="small">(utfallet värt mer än kostnaden)</span><br><span class="small">efter avgift: <b class="num" style="color:var(--text)">${dec(A.winProbNet * 100, 1)} %</b> · ${A.outcomes.length} utfall</span></div></div>
    ${A.missingOutcomes || A.missingInputs ? `<div class="small" style="margin-bottom:8px;color:#d9b36a">⚠ ${A.missingOutcomes ? `${A.missingOutcomes} utfall (${dec(A.missingProb * 100, 0)} % av sannolikheten) saknar pris och räknas som noll – det riktiga förväntade värdet är <b>minst</b> ${kr(A.ev)}, sannolikt högre. ` : ""}${A.missingInputs ? `${A.missingInputs} input saknar pris – kostnaden är därför lägre än verkligheten.` : ""}</div>` : ""}
    ${r ? `<div class="panel" style="margin-bottom:12px;padding:10px"><b class="small">Risk</b> <span class="muted small">(bland utfall med pris, ${dec(r.coverage * 100, 0)} % av sannolikheten)</span>
      <dl class="kv small" style="margin:6px 0 0"><dt>Lägsta / högsta utfall</dt><dd class="num">${kr(r.min)} / ${kr(r.max)}</dd><dt>Spridning (standardavvikelse)</dt><dd class="num">${kr(r.stdev)}${A.ev > 0 ? ` <span class="faint">(${dec(r.stdev / A.ev * 100, 0)} % av förväntat värde)</span>` : ""}</dd>
      <dt>Chans att få mindre än hälften av kostnaden</dt><dd class="num ${r.lossHalf > 0.25 ? "neg" : ""}">${dec(r.lossHalf * 100, 1)} %</dd><dt>Chans att förlora pengar (värde &lt; kostnad)</dt><dd class="num">${dec(r.lossAny * 100, 1)} %</dd>
      <dt>Mest sannolika utfall</dt><dd class="num">${esc(r.mostLikely.s.p || r.mostLikely.s.n)} · ${dec(r.mostLikely.prob * 100, 1)} %</dd></dl></div>` : ""}
    ${A.top.length ? `<div style="margin-bottom:12px"><b class="small">Mest värdefulla utfall</b><div class="small" style="margin-top:4px">${A.top.map(o => `<div class="row spread" style="padding:3px 0"><span>${esc(o.s.p ? `${o.s.w} | ${o.s.p}` : o.s.n)} <span class="faint">${o.wear || ""} · ${dec(o.prob * 100, 1)} %</span></span><span class="num ${o.price > A.cost ? "pos" : ""}">${kr(o.price)}</span></div>`).join("")}</div></div>` : ""}
    <div style="margin-bottom:12px"><b class="small">Samlingar</b><div class="scroll-x"><table class="tbl small"><thead><tr><th>Samling</th><th class="r">Input</th><th class="r">Chans att få utfall härifrån</th><th class="r">${A.covert ? "Modeller × finish" : "Möjliga utfall"}</th><th class="r">Chans per ${A.covert ? "modell/finish" : "utfall"}</th></tr></thead><tbody>${A.collections.map(c => `<tr><td>${esc(c.name)}</td><td class="r num">${c.inputs}/${A.n}</td><td class="r num">${dec(c.share * 100, 0)} %</td><td class="r num">${c.poolSize}</td><td class="r num">${dec(c.perOutcome * 100, 1)} %</td></tr>`).join("")}</tbody></table></div></div>
    ${A.collections.length > 1 ? `<div class="row small" style="margin-bottom:8px;gap:8px"><span class="muted">Visa bara utfall från:</span><select class="inp" id="colf" aria-label="Samling"><option value="">Alla samlingar</option>${A.collections.map(c => `<option value="${esc(c.cid)}" ${st.col === c.cid ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>${colShare ? `<span class="muted">Chans att få något därifrån: <b class="num" style="color:var(--text)">${dec(colShare.share * 100, 0)} %</b></span>` : ""}</div>` : ""}
    <div class="scroll-x"><table class="tbl"><thead><tr><th>Utfall</th><th class="r">Chans</th><th class="r hide-m">Float</th><th class="r">Värde</th></tr></thead><tbody>${outs.slice(0, 40).map(o => `<tr><td><div class="nm"><span class="rar" style="--rc:${esc(o.s.rc)}"></span><img loading="lazy" src="${esc(imgUrl(o.s.img, "96fx72f"))}" alt="" width="56" height="42"><div><div class="n2">${esc(o.s.p ? `${o.s.w} | ${o.s.p}` : o.s.n)}</div><div class="n1">${esc(o.col?.n || "")}${o.phases.length ? ` · ${esc(o.phases.join("/"))} (lika chans)` : ""}${o.rare.length ? ` · <span style="color:#d9b36a" title="Dessa faser kan också droppas men chansen är okänd och ingår inte i värdet">+ ${esc(o.rare.map(x => (/^#/.test(x) ? "fas " + x : x)).join("/"))} (okänd chans)</span>` : ""}</div></div></div></td>
      <td class="r num">${dec(o.prob * 100, 1)} %</td><td class="r num hide-m">${o.fl != null ? dec(o.fl, 4) : "–"}<div class="muted small">${o.wear || "ingen float"}${o.edge && o.edge.distance < 0.003 ? ` <span style="color:#d9b36a" title="Floaten ligger mindre än 0,003 från slitagegränsen ${dec(o.edge.edge, 2)} – en liten ändring i inputs kan ge ett annat slitage och pris">⚠ nära gräns</span>` : ""}</div></td><td class="r num ${(o.price ?? 0) > A.cost ? "pos" : ""}">${krm(o.price)}${o.flag ? `<div><span class="miss" title="${esc(o.flag.reasons.join(" "))}">${esc(o.flag.label)}</span></div>` : ""}</td></tr>`).join("")}</tbody></table></div>
    ${outs.length > 40 ? `<div class="muted small">Visar 40 av ${outs.length}.</div>` : ""}`;
}

/** Steg-för-steg: så har siffrorna räknats fram för just det här kontraktet. */
function explainHtml(A) {
  const first = A.outcomes.find(o => o.fl != null) || A.outcomes[0], hasF = first.fl != null, lo = hasF ? first.s.f[0] : 0, hi = hasF ? first.s.f[1] : 0;
  const lim = hasF ? normLimitForWear(lo, hi, first.wear) : null;
  return `<details class="panel" style="margin-top:14px"><summary style="cursor:pointer"><b>Så räknades det här kontraktet ut</b></summary><div class="small" style="margin-top:10px;line-height:1.7">
    <p style="margin:0 0 8px"><b>1. Normaliserad float per input</b> = (float − skinets lägsta) / (skinets högsta − lägsta):</p>
    <ul style="margin:0 0 8px;padding-left:18px">${A.lines.map(x => `<li>${esc(dispName(x.s))}: (${dec(x.fl, 4)} − ${dec(x.s.f[0], 2)}) / (${dec(x.s.f[1], 2)} − ${dec(x.s.f[0], 2)}) = <b>${dec(x.norm, 4)}</b> × ${x.count} st</li>`).join("")}</ul>
    <p style="margin:0 0 8px"><b>2. Snitt</b> av de ${A.n} inputsen = <b>${dec(A.avgNorm, 4)}</b>.</p>
    <p style="margin:0 0 8px"><b>3. Output-float</b> för varje utfall = skinets lägsta + snittet × (högsta − lägsta). ${hasF ? `Exempel (${esc(first.s.p || first.s.n)}): ${dec(lo, 2)} + ${dec(A.avgNorm, 4)} × (${dec(hi, 2)} − ${dec(lo, 2)}) = <b>${dec(first.fl, 4)}</b> → ${WEAR_LONG[first.wear]}.` : "Utfallen saknar float (vanilla-kniv)."}${A.covert ? " Exakt formel för Covert → kniv/handske är inte bekräftad av Valve." : ""}${lim ? ` Utfallet förblir ${first.wear} så länge snittet ligger mellan ${dec(lim.min, 3)} och ${dec(lim.max, 3)}.` : ""}</p>
    <p style="margin:0 0 8px"><b>4. Chans</b> för ett utfall = (antal input från samlingen / ${A.n}) / (antal ${A.covert ? "modeller × finish i samlingens fall" : esc(A.next) + "-skins i samlingen"}). Exempel: ${esc(first.s.p || first.s.n)}: ${A.collections.find(c => c.cid === first.cid).inputs}/${A.n} / ${A.collections.find(c => c.cid === first.cid).poolSize} = <b>${dec(first.prob * 100, 2)} %</b>.${A.covert ? " Doppler-faser (Phase 1–4) delar på gruppens chans; sällsynta faser ingår inte." : ""}</p>
    <p style="margin:0 0 8px"><b>5. Förväntat värde</b> = summan av (chans × pris) över alla utfall = <b>${kr(A.ev)}</b>. Break-even-kostnaden är samma tal: kostar inputsen mer än så förväntas förlust i genomsnitt.</p>
    <p style="margin:0"><b>6. Chans till vinst</b> = summan av chansen för de utfall vars pris är högre än kostnaden (${kr(A.cost)}). "Efter avgift" jämför i stället utfallets nettovärde (efter marknadsavgift).</p></div></details>`;
}

function savedHtml(list) {
  const ctxCache = {};
  const rows = list.map(c => {
    const ctx = ctxCache[c.stattrak] || (ctxCache[c.stattrak] = ctxFor(c.stattrak)), contract = { stattrak: c.stattrak, entries: c.entries };
    const rl = checkRules(contract, ctx), ok = rl.every(r => !r.hard || r.ok) && c.entries.reduce((t, e) => t + e.count, 0) === sizeOf(D.byId.get(c.entries[0]?.id)?.r) && c.entries.every(e => D.byId.has(e.id));
    return { c, A: ok ? analyze(contract, ctx) : null };
  });
  const order = [...rows].sort((a, b) => (b.A?.profit ?? -1e12) - (a.A?.profit ?? -1e12)), best = order[0]?.A ? order[0].c.id : null;
  return `<div class="scroll-x" style="margin-top:10px"><table class="tbl small"><thead><tr><th>Kontrakt</th><th class="r">Kostnad</th><th class="r">Förväntat värde</th><th class="r">Vinst</th><th class="r hide-m">Chans vinst</th><th class="r hide-m">Spridning</th><th></th></tr></thead><tbody>${order.map(({ c, A }) => `<tr style="${c.id === best && rows.length > 1 ? "font-weight:700" : ""}"><td>${esc(c.name)}${c.stattrak ? " ST™" : ""}${A && (A.missingOutcomes || A.missingInputs) ? ' <span class="miss" title="Något pris saknas">pris saknas</span>' : ""}</td>
    ${A ? `<td class="r num">${kr(A.cost)}</td><td class="r num">${kr(A.ev)}</td><td class="r num ${cls(A.profit)}">${signKr(A.profit)}</td><td class="r num hide-m">${dec(A.winProb * 100, 0)} %</td><td class="r num hide-m">${A.risk ? kr(A.risk.stdev) : "–"}</td>` : `<td colspan="5" class="muted">kan inte räknas (ogiltigt kontrakt eller skin saknas)</td>`}
    <td class="r" style="white-space:nowrap"><button class="btn ghost sm" data-open="${esc(c.id)}">Öppna</button> <button class="btn ghost sm danger" data-del="${esc(c.id)}" aria-label="Ta bort">✕</button></td></tr>`).join("")}</tbody></table></div>
    <p class="muted small" style="margin:6px 0 0">Räknas om med dagens priser. Fetstil = högst förväntad vinst.</p>`;
}

function bind(root) {
  const redraw = () => draw(root);
  itemPicker($("#pk", root), s => {
    if (!s.wr || !s.f || !s.col.length) return notice("Den här skinen kan inte användas i ett trade-up här (samling saknas, eller så är den en kniv/handske).");
    if (!nextOf(s.r)) return notice(`Rarity ${s.r} kan inte användas i ett kontrakt.`);
    if (s.r === COVERT && !s.col.some(c => specials().has(c))) return notice("Den här Covert-skinen tillhör en samling utan vapenfall med kniv/handske (kart-, Armory- eller souvenirsamling) och kan inte användas.");
    if (st.entries.length && D.byId.get(st.entries[0].id).r !== s.r) return notice("Alla skins måste ha samma rarity (" + D.byId.get(st.entries[0].id).r + ").");
    if (st.stattrak && !s.st) return notice("Skinen finns inte som StatTrak™.");
    const ex = st.entries.find(e => e.id === s.id);
    const cap = sizeOf(s.r);
    if (total() >= cap && !ex) return notice(`Kontraktet har redan ${cap} skins. Ta bort eller minska något först.`);
    if (ex) ex.count = Math.min(cap, ex.count + 1); else st.entries.push({ id: s.id, float: +((s.f[0] + s.f[1]) / 2).toFixed(3), count: Math.max(1, Math.min(cap - total(), cap)), price: null });
    redraw();
  }, { kinds: ["weapon"], placeholder: "Sök skin att lägga till…" });
  $("#stt", root).addEventListener("click", () => { st.stattrak = !st.stattrak; redraw(); });
  $("#clr", root).addEventListener("click", () => { st.entries = []; st.col = ""; redraw(); });
  const num = (sel, key, fn) => $$(sel, root).forEach(el => el.addEventListener("change", () => { fn(st.entries[+el.dataset[key]], el.value); redraw(); }));
  num("[data-f]", "f", (e, v) => e.float = Math.max(0, Math.min(1, +v || 0)));
  num("[data-c]", "c", (e, v) => e.count = Math.max(1, Math.min(sizeNow(), Math.floor(+v) || 1)));
  num("[data-p]", "p", (e, v) => e.price = v === "" || !Number.isFinite(+v) || +v < 0 ? null : moneyFromNum(v)); // inskrivet i visningsvalutan -> kronor
  $$("[data-x]", root).forEach(b => b.addEventListener("click", () => { st.entries.splice(+b.dataset.x, 1); redraw(); }));
  $("#colf", root)?.addEventListener("change", e => { st.col = e.target.value; redraw(); });
  $("#tname", root)?.addEventListener("input", e => { st.name = e.target.value; });
  $("#tsave", root)?.addEventListener("click", async () => {
    const name = (st.name.trim() || `Trade-up ${saved.length + 1}`).slice(0, 80);
    saved = cleanSavedTradeups([{ id: uid(), name, stattrak: st.stattrak, entries: st.entries.map(e => ({ id: e.id, float: e.float, count: e.count, price: e.price })), created: Date.now() }, ...saved]);
    await setKV("tradeupSaved", saved); st.name = ""; toast("Kontraktet sparat"); redraw();
  });
  $$("[data-open]", root).forEach(b => b.addEventListener("click", () => { const c = saved.find(x => x.id === b.dataset.open); if (!c) return; st.stattrak = c.stattrak; st.entries = c.entries.filter(e => D.byId.has(e.id)).map(e => ({ ...e })); st.col = ""; st.name = c.name; redraw(); scrollTo(0, 0); }));
  $$("[data-del]", root).forEach(b => b.addEventListener("click", async () => { if (!await confirmBox("Ta bort det sparade kontraktet?", { ok: "Ta bort", danger: true })) return; saved = saved.filter(x => x.id !== b.dataset.del); await setKV("tradeupSaved", saved); redraw(); }));
}
