import { $, $$, esc, fx, dec, toast, curCode } from "./util.js";
import { initSearch } from "./search.js";
import { loadCachedFx, loadData, refreshLive, D, settings, setPriceMode, loadSettings, ensureStickers } from "./data.js";
import { getKV } from "./store.js";
import { skeletonCards } from "./views/common.js";
import { initUpdateCheck, checkPriceAge, checkBackupReminder } from "./upkeep.js";
import { loadPrefs } from "./prefs.js";
import { recordSnapshot } from "./snapshot.js";
// Vyerna laddas först när man öppnar dem (kodsplittring): startar snabbare och använder mindre data, särskilt på mobil.
const NAV = [
  { g: "" , items: [["overview", "Overview", "◧"]] },
  { g: "Collect", items: [["inventory", "My Inventory", "▤"], ["collections", "Collection Tracker", "▣"], ["watchlist", "Watchlist", "☆"]] },
  { g: "Explore", items: [["database", "Database", "☰"], ["colors", "Color Explorer", "◐"], ["combo", "Combo Finder", "✧"]] },
  { g: "Create", items: [["loadout", "Loadout Builder", "⚒"], ["workshop", "Sticker Workshop", "✦"], ["stickers", "Sticker Finder", "◈"]] },
  { g: "Market", items: [["market", "Market & Prices", "↗"], ["deals", "Dagens fynd", "✦"], ["invest", "Investeringsradar", "△"], ["calc", "Price Calculator", "∑"]] },
  { g: "Analyze", items: [["inspect", "Inspect & Float", "◎"], ["tradeup", "Trade-up", "⇪"], ["patterns", "Pattern Explorer", "❖"], ["compare", "Skin Comparison", "⇄"], ["floats", "Float Ranking", "≋"], ["tools", "Tools", "⚙"]] },
  { g: "", items: [["settings", "Inställningar", "⚙"]] },
];
const TABS = [["overview", "Översikt", "◧"], ["inventory", "Inventory", "▤"], ["database", "Databas", "☰"], ["colors", "Färger", "◐"], ["menu", "Mer", "⋯"]];

const view = (file, fn) => (r, a) => import(`./views/${file}.js`).then(m => m[fn](r, a));
const INV_TABS = ["holdings", "trades", "profit", "analysis", "sell", "portfolio"];
const ROUTES = {
  overview: view("overview", "renderOverview"), inventory: (r, a) => import("./views/inventory.js").then(m => m.renderInventory(r, INV_TABS.includes(a[0]) ? a[0] : undefined)), watchlist: view("watchlist", "renderWatchlist"),
  database: (r, a) => import("./views/database.js").then(m => m.renderList(r, { kind: a[0] })), item: (r, a) => import("./views/database.js").then(m => m.renderItem(r, a[0])), collection: (r, a) => import("./views/database.js").then(m => m.renderCollection(r, a[0])),
  colors: view("colors", "renderColors"), inspect: view("inspect", "renderInspect"), tradeup: view("tradeup", "renderTradeup"), patterns: view("patterns", "renderPatterns"), collections: view("collections", "renderCollections"), compare: view("compare", "renderCompare"),
  share: (r, a) => import("./views/share.js").then(m => m.renderShare(r, a[0])), floats: view("floats", "renderFloats"), loadout: view("loadout", "renderLoadout"), workshop: view("workshop", "renderWorkshop"),
  market: (r) => import("./views/tools.js").then(m => m.renderMarket(r)), tools: (r) => import("./views/tools.js").then(m => m.renderTools(r)),
  settings: view("settings", "renderSettings"), deals: view("deals", "renderDeals"), invest: view("invest", "renderInvest"), calc: view("calc", "renderCalc"), stickers: view("stickers", "renderStickers"), combo: view("combo", "renderCombo"),
};const TITLES = { overview: "Overview", inventory: "My Inventory", watchlist: "Watchlist", database: "Database", item: "Database", collection: "Database", colors: "Color Explorer", loadout: "Loadout Builder", workshop: "Sticker Workshop", market: "Market & Prices", inspect: "Inspect & Float", tradeup: "Trade-up Calculator", patterns: "Pattern Explorer", collections: "Collection Tracker", compare: "Skin Comparison", share: "Delad samling", floats: "Float Ranking", tools: "Tools", settings: "Inställningar", deals: "Dagens fynd", invest: "Investeringsradar", calc: "Price Calculator", stickers: "Sticker Finder", combo: "Combo Finder" };
const SECTION = { item: "database", collection: "database" };
/* Vyer som inte slår upp klistermärken ritas direkt; alla andra väntar (oftast redan klart) på den stora stickers-filen. */
const NO_STICKERS = new Set(["overview", "settings", "tradeup", "patterns", "floats"]);

