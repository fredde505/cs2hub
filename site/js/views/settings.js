import { $, esc, toast, confirmBox, fmtDateTime, ago, dec, parseDec, parseMoney, inputMoney, curSym, curCode, fx, download } from "../util.js";
import { all, getKV, setKV, clear } from "../store.js";
import { restoreFromFile, undoLastRestore, safetyInfo } from "./backup-ui.js";
import { D, MARKETS, settings, saveSettings, setPriceMode, refreshLive, DEFAULT_FEES } from "../data.js";
import { STEAM_PROXY } from "../config.js";
import { backupNow } from "../upkeep.js";
import { pageHead } from "./common.js";
import { getPrefs, savePrefs, resetPrefs } from "../prefs.js";

// Etiketter för utseende- och beteendeinställningarna (värdena och giltiga alternativ ligger i prefs-core.js)
const PREF_UI = [
  ["theme", "Tema", [["dark", "Mörkt (standard)"], ["light", "Ljust"], ["system", "Följ systemet"]]],
  ["density", "Täthet", [["normal", "Normal"], ["compact", "Kompakt (mindre avstånd, mer på skärmen)"]]],
  ["cards", "Kortstorlek i listor", [["small", "Små"], ["normal", "Normala"], ["large", "Stora"]]],
  ["imageQuality", "Bildkvalitet", [["low", "Låg (sparar data)"], ["normal", "Normal"], ["high", "Hög (skarpare)"]]],
  ["motion", "Animationer", [["auto", "Följ systemets inställning"], ["on", "På"], ["off", "Av"]]],
  ["invView", "Inventory: standardvy", [["cards", "Bildkort"], ["table", "Tabell"]]],
  ["invTab", "Inventory: startflik", [["holdings", "Innehav"], ["trades", "Transaktioner"], ["profit", "Vinst per föremål"], ["sell", "Var sälja"], ["portfolio", "Portfolio"], ["analysis", "Analys"]]],
  ["invSort", "Inventory: standardsortering", [["value", "Värde ↓"], ["name", "Namn"], ["pl", "Vinst ↓"], ["plr", "Förlust ↓"], ["float", "Float ↑"]]],
  ["invMode", "Inventory: värdera som", [["cash", "Riktiga pengar (netto)"], ["steam", "Steam-krediter"]]],
  ["currency", "Visningsvaluta", [["SEK", "Svenska kronor (SEK)"], ["USD", "US-dollar (USD)"], ["EUR", "Euro (EUR)"], ["NOK", "Norska kronor (NOK)"], ["DKK", "Danska kronor (DKK)"]]],
  ["calcMarket", "Standardmarknad i Price Calculator", [["csfloat", "CSFloat"], ["skinport", "Skinport"], ["csmoney", "CS.MONEY"], ["buff163", "BUFF163"], ["swapgg", "Swap.gg"], ["steam", "Steam Market"]]],
];

