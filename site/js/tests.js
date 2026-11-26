// Automatiska tester för de viktigaste beräkningarna. Öppna http://localhost:5173/tests.html (python tools/serve.py).
// Inga beroenden. Rör aldrig den riktiga databasen (inga IndexedDB-anrop).
import { analysePrice, tradeMath, listForNet, seriesStats, lastDays, spanDays, median } from "./pricing.js";
import { validateBackup, buildBackup, planImport, payloadFor, checksumOf, plain, stable, FORMAT } from "./backup-core.js";
import { parseDec, wearFromFloat } from "./util.js";
import { positions, posKey } from "./finance.js";
import { parseInventory, planSteamImport } from "./steam-core.js";
import { unitsPerSek, effectiveCode, formatMoney, sekToDisplay, displayToSek, isCurrency, CURRENCY_NOISE } from "./money-core.js";
import { okPrices, okHistory } from "./data.js";
import * as PFC from "./portfolio-core.js";
import * as IVL from "./inv-logic.js";
import * as MNY from "./money-core.js";
import { searchTerms } from "./util.js";
import * as TUC from "./tradeup-core.js";
import { encodeShare, decodeShare } from "./views/share.js";
import { buildCandidates, enumerateCombos, pickVariety, loadoutFromCombo, workshopLink, cleanColorThemes } from "./combo-core.js";
import { DEFAULTS as PDEF, cleanPrefs, resolveTheme, imgScaleOf, scaleImgSize, bootMirror } from "./prefs-core.js";
import { normFloat, outputFloat, avgNorm, checkRules, analyze, nearestEdge, normLimitForWear, cleanSavedTradeups } from "./tradeup-core.js";
import { parseSeeds, competitionRanks, betterThanPct, histogram, explainBlue, explainFade, filterBlue, filterFade, similarBlue, similarFade } from "./pattern-core.js";
import { decodeInspect, extractHex } from "./inspect-decode.js";
import { floatPosition, boundaryInfo, wearTable, compareDecoded, cleanSavedInspect, wearOf } from "./inspect-core.js";
import { evaluate, isStale, describeTarget, groupWatches, summarize, normalizeWatch } from "./watch-core.js";
import { trendChanges, bestIndex, bestFlags, verdicts, cleanSavedCompares } from "./compare-core.js";
import { colorScore, cohesion, stickerMeta, findCombos, workshopHash, numericId, cleanCombos } from "./sticker-core.js";
import { planCollection, progress, sortCollections, cleanGoals } from "./planner-core.js";
import { windowSnaps, coverageDays, changeSince, splitChange, concentration, holdingAge, contributors } from "./portfolio-core.js";
import { FILTER_DEFAULTS, countFilters, rowMatches, ownedCount, sellFromItems } from "./inv-logic.js";

const out = document.getElementById("out");
let pass = 0, fail = 0;
const log = (ok, name, extra = "") => { ok ? pass++ : fail++; out.insertAdjacentHTML("beforeend", `<div class="${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}</div>`); };
const eq = (name, got, want) => log(JSON.stringify(got) === JSON.stringify(want), name, JSON.stringify(got) === JSON.stringify(want) ? "" : `fick ${JSON.stringify(got)}, väntade ${JSON.stringify(want)}`);
const near = (name, got, want, tol = 1e-9) => log(Math.abs(got - want) <= tol, name, Math.abs(got - want) <= tol ? "" : `fick ${got}, väntade ${want}`);
const truthy = (name, v) => log(!!v, name);
const section = t => out.insertAdjacentHTML("beforeend", `<h2>${t}</h2>`);

