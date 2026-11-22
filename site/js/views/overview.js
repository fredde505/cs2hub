import { esc, kr, krm, signKr, pct, cls, lineChart, imgUrl, COLORS } from "../util.js";
import { all } from "../store.js";
import { D, bestUsd } from "../data.js";
import { usd2sek } from "../util.js";
import { loadState, buildRows, totals } from "../finance.js";
import { pageHead, stat, itemCard } from "./common.js";
import { checkAlerts } from "./watchlist.js";

export async function renderOverview(root) {
  const [{ items, trades }, snaps, alerts, watch, loadouts] = await Promise.all([loadState(), all("snapshots"), checkAlerts(), all("watch"), all("loadouts")]);
  const { rows, pos } = buildRows(items, trades);
  const t = totals(rows, pos, items);
  const has = items.length > 0, hasSales = [...pos.values()].some(p => p.sold > 0);
  const top = [...rows].filter(r => !r.it.hidden).sort((a, b) => (b.vCash || 0) - (a.vCash || 0)).slice(0, 5);
  const pts = snaps.sort((a, b) => a.ts - b.ts).map(s => ({ x: s.ts, y: s.cash }));
  const steps = [
    { done: has, t: "Hämta ditt inventory", d: "Från Steam eller lägg till för hand.", href: "#/inventory" },
    { done: trades.length > 0, t: "Registrera vad du betalade", d: "Då räknas vinst och förlust ut.", href: "#/inventory/trades" },
    { done: watch.length > 0, t: "Bevaka ett pris", d: "Få besked när målpriset nås.", href: "#/watchlist" },
    { done: loadouts.length > 0, t: "Bygg en loadout", d: "Planera kostnad och färgtema.", href: "#/loadout" },
  ];
  const pillar = (n, t, d, h) => `<a class="panel" href="${h}" style="display:block"><div class="faint small">${n}</div><div style="font-weight:600;margin:2px 0 4px">${t}</div><div class="muted small">${d}</div></a>`;
  root.innerHTML = `${pageHead("Overview", "Samla, utforska, skapa och analysera – gratis och helt i din webbläsare.")}
    ${alerts.length ? `<div class="panel" style="margin-bottom:12px;border-color:#3a4a3f"><b class="pos">● ${alerts.length} prisavisering${alerts.length > 1 ? "ar" : ""}</b> <span class="muted">– målpriset är nått för ${esc(alerts.slice(0, 2).map(a => a.mhn).join(", "))}${alerts.length > 2 ? "…" : ""}. <a href="#/watchlist" style="text-decoration:underline">Visa</a></span></div>` : ""}
    <div class="grid cols-4" style="margin-bottom:12px">
      ${stat("Inventory (riktiga pengar)", has ? kr(t.cash) : "–", has ? `${t.count} föremål · netto efter marknadsavgifter${t.unpricedItems ? ` · <span class="miss">${t.unpricedItems} utan pris</span>` : ""}` : "Inget inventory än")}
      ${stat("Inventory (Steam-krediter)", has ? kr(t.steam) : "–", "Steam Market-pris, går inte att ta ut")}
      ${stat("Orealiserad vinst", t.withCost ? signKr(t.unrealizedCash) : "–", t.cost ? pct(t.unrealizedCash / t.cost * 100) + " på investerat" : "Registrera inköp för att se vinst", cls(t.unrealizedCash))}
      ${stat("Realiserad vinst", hasSales ? signKr(t.realized) : "–", hasSales ? `Efter avgifter (${kr(t.fees)})` : "Ingen försäljning registrerad än", cls(t.realized))}
    </div>
    ${has ? `<div class="grid split" style="margin-bottom:18px"><div class="panel"><h2>Värdeutveckling</h2>${lineChart(pts, { fmt: v => kr(v) })}</div>
      <div class="panel"><h2>Största innehav</h2>${top.map(r => `<div class="row spread" style="padding:7px 0;border-bottom:1px solid var(--line)"><div class="row" style="flex-wrap:nowrap;min-width:0"><span class="rar" style="--rc:${esc(r.rc)};height:24px"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</span></div><span class="num">${krm(r.vCash)}</span></div>`).join("")}<a href="#/inventory" class="muted small" style="display:block;margin-top:10px;text-decoration:underline">Hela inventoryt →</a></div></div>`
    : ""}
    ${steps.every(s => s.done) ? "" : `<div class="panel" style="margin-bottom:14px"><div class="row spread"><h3 style="margin:0">Kom igång</h3><span class="muted small">${steps.filter(s => s.done).length} av ${steps.length} klara</span></div>
      <div class="grid cols-4" style="margin-top:12px">${steps.map((s, i) => `<a class="panel" href="${s.href}" style="display:block;${s.done ? "opacity:.6" : "border-color:var(--line2)"}"><div class="small ${s.done ? "pos" : "muted"}">${s.done ? "✓ Klart" : "Steg " + (i + 1)}</div><div style="font-weight:600;margin:2px 0">${s.t}</div><div class="muted small">${s.d}</div></a>`).join("")}</div></div>`}
    ${watch.length ? `<div class="panel" style="margin-bottom:14px"><div class="row spread"><h2 style="margin:0">Dina bevakningar</h2><a class="muted small" href="#/watchlist" style="text-decoration:underline">Alla (${watch.length}) →</a></div>${watch.slice(0, 5).map(w => { const cur = usd2sek(bestUsd(w.mhn)), hit = cur != null && (w.dir === "below" ? cur <= w.target : cur >= w.target); return `<div class="row spread" style="padding:7px 0;border-bottom:1px solid var(--line)"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.mhn)}</span><span class="num small">${krm(cur)} <span class="muted">${w.dir === "below" ? "≤" : "≥"} ${kr(w.target)}</span> ${hit ? '<b class="pos">● nått</b>' : ""}</span></div>`; }).join("")}</div>` : ""}
    <div class="grid cols-4">
      ${pillar("COLLECT", "My Inventory", "Innehav, inköp och vinst i kronor.", "#/inventory")}
      ${pillar("EXPLORE", "Database", `${D.skins.length.toLocaleString("sv-SE")} skins, ${D.stickers.length.toLocaleString("sv-SE")} stickers och mer.`, "#/database")}
      ${pillar("EXPLORE", "Color Explorer", "Hitta skins efter färg, pris och slitage.", "#/colors")}
      ${pillar("ANALYZE", "Market & Tools", "Prisjämförelse, avgifter och rörelser.", "#/market")}
    </div>`;
}