/** Inställningar: allt som tidigare låg utspritt (prisläge, avgifter, backup, proxy, rensa data). */
export async function renderSettings(root) {
  const [items, trades, loadouts, snaps, watch] = await Promise.all([all("items"), all("trades"), all("loadouts"), all("snapshots"), all("watch")]);
  const safety = await safetyInfo();
  const lastBackup = await getKV("lastBackup", 0), proxy = await getKV("proxyUrl", "") || STEAM_PROXY;
  const ver = await fetch("version.txt", { cache: "no-store" }).then(r => r.ok ? r.text() : "").catch(() => "");
  const feeRow = m => `<tr><td>${esc(m.name)}</td><td class="r"><input class="inp" data-fee="${m.key}" type="text" inputmode="decimal" value="${dec(m.fee * 100, 1).replace(/\s/g, "")}" style="width:84px;text-align:right" aria-label="Avgift ${esc(m.name)} i procent"> %</td><td class="muted small">${m.real ? "Riktiga pengar" : "Steam-krediter"}</td></tr>`;
  const sec = (title, body) => `<div class="panel" style="margin-bottom:14px"><h2>${title}</h2>${body}</div>`;
  const pr = getPrefs();
  const prefSel = ([k, l, opts]) => `<label>${esc(l)}<select class="inp" data-pref="${k}">${opts.map(([v, t]) => `<option value="${v}" ${pr[k] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  root.innerHTML = `${pageHead("Inställningar", "Allt sparas i den här webbläsaren – inget skickas till någon server.")}
    ${sec("Utseende och beteende", `<div class="form" style="max-width:720px">${PREF_UI.map(prefSel).join("")}
      <label>Standard lägsta pris (${curSym()}) i Dagens fynd och Investeringsradar<input class="inp" id="pminkr" type="text" inputmode="decimal" placeholder="standard för respektive sida" value="${pr.minKr != null ? esc(inputMoney(pr.minKr, 2)) : ""}"></label>
      <label style="grid-auto-flow:column;justify-content:start;align-items:center;gap:8px"><input type="checkbox" id="pnotif" ${pr.notifications ? "checked" : ""}> Notiser och bevakningsbanner (när sidan är öppen)</label></div>
      <div class="row" style="margin-top:12px"><button class="btn ghost sm" id="prefReset">Återställ utseende och beteende</button></div>
      <p class="muted small" style="margin-bottom:0">Det här ändrar bara hur sidan ser ut och beter sig – aldrig din sparade data, dina priser eller dina transaktioner. Inställningarna sparas lokalt och följer med i backup. Visningsvaluta: belopp visas omräknade med dagens kurs (${curCode() === "SEK" ? "kronor" : curCode()}), och belopp du skriver in tolkas i den valda valutan. Allt du sparar (inköp, försäljningar, avgifter, målpriser, budgetar) lagras alltid i kronor och ändras aldrig av valutavalet – så samma belopp kan visas olika när kursen ändras.</p>`)}
    ${sec("Priser", `<div class="form" style="max-width:520px"><label>Vilket pris ska visas?<select class="inp" id="pm"><option value="market" ${settings.priceMode === "market" ? "selected" : ""}>Lägsta marknadspris (rekommenderas)</option><option value="steam" ${settings.priceMode === "steam" ? "selected" : ""}>Steam Market-pris</option></select></label>
      <label>Steam-krediter räknas som (%) av riktiga pengar<input class="inp" id="c2c" type="text" inputmode="decimal" value="${Math.round(settings.creditToCash * 100)}"></label></div>
      <div class="scroll-x" style="margin-top:12px"><table class="tbl"><thead><tr><th>Marknad</th><th class="r">Avgift när du säljer</th><th></th></tr></thead><tbody>${MARKETS.map(feeRow).join("")}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn ghost sm" id="feeReset">Återställ standardavgifter</button><button class="btn ghost sm" id="priceNow">Hämta nya priser nu</button><span class="muted small" id="priceInfo">${D.priceAge ? "Priser från " + esc(fmtDateTime(D.priceAge)) + " (" + esc(ago(D.priceAge)) + ")" : "Ingen prisdata"}</span></div>
      <p class="muted small">Avgifterna används för nettovärdet (vad du får ut). De ändras ibland hos marknaderna – justera här om något stämmer dåligt.</p>`)}
    ${sec("Backup och data", `<p class="small" style="margin-top:0">Du har <b>${items.length}</b> föremål, <b>${trades.length}</b> transaktioner, <b>${loadouts.length}</b> loadouts, <b>${watch.length}</b> bevakningar och <b>${snaps.length}</b> värdepunkter. Datan finns <b>bara här i webbläsaren</b> – ta backup ibland och innan du rensar webbläsardata.</p>
      <div class="row"><button class="btn" id="bk">Ladda ner backup</button><label class="btn ghost" style="cursor:pointer">Återställ från fil<input type="file" id="bkIn" accept=".json,application/json" hidden></label>${safety ? `<button class="btn ghost" id="bkUndo" title="Går tillbaka till läget precis före senaste återställning eller Steam-import">Ångra senaste återställning/import</button>` : ""}<span class="muted small">${lastBackup ? "Senaste backup: " + esc(fmtDateTime(lastBackup)) + " (" + esc(ago(lastBackup)) + ")" : "Ingen backup tagen än"}</span></div>
      <p class="muted small" style="margin-bottom:0">Backupen har versionsnummer och en kontrollsumma, och granskas med en förhandsvisning innan något ändras. En trasig eller manipulerad fil kan aldrig ersätta din fungerande data. Proxy-adressen sparas inte i backuper av säkerhetsskäl.</p>
      <div class="row" style="margin-top:14px"><button class="btn ghost danger" id="wipe">Rensa all min data…</button><span class="muted small">Tar bort inventory, transaktioner, loadouts och bevakningar från den här webbläsaren.</span></div>`)}
    ${sec("Steam-import", `<div class="form" style="max-width:520px"><label>Adress till din Steam-proxy<input class="inp" id="px" value="${esc(proxy)}" placeholder="https://din-proxy.workers.dev" autocomplete="off"></label></div><p class="muted small">Behövs för att hämta ditt Steam-inventory. Se DEPLOY.md för hur du skapar den.</p>`)}
    ${sec("Appen", `<div class="row"><button class="btn ghost" id="reload">Rensa cache och ladda om</button></div><p class="muted small" style="margin-bottom:0">Version: ${esc((ver || "okänd").trim().slice(0, 14))} · Databas: ${D.skins.length.toLocaleString("sv-SE")} skins · Du kan installera sidan som app via webbläsarens meny (”Installera” / ”Lägg till på hemskärmen”).</p>`)}`;

  root.querySelectorAll("[data-pref]").forEach(s => s.addEventListener("change", async () => { await savePrefs({ [s.dataset.pref]: s.value }); toast("Inställningen sparad"); if (s.dataset.pref === "currency") setTimeout(() => location.reload(), 400); /* ladda om så att alla fält och listor visar och tolkar belopp i nya valutan */ }));
  $("#pminkr", root).addEventListener("change", async e => { const raw = e.target.value.trim(), v = raw === "" ? null : parseMoney(raw); if (raw !== "" && (v == null || v < 0)) { toast("Ange ett belopp, t.ex. 100"); e.target.value = getPrefs().minKr != null ? inputMoney(getPrefs().minKr, 2) : ""; return; } await savePrefs({ minKr: v }); toast("Inställningen sparad"); });
  $("#pnotif", root).addEventListener("change", async e => { await savePrefs({ notifications: e.target.checked }); toast(e.target.checked ? "Notiser på" : "Notiser av"); });
  $("#prefReset", root).addEventListener("click", async () => { await resetPrefs(); toast("Återställt"); renderSettings(root); });
  $("#pm", root).addEventListener("change", async e => { await setPriceMode(e.target.value); toast("Prisläge sparat"); const sel = $("#priceMode"); if (sel) sel.value = settings.priceMode; });
  $("#c2c", root).addEventListener("change", async e => { const v = parseDec(e.target.value); if (v >= 1 && v <= 100) { settings.creditToCash = v / 100; await saveSettings(); toast("Sparat"); } else toast("Ange ett värde mellan 1 och 100"); });
  root.querySelectorAll("[data-fee]").forEach(i => i.addEventListener("change", async () => {
    const m = MARKETS.find(x => x.key === i.dataset.fee), v = parseDec(i.value);
    if (v != null && v >= 0 && v <= 50) { m.fee = v / 100; await saveSettings(); toast("Avgift sparad"); } else { toast("Ange en avgift mellan 0 och 50 %"); i.value = dec(m.fee * 100, 1).replace(/\s/g, ""); }
  }));
  $("#feeReset", root).addEventListener("click", async () => { MARKETS.forEach(m => m.fee = DEFAULT_FEES[m.key]); settings.creditToCash = 0.7; await saveSettings(); toast("Standardavgifter återställda"); renderSettings(root); });
  $("#priceNow", root).addEventListener("click", async e => { e.target.disabled = true; $("#priceInfo", root).textContent = "Hämtar…"; const ok = await refreshLive(() => { }, true); $("#priceInfo", root).textContent = D.priceAge ? "Priser från " + fmtDateTime(D.priceAge) + (ok ? "" : " (ingen nyare finns)") : "Ingen prisdata"; e.target.disabled = false; });
  $("#bk", root).addEventListener("click", async () => { await backupNow(); toast("Backup sparad som fil"); renderSettings(root); });
  $("#bkIn", root).addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; await restoreFromFile(f, () => renderSettings(root)); });
  $("#bkUndo", root)?.addEventListener("click", () => undoLastRestore(() => renderSettings(root)));
  $("#wipe", root).addEventListener("click", async () => {
    if (!await confirmBox(`Ta bort ALL din data (${items.length} föremål, ${trades.length} transaktioner, ${loadouts.length} loadouts)? Det går inte att ångra. Ta en backup först om du är osäker.`, { ok: "Fortsätt", danger: true })) return;
    if (!await confirmBox("Är du helt säker? Allt raderas permanent från den här webbläsaren.", { ok: "Ja, radera allt", danger: true })) return;
    for (const s of ["items", "trades", "loadouts", "snapshots", "watch"]) await clear(s);
    await setKV("crafts", []); toast("All data borttagen"); renderSettings(root);
  });
  $("#px", root).addEventListener("change", async e => { const v = e.target.value.trim(); if (v && !/^https:\/\/[\w.-]+(:\d+)?\/?$/.test(v)) return toast("Adressen ska se ut som https://namn.workers.dev"); await setKV("proxyUrl", v.replace(/\/$/, "")); toast("Proxy-adress sparad"); });
  $("#reload", root).addEventListener("click", async () => {
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch { /* ignorera */ }
    location.reload();
  });
}
