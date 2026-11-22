import { $, $$, esc, fx } from "./util.js";
import { loadData, refreshLive, D, settings, setPriceMode, loadSettings } from "./data.js";
import { getKV } from "./store.js";
import { renderOverview } from "./views/overview.js";
import { renderInventory, recordSnapshot } from "./views/inventory.js";
import { renderList, renderItem, renderCollection, searchDatabase } from "./views/database.js";
import { renderColors } from "./views/colors.js";
import { renderWatchlist, startWatchPolling, notifyNewHits } from "./views/watchlist.js";
import { renderTools, renderMarket } from "./views/tools.js";
import { renderWorkshop } from "./views/workshop.js";
import { renderLoadout } from "./views/loadout.js";
import { renderInspect } from "./views/inspect.js";
import { renderTradeup } from "./views/tradeup.js";
import { renderPatterns } from "./views/patterns.js";
import { renderCollections } from "./views/collections.js";
import { renderCompare } from "./views/compare.js";
import { renderShare } from "./views/share.js";
import { renderFloats } from "./views/floats.js";

const NAV = [
  { g: "" , items: [["overview", "Overview", "◧"]] },
  { g: "Collect", items: [["inventory", "My Inventory", "▤"], ["collections", "Collection Tracker", "▣"], ["watchlist", "Watchlist", "☆"]] },
  { g: "Explore", items: [["database", "Database", "☰"], ["colors", "Color Explorer", "◐"]] },
  { g: "Create", items: [["loadout", "Loadout Builder", "⚒"], ["workshop", "Sticker Workshop", "✦"]] },
  { g: "Analyze", items: [["market", "Market & Prices", "↗"], ["inspect", "Inspect & Float", "◎"], ["tradeup", "Trade-up", "⇪"], ["patterns", "Pattern Explorer", "❖"], ["compare", "Skin Comparison", "⇄"], ["floats", "Float Ranking", "≋"], ["tools", "Tools", "∑"]] },
];
const TABS = [["overview", "Översikt", "◧"], ["inventory", "Inventory", "▤"], ["database", "Databas", "☰"], ["colors", "Färger", "◐"], ["menu", "Mer", "⋯"]];

const ROUTES = {
  overview: r => renderOverview(r), inventory: r => renderInventory(r), watchlist: r => renderWatchlist(r),
  database: (r, a) => renderList(r, { kind: a[0] }), item: (r, a) => renderItem(r, a[0]), collection: (r, a) => renderCollection(r, a[0]),
  colors: r => renderColors(r), inspect: (r, a) => renderInspect(r, a), tradeup: r => renderTradeup(r), patterns: (r, a) => renderPatterns(r, a), collections: (r, a) => renderCollections(r, a), compare: (r, a) => renderCompare(r, a), share: (r, a) => renderShare(r, a[0]), floats: r => renderFloats(r), loadout: (r, a) => renderLoadout(r, a), workshop: (r, a) => renderWorkshop(r, a), market: r => renderMarket(r), tools: r => renderTools(r),
};
const TITLES = { overview: "Overview", inventory: "My Inventory", watchlist: "Watchlist", database: "Database", item: "Database", collection: "Database", colors: "Color Explorer", loadout: "Loadout Builder", workshop: "Sticker Workshop", market: "Market & Prices", inspect: "Inspect & Float", tradeup: "Trade-up Calculator", patterns: "Pattern Explorer", collections: "Collection Tracker", compare: "Skin Comparison", share: "Delad samling", floats: "Float Ranking", tools: "Tools" };
const SECTION = { item: "database", collection: "database" };

$("#nav").innerHTML = NAV.map(g => (g.g ? `<div class="grp">${g.g}</div>` : "") + g.items.map(([k, l, i]) => `<a href="#/${k}" data-r="${k}"><span class="ico">${i}</span>${l}</a>`).join("")).join("");
$("#tabbar").innerHTML = TABS.map(([k, l, i]) => `<a href="${k === "menu" ? "#" : "#/" + k}" data-r="${k}"><span class="ico">${i}</span>${l}</a>`).join("");
const side = $("#side");
$("#menuBtn").addEventListener("click", () => side.classList.toggle("open"));
$("#tabbar [data-r=menu]").addEventListener("click", e => { e.preventDefault(); side.classList.toggle("open"); });
document.addEventListener("click", e => { if (side.classList.contains("open") && !e.target.closest(".side") && !e.target.closest("#menuBtn") && !e.target.closest("[data-r=menu]")) side.classList.remove("open"); if (e.target.closest("#nav a")) side.classList.remove("open"); });

$("#globalSearch").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim()) { searchDatabase(e.target.value.trim()); e.target.blur(); }
});

let token = 0;
async function route() {
  const [, name = "overview", ...args] = location.hash.split("/").map(decodeURIComponent);
  const fn = ROUTES[name] || ROUTES.overview;
  const key = SECTION[name] || (ROUTES[name] ? name : "overview");
  $$("[data-r]").forEach(a => a.classList.toggle("on", a.dataset.r === key));
  $("#topTitle").textContent = TITLES[name] || "Overview";
  const view = $("#view"); const my = ++token;
  try {
    view.innerHTML = D.skins.length ? "" : `<div class="muted">Laddar data…</div>`;
    await fn(view, args);
  } catch (e) {
    if (my === token) view.innerHTML = `<div class="empty"><b>Något gick fel</b><br><span class="small">${esc(e.message)}</span></div>`;
    console.error(e);
  }
  if (my === token) scrollTo(0, 0);
}

function setStatus() {
  const age = D.priceAge ? new Date(D.priceAge).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : null;
  $("#priceStatus").innerHTML = age ? `${D.live ? "● Priser uppdaterade" : "○ Äldre prissnapshot"}<br>${age}` : "Ingen prisdata";
  $("#rateStatus").textContent = `1 USD = ${fx.rate.toFixed(2).replace(".", ",")} kr`;
}

async function init() {
  try { await loadData(); } catch (e) { $("#view").innerHTML = `<div class="empty"><b>Kunde inte ladda databasen</b><br><span class="small">${esc(e.message)}. Kör <code>python tools/build_data.py</code> och servera mappen <code>site/</code> via en webbserver.</span></div>`; return; }
  await loadSettings();
  await setPriceMode(await getKV("priceMode", "market"));
  $("#priceMode").value = settings.priceMode;
  $("#priceMode").addEventListener("change", async e => { await setPriceMode(e.target.value); route(); });
  setStatus();
  window.addEventListener("hashchange", route);
  await route();
  startWatchPolling(); notifyNewHits();
  refreshLive(m => $("#priceStatus").textContent = m).then(async ok => { setStatus(); await recordSnapshot(); if (ok) { const n = (location.hash.split("/")[1] || "overview"); if (["overview", "inventory", "market"].includes(n)) route(); } });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
}
init();