$("#nav").innerHTML = NAV.map(g => (g.g ? `<div class="grp">${g.g}</div>` : "") + g.items.map(([k, l, i]) => `<a href="#/${k}" data-r="${k}"><span class="ico">${i}</span>${l}</a>`).join("")).join("");
$("#tabbar").innerHTML = TABS.map(([k, l, i]) => `<a href="${k === "menu" ? "#" : "#/" + k}" data-r="${k}"><span class="ico">${i}</span>${l}</a>`).join("");
const side = $("#side");
$("#menuBtn").addEventListener("click", () => side.classList.toggle("open"));
$("#tabbar [data-r=menu]").addEventListener("click", e => { e.preventDefault(); side.classList.toggle("open"); });
document.addEventListener("click", e => { if (side.classList.contains("open") && !e.target.closest(".side") && !e.target.closest("#menuBtn") && !e.target.closest("[data-r=menu]")) side.classList.remove("open"); if (e.target.closest("#nav a")) side.classList.remove("open"); });

$("#skipLink").addEventListener("click", () => $("#view").focus());
// Offline-banner och vänlig hantering av oväntade fel
const net = () => { $("#netBanner").hidden = navigator.onLine; };
addEventListener("online", net); addEventListener("offline", net); net();
addEventListener("unhandledrejection", e => { console.error(e.reason); toast("Något gick fel – försök igen. Hjälper det inte, ladda om sidan."); });

let token = 0;
async function route() {
  const [, name = "overview", ...args] = location.hash.split("/").map(s => { try { return decodeURIComponent(s); } catch { return s; } }); // trasig %-kodning får inte krascha routern
  const fn = ROUTES[name] || ROUTES.overview;
  const key = SECTION[name] || (ROUTES[name] ? name : "overview");
  $$("[data-r]").forEach(a => a.classList.toggle("on", a.dataset.r === key));
  $("#topTitle").textContent = TITLES[name] || "Overview";
  const view = $("#view"); const my = ++token;
  try {
    const waitSt = !NO_STICKERS.has(name) && !D.stickersReady;
    view.innerHTML = D.skins.length && !waitSt ? "" : skeletonCards(12);
    if (waitSt) { await ensureStickers(); if (my !== token) return; if (D.stickersFailed && !route.warned) { route.warned = true; toast("Klistermärkena kunde inte laddas – ladda om sidan för att försöka igen."); } }
    await fn(view, args);
  } catch (e) {
    if (my === token) view.innerHTML = `<div class="empty"><b>Något gick fel</b><br><span class="small">${esc(e.message)}</span></div>`;
    console.error(e);
  }
  if (my === token) {
    scrollTo(0, 0);
    document.title = (TITLES[name] || "Overview") + " · CS2 Hub"; // skärmläsare och flikar ser var man är
    if (!route.first) route.first = true; else view.focus({ preventScroll: true }); // flytta fokus till innehållet vid sidbyte (inte vid första laddningen)
  }
}

function setStatus() {
  const age = D.priceAge ? new Date(D.priceAge).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : null;
  $("#priceStatus").innerHTML = age ? `${D.live ? "● Priser uppdaterade" : "○ Äldre prissnapshot"}<br>${age}` : "Ingen prisdata";
  $("#rateStatus").textContent = `1 USD = ${dec(fx.rate, 2)} kr` + (curCode() !== "SEK" ? ` · visar ${curCode()}` : "");
}

async function init() {
  $("#view").innerHTML = skeletonCards(12);
  try { await loadData(); } catch (e) { $("#view").innerHTML = `<div class="empty"><div class="empty-ico">!</div><b>Kunde inte ladda databasen</b><div class="muted small" style="margin:6px 0 14px">${esc(e.message)}<br>Kontrollera din internetanslutning och försök igen.</div><button class="btn" id="retryBoot">Försök igen</button></div>`; $("#retryBoot").addEventListener("click", () => location.reload()); return; }
  initSearch($("#globalSearch"), q => import("./views/database.js").then(m => m.searchDatabase(q)));
  await loadSettings();
  await loadCachedFx(); // sparade kurser före första sidan (annars visas standardkursen en kort stund)
  await loadPrefs(); // tema, täthet, bildkvalitet m.m. innan första sidan ritas
  await setPriceMode(await getKV("priceMode", "market"));
  $("#priceMode").value = settings.priceMode;
  $("#priceMode").addEventListener("change", async e => { await setPriceMode(e.target.value); route(); });
  setStatus();
  window.addEventListener("hashchange", route);
  await route();
  // bevakningar: ladda modulen (och starta kontrollen) bara om det finns några
  import("./store.js").then(s => s.all("watch")).then(ws => { if (ws.length) import("./views/watchlist.js").then(m => { m.startWatchPolling(); m.notifyNewHits(); }); });
  initUpdateCheck(); checkPriceAge(); checkBackupReminder();
  refreshLive(m => $("#priceStatus").textContent = m).then(async ok => { setStatus(); checkPriceAge(); await recordSnapshot(); import("./store.js").then(s => s.all("watch")).then(ws => { if (ws.length) import("./views/watchlist.js").then(m => m.notifyNewHits()); }); if (ok) { const n = (location.hash.split("/")[1] || "overview"); if (["overview", "inventory", "market"].includes(n)) route(); } });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
}
init();
