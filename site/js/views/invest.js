import { $, esc, imgUrl, kr, usd2sek, pct, cls, parseMoney, inputMoney, curSym, dec } from "../util.js";
import { D, MARKETS, lookup, lowestExternal, cashUsd, loadHistory, historyFor, historyDays } from "../data.js";
import { analysePrice, seriesStats, spanDays, lastDays } from "../pricing.js";
import { pageHead, emptyState } from "./common.js";
import { getPrefs } from "../prefs.js";

/**
 * Investeringsradar: ett historiskt analysverktyg – vilka skins har hållit värdet eller stigit, och vilka har tappat.
 * Underlag: (1) Steams snitt för 24 h / 7 d / 30 d / 90 d, (2) vår egen dagliga prishistorik när den hunnit bli minst 7 dagar lång.
 * Det är inte en prognos och inte ekonomisk rådgivning.
 */
const P = { min: "100", kind: "", hideDoubt: true };
const skip = mhn => mhn.startsWith("Souvenir") || /Doppler|Marble Fade|Case Hardened|Fade/.test(mhn); // pris beror på fas/mönster
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MIN_HIST_DAYS = 7;

/** Poängformeln på ett ställe, så att sidan kan visa exakt hur den räknas. */
export const SCORE = { w90: 0.45, w30: 0.35, w7: 0.1, volPenalty: 0.15, volFree: 12, heatPenalty: 15 };
function scoreOf({ ch7, ch30, ch90, vol, hot }) {
  const parts = { ch90: SCORE.w90 * clamp(ch90, -40, 60), ch30: SCORE.w30 * clamp(ch30, -30, 40), ch7: SCORE.w7 * clamp(ch7, -15, 15), vol: -SCORE.volPenalty * Math.max(0, vol - SCORE.volFree), heat: hot ? -SCORE.heatPenalty : 0 };
  return { score: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

/** Analysen räknas om bara när underlaget ändras (prisdata, historik eller avgifter) – inte vid varje filterändring. */
let memo = null;
const analysed = () => { const k = D.priceAge + "|" + historyDays() + "|" + MARKETS.map(m => m.fee).join(); if (!memo || memo.k !== k) memo = { k, v: analyse() }; return memo.v; };
function analyse() {
  const out = [], ageMs = D.priceAge ? Date.now() - D.priceAge : 0;
  for (const [mhn, t] of D.trend) {
    const [d1, d7, d30, d90] = t;
    const now = d1 ?? d7;
    const row = D.P.p[mhn], hit = D.mhn.get(mhn);
    if (!now || !d7 || !d30 || !d90 || !row || !hit || skip(mhn)) continue;
    const kind = hit.e.kind;
    if (!["weapon", "knife", "glove", "case"].includes(kind)) continue;
    const ext = lowestExternal(row);
    if (!ext || ext < 3 || [1, 2, 3, 4, 5].filter(i => row[i]).length < 3) continue; // för få marknader = för lite handel
    if (now / ext > 3 || now / ext < 0.8) continue; // Steam-priset avviker för mycket från marknaden = brus
    const ch7 = (now / d7 - 1) * 100, ch30 = (now / d30 - 1) * 100, ch90 = (now / d90 - 1) * 100;
    if (Math.abs(ch90) > 300) continue;
    const pts = [now, d7, d30, d90], mean = pts.reduce((a, b) => a + b, 0) / 4;
    const vol = (Math.max(...pts) - Math.min(...pts)) / mean * 100; // hur mycket priset svängt mellan perioderna
    const net = cashUsd(mhn), need = net ? Math.max(0, (ext / net - 1) * 100) : null; // hur mycket det måste stiga för att täcka avgiften vid försäljning
    let tag, tone;
    const hot = ch7 > 20 || now > d30 * 1.25;
    if (hot) { tag = "Överhettad – vänta"; tone = "warn"; }
    else if (ch90 <= -10 || ch30 <= -8) { tag = "Fallande"; tone = "neg"; }
    else if (ch90 >= 10 && ch30 >= 3) { tag = "Stigande"; tone = "pos"; }
    else if (ch90 >= -5 && ch30 >= -5 && vol < SCORE.volFree) { tag = "Stabil"; tone = "pos"; }
    else { tag = "Blandat"; tone = ""; }
    const { score, parts } = scoreOf({ ch7, ch30, ch90, vol, hot });
    const ps = analysePrice(row, { ageMs, mhn });
    const mk = [1, 2, 3, 4, 5].filter(i => row[i]).length;
    // Egen historik (ett värde per dag, lägsta marknadspris) – används bara när den är tillräckligt lång
    const hp = historyFor(mhn), span = hp ? spanDays(hp) : 0;
    const own = hp && span >= MIN_HIST_DAYS ? { days: Math.round(span), chg: seriesStats(hp).changePct, vol: seriesStats(hp).vol, w30: spanDays(lastDays(hp, 30)) >= 20 ? seriesStats(lastDays(hp, 30)).changePct : null } : null;
    out.push({ mhn, e: hit.e, kind, ext, ch7, ch30, ch90, vol, need, score, parts, tag, tone, ps, mk, own });
  }
  return out;
}

export async function renderInvest(root) {
  if (!P._init) { P._init = true; const m = getPrefs().minKr; P.min = inputMoney(m != null ? m : 100, m != null ? 2 : 0); /* standard 100 kr, omräknat till visningsvalutan */ } // standard lägsta pris från Inställningar
  root.innerHTML = `${pageHead("Investeringsradar", "Ett historiskt analysverktyg: vilka skins har hållit priset eller stigit, och vilka har tappat. Ingen prognos och ingen ekonomisk rådgivning.")}
    <div class="toolbar"><label class="muted small">Lägsta pris (${curSym()}) <input class="inp" id="imin" type="text" inputmode="decimal" value="${esc(P.min)}" style="width:90px"></label>
    <select class="inp" id="ikind" aria-label="Typ"><option value="">Alla typer</option><option value="weapon">Vapen</option><option value="knife">Knivar</option><option value="glove">Handskar</option><option value="case">Lådor</option></select>
    <label class="muted small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="idoubt" ${P.hideDoubt ? "checked" : ""}> Dölj osäkra priser</label></div>
    <div id="ihist" class="muted small" style="margin:-4px 0 10px"></div>
    <div id="iout"></div>
    <details class="muted small" style="margin-top:6px"><summary style="cursor:pointer;width:max-content">Så räknas poängen och taggarna</summary>
      <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7">
        <li><b>Poäng</b> = ${SCORE.w90} × förändring 90 d (begränsad −40…+60 %) + ${SCORE.w30} × 30 d (−30…+40 %) + ${SCORE.w7} × 7 d (−15…+15 %) − ${SCORE.volPenalty} × (svängning − ${SCORE.volFree} %) − ${SCORE.heatPenalty} om överhettad. Håll muspekaren över en tagg för exakta delar för just det föremålet.</li>
        <li><b>Överhettad:</b> upp över 20 % senaste veckan eller över 1,25 × 30 d-snittet. <b>Fallande:</b> −10 % eller mer på 90 d, eller −8 % på 30 d. <b>Stigande:</b> +10 % på 90 d och +3 % på 30 d. <b>Stabil:</b> inom −5 % på både 30 och 90 d och svängning under ${SCORE.volFree} %.</li>
        <li><b>Svängning</b> = (högsta − lägsta av nuvarande, 7, 30 och 90 d-snittet) / medelvärdet. <b>Måste stiga</b> = hur mycket priset måste öka för att du ska gå plus efter säljavgiften på Skinport/CSFloat.</li>
        <li><b>Egen historik</b> (kolumnen "Egen") är vår dagliga insamling av lägsta marknadspris och visas först när den är minst ${MIN_HIST_DAYS} dagar lång för just det föremålet. Steams snitt bygger ofta på få försäljningar för dyra eller sällsynta skins – därför kräver vi minst tre marknader och döljer som standard föremål med osäkert pris.</li></ul></details>
    <p class="muted small" style="margin-top:12px">Doppler, Fade, Case Hardened, Marble Fade och Souvenir tas inte med (priset beror på fas/mönster). Priserna är utropspriser, inte genomförda försäljningar. Historik säger inget säkert om framtiden.</p>`;
  $("#ikind", root).value = P.kind;
  const go = () => { P.min = $("#imin", root).value; P.kind = $("#ikind", root).value; P.hideDoubt = $("#idoubt", root).checked; paint(root); };
  $("#imin", root).addEventListener("change", go); $("#ikind", root).addEventListener("change", go); $("#idoubt", root).addEventListener("change", go);
  paint(root);
  await loadHistory(); // egen historik hämtas först nu (stor fil) och uppdaterar bara kolumnen "Egen"
  if (!root.contains($("#iout", root))) return;
  const d = historyDays();
  $("#ihist", root).textContent = d ? `Egen prishistorik: ${d} dag${d === 1 ? "" : "ar"} insamlade${d < MIN_HIST_DAYS ? ` – visas per föremål först när den är minst ${MIN_HIST_DAYS} dagar.` : "."}` : "Egen prishistorik är inte tillgänglig just nu – bara Steams snitt används.";
  paint(root);
}

const tip = r => `Poäng ${dec(r.score, 1)}: 90 d ${dec(r.parts.ch90, 1)} · 30 d ${dec(r.parts.ch30, 1)} · 7 d ${dec(r.parts.ch7, 1)} · svängning ${dec(r.parts.vol, 1)}${r.parts.heat ? " · överhettad " + dec(r.parts.heat, 0) : ""}`;
function row(r) {
  const ownTxt = r.own ? `<span class="${cls(r.own.chg)}">${pct(r.own.chg)}</span><div class="faint small">${r.own.days} d</div>` : '<span class="faint">–</span>';
  const doubt = r.ps.level === "uncertain" || r.ps.level === "stale";
  return `<tr><td><div class="nm"><img loading="lazy" src="${esc(imgUrl(r.e.img, "96fx72f"))}" alt="" width="56" height="42"><div><a class="n2" href="#/item/${esc(r.e.id)}">${esc(r.mhn)}</a><div class="n1 ${r.tone === "pos" ? "pos" : r.tone === "neg" ? "neg" : ""}" title="${esc(tip(r))}">${esc(r.tag)} · poäng ${dec(r.score, 0)}${doubt ? ` · <span class="miss" title="${esc(r.ps.reasons.join(" "))}">${esc(r.ps.label)}</span>` : ""}${r.mk < 4 ? ` · <span class="faint">${r.mk} marknader</span>` : ""}</div></div></div></td>
    <td class="r num">${kr(usd2sek(r.ext))}</td>
    <td class="r num hide-m ${cls(r.ch7)}">${pct(r.ch7)}</td>
    <td class="r num ${cls(r.ch30)}">${pct(r.ch30)}</td>
    <td class="r num ${cls(r.ch90)}"><b>${pct(r.ch90)}</b></td>
    <td class="r num hide-m">${ownTxt}</td>
    <td class="r num hide-m">${Math.round(r.vol)} %</td>
    <td class="r num hide-m">${r.need == null ? "–" : "+" + Math.round(r.need) + " %"}</td></tr>`;
}
const table = list => `<div class="panel scroll-x" style="padding:0;margin-bottom:18px"><table class="tbl"><thead><tr><th>Skin</th><th class="r">Pris</th><th class="r hide-m">7 d</th><th class="r">30 d</th><th class="r">90 d</th><th class="r hide-m" title="Förändring i vår egen dagliga prishistorik sedan första mätningen (visas när den är minst 7 dagar)">Egen</th><th class="r hide-m" title="Hur mycket priset svängt mellan perioderna">Svängning</th><th class="r hide-m" title="Hur mycket priset måste stiga för att täcka säljavgiften">Måste stiga</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table></div>`;

function paint(root) {
  const out = $("#iout", root), minUsd = (parseMoney(P.min) || 0) / usd2sek(1);
  if (!D.trend.size) { out.innerHTML = emptyState("Ingen trenddata", "Prisutveckling saknas i den nuvarande prisfilen. Uppdatera priserna och försök igen."); return; }
  const base = analysed().filter(r => r.ext >= minUsd && (!P.kind || r.kind === P.kind));
  const hidden = P.hideDoubt ? base.filter(r => r.ps.level === "uncertain" || r.ps.level === "stale").length : 0;
  const all = P.hideDoubt ? base.filter(r => r.ps.level !== "uncertain" && r.ps.level !== "stale") : base;
  const good = all.filter(r => r.tone === "pos").sort((a, b) => b.score - a.score).slice(0, 25);
  const hot = all.filter(r => r.tone === "warn").sort((a, b) => b.ch7 - a.ch7).slice(0, 15);
  const bad = all.filter(r => r.tone === "neg").sort((a, b) => a.score - b.score).slice(0, 25);
  const sec = (title, sub, list, none) => `<h2 style="margin:6px 0 2px">${title}</h2><p class="muted small" style="margin:0 0 8px">${sub}</p>${list.length ? table(list) : `<div class="panel muted small" style="margin-bottom:18px">${none}</div>`}`;
  out.innerHTML = sec("Har hållit värdet eller stigit", "Stabil eller uppåtgående över 30 och 90 dagar, utan stora svängningar. Sorterat efter poäng.", good, "Inga föremål matchar med dina filter.")
    + sec("Överhettade – vänta med att köpa", "Har hoppat kraftigt på kort tid. Ofta rätt dåligt läge att köpa; priset brukar röra sig tillbaka.", hot, "Inga kraftiga hopp just nu.")
    + sec("Fallande – undvik eller sälj", "Har tappat värde senaste 30–90 dagarna.", bad, "Inga tydliga fallare med dina filter.")
    + (hidden ? `<p class="muted small">${hidden} föremål döljs eftersom deras pris är osäkert eller gammalt (avmarkera "Dölj osäkra priser" för att se dem).</p>` : "");
}
