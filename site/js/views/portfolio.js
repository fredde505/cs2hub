import { curSym, esc, kr, dec, signKr, pct, cls, fmtDate, multiChart } from "../util.js";
import { KIND_LABEL, emptyState } from "./common.js";
import { PERIODS, windowSnaps, coverageDays, changeSince, splitChange, concentration, holdingAge, contributors } from "../portfolio-core.js";

const P = { period: "90" };

/** Portfolio Analytics. Historiska värden bygger enbart på sparade mätpunkter – inget gammalt värde gissas från dagens priser. */
export function portfolioTab(body, allRows, t, trades, snaps, steamMode, redraw) {
  const rows = allRows.filter(r => !r.it.hidden);
  const field = steamMode ? "steam" : "cash", val = r => (steamMode ? r.vSteam : r.vCash) ?? 0, pl = r => (steamMode ? r.plSteam : r.plCash);
  const now = Date.now(), total = steamMode ? t.steam : t.cash;
  if (!rows.length || !total) { body.innerHTML = emptyState("Ingen portfölj att analysera än", "Portfolio Analytics visas när du har värderade föremål i ditt inventory."); return; }

  const per = PERIODS.find(p => p[0] === P.period) || PERIODS[2], days = per[2];
  const cover = coverageDays(snaps, now), all = windowSnaps(snaps, null, now), win = windowSnaps(snaps, days, now);
  const allHaveCost = t.withoutCost === 0 && t.withCost > 0;
  const chg = d => changeSince(snaps, total, field, d, now);
  const ch1 = chg(1), ch7 = chg(7), ch30 = chg(30), chSel = chg(days ?? 36500);

  const delta = (c, label) => {
    if (!c) return { v: "–", sub: all.length ? "ingen äldre mätpunkt än" : "inga mätpunkter än", c: "" };
    return { v: signKr(c.change), sub: `${c.pct != null ? pct(c.pct) : "–"}${c.partial ? ` · sedan ${dec(c.spanDays, c.spanDays < 10 ? 1 : 0)} d (äldre saknas)` : ""}`, c: cls(c.change) };
  };
  const kpi = (label, d, tip = "") => `<div class="panel stat" title="${esc(tip)}"><div class="lbl">${esc(label)}</div><div class="val num ${d.c || ""}">${d.v}</div><div class="sub">${d.sub}</div></div>`;

  const seg = `<div class="seg" id="pseg" role="group" aria-label="Period">${PERIODS.map(([k, l, d]) => `<button data-p="${k}" class="${k === per[0] ? "on" : ""}" ${d && d > cover + 1 && cover > 0 ? `title="Du har bara ${dec(cover, 0)} dagars historik – grafen visar allt som finns"` : ""}>${l}</button>`).join("")}</div>`;

  const cost = win.filter(x => x.cost > 0).map(x => ({ x: x.ts, y: x.cost })), valuePts = win.map(x => ({ x: x.ts, y: x[field] })).filter(p => Number.isFinite(p.y));
  const marks = trades.filter(x => (x.type === "buy" || x.type === "sell") && x.date >= (win[0]?.ts ?? 0)).map(x => ({ x: x.date, type: x.type, tip: `${x.type === "buy" ? "Köp" : "Försäljning"}: ${x.qty} × ${x.mhn} à ${kr(x.price)}` }));
  const chart = multiChart([{ name: steamMode ? "Värde (Steam)" : "Värde (netto)", color: "currentColor", pts: valuePts }, { name: "Registrerad kostnad", color: "#8a9099", dash: "5 4", pts: cost }], { fmt: v => kr(v), marks, since: all[0]?.ts });
  const hi = valuePts.length ? Math.max(...valuePts.map(p => p.y)) : null, lo = valuePts.length ? Math.min(...valuePts.map(p => p.y)) : null;
  const covNote = all.length ? `${all.length} mätpunkter sedan ${fmtDate(all[0].ts)} (${dec(cover, 0)} dagar). ${days && days > cover + 1 ? `<b>Du har bara ${dec(cover, 0)} dagars historik – ${esc(per[1])} kan inte visas fullt ut än.</b> ` : ""}En mätpunkt sparas ungefär var 6:e timme du öppnar sidan, så luckor är normala.` : "Inga mätpunkter än – de börjar sparas automatiskt när du öppnar sidan.";

  const sp = splitChange(chSel, t.cost, allHaveCost);
  const driver = chSel ? `<div class="panel"><h2>Vad har ändrat värdet? <span class="muted small" style="font-weight:400">${esc(per[1])}${chSel.partial ? ` (hela historiken, ${dec(chSel.spanDays, 0)} d)` : ""}</span></h2>
      <dl class="kv"><dt>Värdeförändring</dt><dd class="num ${cls(chSel.change)}"><b>${signKr(chSel.change)}</b></dd>
      ${sp ? `<dt>varav nya köp (ökad kostnad)</dt><dd class="num">${signKr(sp.invested)}</dd><dt>varav marknadsrörelse</dt><dd class="num ${cls(sp.market)}"><b>${signKr(sp.market)}</b></dd>` : `<dt>Uppdelning</dt><dd class="muted small">kräver inköpspris på alla föremål och en mätpunkt med kostnad</dd>`}
      ${hi != null ? `<dt>Högsta / lägsta värde</dt><dd class="num">${kr(hi)} / ${kr(lo)}</dd>` : ""}</dl>
      <p class="muted small" style="margin:8px 0 0">Värdeförändring jämför dagens värde med mätpunkten ${fmtDate(chSel.base.ts)}. Marknadsrörelse = värdeförändring minus det du lagt till i inköp – en uppskattning, inte en exakt mätning.</p></div>` : `<div class="panel"><h2>Vad har ändrat värdet?</h2><p class="muted small" style="margin:0">Visas när det finns en äldre mätpunkt att jämföra med.</p></div>`;

  const unreal = steamMode ? t.unrealizedSteam : t.unrealizedCash, real = steamMode ? t.realizedSteam : t.realizedCash;
  const hasSales = trades.some(x => x.type === "sell");
  const pnl = `<div class="panel"><h2>Vinst och förlust</h2><dl class="kv">
      <dt>Investerat (registrerat)</dt><dd class="num">${t.withCost ? kr(t.cost) : "–"}</dd>
      <dt>Orealiserad vinst</dt><dd class="num ${cls(unreal)}">${t.withCost ? signKr(unreal) : "–"}</dd>
      <dt>Realiserad vinst</dt><dd class="num ${cls(real)}">${hasSales ? signKr(real) : "–"}</dd>
      <dt><b>Totalt</b></dt><dd class="num ${cls((t.withCost ? unreal : 0) + (hasSales ? real : 0))}"><b>${t.withCost || hasSales ? signKr((t.withCost ? unreal : 0) + (hasSales ? real : 0)) : "–"}</b></dd></dl>
      <p class="muted small" style="margin:8px 0 0">${t.withoutCost ? `${t.withoutCost} föremål saknar inköpspris och ingår inte i vinsten. ` : ""}Orealiserat = uppskattat värde − registrerad kostnad. Realiserat bygger på försäljningar du själv registrerat.</p></div>`;

  const conc = concentration(rows.map(val));
  const concBox = conc ? `<div class="panel"><h2>Koncentration</h2><dl class="kv"><dt>Största innehavet</dt><dd class="num">${dec(conc.top1, 1)} %</dd><dt>3 största</dt><dd class="num">${dec(conc.top3, 1)} %</dd><dt>5 största</dt><dd class="num"><b>${dec(conc.top5, 1)} %</b></dd><dt>10 största</dt><dd class="num">${dec(conc.top10, 1)} %</dd><dt>Antal värderade poster</dt><dd class="num">${conc.count}</dd></dl>
      <p class="muted small" style="margin:8px 0 0">Koncentrationen är <b>${conc.level}</b> (hög: största &gt; 40 % eller 5 största &gt; 80 %; måttlig: 5 största &gt; 60 %). Det beskriver bara hur värdet är fördelat – inte om det är bra eller dåligt.</p></div>` : "";

  const ages = holdingAge(rows.map(r => ({ value: val(r), firstBuy: r.firstBuy })), now), ageMax = Math.max(1, ...ages.buckets.map(b => b.value));
  const ageBox = `<div class="panel"><h2>Hur länge har du ägt dem?</h2>${ages.known ? ages.buckets.map(b => `<div style="margin-bottom:9px"><div class="row spread small"><span>${esc(b.label)} <span class="faint">· ${b.count} poster</span></span><span class="num">${kr(b.value)}</span></div><div style="height:4px;background:var(--line);border-radius:2px;margin-top:4px"><div style="height:4px;width:${(b.value / ageMax * 100).toFixed(1)}%;background:#8a9099;border-radius:2px"></div></div></div>`).join("")
    + `<p class="muted small" style="margin:8px 0 0">Mediantid sedan första köp: <b>${dec(ages.medianDays, 0)} dagar</b> · äldsta: ${dec(ages.oldestDays, 0)} dagar.${ages.unknown ? ` ${ages.unknown} poster (${kr(ages.unknownValue)}) saknar registrerat köp och ingår inte.` : ""}</p>` : `<p class="muted small" style="margin:0">Visas när du registrerat köp med datum. Ägartiden räknas från första registrerade köp av varje föremål.</p>`}</div>`;

  const cats = Object.entries(t.byKind).map(([k, v]) => [k, steamMode ? v.steam : v.cash, v.qty]).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]), catTot = cats.reduce((s, e) => s + e[1], 0);
  const catBox = `<div class="panel"><h2>Kategorier</h2>${cats.map(([k, v, q]) => `<div style="margin-bottom:9px"><div class="row spread small"><span>${esc(KIND_LABEL[k] || k)} <span class="faint">· ${q} st</span></span><span class="num">${kr(v)} <span class="faint">${dec(v / catTot * 100, 0)} %</span></span></div><div style="height:4px;background:var(--line);border-radius:2px;margin-top:4px"><div style="height:4px;width:${(v / catTot * 100).toFixed(1)}%;background:#8a9099;border-radius:2px"></div></div></div>`).join("")}</div>`;

  const c = contributors(rows.map(r => ({ name: (r.e?.p || r.name) + (r.qty > 1 ? ` ×${r.qty}` : ""), value: val(r), pl: r.cost != null ? pl(r) : null })), 8);
  const line = (x, k) => `<div class="row spread small" style="padding:5px 0;border-bottom:1px solid var(--line)"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span><span class="num ${k === "v" ? "" : cls(x.pl)}">${k === "v" ? `${kr(x.value)} <span class="faint">${dec(x.share, 1)} %</span>` : signKr(x.pl)}</span></div>`;
  const lists = `<div class="grid cols-2 keep1" style="grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));margin-top:12px">
      <div class="panel"><h2>Bidrar mest till värdet</h2>${c.byValue.map(x => line(x, "v")).join("") || '<div class="muted small">–</div>'}</div>
      <div class="panel"><h2>Största vinster (${curSym()})</h2>${c.gains.map(x => line(x, "p")).join("") || '<div class="muted small">Registrera inköp för att se vinst per föremål.</div>'}</div>
      <div class="panel"><h2>Största förluster (${curSym()})</h2>${c.losses.map(x => line(x, "p")).join("") || '<div class="muted small">Inga förluster registrerade.</div>'}</div></div>`;

  body.innerHTML = `<div class="row spread" style="margin-bottom:12px;flex-wrap:wrap"><span class="muted small" style="max-width:640px">Historiken bygger bara på mätpunkter som sparats i den här webbläsaren – inget gammalt värde gissas utifrån dagens priser.</span>${seg}</div>
    <div class="kpis" style="margin-bottom:14px">${kpi("Totalt värde", { v: kr(total), sub: steamMode ? "Steam-krediter" : "netto efter avgift", c: "" })}${kpi("Idag (24 h)", delta(ch1), "Skillnad mot mätpunkten närmast 24 timmar bakåt")}${kpi("7 dagar", delta(ch7))}${kpi("30 dagar", delta(ch30))}</div>
    <p class="muted small" style="margin:-6px 0 12px">Värdeförändringar inkluderar nya köp och försäljningar – se uppdelningen nedan för vad som är marknadsrörelse.</p>
    <div class="panel" style="margin-bottom:14px"><h2>Värde och inköp över tid · ${esc(per[1])}</h2>${chart}<div class="muted small" style="margin-top:6px">${covNote}</div></div>
    <div class="grid cols-2 keep1" style="grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))">${driver}${pnl}${concBox}${ageBox}${catBox}</div>${lists}`;
  body.querySelectorAll("#pseg [data-p]").forEach(b => b.addEventListener("click", () => { P.period = b.dataset.p; redraw(); }));
}