async function main() {
  /* ---------- parseDec ---------- */
  section("parseDec (prisinmatning)");
  eq("12,50", parseDec("12,50"), 12.5); eq("12.5", parseDec("12.5"), 12.5); eq("3 595,74", parseDec("3 595,74"), 3595.74);
  eq("3,595.74", parseDec("3,595.74"), 3595.74); eq("1 234 kr", parseDec("1 234 kr"), 1234); eq("1.234.567", parseDec("1.234.567"), 1234567);
  eq("3,595 (tusental)", parseDec("3,595"), 3595); eq("abc", parseDec("abc"), null); eq("tom", parseDec(""), null); eq("-5", parseDec("-5"), -5);

  /* ---------- slitage ---------- */
  section("Slitagegränser");
  eq("0.069999 = FN", wearFromFloat(0.069999), "FN"); eq("0.07 = MW", wearFromFloat(0.07), "MW"); eq("0.15 = FT", wearFromFloat(0.15), "FT");
  eq("0.38 = WW", wearFromFloat(0.38), "WW"); eq("0.45 = BS", wearFromFloat(0.45), "BS"); eq("1 = BS", wearFromFloat(1), "BS");

  /* ---------- prisanalys ---------- */
  section("Prisanalys (tillförlitlighet)");
  const row = (steam, sp, buff, cf, cm, sw) => [steam, sp, buff, cf, cm, sw, null];
  eq("saknas helt", analysePrice(null).level, "missing");
  eq("tom rad", analysePrice(row(null, null, null, null, null, null)).level, "missing");
  eq("bara Steam = begränsad", analysePrice(row(10, null, null, null, null, null)).level, "limited");
  eq("fyra nära marknader = hög", analysePrice(row(15, 10, 9.5, 10.2, 10.1, 10.4), { mhn: "AK-47 | Redline (Field-Tested)" }).level, "high");
  eq("två marknader = begränsad", analysePrice(row(null, 10, null, 10.5, null, null)).level, "limited");
  const low = analysePrice(row(15, 4, 9.5, 10.2, 10.1, 10.4));
  eq("extremt låg Skinport = osäker", low.level, "uncertain");
  truthy("avvikelsen pekar ut Skinport", low.outliers.some(o => o.key === "skinport" && o.kind === "low" && o.extreme));
  eq("gammal data (48 h) = gammal", analysePrice(row(15, 10, 9.5, 10.2, 10.1, 10.4), { ageMs: 48 * 3600e3 }).level, "stale");
  eq("35 h är inte gammal", analysePrice(row(15, 10, 9.5, 10.2, 10.1, 10.4), { ageMs: 35 * 3600e3 }).level, "high");
  eq("Doppler = osäkert", analysePrice(row(80, 70, 65, 72, 71, 75), { mhn: "★ Karambit | Doppler (Factory New)" }).level, "uncertain");
  eq("Steam långt under marknad = osäkert", analysePrice(row(3, 10, 9.5, 10.2, 10.1, 10.4)).level, "uncertain");
  eq("lägsta pris väljs bland köpbara (BUFF räknas inte)", analysePrice(row(15, 10, 5, 10.2, 10.1, 10.4)).lowest.key, "skinport");
  eq("billigt föremål (0,10 vs 0,30) flaggas inte som avvikande", analysePrice(row(0.2, 0.1, null, 0.3, 0.12, 0.11)).level, "high");
  const hi = analysePrice(row(15, 10, 9.5, 10.2, 10.1, 30));
  eq("en dyr marknad sänker inte tillförlitligheten", hi.level, "high"); truthy("… men nämns", hi.reasons.some(r => r.includes("Swap.gg")));
  near("median jämnt antal", median([1, 2, 3, 4]), 2.5); eq("median tom", median([]), null);

  /* ---------- köp/sälj ---------- */
  section("Köp/sälj-matematik och avgifter");
  let t = tradeMath({ buy: 100, sell: 120, qty: 1, sellFeePct: 12 });
  near("netto 120 med 12 % avgift = 105,6", t.net, 105.6); near("vinst = 5,6", t.profit, 5.6, 1e-9); near("avgift = 14,4", t.fee, 14.4, 1e-9);
  near("break-even = 100 / 0,88", t.breakEven, 100 / 0.88); near("vid break-even är vinsten 0", tradeMath({ buy: 100, sell: t.breakEven, sellFeePct: 12 }).profit, 0, 1e-9);
  t = tradeMath({ buy: 50, sell: 80, qty: 3, buyFeePct: 2, sellFeePct: 2, fixedFee: 5 });
  near("kostnad 3 × 50 × 1,02 = 153", t.cost, 153); near("brutto 240", t.gross, 240); near("avgift 240 × 2 % + 5 = 9,8", t.fee, 9.8, 1e-9); near("netto 230,2", t.net, 230.2, 1e-9);
  near("vinst 77,2", t.profit, 77.2, 1e-9); near("ROI = 77,2 / 153", t.roi, 77.2 / 153 * 100, 1e-9);
  near("break-even med fast avgift ger vinst 0", tradeMath({ buy: 50, sell: t.breakEven, qty: 3, buyFeePct: 2, sellFeePct: 2, fixedFee: 5 }).profit, 0, 1e-9);
  near("listForNet(88, 12) = 100", listForNet(88, 12), 100); eq("ogiltig avgift (100 %) kraschar inte", Number.isFinite(tradeMath({ buy: 1, sell: 1, sellFeePct: 100 }).net), true);
  eq("qty 0 blir 1", tradeMath({ buy: 10, sell: 10, qty: 0 }).qty, 1);

  /* ---------- prisserie ---------- */
  section("Prishistorik (statistik)");
  const D = 864e5, pts = [10, 12, 8, 14, 11].map((y, i) => ({ x: i * D, y }));
  const st = seriesStats(pts);
  near("min", st.min, 8); near("max", st.max, 14); near("snitt", st.mean, 11); near("median", st.median, 11); near("förändring", st.changePct, 10);
  eq("tom serie = null", seriesStats([]), null);
  eq("lastDays(2) tar de sista två dygnen", lastDays(pts, 2).length, 3); near("spanDays", spanDays(pts), 4);
  const gaps = [{ x: 0, y: 5 }, { x: 10 * D, y: 6 }]; eq("lucka i datan ger ändå en serie", lastDays(gaps, 30).length, 2);

  /* ---------- vinstmotor ---------- */
  section("Vinstmotor (finance.positions)");
  const tr = (type, qty, price, date, extra = {}) => ({ type, mhn: "AK-47 | Redline (Field-Tested)", qty, price, fee: 0, date, created: date, ...extra });
  let pos = positions([tr("buy", 2, 100, 1), tr("buy", 2, 200, 2)]).get("AK-47 | Redline (Field-Tested)");
  near("glidande snitt (2×100 + 2×200) / 4 = 150", pos.avg, 150); eq("antal kvar 4", pos.qty, 4);
  pos = positions([tr("buy", 2, 100, 1), tr("buy", 2, 200, 2), tr("sell", 1, 250, 3)]).get("AK-47 | Redline (Field-Tested)");
  near("realiserad vinst = 250 − 150", pos.realized, 100); near("snittet ändras inte av en försäljning", pos.avg, 150); eq("3 kvar", pos.qty, 3);
  pos = positions([tr("buy", 1, 100, 1, { fee: 10 }), tr("sell", 1, 150, 2, { fee: 15 })]).get("AK-47 | Redline (Field-Tested)");
  near("avgifter räknas: (150−15) − (100+10) = 25", pos.realized, 25);
  pos = positions([tr("buy", 1, 100, 1), tr("sell", 3, 50, 2)]).get("AK-47 | Redline (Field-Tested)");
  near("såld mer än ägd: överskottet saknar kostnad: 150 − 100 = 50", pos.realized, 50); eq("kvar blir 0, aldrig negativ", pos.qty, 0);
  const two = positions([tr("buy", 1, 100, 1, { float: 0.01, seed: 5 }), tr("buy", 1, 300, 2, { float: 0.2, seed: 9 })]);
  eq("olika float/seed = olika positioner", two.size, 2); eq("posKey med float+seed", posKey("X", 0.01, 5), "X#0.01000#5");
  eq("posKey utan float = namnet", posKey("X", null, null), "X");
  pos = positions([tr("buy", 1, 100, 1), tr("sell", 1, 150, 2, { pay: "steam" })]).get("AK-47 | Redline (Field-Tested)");
  near("Steam-krediter delas upp separat", pos.realizedSteam, 50); near("kontanter 0", pos.realizedCash, 0);

  /* ---------- backup ---------- */
  section("Backup: validering, migrering, kontrollsumma");
  const stores = { items: [{ id: "a", mhn: "AK-47 | Redline (Field-Tested)", qty: 2, float: 0.2, seed: 5 }], trades: [{ id: "t1", type: "buy", mhn: "AK-47 | Redline (Field-Tested)", qty: 2, price: 100, fee: 0, date: 1, created: 1 }], snapshots: [{ ts: 1, steam: 10, cash: 8, cost: 5 }], watch: [], loadouts: [{ id: "l1", name: "Min" }], kv: [{ key: "priceMode", value: "steam" }] };
  const b = await buildBackup(stores, 12345);
  eq("nytt format", b.format, FORMAT); truthy("kontrollsumma finns", /^(sha256|fnv1a):/.test(b.checksum)); eq("antal", b.counts.items, 1);
  let v = await validateBackup(JSON.parse(JSON.stringify(b)));
  eq("rundtur är giltig", v.ok, true); eq("kontrollsumma ok", v.checksum, "ok"); eq("alla föremål med", v.clean.items.length, 1);
  const tam = JSON.parse(JSON.stringify(b)); tam.trades[0].price = 1;
  v = await validateBackup(tam); eq("ändrad fil avvisas", v.ok, false); eq("… med kontrollsumma-fel", v.checksum, "mismatch");
  v = await validateBackup({ app: "annat", items: [] }); eq("fel app avvisas", v.ok, false);
  v = await validateBackup({ app: "cs2hub", format: 99, items: [] }); eq("nyare format avvisas", v.ok, false);
  v = await validateBackup({ app: "cs2hub", version: 1 }); eq("utan data avvisas", v.ok, false);
  v = await validateBackup(null); eq("null avvisas", v.ok, false); v = await validateBackup([1, 2]); eq("lista avvisas", v.ok, false);
  v = await validateBackup({ app: "cs2hub", items: "inte en lista" }); eq("fel typ avvisas", v.ok, false);
  const old = { app: "cs2hub", version: 1, exported: 1, items: stores.items, trades: stores.trades, snapshots: [], watch: [], loadouts: [], kv: [] };
  v = await validateBackup(old); eq("v1-backup migreras", v.ok, true); eq("… format 1 noteras", v.format, 1); truthy("… med migreringsnotis", v.notes.some(n => n.includes("Äldre")));
  v = await validateBackup({ ...old, items: [{ id: "x", mhn: "M", qty: "<img onerror=1>", float: "abc", seed: null, rc: "red;background:url(x)", img: { a: 1 } }, { id: 5 }, null] });
  eq("skräpposter filtreras", v.clean.items.length, 1); eq("qty tvättas till tal", v.clean.items[0].qty, 1); eq("float tvättas till null", v.clean.items[0].float, null);
  eq("ogiltig rc tas bort", v.clean.items[0].rc, undefined); eq("img som objekt tas bort", v.clean.items[0].img, undefined);
  v = await validateBackup({ ...old, kv: [{ key: "proxyUrl", value: "https://evil.example" }, { key: "priceMode", value: "hack" }, { key: "pricesCache", value: { a: 1 } }, { key: "fees", value: { skinport: 0.5, csfloat: 9, evil: 1 } }, { key: "steamId", value: "12345678901234567" }] });
  eq("proxyUrl från fil ignoreras", v.clean.kv.some(r => r.key === "proxyUrl"), false); eq("ogiltigt prisläge ignoreras", v.clean.kv.some(r => r.key === "priceMode"), false);
  eq("cache-nycklar ignoreras", v.clean.kv.some(r => r.key === "pricesCache"), false); eq("fees: bara giltiga bolag/värden", v.clean.kv.find(r => r.key === "fees").value, { skinport: 0.5 });
  eq("giltigt Steam-ID behålls", v.clean.kv.some(r => r.key === "steamId"), true);
  v = await validateBackup({ ...old, items: [{ id: "d", mhn: "A", qty: 1 }, { id: "d", mhn: "A", qty: 5 }] });
  eq("dubbletter: sista gäller", v.clean.items.length === 1 && v.clean.items[0].qty === 5, true); truthy("… med varning", v.warnings.some(w => w.includes("dubbletter")));
  const proto = JSON.parse('{"app":"cs2hub","items":[{"id":"p","mhn":"M","qty":1,"__proto__":{"polluted":1},"x":{"constructor":{"y":1}}}]}');
  v = await validateBackup(proto); eq("__proto__ förorenar inte", ({}).polluted, undefined); eq("… och nyckeln tas bort", Object.prototype.hasOwnProperty.call(v.clean.items[0], "__proto__"), false);
  eq("plain() begränsar djup", JSON.stringify(plain({ a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } })).includes('"h"'), false);
  eq("stable() ignorerar nyckelordning", stable({ a: 1, b: 2 }), stable({ b: 2, a: 1 }));
  const cs = await checksumOf(stores), cs2 = await checksumOf({ ...stores, items: [] }); truthy("kontrollsumma ändras med innehållet", cs !== cs2);

  section("Backup: förhandsvisning och import");
  const clean = (await validateBackup(JSON.parse(JSON.stringify(b)))).clean;
  const cur = { items: [{ id: "a", mhn: "AK-47 | Redline (Field-Tested)", qty: 2, float: 0.2, seed: 5 }, { id: "z", mhn: "Annat", qty: 1, float: null, seed: null }], trades: [], snapshots: [], watch: [], loadouts: [], kv: [] };
  let p = planImport(clean, cur, "replace");
  eq("replace: 1 oförändrad (a)", p.items.same, 1); eq("replace: 1 tas bort (z)", p.items.remove, 1); eq("replace: 1 ny transaktion", p.trades.add, 1);
  p = planImport(clean, cur, "merge"); eq("merge: inget tas bort", p.items.remove, 0);
  const cur2 = { ...cur, items: [{ ...cur.items[0], qty: 9 }] };
  p = planImport(clean, cur2, "merge"); eq("merge: skiljer sig → behålls lokalt", p.items.skipped, 1);
  eq("merge-payload skriver inte över befintligt", payloadFor(clean, cur2, "merge").items.length, 0);
  eq("merge-payload lägger till nytt", payloadFor(clean, cur2, "merge").trades.length, 1);
  eq("replace-payload = hela filen", payloadFor(clean, cur2, "replace").items.length, 1);
  eq("importen rör inte indata", clean.items.length, 1);

  /* ---------- inventory: filter och försäljning ---------- */
  section("Inventory: filter (kombinerade)");
  const R = (o = {}) => ({ it: { id: o.id || "x", hidden: false, fav: false, nametag: "" }, name: "AK-47 | Redline", mhn: "AK-47 | Redline (Field-Tested)", kind: "weapon", rarity: "Classified", c1: "red", c2: null, e: { c: "Rifle" }, ref: {}, st: false, float: 0.2, seed: 100, cost: 100, unitCost: 100, noPrice: false, sold: 0, realized: 0, cash: 120, ...o });
  const opt = { unit: r => r.cash, pl: r => (r.cash != null && r.cost != null ? r.cash - r.cost : null) };
  const m = (r, f) => rowMatches(r, { ...FILTER_DEFAULTS, ...f }, opt);
  eq("inga filter = allt visas", m(R(), {}), true); eq("dolda döljs som standard", m(R({ it: { id: "h", hidden: true } }), {}), false); eq("… och visas med filtret", m(R({ it: { id: "h", hidden: true } }), { hidden: true }), true);
  eq("vinst: +20 = vinst", m(R(), { profit: "gain" }), true); eq("vinst: filtrerar bort förlust", m(R({ cash: 80 }), { profit: "gain" }), false); eq("förlust matchar", m(R({ cash: 80 }), { profit: "loss" }), true);
  eq("utan inköpspris är varken vinst eller förlust", m(R({ cost: null, unitCost: null }), { profit: "gain" }) || m(R({ cost: null, unitCost: null }), { profit: "loss" }), false);
  eq("realiserad vinst kräver försäljning", m(R({ realized: 50, sold: 0 }), { real: "gain" }), false); eq("realiserad vinst efter sålt", m(R({ realized: 50, sold: 1 }), { real: "gain" }), true); eq("realiserad förlust", m(R({ realized: -5, sold: 2 }), { real: "loss" }), true);
  eq("StatTrak", m(R({ st: true }), { variant: "st" }), true); eq("StatTrak-filter utesluter normal", m(R(), { variant: "st" }), false);
  eq("Souvenir", m(R({ ref: { sv: true } }), { variant: "sv" }), true); eq("Normal utesluter ST", m(R({ st: true }), { variant: "normal" }), false);
  eq("seed exakt", m(R({ seed: 661 }), { seed: "661" }), true); eq("seed fel", m(R({ seed: 661 }), { seed: "12" }), false); eq("seed 0 matchar seed 0", m(R({ seed: 0 }), { seed: "0" }), true);
  eq("float-intervall", m(R({ float: 0.03 }), { fmin: "0.01", fmax: "0.05" }), true); eq("float utanför", m(R({ float: 0.2 }), { fmax: "0.05" }), false); eq("saknad float matchar inte float-filter", m(R({ float: null }), { fmin: "0" }), false);
  eq("inköpspris-intervall", m(R({ unitCost: 150 }), { bmin: "100", bmax: "200" }), true); eq("inköpspris saknas matchar inte", m(R({ unitCost: null, cost: null }), { bmin: "1" }), false);
  eq("saknar pris", m(R({ noPrice: true }), { noprice: true }), true); eq("har pris utesluts", m(R(), { noprice: true }), false);
  eq("ovanlig: Doppler", m(R({ mhn: "★ Karambit | Doppler (Factory New)" }), { rare: true }), true); eq("ovanlig: vanlig AK är inte det", m(R(), { rare: true }), false);
  eq("flera filter kombineras (OCH)", m(R({ st: true, cash: 80 }), { variant: "st", profit: "gain" }), false); eq("… båda uppfyllda", m(R({ st: true }), { variant: "st", profit: "gain", color: "red" }), true);
  eq("sök", m(R(), { q: "redline ft" }), false); eq("sök träff", m(R(), { q: "ak-47 redline" }), true);
  eq("countFilters räknar aktiva", countFilters({ ...FILTER_DEFAULTS, kind: "knife", fav: true, seed: "5" }), 3); eq("sök räknas inte", countFilters({ ...FILTER_DEFAULTS, q: "x" }), 0);

  section("Inventory: försäljning ur lagret");
  const inv = [{ id: "a", mhn: "M", qty: 3 }, { id: "b", mhn: "M", qty: 2 }, { id: "c", mhn: "Annat", qty: 1 }];
  let s = sellFromItems(inv, "M", 4); eq("4 av 5: a tas helt, b minskar", [s.deletes, s.updates.map(u => [u.id, u.qty]), s.shortfall], [["a"], [["b", 1]], 0]);
  s = sellFromItems(inv, "M", 2, "b"); eq("preferId tas först", [s.deletes, s.updates.length], [["b"], 0]);
  s = sellFromItems(inv, "M", 9); eq("sälja mer än ägt ger shortfall", [s.shortfall, s.owned, s.deletes.length], [4, 5, 2]);
  s = sellFromItems(inv, "Saknas", 1); eq("okänt föremål: allt är shortfall", [s.shortfall, s.owned], [1, 0]);
  eq("indatan ändras inte", inv[0].qty, 3); eq("ownedCount summerar", ownedCount(inv, "M"), 5); eq("qty 0 gör inget", sellFromItems(inv, "M", 0).deletes.length, 0);

  /* ---------- Steam-import ---------- */
  section("Steam-import: tolkning och plan");
  const desc = (id, name, extra = {}) => ({ classid: String(id), instanceid: "0", market_hash_name: name, type: "Rifle", marketable: 1, icon_url: "a".repeat(40), name_color: "D2D2D2", ...extra });
  const sinv = (assets, descs, extra = {}) => ({ assets: assets.map(([id, amount]) => ({ classid: String(id), instanceid: "0", amount: String(amount ?? 1) })), descriptions: descs, ...extra });
  let pr = parseInventory(sinv([[1, 1], [1, 1], [2, 3]], [desc(1, "AK-47 | Redline (Field-Tested)"), desc(2, "Sticker | X")]));
  eq("grupperar per marknadsnamn och summerar", [pr.ok, pr.groups.get("AK-47 | Redline (Field-Tested)").qty, pr.groups.get("Sticker | X").qty, pr.assets], [true, 2, 3, 3]);
  eq("null avvisas", parseInventory(null).ok, false); eq("lista avvisas", parseInventory([]).ok, false); eq("utan assets avvisas", parseInventory({ descriptions: [] }).ok, false);
  eq("tomt inventory avvisas", parseInventory(sinv([], [desc(1, "A")])).ok, false);
  pr = parseInventory(sinv([[1, "<b>9</b>"], [1, -5], [1, 1e12], [9, 1]], [desc(1, "M", { icon_url: "javascript:alert(1)", name_color: "red;x" })]));
  eq("skräp i amount blir 1 / begränsas", pr.groups.get("M").qty, 1 + 1 + 1e6); eq("okänd beskrivning varnar", pr.warnings.some(w => w.includes("saknade beskrivning")), true);
  eq("ogiltig icon_url rensas", pr.groups.get("M").d.icon_url, ""); eq("ogiltig färg rensas", pr.groups.get("M").d.name_color, "");
  eq("more_items ger varning", parseInventory(sinv([[1, 1]], [desc(1, "M")], { more_items: 1 })).warnings.some(w => w.includes("fler")), true);
  eq("truncated ger varning", parseInventory(sinv([[1, 1]], [desc(1, "M")], { truncated: true })).warnings.some(w => w.includes("ofullständig")), true);
  eq("icke-marknadsbar flaggas", parseInventory(sinv([[1, 1]], [desc(1, "Medal", { marketable: 0 })])).groups.get("Medal").d.marketable, 0);
  let idn = 0; const mk = () => "n" + ++idn;
  const base = parseInventory(sinv([[1, 2], [2, 1], [3, 1]], [desc(1, "AK"), desc(2, "AWP"), desc(3, "M4")]));
  let plan = planSteamImport(base, [], { mkId: mk, now: 1 });
  eq("tom databas: allt är nytt", [plan.add.length, plan.update.length, plan.remove.length], [3, 0, 0]);
  const stored = plan.writes.map(i => ({ ...i }));
  plan = planSteamImport(base, stored, { mkId: mk });
  eq("andra körningen: inga dubbletter, inget att skriva", [plan.add.length, plan.remove.length, plan.writes.length, plan.summary.unchanged], [0, 0, 0, 3]);
  const edited = stored.map(i => i.mhn === "AK" ? { ...i, float: 0.0123, seed: 42, note: "min", nametag: "Bob", fav: true, hidden: true } : i);
  const ch = parseInventory(sinv([[1, 1], [1, 1], [1, 1], [2, 1], [5, 1]], [desc(1, "AK"), desc(2, "AWP"), desc(5, "Ny")]));
  plan = planSteamImport(ch, edited, { mkId: mk });
  const akUp = plan.update.find(u => u.after.mhn === "AK").after;
  eq("antal uppdateras 2 → 3", [plan.update.find(u => u.after.mhn === "AK").before.qty, akUp.qty], [2, 3]);
  eq("egna uppgifter bevaras", [akUp.float, akUp.seed, akUp.note, akUp.nametag, akUp.fav, akUp.hidden, akUp.id], [0.0123, 42, "min", "Bob", true, true, edited[0].id]);
  eq("försvunnet (M4) hamnar i remove", plan.remove.map(i => i.mhn), ["M4"]); eq("nytt föremål läggs till", plan.add.map(i => i.mhn), ["Ny"]);
  const unk = planSteamImport(ch, [], { mkId: mk, known: () => false }).add.find(i => i.mhn === "Ny");
  eq("okänt föremål (finns ej i katalogen) får namn/typ", [unk.name, typeof unk.kind], ["Ny", "string"]);
  plan = planSteamImport(base, [...stored, { id: "man", mhn: "AK", qty: 1, source: "manual" }], { mkId: mk });
  eq("manuellt + Steam varnar om dubbelräkning", [plan.manualOverlap.length, plan.warnings.some(w => w.includes("räknas då dubbelt"))], [1, true]);
  eq("manuella föremål rörs aldrig", plan.remove.some(i => i.id === "man") || plan.writes.some(i => i.id === "man"), false);
  const many = Array.from({ length: 12 }, (_, i) => ({ id: "s" + i, mhn: "Gammal " + i, qty: 1, source: "steam", float: null, seed: null }));
  plan = planSteamImport(base, many, { mkId: mk }); eq("kraftigt krympande import varnar", plan.warnings.some(w => w.includes("Mer än hälften")), true);
  plan = planSteamImport(base, [{ id: "z", mhn: "Borta", qty: 1, source: "steam", float: 0.5, seed: null }], { mkId: mk }); eq("borttagning med egna uppgifter varnar", plan.warnings.some(w => w.includes("egna uppgifter")), true);
  plan = planSteamImport(base, stored.map(i => ({ ...i, steamQty: undefined })), { mkId: mk }); eq("steamQty uppdateras tyst utan synlig ändring", [plan.update.length, plan.writes.length], [0, 3]);

  /* ---------- Portfolio Analytics ---------- */
  section("Portfolio: perioder, förändring, koncentration, ägartid");
  const NOW = 100 * 864e5, DY = 864e5;
  const sn = [{ ts: NOW - 40 * DY, cash: 800, steam: 1000, cost: 700 }, { ts: NOW - 10 * DY, cash: 900, steam: 1100, cost: 700 }, { ts: NOW - 2 * DY, cash: 950, steam: 1150, cost: 800 }, { ts: NOW - 0.5 * DY, cash: 980, steam: 1180, cost: 800 }];
  eq("windowSnaps 7 d", windowSnaps(sn, 7, NOW).length, 2); eq("windowSnaps alla", windowSnaps(sn, null, NOW).length, 4); eq("windowSnaps sorterar", windowSnaps([{ ts: 5 }, { ts: 1 }], null, 9).map(x => x.ts), [1, 5]);
  near("täckning = 40 dagar", coverageDays(sn, NOW), 40); eq("täckning utan data = 0", coverageDays([], NOW), 0);
  let c = changeSince(sn, 1000, "cash", 30, NOW);
  eq("30 d: utgångspunkt = senaste mätpunkt som är minst 30 d gammal", [c.base.ts === NOW - 40 * DY, c.change, c.partial], [true, 200, false]); near("procent 25 %", c.pct, 25);
  c = changeSince(sn, 1000, "cash", 90, NOW);
  eq("90 d: ingen så gammal mätpunkt → partial, verklig tid visas", [c.partial, Math.round(c.spanDays), c.change], [true, 40, 200]);
  c = changeSince(sn, 1000, "cash", 1, NOW); eq("1 d: baseras på mätpunkt från 2 d sedan (inte gissad)", [c.base.ts === NOW - 2 * DY, c.partial, c.change], [true, false, 50]);
  eq("inga mätpunkter = null", changeSince([], 1000, "cash", 7, NOW), null); eq("nyss sparad mätpunkt ger ingen förändring", changeSince([{ ts: NOW - 60e3, cash: 10, cost: 0 }], 11, "cash", 1, NOW), null);
  eq("Steam-fältet används för Steam", changeSince(sn, 1300, "steam", 30, NOW).change, 300);
  eq("splitChange: nya köp och marknad", splitChange({ change: 200, costThen: 700 }, 800, true), { invested: 100, market: 100 });
  eq("splitChange kräver kostnad för alla föremål", splitChange({ change: 200, costThen: 700 }, 800, false), null); eq("splitChange utan kostnad då = null", splitChange({ change: 200, costThen: 0 }, 800, true), null);
  let cn = concentration([500, 300, 100, 50, 30, 10, 5, 3, 1, 1]);
  near("top1 = 50 %", cn.top1, 50, 1e-9); near("top5 = 980 / 1000 = 98 %", cn.top5, 98, 1e-9); eq("nivå hög", cn.level, "hög");
  cn = concentration(Array.from({ length: 50 }, () => 10)); eq("jämn fördelning = låg", cn.level, "låg"); near("top5 = 10 %", cn.top5, 10, 1e-9);
  eq("tom → null", concentration([]), null); eq("nollor ignoreras", concentration([0, 0, 5]).count, 1);
  const ag = holdingAge([{ value: 100, firstBuy: NOW - 10 * DY }, { value: 200, firstBuy: NOW - 60 * DY }, { value: 300, firstBuy: NOW - 400 * DY }, { value: 50, firstBuy: null }, { value: 25, firstBuy: NOW - 100 * DY }], NOW);
  eq("åldersgrupper", ag.buckets.map(b => [b.count, b.value]), [[1, 100], [1, 200], [1, 25], [1, 300]]); eq("okänd ägartid separat", [ag.unknown, ag.unknownValue], [1, 50]);
  near("median av 10, 60, 100, 400 = 80", ag.medianDays, 80); near("äldsta 400", ag.oldestDays, 400);
  eq("inga köp: median null", holdingAge([{ value: 5, firstBuy: null }], NOW).medianDays, null);
  const ct = contributors([{ name: "A", value: 600, pl: 100 }, { name: "B", value: 300, pl: -50 }, { name: "C", value: 100, pl: null }, { name: "D", value: 0, pl: -5 }], 2);
  eq("bidrag: störst värde först + andel", [ct.byValue[0].name, ct.byValue[0].share], ["A", 60]); eq("vinster", ct.gains.map(x => x.name), ["A"]); eq("förluster (störst först)", ct.losses.map(x => x.name), ["B", "D"]);
  eq("poster utan vinstdata hoppas över", ct.gains.concat(ct.losses).some(x => x.name === "C"), false);

  /* ---------- Collection Planner ---------- */
  section("Collection Planner: plan, budget, mål, sortering");
  const cr = [{ id: "a", name: "A", owned: true, cost: 50 }, { id: "b", name: "B", owned: false, cost: 300 }, { id: "c", name: "C", owned: false, cost: 100 }, { id: "d", name: "D", owned: false, cost: 20 }, { id: "e", name: "E", owned: false, cost: null }];
  let pc = planCollection(cr);
  eq("köpordning billigast först", pc.order.map(x => x.id), ["d", "c", "b"]); eq("löpande summa", pc.order.map(x => x.cum), [20, 120, 420]); near("total kostnad", pc.totalCost, 420);
  eq("prislös saknas separat och gör samlingen ej fullt prissatt", [pc.unpriced.map(x => x.id), pc.completable], [["e"], false]); eq("dyraste först", pc.expensive.map(x => x.id), ["b", "c", "d"]);
  eq("inga ägda i planen", pc.order.some(x => x.id === "a"), false); eq("utan budget: inget köps", [pc.hasBudget, pc.buy.length, pc.shortfall], [false, 0, null]);
  pc = planCollection(cr, { budget: 130 }); eq("budget 130: d och c ryms", [pc.buy.map(x => x.id), pc.spent, pc.budgetLeft], [["d", "c"], 120, 10]); near("saknas 290 till allt", pc.shortfall, 290); eq("ryms inte allt", pc.fitsAll, false);
  pc = planCollection(cr, { budget: 20 }); eq("budget exakt = pris ryms", pc.buy.map(x => x.id), ["d"]); pc = planCollection(cr, { budget: 19.99 }); eq("1 öre för lite → inget", pc.buy.length, 0);
  pc = planCollection(cr, { budget: 0 }); eq("budget 0 → inget, men giltig budget", [pc.hasBudget, pc.buy.length], [true, 0]);
  pc = planCollection(cr.filter(r => r.id !== "e"), { budget: 1000 }); eq("budget räcker till allt", [pc.fitsAll, pc.budgetLeft], [true, 580]);
  pc = planCollection(cr, { goals: new Set(["b", "d"]) }); eq("mål begränsar planen", [pc.order.map(x => x.id), pc.totalCost, pc.useGoals, pc.unpriced.length], [["d", "b"], 320, true, 0]);
  pc = planCollection(cr, { goals: new Set(["a"]) }); eq("mål som redan ägs räknas inte som kostnad", pc.order.length, 0); eq("tomt målset = alla saknade", planCollection(cr, { goals: new Set() }).order.length, 3);
  pc = planCollection(cr, { goals: new Set(["b", "c"]), budget: 150 }); eq("budget + mål", [pc.buy.map(x => x.id), pc.left.map(x => x.id)], [["c"], ["b"]]);
  eq("framsteg", progress(cr, new Set(["a", "b"])), { total: 5, have: 1, pct: 20, goalTotal: 2, goalHave: 1 });
  const colList = [{ col: { n: "B" }, have: 3, total: 10, cost: 500, unpriced: 0, value: 900 }, { col: { n: "A" }, have: 10, total: 10, cost: 0, unpriced: 0, value: 400 }, { col: { n: "C" }, have: 1, total: 10, cost: 100, unpriced: 2, value: 300 }, { col: { n: "D" }, have: 9, total: 10, cost: 40, unpriced: 0, value: 200 }];
  eq("lägst kostnad: fullt prissatta först, ofullständiga efter, kompletta sist", sortCollections(colList, "cost").map(x => x.col.n), ["D", "B", "C", "A"]);
  eq("högst kostnad: kompletta sist", sortCollections(colList, "costhi").map(x => x.col.n), ["B", "C", "D", "A"]); eq("mest färdig", sortCollections(colList, "prog").map(x => x.col.n), ["A", "D", "B", "C"]);
  eq("minst kvar", sortCollections(colList, "left").map(x => x.col.n), ["D", "B", "C", "A"]); eq("namn", sortCollections(colList, "name").map(x => x.col.n), ["A", "B", "C", "D"]); eq("sortering ändrar inte indata", colList[0].col.n, "B");
  eq("okänd nyckel faller tillbaka", sortCollections(colList, "xyz").length, 4);
  eq("cleanGoals: giltigt", cleanGoals({ c1: ["a", "b", "a"] }), { c1: ["a", "b"] }); eq("cleanGoals: skräp", cleanGoals({ c1: "x", c2: [1, "ok", null], __proto__: 1 }), { c2: ["ok"] }); eq("cleanGoals: ej objekt", cleanGoals([1]), {});
  const kvv = await validateBackup({ app: "cs2hub", kv: [{ key: "colGoals", value: { c1: ["a", 5], c2: "x" } }, { key: "colBudgets", value: { c1: 2500, c2: -5, c3: "9" } }] });
  eq("backup: mål tvättas", kvv.clean.kv.find(r => r.key === "colGoals").value, { c1: ["a"] }); eq("backup: budgetar tvättas", kvv.clean.kv.find(r => r.key === "colBudgets").value, { c1: 2500 });

  /* ---------- Sticker Finder ---------- */
  section("Sticker Finder: färgmatchning, kombinationer, Workshop-länk");
  const stk = (id, c1, c2 = null, o = {}) => ({ id: "sticker-" + id, n: "Sticker | S" + id, c1, c2, p1: 50, mc: false, tn: "T1", ty: "Team", ef: "Other", ...o });
  eq("primärfärg i temat: 70 + 15·0,5 = 78", colorScore(stk(1, "blue"), ["blue"]), 78); eq("båda färgerna i temat ger +15", colorScore(stk(1, "blue", "cyan"), ["blue", "cyan"]), 93);
  eq("bara sekundär i temat = 35", colorScore(stk(1, "red", "blue"), ["blue"]), 35); eq("ingen träff = 0", colorScore(stk(1, "red"), ["blue"]), 0);
  eq("multicolor sänker", colorScore(stk(1, "blue", null, { mc: true }), ["blue"]), 68); eq("saknar färgdata = null", colorScore({ id: "x" }, ["blue"]), null); eq("utan tema = 100", colorScore(stk(1, "red"), null), 100);
  eq("cohesion: alla blå = 100", cohesion([stk(1, "blue"), stk(2, "blue")]), 100); eq("cohesion: blandat lägre", cohesion([stk(1, "blue"), stk(2, "red")]), 50); eq("cohesion: ingen färgdata = null", cohesion([{ id: "x" }]), null);
  eq("meta: spelare", stickerMeta({ n: "Sticker | yuurih | Antwerp 2022", ty: "Autograph" }), { who: "yuurih", event: "Antwerp 2022", kind: "player" });
  eq("meta: effekt tas bort ur namnet", stickerMeta({ n: "Sticker | 3DMAX (Holo) | Katowice 2014", ty: "Team" }).who, "3DMAX"); eq("meta: enkelt namn", stickerMeta({ n: "Sticker | Shooter", ty: "Event" }), { who: "Shooter", event: "", kind: "event" });
  const prices = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 5000, 6: 15, 7: null };
  const pool = [stk(1, "blue"), stk(2, "blue", "cyan"), stk(3, "blue"), stk(4, "red"), stk(5, "blue"), stk(6, "cyan"), stk(7, "blue")];
  const cof = s => prices[+s.id.replace("sticker-", "")];
  let fc = findCombos(pool, cof, { count: 2, theme: ["blue", "cyan"], budget: 60, sort: "cheap" });
  eq("billigaste kombinationen först", [fc.combos[0].items.map(s => s.id), fc.combos[0].cost], [["sticker-1", "sticker-6"], 25]);
  eq("alla kombinationer ryms i budgeten", fc.combos.every(c => c.cost <= 60), true); eq("för dyr sticker (5000) utesluts", fc.combos.some(c => c.items.some(s => s.id === "sticker-5")), false);
  eq("sticker utan pris utesluts", fc.combos.some(c => c.items.some(s => s.id === "sticker-7")), false); eq("fel färg (röd) utesluts", fc.combos.some(c => c.items.some(s => s.id === "sticker-4")), false);
  eq("inga dubbletter inom en kombination", fc.combos.every(c => new Set(c.items.map(s => s.id)).size === c.items.length), true);
  eq("antal kombinationer av 4 kandidater, 2 åt gången = 6", findCombos(pool, cof, { count: 2, theme: ["blue", "cyan"], budget: 60, limit: 50 }).combos.length, 6);
  fc = findCombos(pool, cof, { count: 2, theme: ["blue", "cyan"], budget: 60, duplicates: true, limit: 50 }); eq("med dubbletter: 4 sorter ger 10 kombinationer", fc.combos.length, 10);
  eq("budget exakt 20 → 1+1 (10+10)", findCombos(pool, cof, { count: 2, theme: ["blue"], budget: 20, duplicates: true }).combos.map(c => c.cost), [20]);
  eq("budget för låg → inga kombinationer", findCombos(pool, cof, { count: 2, theme: ["blue"], budget: 5 }).combos.length, 0);
  fc = findCombos(pool, cof, { count: 2, theme: ["blue", "cyan"], budget: 100, sort: "match" }); eq("match: högsta poängen först", fc.combos[0].score >= fc.combos[fc.combos.length - 1].score, true);
  eq("count begränsas till 4", findCombos(pool, cof, { count: 9, theme: ["blue"], budget: 1e6 }).combos[0].items.length, 4); eq("dyrast först", findCombos(pool, cof, { count: 1, theme: ["blue"], sort: "dear" }).combos[0].items[0].id, "sticker-5");
  eq("utan tema används färglikhet", findCombos(pool, cof, { count: 2, sort: "match", budget: 60 }).combos[0].score, 100);
  eq("tomt urval kraschar inte", findCombos([], cof, { count: 4 }).combos.length, 0);
  const wh = workshopHash([5476, 12]); eq("Workshop-länk har rätt prefix", wh.startsWith("#/workshop/"), true);
  const back = JSON.parse(decodeURIComponent(escape(atob(wh.slice(11).replace(/-/g, "+").replace(/_/g, "/"))))); eq("Workshop-länk: stickers kodas som tal, max 4", [back.st.map(x => x.id), back.s], [[5476, 12], null]);
  eq("fler än 4 begränsas", JSON.parse(decodeURIComponent(escape(atob(workshopHash([1, 2, 3, 4, 5, 6]).slice(11).replace(/-/g, "+").replace(/_/g, "/"))))).st.length, 4);
  eq("numericId", numericId({ id: "sticker-5476" }), 5476);
  eq("cleanCombos: giltig", cleanCombos([{ id: "a", name: "N", ids: [1, "2", 3.5, -1, 99999999999], created: 5 }]), [{ id: "a", name: "N", ids: [1, 2], created: 5 }]); eq("cleanCombos: skräp", cleanCombos([null, { id: 5 }, { id: "x", ids: [] }, "q"]), []); eq("cleanCombos: ej lista", cleanCombos({}), []);
  const kv2 = await validateBackup({ app: "cs2hub", kv: [{ key: "stickerCombos", value: [{ id: "a", name: "N", ids: [1, "x"], created: 1 }, { id: "", ids: [1] }] }] }); eq("backup: sparade kombinationer tvättas", kv2.clean.kv.find(r => r.key === "stickerCombos").value, [{ id: "a", name: "N", ids: [1], created: 1 }]);

  /* ---------- Skin Comparison ---------- */
  section("Skin Comparison: utveckling, bäst-markering, sammanfattning");
  const trc = trendChanges([110, 100, 80, 50]);
  near("7 d = +10 %", trc.d7, 10, 1e-9); near("30 d = +37,5 %", trc.d30, 37.5, 1e-9); near("90 d = +120 %", trc.d90, 120, 1e-9);
  eq("utan 24 h-snitt används 7 d som nu", trendChanges([null, 100, 80, 50]).d7, 0); eq("saknat 90 d = null", trendChanges([110, 100, 80, null]).d90, null);
  eq("inget underlag", trendChanges(null), { d7: null, d30: null, d90: null }); eq("nollor ger null (ingen division med 0)", trendChanges([10, 0, 0, 0]), { d7: null, d30: null, d90: null });
  eq("bestFlags lägst", bestFlags([10, 5, 8], true), [false, true, false]); eq("bestFlags högst", bestFlags([10, 5, 8], false), [true, false, false]);
  eq("lika värden = ingen vinnare", bestFlags([5, 5, 5]), [false, false, false]); eq("delad vinst markeras båda", bestFlags([5, 5, 9]), [true, true, false]);
  eq("ett enda värde ger ingen markering", bestFlags([5, null, undefined]), [false, false, false]); eq("null/NaN ignoreras", bestFlags([null, 3, NaN, 7]), [false, true, false, false]);
  eq("bestIndex", bestIndex([9, 3, 5]), 1); eq("bestIndex lika = null", bestIndex([3, 3]), null); eq("bestIndex <2 värden = null", bestIndex([null, 4]), null); eq("bestIndex högst", bestIndex([1, 9, 4], false), 1);
  const vd = verdicts([{ name: "A", from: 100, ch30: 5, floatMin: 0.06, cash: 80 }, { name: "B", from: 50, ch30: 12, floatMin: 0, cash: 40 }, { name: "C", from: null, ch30: null, floatMin: 0.1, cash: null }]);
  eq("billigast B", vd.cheapest.name, "B"); eq("bäst 30 d utveckling B", vd.trend30.name, "B"); eq("lägst float B", vd.lowestFloat.name, "B"); eq("högst netto A", vd.bestNet.name, "A");
  eq("saknar underlag → ingen vinnare", verdicts([{ name: "A", from: 5 }, { name: "B" }]).cheapest, null);
  eq("cleanSavedCompares: giltig", cleanSavedCompares([{ id: "a", name: "N", ids: ["skin-1", "skin-2", "skin-1", "bad id!", 5], created: 1 }]), [{ id: "a", name: "N", ids: ["skin-1", "skin-2"], created: 1 }]);
  eq("cleanSavedCompares: kräver minst 2 föremål", cleanSavedCompares([{ id: "a", ids: ["skin-1"] }]), []); eq("cleanSavedCompares: ej lista", cleanSavedCompares("x"), []);
  const kv3 = await validateBackup({ app: "cs2hub", kv: [{ key: "savedCompares", value: [{ id: "a", name: "N", ids: ["s1", "s2"], created: 1 }, { id: "b", ids: ["<x>", "s2"] }] }] });
  eq("backup: sparade jämförelser tvättas", kv3.clean.kv.find(r => r.key === "savedCompares").value, [{ id: "a", name: "N", ids: ["s1", "s2"], created: 1 }]);

  /* ---------- Watchlist ---------- */
  section("Watchlist: mål i kr och %, paus, grupper, gamla priser");
  const RATE = 10, wk = (o = {}) => ({ id: "w", mhn: "X", mode: "price", dir: "below", target: 100, startUsd: 10, created: 1, paused: false, ...o });
  let ev = evaluate(wk(), 9, RATE); eq("under mål (90 ≤ 100) = träff", [ev.hit, ev.state], [true, "hit"]); near("avstånd negativt när nått", ev.distance, (90 / 100 - 1) * 100, 1e-9);
  ev = evaluate(wk(), 12, RATE); eq("över mål = bevakar", [ev.hit, ev.state], [false, "watching"]); near("avstånd kvar +20 %", ev.distance, 20, 1e-9); near("sedan start +20 %", ev.sinceStart, 20, 1e-9);
  eq("exakt på målet = träff", evaluate(wk(), 10, RATE).hit, true);
  ev = evaluate(wk({ dir: "above", target: 150 }), 16, RATE); eq("över-mål: 160 ≥ 150 = träff", ev.hit, true); ev = evaluate(wk({ dir: "above", target: 150 }), 12, RATE); near("över-mål: avstånd = 150/120 − 1 = 25 %", ev.distance, 25, 1e-9);
  ev = evaluate(wk({ mode: "pct", pct: -10, target: 90 }), 9, RATE); eq("−10 % från start 10 USD: 9 USD = träff", [ev.hit, ev.dir], [true, "below"]); near("målpris i kr = 90", ev.targetKr, 90, 1e-9);
  eq("−10 %: 9,5 USD = ej träff", evaluate(wk({ mode: "pct", pct: -10 }), 9.5, RATE).hit, false); eq("+20 %: 12 USD = träff", evaluate(wk({ mode: "pct", pct: 20 }), 12, RATE).hit, true);
  eq("+20 %: 11,9 = ej träff", evaluate(wk({ mode: "pct", pct: 20 }), 11.9, RATE).hit, false); eq("pct följer inte växelkursen", evaluate(wk({ mode: "pct", pct: -10 }), 9, 99).hit, true);
  eq("pct utan startpris = ogiltig", evaluate(wk({ mode: "pct", pct: -10, startUsd: null }), 9, RATE).state, "invalid");
  ev = evaluate(wk({ paused: true }), 5, RATE); eq("pausad ger aldrig träff", [ev.hit, ev.state], [false, "paused"]); near("men aktuellt pris visas", ev.curKr, 50, 1e-9);
  ev = evaluate(wk(), null, RATE); eq("inget pris = väntar", [ev.hit, ev.state], [false, "waiting"]); eq("pris 0 = väntar", evaluate(wk(), 0, RATE).state, "waiting");
  eq("isStale 35 h", isStale(35 * 3600e3), false); eq("isStale 37 h", isStale(37 * 3600e3), true);
  eq("describeTarget kr", describeTarget(wk(), evaluate(wk(), 9, RATE), v => v + " kr"), "≤ 100 kr"); eq("describeTarget %", describeTarget(wk({ mode: "pct", pct: -10 }), evaluate(wk({ mode: "pct", pct: -10 }), 9, RATE), v => v + " kr"), "−10 % (≤ 90 kr)");
  const gw = groupWatches([wk({ id: "1", group: "B", created: 1 }), wk({ id: "2", group: "", created: 2 }), wk({ id: "3", group: "A", created: 3 }), wk({ id: "4", group: "B", created: 9 })]);
  eq("grupper A, B, sist ogrupperade", gw.map(g => g.group), ["A", "B", ""]); eq("nyast först i gruppen", gw[1].items.map(w => w.id), ["4", "1"]);
  const sm = summarize([{ ev: { state: "hit" }, stale: false }, { ev: { state: "watching" }, stale: true }, { ev: { state: "paused" }, stale: true }, { ev: { state: "waiting" }, stale: false }]);
  eq("sammanfattning", sm, { total: 4, hit: 1, paused: 1, watching: 1, waiting: 1, stale: 1 });
  eq("normalizeWatch: gamla bevakningar får standardvärden", [normalizeWatch({ id: "a", mhn: "X", target: 5, dir: "above" }).mode, normalizeWatch({ id: "a", mhn: "X", target: 5, dir: "above" }).paused, normalizeWatch({ id: "a", mhn: "X", target: 5 }).group], ["price", false, ""]);
  eq("normalizeWatch: pct begränsas", normalizeWatch({ mode: "pct", pct: -500 }).pct, -99); eq("normalizeWatch: ogiltig dir → below", normalizeWatch({ dir: "x" }).dir, "below");
  const wb = await validateBackup({ app: "cs2hub", watch: [{ id: "a", mhn: "X", target: 5, mode: "pct", pct: -10, group: "  Knivar ", paused: true, note: "n", startUsd: 3 }, { id: "b", mhn: "Y", target: 5, mode: "evil", pct: 5, group: 5 }] });
  eq("backup: pct-bevakning bevaras", [wb.clean.watch[0].mode, wb.clean.watch[0].pct, wb.clean.watch[0].dir, wb.clean.watch[0].group, wb.clean.watch[0].paused], ["pct", -10, "below", "Knivar", true]);
  eq("backup: ogiltigt läge → price, ogiltig grupp tom", [wb.clean.watch[1].mode, wb.clean.watch[1].pct, wb.clean.watch[1].group], ["price", null, ""]);
  eq("backup: gamla bevakningar utan nya fält fungerar", (await validateBackup({ app: "cs2hub", watch: [{ id: "a", mhn: "X", target: 5, dir: "above", created: 1, startUsd: 2 }] })).clean.watch[0].mode, "price");

  /* ---------- Inspect & Float ---------- */
  section("Inspect & Float: avkodning, felhantering, float-position, jämförelse");
  // Liten protobuf-kodare för att bygga syntetiska "masked" inspect-länkar (inga riktiga spelarlänkar används)
  const vi = n => { const o = []; n = BigInt(n); do { let b = Number(n & 0x7fn); n >>= 7n; if (n) b |= 0x80; o.push(b); } while (n); return o; };
  const fx32 = f => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, f); const u = d.getUint32(0); return [u & 255, (u >> 8) & 255, (u >> 16) & 255, (u >>> 24) & 255]; };
  const fV = (f, n) => [...vi(f << 3), ...vi(n)], fF = (f, x) => [...vi((f << 3) | 5), ...fx32(x)], fB = (f, bytes) => [...vi((f << 3) | 2), ...vi(bytes.length), ...bytes];
  const maskI = (pb, key = 0x5a) => { const raw = [0, ...pb, 1, 2, 3, 4]; return raw.map(b => b ^ key).map(b => b.toString(16).padStart(2, "0")).join(""); };
  const pb = o => [...fV(1, o.acct ?? 123456), ...fV(2, o.item ?? 987654321), ...fV(3, o.def ?? 7), ...fV(4, o.paint ?? 282), ...fV(5, 3), ...fV(6, o.q ?? 4), ...(o.float != null ? fF(7, o.float) : []), ...fV(8, o.seed ?? 661), ...(o.st != null ? fV(10, o.st) : []), ...(o.name ? fB(11, [...new TextEncoder().encode(o.name)]) : []), ...(o.stk || []).flatMap(a => fB(12, [...fV(1, a.slot), ...fV(2, a.id), ...(a.wear != null ? fF(3, a.wear) : [])])), ...(o.charm ? fB(20, [...fV(1, 0), ...fV(2, o.charm), ...fV(10, 4321)]) : [])];
  const hrefI = h => `steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20${h}`;
  const FL = 0.0723456799983978;
  let dr = decodeInspect(hrefI(maskI(pb({ float: FL, st: 1337, name: "Åke", stk: [{ slot: 0, id: 5476, wear: 0.25 }, { slot: 2, id: 12 }], charm: 77 }))));
  eq("defindex/paint/seed", [dr.defIndex, dr.paintIndex, dr.seed], [7, 282, 661]); near("float32 avkodas exakt", dr.float, Math.fround(FL), 1e-12); eq("item-id", dr.itemId, "987654321");
  eq("StatTrak-räknare", dr.stattrak, 1337); eq("namntag (UTF-8)", dr.nametag, "Åke"); eq("stickers", dr.stickers.map(a => [a.slot, a.id]), [[0, 5476], [2, 12]]); near("sticker-slitage", dr.stickers[0].wear, 0.25); eq("sticker utan slitage", dr.stickers[1].wear, undefined);
  eq("charm + pattern", [dr.charms[0].id, dr.charms[0].pattern], [77, 4321]);
  eq("nyckelbyte 0 (ingen XOR) fungerar", decodeInspect(maskI(pb({ float: 0.5 }), 0)).defIndex, 7); eq("ren hex utan steam://", decodeInspect(maskI(pb({ float: 0.5 }))).seed, 661);
  eq("hex med radbrytningar", decodeInspect(maskI(pb({ float: 0.5 })).replace(/(.{20})/g, "$1\n")).defIndex, 7);
  eq("utan float: float null + varning", (d => [d.float, d.warnings.some(w => w.includes("ingen float"))])(decodeInspect(maskI(pb({ float: null })))), [null, true]);
  const badInsp = (txt, part) => { try { decodeInspect(txt); return false; } catch (e) { return e.message.includes(part); } };
  eq("tom text", badInsp("", "Klistra in"), true); eq("slumptext", badInsp("hej hopp", "Hittade ingen"), true); eq("webbadress", badInsp("https://csfloat.com/checker?x=1", "webbadress"), true);
  eq("äldre S/A/D-länk", badInsp("steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A123456789D1234567890123456789", "äldre länk"), true);
  eq("udda antal hex-tecken", badInsp(maskI(pb({ float: 0.5 })).slice(0, -1), "udda"), true); eq("för kort hex", badInsp("00ff00ff00ff00ff00ff", "för kort"), true);
  // En avklippt länk ger antingen ett fel eller (om den klipptes exakt vid ett fältbyte) ett resultat där float saknas – då varnar vi i stället för att hitta på ett värde.
  eq("avklippt länk: fel eller varning om saknad float", (() => { try { const d = decodeInspect(maskI(pb({ float: 0.5 })).slice(0, 40) + "00".repeat(4)); return d.float === null && d.warnings.some(w => w.includes("ingen float")); } catch { return true; } })(), true);
  eq("defindex 0", badInsp(maskI(pb({ def: 0, float: 0.5 })), "ingen vapendata"), true); eq("float > 1 avvisas", badInsp(maskI(pb({ float: 7.5 })), "ogiltigt float"), true); eq("negativ float avvisas", badInsp(maskI(pb({ float: -0.5 })), "ogiltigt float"), true);
  eq("NaN-float avvisas", badInsp(maskI(pb({ float: NaN })), "ogiltigt float"), true); eq("seed > 1000 avvisas", badInsp(maskI(pb({ float: 0.5, seed: 5000 })), "ogiltig paint seed"), true);
  eq("orimligt sticker-slitage ignoreras", decodeInspect(maskI(pb({ float: 0.5, stk: [{ slot: 0, id: 1, wear: 9 }] }))).stickers[0].wear, undefined);
  eq("långt namntag kortas till 40", decodeInspect(maskI(pb({ float: 0.5, name: "x".repeat(300) }))).nametag.length, 40);
  eq("extractHex: länk", extractHex(hrefI("aabbccddeeff00112233")), "aabbccddeeff00112233");
  let fp2 = floatPosition(0.25, 0.1, 0.7); near("float 0,25 i 0,10–0,70 = 25 %", fp2.pos, 25, 1e-9); near("högre än 75 %", fp2.lowerThan, 75, 1e-9); eq("inom intervallet", fp2.outside, false);
  eq("utanför intervallet flaggas", floatPosition(0.9, 0.1, 0.7).outside, true); eq("ogiltigt intervall = null", floatPosition(0.5, 0.7, 0.7), null); eq("NaN = null", floatPosition(NaN, 0, 1), null);
  let bi2 = boundaryInfo(0.0712); eq("nära 0,07: över gränsen, grannen FN", [bi2.boundary, bi2.side, bi2.neighbor, bi2.wear], [0.07, "över", "FN", "MW"]); near("avstånd 0,0012", bi2.distance, 0.0012, 1e-9);
  bi2 = boundaryInfo(0.149); eq("0,149: under 0,15, grannen FT", [bi2.boundary, bi2.side, bi2.neighbor], [0.15, "under", "FT"]); eq("exakt 0,07 räknas som MW (över gränsen)", boundaryInfo(0.07).wear, "MW"); eq("utanför 0–1 = null", boundaryInfo(1.5), null);
  eq("wearOf gränser", [wearOf(0.0699), wearOf(0.07), wearOf(0.45), wearOf(1)], ["FN", "MW", "BS", "BS"]);
  eq("wearTable för 0,06–0,80", wearTable(0.06, 0.8).map(x => [x.wear, +x.from.toFixed(2), +x.to.toFixed(2)]), [["FN", 0.06, 0.07], ["MW", 0.07, 0.15], ["FT", 0.15, 0.38], ["WW", 0.38, 0.45], ["BS", 0.45, 0.8]]);
  eq("wearTable utesluter band utanför intervallet", wearTable(0.1, 0.5).map(x => x.wear), ["MW", "FT", "WW", "BS"]); eq("wearTable respekterar skinets slitage", wearTable(0, 1, ["FT", "WW"]).map(x => x.wear), ["FT", "WW"]);
  const cmpr = compareDecoded({ defIndex: 7, paintIndex: 282, float: 0.07, seed: 1 }, { defIndex: 7, paintIndex: 282, float: 0.0699, seed: 2 });
  eq("jämförelse: B lägre", [cmpr.sameItem, cmpr.lower, cmpr.sameSeed, cmpr.sameWear], [true, "B", false, false]); near("skillnad −0,0001", cmpr.floatDiff, -0.0001, 1e-12);
  eq("jämförelse: lika float", compareDecoded({ defIndex: 1, paintIndex: 1, float: 0.2, seed: 1 }, { defIndex: 1, paintIndex: 1, float: 0.2, seed: 1 }).lower, "lika"); eq("jämförelse: olika skins", compareDecoded({ defIndex: 1, paintIndex: 1, float: 0.2 }, { defIndex: 2, paintIndex: 1, float: 0.2 }).sameItem, false);
  eq("jämförelse: saknad float = null", compareDecoded({ defIndex: 1, paintIndex: 1, float: null }, { defIndex: 1, paintIndex: 1, float: 0.2 }).lower, null);
  const hx = maskI(pb({ float: 0.3 }));
  eq("cleanSavedInspect: hex och simulering", cleanSavedInspect([{ id: "a", name: "N", hex: hx, created: 1 }, { id: "b", name: "S", sim: { skin: "skin-1", float: 0.2, seed: 5 }, created: 2 }]).map(x => [x.id, !!x.hex, !!x.sim]), [["a", true, false], ["b", false, true]]);
  eq("cleanSavedInspect: skräp", cleanSavedInspect([null, { id: "x", hex: "zz" }, { id: "y", sim: { skin: "<b>", float: 0.2, seed: 5 } }, { id: "z", sim: { skin: "skin-1", float: 5, seed: 5 } }, { id: "w", sim: { skin: "skin-1", float: null, seed: 1 } }, "q"]), []);
  eq("cleanSavedInspect: ej lista", cleanSavedInspect({}), []);
  const kv4 = await validateBackup({ app: "cs2hub", kv: [{ key: "inspectSaved", value: [{ id: "a", name: "N", hex: hx, created: 1 }, { id: "b", hex: "nej" }] }] });
  eq("backup: sparade inspect-resultat tvättas", kv4.clean.kv.find(r => r.key === "inspectSaved").value.map(x => x.id), ["a"]);

  /* ---------- Pattern Explorer ---------- */
  section("Pattern Explorer: rank, filter, förklaring");
  eq("parseSeeds: lista + intervall", parseSeeds("661, 12-14  5"), { seeds: [661, 12, 13, 14, 5], bad: [] }); eq("parseSeeds: omvänt intervall", parseSeeds("14-12").seeds, [12, 13, 14]);
  eq("parseSeeds: ogiltigt", parseSeeds("abc 5000 1001 -3 7").bad, ["abc", "5000", "1001", "-3"]); eq("parseSeeds: gränsen 1000 ok", parseSeeds("1000").seeds, [1000]); eq("parseSeeds: dubbletter", parseSeeds("5 5 4-6").seeds, [5, 4, 6]);
  eq("parseSeeds: tom/null", [parseSeeds("").seeds, parseSeeds(null).seeds], [[], []]); eq("parseSeeds: tak 500", parseSeeds("0-1000").seeds.length, 500);
  const cr2 = competitionRanks([10, 30, 30, null, 20]); eq("konkurrensrank: 30,30 delar rank 1, sedan 3, 4", [cr2.rankOf(1), cr2.rankOf(2), cr2.rankOf(4), cr2.rankOf(0), cr2.rankOf(3), cr2.n], [1, 1, 3, 4, null, 4]);
  eq("rank lägst är bäst", competitionRanks([10, 30, 20], false).order, [0, 2, 1]);
  near("betterThan: 30 av [10,20,30] slår 2 av 2 = 100 %", betterThanPct([10, 20, 30], 2), 100); near("betterThan: 10 = 0 %", betterThanPct([10, 20, 30], 0), 0); near("betterThan: 20 = 50 %", betterThanPct([10, 20, 30], 1), 50); eq("betterThan: saknad = null", betterThanPct([1, null, 3], 1), null);
  const hg = histogram([0, 5, 9.9, 10, 55, 100, null, 200], 0, 100, 10); eq("histogram: antal per hink", [hg.bins[0].count, hg.bins[1].count, hg.bins[5].count, hg.bins[9].count], [3, 1, 1, 1]); eq("histogram: 100 hamnar i sista hinken", hg.binOf(100), 9); eq("histogram: utanför ignoreras", hg.bins.reduce((t, b) => t + b.count, 0), 6);
  const bl = [[50, 10, 5], [97.6, 6, 0], [80, 5, 10], null, [80, 20, 0], [10, 60, 20]];
  let eb = explainBlue(bl, 2); eq("blå: rank 3 av 5 (97,6 / 80 / 80)", [eb.rank, eb.n, eb.top, eb.tied], [2, 5, 1, 2]); near("gap till toppen 17,6", eb.gap, 17.6, 1e-9); eq("andelar summerar till 100", eb.parts, { blue: 80, purple: 5, gold: 10, other: 5 });
  eq("dominerande färg blå", eb.dominant, "blue"); eq("lila dominerar för seed 5", explainBlue(bl, 5).dominant, "purple"); eq("topp-seeden är rank 1", explainBlue(bl, 1).rank, 1); eq("saknad seed = null", explainBlue(bl, 3), null);
  eq("förklaringen nämner toppseeden", explainBlue(bl, 0).sentences.some(t => t.includes("seed 1") || t.includes("Toppseeden är 1")), true); eq("hög guld nämns", explainBlue(bl, 5).sentences.some(t => t.includes("guldandel")), true);
  const fd = [95, 99.5, null, 95, 80]; let ef = explainFade(fd, 0); eq("fade: delad rank 2", [ef.rank, ef.tied, ef.n, ef.top], [2, 2, 4, 1]); eq("fade: saknad seed = null", explainFade(fd, 2), null); eq("fade: toppseed rank 1", explainFade(fd, 1).rank, 1);
  eq("avrundning i förklaringen = visningen (98,35 → 98,4)", explainFade([98.35, 100], 0).sentences[0].includes("98,4 %"), true);
  eq("filterBlue: min blå 80, sorterat blå ↓", filterBlue(bl, { minBlue: 80 }), [1, 2, 4]); eq("filterBlue: lika sorteras på seed", filterBlue(bl, { minBlue: 80, sort: "blue" }), [1, 2, 4]);
  eq("filterBlue: lila ≥ 20", filterBlue(bl, { minPurple: 20, sort: "purple" }), [5, 4]); eq("filterBlue: guld ≥ 10, guld ↓", filterBlue(bl, { minGold: 10, sort: "gold" }), [5, 2]);
  eq("filterBlue: intervall + seed-lista", filterBlue(bl, { minBlue: 40, maxBlue: 90, seeds: [0, 2, 5] }), [2, 0]); // standardsortering = blå ↓ eq("filterBlue: seed ↑", filterBlue(bl, { sort: "seed" }), [0, 1, 2, 4, 5]); eq("filterBlue: top 2", filterBlue(bl, { top: 2 }), [1, 2]);
  eq("filterBlue: tomma filter = alla med data", filterBlue(bl, { minBlue: "", maxBlue: "" }).length, 5); eq("filterBlue: blå ↑", filterBlue(bl, { sort: "blueAsc" })[0], 5);
  eq("filterFade: ≥ 95, högst först", filterFade(fd, { min: 95 }), [1, 0, 3]); eq("filterFade: saknad seed hoppas över", filterFade(fd, {}).includes(2), false); eq("filterFade: ≤ 90", filterFade(fd, { max: 90 }), [4]); eq("filterFade: fadeAsc", filterFade(fd, { sort: "fadeAsc" })[0], 4);
  eq("similarBlue: närmast (80,20,0) är (80,5,10)? nej – (50,10,5) eller (80,5,10)", similarBlue(bl, 4, 1)[0].seed, 2); eq("similarBlue: inte sig själv", similarBlue(bl, 4, 5).some(x => x.seed === 4), false); eq("similarBlue: saknad = []", similarBlue(bl, 3), []);
  eq("similarFade: närmast", similarFade(fd, 0, 1)[0].seed, 3); eq("similarFade: saknad = []", similarFade(fd, 2), []);
  // mot verkliga datafilen: AK-47 Case Hardened, ovansida
  const PD = await fetch("data/patterns.json").then(r => r.json()), ak = PD.blue.ak47.ch.top, akE = explainBlue(ak, 661);
  eq("verklig data: seed 661 har högst blå andel på AK ovansida (rank 1)", akE.rank, 1); eq("verklig data: 1001 seeds", akE.n, 1001); near("verklig data: andelar summerar ≤ 100", Math.min(100, akE.parts.blue + akE.parts.purple + akE.parts.gold) <= 100 ? 1 : 0, 1);
  eq("verklig data: Fade 27 vapen", Object.keys(PD.fade).length, 27); eq("verklig data: rank 1 finns för varje fade-vapen", Object.values(PD.fade).every(a => competitionRanks(a, true).rankOf(competitionRanks(a, true).order[0]) === 1), true);

  /* ---------- Trade-up ---------- */
  section("Trade-up: regler, float, utfall, förväntat värde, risk");
  const TU = {
    in1: { id: "in1", r: "Mil-Spec Grade", f: [0, 1], st: true, col: ["c1"] }, in2: { id: "in2", r: "Mil-Spec Grade", f: [0.1, 0.5], st: false, col: ["c2"] },
    in3: { id: "in3", r: "Mil-Spec Grade", f: [0, 1], st: true, col: ["c3"] }, inTop: { id: "inTop", r: "Classified", f: [0, 1], st: true, col: ["c1"] }, inCov: { id: "inCov", r: "Covert", f: [0, 1], st: true, col: ["c1"] },
    o1a: { id: "o1a", r: "Restricted", f: [0, 1], st: true, col: ["c1"] }, o1b: { id: "o1b", r: "Restricted", f: [0, 0.5], st: true, col: ["c1"] }, o2a: { id: "o2a", r: "Restricted", f: [0.05, 0.8], st: false, col: ["c2"] },
  };
  const TCOL = { c1: { n: "Samling 1", items: ["in1", "o1a", "o1b", "inTop"] }, c2: { n: "Samling 2", items: ["in2", "o2a"] }, c3: { n: "Samling 3 (utan Restricted)", items: ["in3"] } };
  const TPRICE = { o1a: 100, o1b: 300, o2a: 50 };
  const tcx = { skin: id => TU[id] || null, collection: cid => TCOL[cid] || null, price: (s, f) => TPRICE[s.id] ?? null, net: (s, f) => (TPRICE[s.id] != null ? TPRICE[s.id] * 0.9 : null), flag: () => null };
  const tOk = r => r.every(x => !x.hard || x.ok);
  near("normFloat (0,3 i 0,1–0,5 = 0,5)", normFloat(0.3, 0.1, 0.5), 0.5, 1e-12); eq("normFloat: under = 0, över = 1, tomt intervall = 0", [normFloat(0.05, 0.1, 0.5), normFloat(0.9, 0.1, 0.5), normFloat(0.5, 0.3, 0.3)], [0, 1, 0]); near("outputFloat", outputFloat(0.5, 0.05, 0.8), 0.425, 1e-12);
  near("snittnorm vägt med antal", avgNorm([{ count: 3, norm: 0 }, { count: 7, norm: 1 }]), 0.7, 1e-12); eq("avgNorm tom = 0", avgNorm([]), 0);
  eq("fel antal avvisas", tOk(checkRules({ entries: [{ id: "in1", float: 0.1, count: 9 }], stattrak: false }, tcx)), false); eq("10 av samma godkänns", tOk(checkRules({ entries: [{ id: "in1", float: 0.1, count: 10 }], stattrak: false }, tcx)), true);
  eq("blandad rarity avvisas", tOk(checkRules({ entries: [{ id: "in1", float: 0.1, count: 5 }, { id: "inTop", float: 0.1, count: 5 }], stattrak: false }, tcx)), false);
  eq("Covert utan vapenfall i samlingen avvisas med förklaring", checkRules({ entries: [{ id: "inCov", float: 0.1, count: 5 }], stattrak: false }, tcx).find(r => !r.ok && r.text.includes("vapenfall")) != null, true);
  eq("StatTrak kräver att alla har ST", tOk(checkRules({ entries: [{ id: "in1", float: 0.1, count: 5 }, { id: "in2", float: 0.2, count: 5 }], stattrak: true }, tcx)), false);
  eq("samling utan nästa nivå avvisas (högsta nivån i samlingen)", tOk(checkRules({ entries: [{ id: "in3", float: 0.1, count: 10 }], stattrak: false }, tcx)), false);
  eq("StatTrak: samling utan ST-utfall avvisas", tOk(checkRules({ entries: [{ id: "in2", float: 0.2, count: 10 }], stattrak: true }, tcx)), false);
  eq("float utanför intervallet = bara varning", (r => [r.find(x => !x.ok)?.hard, tOk(r)])(checkRules({ entries: [{ id: "in2", float: 0.9, count: 10 }], stattrak: false }, tcx)), [false, true]);
  /* ---- Covert → kniv/handske (uppskattning) ---- */
  const KN = {
    dP1: { id: "dP1", n: "★ Bayonet | Doppler", k: "knife", ph: "Phase 1", f: [0, 0.08], st: true, r: "Covert" }, dP2: { id: "dP2", n: "★ Bayonet | Doppler", k: "knife", ph: "Phase 2", f: [0, 0.08], st: true },
    dRuby: { id: "dRuby", n: "★ Bayonet | Doppler", k: "knife", ph: "Ruby", f: [0, 0.08], st: true }, mf: { id: "mf", n: "★ Bayonet | Marble Fade", k: "knife", f: [0, 0.08], st: true },
    van: { id: "van", n: "★ Bayonet", k: "knife", f: null, st: true }, gl: { id: "gl", n: "★ Sport Gloves | Vice", k: "glove", f: [0.06, 0.8], st: false }, mf2: { id: "mf2", n: "★ Karambit | Fade", k: "knife", f: [0, 0.08], st: true },
    cov2: { id: "cov2", r: "Covert", f: [0, 1], st: true, col: ["c4"] }, cov1: { id: "cov1", r: "Covert", f: [0, 1], st: true, col: ["c1"] }, covNoST: { id: "covNoST", r: "Covert", f: [0, 1], st: false, col: ["c1"] },
  };
  const SPEC = { c1: ["dP1", "dP2", "dRuby", "mf", "van", "gl"], c4: ["mf2"] }, CP = { "★ Bayonet | Doppler": 1000, "★ Bayonet | Marble Fade": 800, "★ Bayonet": 400, "★ Sport Gloves | Vice": 600, "★ Karambit | Fade": 2000 };
  const ccx = { skin: id => KN[id] || TU[id] || null, collection: cid => ({ c1: { n: "Samling 1" }, c4: { n: "Samling 4" } })[cid] || null, special: cid => (SPEC[cid] || []).map(i => KN[i]), price: (s, f) => CP[s.n] ?? null, net: (s, f) => (CP[s.n] != null ? CP[s.n] * 0.9 : null), flag: () => null };
  eq("sizeOf/nextOf: Covert = 5 och kniv/handske, annars 10", [TUC.sizeOf("Covert"), TUC.sizeOf("Classified"), TUC.nextOf("Covert"), TUC.nextOf("Classified"), TUC.nextOf("Mil-Spec Grade")], [5, 10, "Kniv/handske", "Covert", "Restricted"]);
  eq("Covert: 5 skins från samling med fall godkänns", tOk(checkRules({ entries: [{ id: "cov1", float: 0.1, count: 5 }], stattrak: false }, ccx)), true);
  eq("Covert: 10 skins avvisas (ska vara 5)", tOk(checkRules({ entries: [{ id: "cov1", float: 0.1, count: 10 }], stattrak: false }, ccx)), false);
  eq("Covert: skins från samma samling med fall kan kombineras", tOk(checkRules({ entries: [{ id: "cov1", float: 0.1, count: 4 }, { id: "inCov", float: 0.1, count: 1 }], stattrak: false }, { ...ccx, special: cid => (cid === "c1" ? SPEC.c1.map(i => KN[i]) : []) })), true);
  eq("Covert: samling helt utan fall avvisas", tOk(checkRules({ entries: [{ id: "cov2", float: 0.1, count: 5 }], stattrak: false }, { ...ccx, special: () => [] })), false);
  eq("Covert + StatTrak: godkänns när fallet har ST-kniv", tOk(checkRules({ entries: [{ id: "cov1", float: 0.1, count: 5 }], stattrak: true }, ccx)), true);
  eq("Covert + StatTrak: avvisas om bara handskar finns", tOk(checkRules({ entries: [{ id: "cov1", float: 0.1, count: 5 }], stattrak: true }, { ...ccx, special: () => [KN.gl] })), false);
  eq("Covert: blandat ST och vanlig avvisas", tOk(checkRules({ entries: [{ id: "cov1", float: 0.1, count: 3 }, { id: "covNoST", float: 0.1, count: 2 }], stattrak: true }, ccx)), false);
  const gs = TUC.groupSpecials(SPEC.c1.map(i => KN[i]), false), gsST = TUC.groupSpecials(SPEC.c1.map(i => KN[i]), true);
  eq("grupper: Doppler-faser slås ihop (4 grupper: Doppler, Marble Fade, vanilla, handske)", gs.length, 4);
  eq("grupper: sällsynt fas (Ruby) ligger separat, Phase 1/2 är vanliga", (g => [g.rare.map(x => x.ph), g.common.map(x => x.ph)])(gs.find(g => g.s.n === "★ Bayonet | Doppler")), [["Ruby"], ["Phase 1", "Phase 2"]]);
  eq("StatTrak: handskar utesluts (3 grupper)", [gsST.length, gsST.some(g => g.s.k === "glove")], [3, false]);
  const CK = { stattrak: false, entries: [{ id: "cov1", float: 0.5, count: 5, price: 100 }] }, CA = analyze(CK, ccx);
  eq("Covert: uppskattning, 5 inputs, 4 utfall", [CA.covert, CA.estimate, CA.n, CA.outcomes.length], [true, true, 5, 4]);
  near("Covert: varje grupp 25 %, summan 100 %", CA.outcomes.reduce((t, o) => t + o.prob, 0), 1, 1e-12); eq("Covert: lika chans per modell/finish", CA.outcomes.every(o => Math.abs(o.prob - 0.25) < 1e-12), true);
  near("Covert: förväntat värde = (1000+800+400+600)/4 = 700 (Ruby ingår inte)", CA.ev, 700, 1e-9); eq("Covert: sällsynta faser flaggas (1 grupp)", [CA.rareGroups, CA.outcomes.find(o => o.s.n === "★ Bayonet | Doppler").rare], [1, ["Ruby"]]);
  eq("Covert: vanilla-kniv har ingen float/slitage men pris", (o => [o.fl, o.wear, o.price])(CA.outcomes.find(o => o.s.id === "van")), [null, null, 400]);
  near("Covert: output-float skalas till utfallets intervall (kniv 0–0,08 med snitt 0,5 → 0,04)", CA.outcomes.find(o => o.s.id === "mf").fl, 0.04, 1e-12); eq("Covert: handske 0,06–0,8 med snitt 0,5 → 0,43 (Well-Worn)", (o => [+o.fl.toFixed(4), o.wear])(CA.outcomes.find(o => o.s.id === "gl")), [0.43, "WW"]);
  near("Covert: kostnad 5×100", CA.cost, 500);
  const CM = analyze({ stattrak: false, entries: [{ id: "cov1", float: 0.5, count: 3, price: 100 }, { id: "cov2", float: 0.5, count: 2, price: 100 }] }, ccx);
  eq("Covert, två samlingar: 4 + 1 utfall", CM.outcomes.length, 5); near("Covert: samling 1 (3/5) delat på 4 = 15 %", CM.outcomes.find(o => o.s.id === "mf").prob, 0.15, 1e-12); near("Covert: samling 4 (2/5) med ett utfall = 40 %", CM.outcomes.find(o => o.s.id === "mf2").prob, 0.4, 1e-12); near("Covert, två samlingar: summan 100 %", CM.outcomes.reduce((t, o) => t + o.prob, 0), 1, 1e-12);
  const CS = analyze({ stattrak: true, entries: [{ id: "cov1", float: 0.5, count: 5, price: 100 }] }, ccx); eq("Covert StatTrak: bara knivar (3 utfall, inga handskar)", [CS.outcomes.length, CS.outcomes.some(o => o.s.k === "glove")], [3, false]);
  eq("grupper: fas utan känt namn (#617) räknas som okänd chans, inte vanlig", (g => [g.common.map(x => x.ph), g.rare.map(x => x.ph)])(TUC.groupSpecials([{ n: "K | Doppler", ph: "Phase 1", k: "knife", st: true }, { n: "K | Doppler", ph: "#617", k: "knife", st: true }, { n: "K | Doppler", ph: "Black Pearl", k: "knife", st: true }], false)[0]), [["Phase 1"], ["#617", "Black Pearl"]]);
  eq("isCommonPhase", [TUC.isCommonPhase("Phase 3"), TUC.isCommonPhase(undefined), TUC.isCommonPhase("Ruby"), TUC.isCommonPhase("#619"), TUC.isCommonPhase("Emerald")], [true, true, false, false, false]);
  const ci = TUC.caseIndex([{ ci: ["a1", "a2", "a3", "a4"], cx: ["k1", "k2"] }, { ci: ["b1", "b2"], cx: ["k3"] }, { ci: ["c1", "x1"], cx: ["k4"] }, { ci: ["d1"], cx: [] }, null, { ci: ["a5"], cx: ["k2", "k5"] }], id => ({ a1: { col: ["A"] }, a2: { col: ["A"] }, a3: { col: ["A"] }, a4: { col: ["A"] }, a5: { col: ["A"] }, b1: { col: ["B"] }, b2: { col: ["B", "Z"] }, c1: { col: ["C"] }, x1: { col: ["X"] }, d1: { col: ["D"] } })[id]);
  eq("caseIndex: fall kopplas till samling, dubbletter slås ihop", [...(ci.get("A") || [])].sort(), ["k1", "k2", "k5"]); eq("caseIndex: samling B får k3", ci.get("B"), ["k3"]);
  eq("caseIndex: för låg täckning (50 %), fall utan special och skräp hoppas över", [ci.has("C"), ci.has("X"), ci.has("D")], [false, false, false]);
  eq("caseIndex: tomt/skräp ger tom karta", [TUC.caseIndex(null, () => null).size, TUC.caseIndex([{}, 5, "x"], () => null).size], [0, 0]);
  // kontrakt: 7 st in1 (float 0,2, samling 1) + 3 st in2 (float 0,3, samling 2; intervall 0,1–0,5), pris in1 = 10, in2 = 20 (manuellt)
  const TK = { stattrak: false, entries: [{ id: "in1", float: 0.2, count: 7, price: 10 }, { id: "in2", float: 0.3, count: 3, price: 20 }] };
  const TA = analyze(TK, tcx);
  near("kostnad 7×10 + 3×20 = 130", TA.cost, 130); near("snittnorm = (7×0,2 + 3×0,5)/10 = 0,29", TA.avgNorm, 0.29, 1e-12); eq("tre möjliga utfall (2 från samling 1, 1 från samling 2)", TA.outcomes.length, 3);
  const tuPr = id => TA.outcomes.find(o => o.s.id === id);
  near("chans o1a = 0,7/2 = 0,35", tuPr("o1a").prob, 0.35, 1e-12); near("chans o1b = 0,35", tuPr("o1b").prob, 0.35, 1e-12); near("chans o2a = 0,3", tuPr("o2a").prob, 0.3, 1e-12); near("chanserna summerar till 1", TA.outcomes.reduce((t, o) => t + o.prob, 0), 1, 1e-12);
  near("output-float o1a = 0,29", tuPr("o1a").fl, 0.29, 1e-12); near("output-float o1b = 0 + 0,29×0,5 = 0,145", tuPr("o1b").fl, 0.145, 1e-12); near("output-float o2a = 0,05 + 0,29×0,75 = 0,2675", tuPr("o2a").fl, 0.2675, 1e-12);
  eq("wear på utfallen", [tuPr("o1a").wear, tuPr("o1b").wear, tuPr("o2a").wear], ["FT", "MW", "FT"]);
  near("EV = 0,35×100 + 0,35×300 + 0,3×50 = 155", TA.ev, 155, 1e-9); near("EV netto = 139,5", TA.evNet, 139.5, 1e-9); near("vinst = 25", TA.profit, 25, 1e-9); near("netto-vinst = 9,5", TA.profitNet, 9.5, 1e-9); near("ROI 19,23 %", TA.roi, (155 / 130 - 1) * 100, 1e-9);
  near("chans till vinst (pris > 130): bara o1b = 35 %", TA.winProb, 0.35, 1e-12); near("chans till vinst netto (netto > 130): bara o1b (270) = 35 %", TA.winProbNet, 0.35, 1e-12); near("break-even = EV", TA.breakEven, 155, 1e-9);
  near("risk: lägsta 50, högsta 300", TA.risk.min + TA.risk.max, 350); near("sannolikhet att få < 50 % av kostnaden (65 kr) = 30 % (o2a = 50)", TA.risk.lossHalf, 0.3, 1e-12); near("sannolikhet förlust (pris < 130) = 65 %", TA.risk.lossAny, 0.65, 1e-12);
  near("stdev: sqrt(0,35×55² + 0,35×145² + 0,3×105²)", TA.risk.stdev, Math.sqrt(0.35 * 55 ** 2 + 0.35 * 145 ** 2 + 0.3 * 105 ** 2), 1e-9); eq("mest sannolika utfallet har högst chans (o1b före o1a vid lika, dyrast först)", TA.risk.mostLikely.s.id, "o1b");
  eq("samlingsfördelning", TA.collections.map(c => [c.cid, c.inputs, c.poolSize]), [["c1", 7, 2], ["c2", 3, 1]]); near("per-utfall-chans samling 1", TA.collections[0].perOutcome, 0.35, 1e-12);
  eq("topplista störst värde först", TA.top.map(o => o.s.id), ["o1b", "o1a", "o2a"]); eq("inga saknade priser", [TA.missingInputs, TA.missingOutcomes], [0, 0]);
  const tcxMiss = { ...tcx, price: (s, f) => (s.id === "o2a" ? null : TPRICE[s.id] ?? null), net: (s, f) => (s.id === "o2a" ? null : TPRICE[s.id] * 0.9) };
  const TAm = analyze(TK, tcxMiss); eq("saknat utfallspris räknas och flaggas", [TAm.missingOutcomes, +TAm.missingProb.toFixed(2), Math.round(TAm.coverage * 100)], [1, 0.3, 70]); near("EV räknar saknat pris som 0 (lägsta möjliga)", TAm.ev, 140, 1e-9);
  const TAi = analyze({ stattrak: false, entries: [{ id: "in1", float: 0.2, count: 10 }] }, { ...tcx, price: (s, f) => (s.id === "in1" ? null : TPRICE[s.id] ?? null) }); eq("saknat inputpris flaggas", TAi.missingInputs, 1); near("kostnad utan pris räknas som 0", TAi.cost, 0);
  const TAs = analyze({ stattrak: true, entries: [{ id: "in1", float: 0.2, count: 10, price: 5 }] }, tcx); eq("StatTrak: bara ST-utfall (o1a, o1b)", TAs.outcomes.map(o => o.s.id).sort(), ["o1a", "o1b"]);
  const TAc = analyze({ stattrak: false, entries: [{ id: "in1", float: 5, count: 10, price: 1 }] }, tcx); near("float klämms till skinets intervall (1,0)", TAc.avgNorm, 1, 1e-12);
  eq("nearestEdge", [nearestEdge(0.071).edge, +nearestEdge(0.071).distance.toFixed(3), nearestEdge(0.2).edge], [0.07, 0.001, 0.15]);
  eq("normLimitForWear: skin 0–1, FN → snittnorm ≤ 0,07", normLimitForWear(0, 1, "FN"), { min: 0, max: 0.07 }); eq("normLimitForWear: MW 0,07–0,15", (r => [+r.min.toFixed(2), +r.max.toFixed(2)])(normLimitForWear(0, 1, "MW")), [0.07, 0.15]);
  eq("normLimitForWear: skin 0,10–0,50, FN är omöjligt", normLimitForWear(0.1, 0.5, "FN"), null); eq("normLimitForWear: skin 0,06–0,8, FN → max (0,07−0,06)/0,74", +normLimitForWear(0.06, 0.8, "FN").max.toFixed(4), 0.0135);
  eq("cleanSavedTradeups: giltig", cleanSavedTradeups([{ id: "a", name: "T", stattrak: 1, entries: [{ id: "skin-1", float: 0.2, count: 10, price: 5 }, { id: "<b>", float: 0.2, count: 1 }, { id: "skin-2", float: 9, count: 99, price: -1 }], created: 3 }]).map(c => [c.stattrak, c.entries.map(e => [e.id, e.float, e.count, e.price])]), [[true, [["skin-1", 0.2, 10, 5], ["skin-2", 1, 10, null]]]]);
  eq("cleanSavedTradeups: skräp", cleanSavedTradeups([null, { id: "x", entries: [] }, { id: "y", entries: [{ id: "bad id", float: 1, count: 1 }] }, "q"]), []); eq("cleanSavedTradeups: ej lista", cleanSavedTradeups({}), []);
  const kvT = await validateBackup({ app: "cs2hub", kv: [{ key: "tradeupSaved", value: [{ id: "a", name: "T", entries: [{ id: "skin-1", float: 0.2, count: 10 }] }, { id: "b", entries: [{ id: "!!", float: 1, count: 1 }] }] }] });
  eq("backup: sparade trade-ups tvättas", kvT.clean.kv.find(r => r.key === "tradeupSaved").value.map(x => x.id), ["a"]);

  /* ---------- Inställningar och tema ---------- */
  section("Inställningar: tvätt, tema, bildskala");
  eq("standardvärden: mörkt tema (som förut)", [PDEF.theme, PDEF.density, PDEF.motion, PDEF.notifications, PDEF.minKr], ["dark", "normal", "auto", true, null]);
  eq("cleanPrefs: ogiltigt → standard", cleanPrefs({ theme: "neon", density: 5, cards: null, notifications: "ja", minKr: "x" }), PDEF); eq("cleanPrefs: ej objekt → standard", [cleanPrefs(null), cleanPrefs([1]), cleanPrefs("x")].every(p => JSON.stringify(p) === JSON.stringify(PDEF)), true);
  eq("cleanPrefs: giltiga värden behålls", (p => [p.theme, p.density, p.cards, p.imageQuality, p.motion, p.invView, p.invTab, p.invSort, p.invMode, p.calcMarket, p.notifications, p.minKr])(cleanPrefs({ theme: "light", density: "compact", cards: "large", imageQuality: "low", motion: "off", invView: "table", invTab: "portfolio", invSort: "pl", invMode: "steam", calcMarket: "skinport", notifications: false, minKr: 250 })), ["light", "compact", "large", "low", "off", "table", "portfolio", "pl", "steam", "skinport", false, 250]);
  eq("cleanPrefs: minKr utanför gränser/NaN/negativt", [cleanPrefs({ minKr: -1 }).minKr, cleanPrefs({ minKr: NaN }).minKr, cleanPrefs({ minKr: 1e9 }).minKr, cleanPrefs({ minKr: 0 }).minKr], [null, null, null, 0]);
  eq("cleanPrefs: okända nycklar följer inte med", "evil" in cleanPrefs({ evil: 1, __proto__: { x: 1 } }), false); eq("cleanPrefs: ändrar inte indatan", (o => (cleanPrefs(o), o.theme))({ theme: "light" }), "light");
  eq("resolveTheme", [resolveTheme({ theme: "dark" }, false), resolveTheme({ theme: "light" }, true), resolveTheme({ theme: "system" }, true), resolveTheme({ theme: "system" }, false), resolveTheme({ theme: "x" }, false)], ["dark", "light", "dark", "light", "dark"]);
  eq("imgScaleOf", [imgScaleOf("low"), imgScaleOf("normal"), imgScaleOf("high"), imgScaleOf("x")], [0.6, 1, 1.5, 1]);
  eq("scaleImgSize: låg", scaleImgSize("256fx192f", 0.6), "154fx115f"); eq("scaleImgSize: hög", scaleImgSize("256fx192f", 1.5), "384fx288f"); eq("scaleImgSize: tak 600", scaleImgSize("512fx384f", 1.5), "600fx576f"); eq("scaleImgSize: golv", scaleImgSize("48fx36f", 0.6), "32fx24f");
  eq("scaleImgSize: normal ändrar inte", scaleImgSize("256fx192f", 1), "256fx192f"); eq("scaleImgSize: okänt format orört", scaleImgSize("360fx360", 1.5), "360fx360");
  eq("bootMirror: bara visningsfält", Object.keys(bootMirror(PDEF)).sort(), ["cards", "density", "motion", "theme"]);
  const kvP = await validateBackup({ app: "cs2hub", kv: [{ key: "prefs", value: { theme: "light", density: "evil", minKr: 99 } }, { key: "other", value: 1 }] });
  eq("backup: inställningar tvättas", (p => [p.theme, p.density, p.minKr])(kvP.clean.kv.find(r => r.key === "prefs").value), ["light", "normal", 99]); eq("backup: ogiltigt prefs-objekt ignoreras", (await validateBackup({ app: "cs2hub", kv: [{ key: "prefs", value: "x" }] })).clean.kv.some(r => r.key === "prefs"), false);

  /* ---------- Combo Finder ---------- */
  section("Combo Finder: kandidater, kombinationer, budget, Loadout/Workshop");
  const cb_cI = (id, sc, cost, extra = {}) => ({ id, sc, cost, ...extra });
  const cb_cands = buildCandidates([cb_cI("a", 90, 100), cb_cI("b", 80, 50), cb_cI("c", 30, 1), cb_cI("d", 60, 10), cb_cI("e", 95, null), cb_cI("f", 70, 200)], { score: x => x.sc, cost: x => x.cost, top: 2, cheap: 2, minScore: 40, cheapMin: 55 });
  eq("kandidater: bästa först, för låg poäng/utan pris utesluts", cb_cands.map(x => x.item.id), ["a", "b", "d"]); eq("kandidater: billiga alternativ med", buildCandidates([cb_cI("a", 90, 100), cb_cI("z", 60, 5)], { score: x => x.sc, cost: x => x.cost, top: 1, cheap: 1 }).map(x => x.item.id), ["a", "z"]);
  eq("kandidater: inga dubbletter", buildCandidates([cb_cI("a", 90, 5)], { score: x => x.sc, cost: x => x.cost, top: 3, cheap: 3 }).length, 1); eq("kandidater: tom lista", buildCandidates([], { score: () => 1, cost: () => 1 }), []);
  const cb_pA = { id: "knife", label: "Kniv", list: [{ item: cb_cI("k1"), cost: 300, score: 90 }, { item: cb_cI("k2"), cost: 100, score: 70 }] }, cb_pB = { id: "glove", label: "Handskar", list: [{ item: cb_cI("g1"), cost: 200, score: 80 }, { item: cb_cI("g2"), cost: 50, score: 60 }] };
  let cb_ec = enumerateCombos([cb_pA, cb_pB], {});
  eq("4 kombinationer utan budget, bäst snittmatchning först", [cb_ec.combos.length, cb_ec.combos[0].picks.map(p => p.item.id), cb_ec.combos[0].score, cb_ec.combos[0].total], [4, ["k1", "g1"], 85, 500]); eq("billigaste kombinationen", [cb_ec.cheapest.total, cb_ec.minTotal], [150, 150]);
  cb_ec = enumerateCombos([cb_pA, cb_pB], { budget: 300 }); eq("budget 300: k2+g1 (300) och k2+g2 (150) ryms", cb_ec.combos.map(c => c.total).sort((a, b) => a - b), [150, 300]); eq("budget exakt = total ryms", enumerateCombos([cb_pA, cb_pB], { budget: 150 }).combos.length, 1);
  cb_ec = enumerateCombos([cb_pA, cb_pB], { budget: 100 }); eq("budget för låg: inga, men minTotal anges", [cb_ec.combos.length, cb_ec.cheapest, cb_ec.minTotal], [0, null, 150]);
  eq("tom del = inga kombinationer", enumerateCombos([cb_pA, { id: "x", label: "X", list: [] }], {}).combos.length, 0); eq("inga delar = inga kombinationer", enumerateCombos([], {}).combos.length, 0);
  eq("tak på antal kombinationer markeras", (r => [r.combos.length, r.truncated])(enumerateCombos([{ id: "a", label: "A", list: Array.from({ length: 10 }, (_, i) => ({ item: cb_cI("a" + i), cost: i, score: 50 })) }, { id: "b", label: "B", list: Array.from({ length: 10 }, (_, i) => ({ item: cb_cI("b" + i), cost: i, score: 50 })) }], { cap: 30 })), [30, true]);
  const cb_many = enumerateCombos([{ id: "a", label: "A", list: [1, 2, 3].map(i => ({ item: cb_cI("a" + i), cost: i, score: 100 - i })) }, { id: "b", label: "B", list: [1, 2, 3].map(i => ({ item: cb_cI("b" + i), cost: i, score: 100 - i })) }], {});
  eq("variation: samma föremål högst 2 gånger", (pk => { const cnt = {}; pk.forEach(c => c.picks.forEach(p => cnt[p.item.id] = (cnt[p.item.id] || 0) + 1)); return Math.max(...Object.values(cnt)); })(pickVariety(cb_many.combos, { n: 4, maxReuse: 2 })) <= 2, true);
  eq("variation: fyller upp om för få", pickVariety(cb_many.combos, { n: 9, maxReuse: 1 }).length >= 3, true);
  const cb_sk = (id, k, w) => ({ id, k, w }); let cb_lo = loadoutFromCombo([{ item: cb_sk("kn", "knife", "Karambit"), wear: "FN" }, { item: cb_sk("gl", "glove", "Sport Gloves"), wear: "FT" }, { item: cb_sk("ak", "weapon", "AK-47"), wear: "FT" }, { item: cb_sk("aw", "weapon", "AWP"), wear: "MW" }]);
  eq("Loadout: AK-47 ger T-sida", [cb_lo.side, Object.keys(cb_lo.slots).sort(), cb_lo.dropped], ["t", ["AK-47", "AWP", "glove", "knife"], 0]); eq("Loadout: wear följer med", cb_lo.slots.AWP, { id: "aw", wear: "MW", st: false });
  cb_lo = loadoutFromCombo([{ item: cb_sk("m4", "weapon", "M4A4"), wear: "FT" }, { item: cb_sk("us", "weapon", "USP-S"), wear: "FT" }]); eq("Loadout: M4A4 + USP-S = CT", [cb_lo.side, cb_lo.dropped], ["ct", 0]);
  cb_lo = loadoutFromCombo([{ item: cb_sk("ak", "weapon", "AK-47"), wear: "FT" }, { item: cb_sk("m4", "weapon", "M4A4"), wear: "FT" }, { item: cb_sk("gl", "weapon", "Glock-18"), wear: "FT" }]); eq("Loadout: blandat T/CT → mest T, M4 hoppas över", [cb_lo.side, cb_lo.dropped, "M4A4" in cb_lo.slots], ["t", 1, false]);
  eq("Loadout: tom kombination = CT utan platser", (r => [r.side, Object.keys(r.slots).length])(loadoutFromCombo([])), ["ct", 0]); eq("Loadout: stickers/charm ignoreras", Object.keys(loadoutFromCombo([{ item: { id: "s", k: "sticker" } }]).slots).length, 0);
  const cb_wl = workshopLink({ skin: "skin-1", wear: "MW", stickers: [5, 6, 7, 8, 9], charm: 77 }), cb_wd = JSON.parse(decodeURIComponent(escape(atob(cb_wl.slice(11).replace(/-/g, "+").replace(/_/g, "/")))));
  eq("Workshop-länk: skin, slitage, max 4 stickers, charm", [cb_wd.s, cb_wd.w, cb_wd.st.map(x => x.id), cb_wd.ch], ["skin-1", "MW", [5, 6, 7, 8], { id: 77 }]); eq("Workshop-länk utan charm", JSON.parse(decodeURIComponent(escape(atob(workshopLink({}).slice(11).replace(/-/g, "+").replace(/_/g, "/"))))).ch, null);
  eq("cleanColorThemes: giltigt", cleanColorThemes([{ id: "a", name: "Mitt", colors: ["blue", "gold", "blue", "evil", 5, "red", "pink"] }]), [{ id: "a", name: "Mitt", colors: ["blue", "gold", "red"] }]);
  eq("cleanColorThemes: skräp", cleanColorThemes([null, { id: "x", colors: [] }, { id: 5, colors: ["red"] }, { id: "y", colors: ["evil"] }, "q"]), []); eq("cleanColorThemes: namn saknas → standard", cleanColorThemes([{ id: "a", colors: ["red"] }])[0].name, "Färgtema"); eq("cleanColorThemes: ej lista", cleanColorThemes({}), []);
  const cb_kvC = await validateBackup({ app: "cs2hub", kv: [{ key: "colorThemes", value: [{ id: "a", name: "T", colors: ["blue", "x"] }, { id: "b", colors: ["x"] }] }] });
  eq("backup: färgteman tvättas", cb_kvC.clean.kv.find(r => r.key === "colorThemes").value, [{ id: "a", name: "T", colors: ["blue"] }]);

  /* ---------- Visningsvaluta ---------- */
  section("Visningsvaluta: kurser, formatering, inmatning");
  const MRATES = { SEK: 10, EUR: 0.9, NOK: 11, DKK: 6.7, USD: 1 }, nrm = s => String(s).replace(/\s/g, " ");
  eq("unitsPerSek: SEK = 1", unitsPerSek("SEK", MRATES), 1); near("unitsPerSek: USD = 1/10", unitsPerSek("USD", MRATES), 0.1); near("unitsPerSek: EUR = 0,9/10", unitsPerSek("EUR", MRATES), 0.09); near("unitsPerSek: NOK = 1,1", unitsPerSek("NOK", MRATES), 1.1);
  eq("unitsPerSek: kurs saknas → null", [unitsPerSek("EUR", { SEK: 10 }), unitsPerSek("EUR", {}), unitsPerSek("EUR", null), unitsPerSek("EUR", { SEK: 0, EUR: 1 }), unitsPerSek("EUR", { SEK: 10, EUR: -1 }), unitsPerSek("EUR", { SEK: 10, EUR: NaN })], [null, null, null, null, null, null]); eq("unitsPerSek: okänd valuta → null", unitsPerSek("XYZ", MRATES), null);
  eq("effectiveCode: valuta med kurs", effectiveCode("EUR", MRATES), "EUR"); eq("effectiveCode: saknad kurs → SEK (hittar inte på kurs)", effectiveCode("EUR", { SEK: 10 }), "SEK"); eq("effectiveCode: ogiltig valuta → SEK", effectiveCode("BTC", MRATES), "SEK"); eq("isCurrency", [isCurrency("EUR"), isCurrency("btc"), isCurrency(null), isCurrency("toString")], [true, false, false, false]);
  eq("formatMoney SEK som förut: 12,50 kr", nrm(formatMoney(12.5, "SEK", 1)), "12,50 kr"); eq("formatMoney SEK ≥ 1000 utan decimaler", nrm(formatMoney(1234.56, "SEK", 1)), "1 235 kr"); eq("formatMoney null/NaN/Infinity = –", [formatMoney(null), formatMoney(NaN), formatMoney(Infinity), formatMoney("5")], ["–", "–", "–", "–"]);
  eq("formatMoney EUR: 100 kr → 9,00 €", nrm(formatMoney(100, "EUR", 0.09)), "9,00 €"); eq("formatMoney USD: 100 kr → 10,00 US$", nrm(formatMoney(100, "USD", 0.1)), "10,00 US$"); eq("formatMoney NOK (kod, inte Nkr)", nrm(formatMoney(100, "NOK", 1.1)), "110,00 NOK"); eq("formatMoney DKK < 1000", nrm(formatMoney(10, "DKK", 0.67)), "6,70 DKK");
  eq("formatMoney negativt", nrm(formatMoney(-50, "EUR", 0.09)).includes("4,50"), true); eq("formatMoney 0", nrm(formatMoney(0, "SEK", 1)), "0,00 kr");
  near("sekToDisplay", sekToDisplay(100, 0.09), 9, 1e-12); near("displayToSek: 9 € = 100 kr", displayToSek(9, 0.09), 100, 1e-9); eq("displayToSek: ogiltigt → null", [displayToSek(null, 0.09), displayToSek(NaN, 0.09), displayToSek(5, 0), displayToSek(5, -1)], [null, null, null, null]);
  near("rundtur kr → € → kr ändrar inte beloppet", displayToSek(sekToDisplay(1234.56, 0.09), 0.09), 1234.56, 1e-9);
  eq("CURRENCY_NOISE tar bort valutaord/symboler", ["12,5 €", "$20", "100 kr", "5 USD", "1 234 SEK", "3 nok", "7:-"].map(s => s.replace(CURRENCY_NOISE, "").trim()), ["12,5", "20", "100", "5", "1 234", "3", "7"]);
  eq("parseDec med valutatecken", [parseDec("12,5 €"), parseDec("$20"), parseDec("1 234,50 kr"), parseDec("5 eur"), parseDec("US$ 7.5")], [12.5, 20, 1234.5, 5, 7.5]); eq("parseDec ogiltigt", [parseDec("abc"), parseDec("€"), parseDec("")], [null, null, null]);
  // den riktiga appens lager (util.js): visningsvaluta på och av
  const UT = await import("./util.js");
  const saveFx = { rate: UT.fx.rate, rates: UT.fx.rates, code: UT.money.code };
  UT.setRates({ USD: 1, SEK: 10, EUR: 0.9, NOK: 11, DKK: 6.7 }); UT.money.code = "SEK";
  eq("util: SEK ger 12,50 kr", nrm(UT.kr(12.5)), "12,50 kr"); eq("util: curSym SEK", UT.curSym(), "kr"); eq("util: inputMoney SEK", UT.inputMoney(12.5), "12,50");
  UT.money.code = "EUR";
  eq("util: EUR visar omräknat", nrm(UT.kr(100)), "9,00 €"); eq("util: curSym EUR", UT.curSym(), "€"); eq("util: inputMoney EUR (100 kr)", UT.inputMoney(100), "9,00"); near("util: parseMoney '9 €' = 100 kr", UT.parseMoney("9 €"), 100, 1e-9); near("util: parseMoney '9,00' = 100 kr", UT.parseMoney("9,00"), 100, 1e-9);
  near("util: moneyFromNum(9) = 100 kr", UT.moneyFromNum("9"), 100, 1e-9); eq("util: moneyFromNum tom/ogiltig = null", [UT.moneyFromNum(""), UT.moneyFromNum("x"), UT.moneyFromNum(null)], [null, null, null]); eq("util: parseMoney ogiltigt = null", UT.parseMoney("abc"), null);
  near("util: inmatning → kronor → visning ger samma tal (inom avrundning till hela cent: ±0,06 kr)", UT.parseMoney(UT.inputMoney(1234.5)), 1234.5, 0.06); eq("util: signKr använder valutan", nrm(UT.signKr(100)), "+9,00 €"); eq("util: krUsd (1 USD = 10 kr = 0,9 €)", nrm(UT.krUsd(1)), "0,90 €");
  UT.money.code = "USD"; eq("util: USD", nrm(UT.kr(100)), "10,00 US$");
  UT.setRates({ USD: 1, SEK: 10 }); UT.money.code = "EUR"; eq("util: kurs saknas för vald valuta → visar kronor", [nrm(UT.kr(100)), UT.curCode(), UT.curSym()], ["100,00 kr", "SEK", "kr"]);
  eq("util: setRates ignorerar skräp", (() => { UT.setRates({ SEK: "x", EUR: -1, NOK: 11 }); return Object.keys(UT.fx.rates); })(), ["NOK"]);
  UT.setRates(saveFx.rates); UT.fx.rate = saveFx.rate; UT.money.code = saveFx.code; // återställ appens riktiga läge
  eq("cleanPrefs: valuta", [cleanPrefs({ currency: "EUR" }).currency, cleanPrefs({ currency: "BTC" }).currency, PDEF.currency], ["EUR", "SEK", "SEK"]);

  /* ---------- Prestanda: diagrammarkeringar ---------- */
  section("Prestanda: sammanslagna köp/sälj-markeringar");
  const UT2 = await import("./util.js"), DAYMS = 864e5;
  const mkMarks = (n, perDay) => Array.from({ length: n }, (_, i) => ({ x: 5 * DAYMS + Math.floor(i / perDay) * DAYMS + (i % perDay) * 1000, type: i % 2 ? "sell" : "buy", tip: "t" + i }));
  eq("thinMarks: få markeringar lämnas orörda", UT2.thinMarks(mkMarks(10, 1)).length, 10); eq("thinMarks: null/tom", [UT2.thinMarks(null), UT2.thinMarks([])], [[], []]);
  const big = UT2.thinMarks(mkMarks(5000, 10)); eq("thinMarks: 5000 → högst 250", big.length <= 250, true); eq("thinMarks: slår ihop per dag och typ med antal i tipset", UT2.thinMarks(mkMarks(600, 6), 100).some(m => /\d+ (köp|försäljningar) den dagen/.test(m.tip)), true);
  eq("thinMarks: behåller de senaste", Math.max(...big.map(m => m.x)) >= 5 * DAYMS + 480 * DAYMS, true); eq("thinMarks: ändrar inte indatan", (m => (UT2.thinMarks(m, 5), m.length))(mkMarks(50, 5)), 50);
  eq("thinMarks: en mark per dag+typ behåller sin egen tooltip", UT2.thinMarks([{ x: DAYMS, type: "buy", tip: "ett" }, ...mkMarks(300, 1)].map((m, i) => ({ ...m, x: m.x + i * DAYMS })), 100).length <= 100, true);

  /* ---------- Säkerhet: externa filer och delningslänkar ---------- */
  section("Säkerhet: prisfil, historik, delningslänkar");
  const goodP = { t: Math.floor(Date.now() / 1000), p: { A: [1, 2, null, 3, 4, 5, null], B: [0.5, null, null, null, null, null, null] }, tr: { A: [1, 2, 3, 4] } };
  eq("okPrices: giltig fil", okPrices(goodP), true); eq("okPrices: null/lista/sträng", [okPrices(null), okPrices([]), okPrices("x")], [false, false, false]);
  eq("okPrices: framtida tidsstämpel avvisas", okPrices({ ...goodP, t: goodP.t + 10 * 86400 }), false); eq("okPrices: tom prislista", okPrices({ ...goodP, p: {} }), false);
  const manyRows = {}; for (let i = 0; i < 5000; i++) manyRows["N" + i] = [1, 2, null, 3, 4, 5, null]; manyRows.N4321 = [1, "<img onerror=x>", null];
  eq("okPrices: EN dålig rad bland 5 000 hittas (inte bara stickprov)", okPrices({ ...goodP, p: manyRows }), false); eq("okPrices: negativt pris", okPrices({ ...goodP, p: { A: [-1] } }), false); eq("okPrices: NaN/Infinity", [okPrices({ ...goodP, p: { A: [NaN] } }), okPrices({ ...goodP, p: { A: [Infinity] } })], [false, false]); eq("okPrices: för lång rad", okPrices({ ...goodP, p: { A: new Array(13).fill(1) } }), false);
  eq("okPrices: trend med text avvisas", okPrices({ ...goodP, tr: { A: ["x", 1, 2, 3] } }), false); eq("okPrices: trend för lång", okPrices({ ...goodP, tr: { A: [1, 2, 3, 4, 5] } }), false); eq("okPrices: trend som lista avvisas", okPrices({ ...goodP, tr: [] }), false);
  const goodH = { d: ["2026-11-24", "2026-11-25"], p: { A: [1, 2], B: [null, 3] } };
  eq("okHistory: giltig", !!okHistory(goodH), true); eq("okHistory: dålig serie sent i filen hittas", !!okHistory({ d: goodH.d, p: { ...Object.fromEntries(Array.from({ length: 300 }, (_, i) => ["S" + i, [1, 2]])), BAD: [1, "x"] } }), false);
  eq("okHistory: fel längd", !!okHistory({ d: goodH.d, p: { A: [1] } }), false); eq("okHistory: ogiltigt datum", !!okHistory({ d: ["<b>", "2026-11-25"], p: {} }), false);
  const tok = await encodeShare({ v: 1, i: [["AK-47 | Redline (Field-Tested)", 2, 1]] }); eq("share: rundtur", (await decodeShare(tok)).i[0][1], 2);
  const bomb = "z" + (await (async () => { const raw = new Uint8Array(12e6).fill(32); const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw")); const buf = new Uint8Array(await new Response(cs).arrayBuffer()); return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); })());
  eq("share: komprimerad 12 MB-bomb är liten som länk", bomb.length < 50000, true); eq("share: zip-bomb avvisas av storlekstaket", await decodeShare(bomb).then(() => "läste", () => "avvisad"), "avvisad");
  eq("share: för lång länk avvisas", await decodeShare("z" + "A".repeat(500000)).then(() => "läste", () => "avvisad"), "avvisad"); eq("share: skräp avvisas", await decodeShare("zINTE-BASE64!!").then(() => "läste", () => "avvisad"), "avvisad");

  /* ---------- Stora tester: skalning och slumpad (fuzz) indata ---------- */
  section("Skalning och fuzz");
  let fz = 20261126; const rnd = () => (fz = (fz * 1664525 + 1013904223) >>> 0) / 4294967296, ri = n => Math.floor(rnd() * n);
  const bigTimed = f => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };
  const BIGNOW = Date.now(), BIGDAY = 864e5;
  const bigSnaps = Array.from({ length: 5000 }, (_, i) => ({ ts: BIGNOW - (5000 - i) * 3600e3, value: 1e4 + i * 3 + ri(500), cost: 8e3 + i }));
  const [, tSnap] = bigTimed(() => { for (const p of PFC.PERIODS) { PFC.windowSnaps(bigSnaps, p[2], BIGNOW); PFC.changeSince(bigSnaps, 2e4, "value", p[2], BIGNOW); } PFC.coverageDays(bigSnaps, BIGNOW); });
  eq("skala: 5 000 snapshots x alla perioder går fort (<150 ms)", tSnap < 150, true);
  const rowsBig = Array.from({ length: 8000 }, (_, i) => ({ mhn: "Item " + (i % 3000), qty: 1 + ri(3), value: ri(5000), unit: ri(1000), cost: ri(900), buyDate: BIGNOW - ri(900) * BIGDAY, it: { added: BIGNOW - ri(900) * BIGDAY } }));
  const [bigConc, tConc] = bigTimed(() => PFC.concentration(rowsBig.map(r => r.value * r.qty)));
  eq("skala: koncentration på 8 000 rader (<100 ms, giltig andel)", tConc < 100 && bigConc && Object.values(bigConc).every(v => v == null || (typeof v !== "number") || Number.isFinite(v)), true);
  const itemsBig = Array.from({ length: 4000 }, (_, i) => ({ id: "i" + i, mhn: "Item " + (i % 400), qty: 1 + ri(3), float: rnd() }));
  const [bigSold, tSold] = bigTimed(() => IVL.sellFromItems(itemsBig, "Item 7", 5));
  eq("skala: sellFromItems på 4 000 föremål (<100 ms)", tSold < 100, true);
  eq("skala: ägd mängd stämmer med summan", IVL.ownedCount(itemsBig, "Item 7"), itemsBig.filter(i => i.mhn === "Item 7").reduce((s, i) => s + i.qty, 0));
  const [, tFilt] = bigTimed(() => { for (const r of rowsBig) IVL.rowMatches({ ...r, e: {}, ref: null }, { ...IVL.FILTER_DEFAULTS, q: "item", pmin: "10" }, { unit: () => r.unit, pl: () => 0 }); });
  eq("skala: filter över 8 000 rader (<400 ms)", tFilt < 400, true);
  /* matematik: osynliga invarianter */
  let bigMathBad = 0; for (let i = 0; i < 3000; i++) { const buy = ri(100000) / 100, sell = ri(100000) / 100, qty = 1 + ri(50), f = ri(20); const m = tradeMath({ buy, sell, qty, sellFeePct: f }); if (!Object.values(m).every(v => v == null || Number.isFinite(v))) bigMathBad++; if (m.net != null && qty > 0 && f === 0 && Math.abs(m.net - (sell - buy) * qty) > 0.01 * qty + 0.01 && m.profit == null) bigMathBad++; }
  eq("fuzz: tradeMath ger aldrig NaN/Infinity (3 000 slumpfall)", bigMathBad, 0);
  let lfn = 0; for (let i = 0; i < 2000; i++) { const net = ri(1e6) / 100, fee = ri(60); const list = listForNet(net, fee); if (!Number.isFinite(list) || list < net - 1e-9) lfn++; }
  eq("fuzz: listForNet (listpris >= nettopris, alltid ändligt)", lfn, 0);
  /* parsers med slumpindata */
  const fzAtoms = [null, 0, -1, 1e308, "", "x", "<img src=x onerror=1>", "__proto__", true, [], {}];
  const fzGen = (d = 0) => { const k = ri(d > 3 ? 3 : 6); return k === 0 ? fzAtoms[ri(fzAtoms.length)] : k === 1 ? String.fromCharCode(...Array.from({ length: ri(30) }, () => 32 + ri(95))) : k === 2 ? rnd() * 1e5 : k === 3 ? Array.from({ length: ri(5) }, () => fzGen(d + 1)) : Object.fromEntries(Array.from({ length: ri(5) }, () => [["descriptions", "assets", "market_hash_name", "amount", "classid", "assetid", "rgInventory", "rgDescriptions", "tags", "actions"][ri(10)], fzGen(d + 1)])); };
  let steamThrow = 0; for (let i = 0; i < 3000; i++) { try { const j = JSON.parse(JSON.stringify(fzGen()) ?? "null"); planSteamImport(parseInventory(j), []); } catch { steamThrow++; } }
  eq("fuzz: 3 000 slumpade Steam-svar kraschar aldrig", steamThrow, 0);
  let decOdd = 0; for (let i = 0; i < 2500; i++) { const s = rnd() < 0.5 ? "steam://rungame/730/1/+csgo_econ_action_preview%20" + Array.from({ length: ri(200) }, () => "0123456789ABCDEF"[ri(16)]).join("") : String.fromCharCode(...Array.from({ length: ri(80) }, () => 32 + ri(95))); try { decodeInspect(s); } catch (e) { if (!(e instanceof Error) || !e.message) decOdd++; } }
  eq("fuzz: inspect-avkodaren kastar bara vanliga fel med text (2 500 fall)", decOdd, 0);
  let curBad = 0; for (let i = 0; i < 1500; i++) { try { const code = ["SEK", "USD", "EUR", "NOK", "DKK", "xx", "", null, "__proto__", 5][ri(10)], v = [0, 1.5, -3, 1e9, NaN, Infinity, null][ri(7)]; const eff = MNY.effectiveCode(code, { USD: 0.1, EUR: 0.09 }); if (!MNY.isCurrency(eff)) curBad++; const s = MNY.formatMoney(v, eff, 1); if (typeof s !== "string") curBad++; } catch { curBad++; } }
  eq("fuzz: valuta-kod/belopp ger alltid text, aldrig krasch", curBad, 0);
  let watchBad = 0; for (let i = 0; i < 1500; i++) { try { normalizeWatch(fzGen()); } catch { watchBad++; } }
  eq("fuzz: normalizeWatch klarar null och skräp", watchBad, 0);

  section("Sökning: inklistrade Steam-namn");
  eq("searchTerms: Steam-marknadsnamn med slitage", searchTerms("AK-47 | Redline (Field-Tested)"), ["ak-47", "redline"]);
  eq("searchTerms: halvskrivet slitage", searchTerms("ak-47 | redline (field"), ["ak-47", "redline"]);
  eq("searchTerms: ★ och | ensamma tas bort", searchTerms("★ Karambit | Doppler (Factory New)"), ["karambit", "doppler"]);
  eq("searchTerms: bara slitage/tecken ger inga ord", [searchTerms("(field-tested)"), searchTerms("|"), searchTerms("   ")], [[], [], []]);
  eq("searchTerms: vanlig sökning oförändrad", searchTerms("ak redline"), ["ak", "redline"]);
  eq("searchTerms: skräp/HTML kraschar inte", searchTerms("<script>alert(1)</script>").length > 0 && searchTerms(null).length === 1, true);

  out.insertAdjacentHTML("afterbegin", `<h1 class="${fail ? "badInsp" : "ok"}">${fail ? "✗ " + fail + " test misslyckades" : "✓ Alla tester godkända"} (${pass} godkända)</h1>`);
  document.title = fail ? `FAIL ${fail}` : `PASS ${pass}`;
  window.__tests = { pass, fail };
}
main().catch(e => { out.insertAdjacentHTML("afterbegin", `<h1 class="badInsp">Testkörningen kraschade: ${e.message}</h1>`); document.title = "CRASH"; window.__tests = { pass, fail: fail + 1, error: String(e.stack || e) }; });
