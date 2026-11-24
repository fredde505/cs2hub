import { $, esc, toast, confirmBox, fmtDateTime, ago, dec, parseDec, download } from "../util.js";
import { all, getKV, setKV, clear, importAll } from "../store.js";
import { D, MARKETS, settings, saveSettings, setPriceMode, refreshLive, DEFAULT_FEES } from "../data.js";
import { STEAM_PROXY } from "../config.js";
import { backupNow } from "../upkeep.js";
import { pageHead } from "./common.js";

/** Inställningar: allt som tidigare låg utspritt (prisläge, avgifter, backup, proxy, rensa data). */
export async function renderSettings(root) {
  const [items, trades, loadouts, snaps, watch] = await Promise.all([all("items"), all("trades"), all("loadouts"), all("snapshots"), all("watch")]);
  const lastBackup = await getKV("lastBackup", 0), proxy = await getKV("proxyUrl", "") || STEAM_PROXY;
  const ver = await fetch("version.txt", { cache: "no-store" }).then(r => r.ok ? r.text() : "").catch(() => "");
  const feeRow = m => `<tr><td>${esc(m.name)}</td><td class="r"><input class="inp" data-fee="${m.key}" type="text" inputmode="decimal" value="${dec(m.fee * 100, 1).replace(/\s/g, "")}" style="width:84px;text-align:right" aria-label="Avgift ${esc(m.name)} i procent"> %</td><td class="muted small">${m.real ? "Riktiga pengar" : "Steam-krediter"}</td></tr>`;
  const sec = (title, body) => `<div class="panel" style="margin-bottom:14px"><h2>${title}</h2>${body}</div>`;
  root.innerHTML = `${pageHead("Inställningar", "Allt sparas i den här webbläsaren – inget skickas till någon server.")}
    ${sec("Priser", `<div class="form" style="max-width:520px"><label>Vilket pris ska visas?<select class="inp" id="pm"><option value="market" ${settings.priceMode === "market" ? "selected" : ""}>Lägsta marknadspris (rekommenderas)</option><option value="steam" ${settings.priceMode === "steam" ? "selected" : ""}>Steam Market-pris</option></select></label>
      <label>Steam-krediter räknas som (%) av riktiga pengar<input class="inp" id="c2c" type="text" inputmode="decimal" value="${Math.round(settings.creditToCash * 100)}"></label></div>
      <div class="scroll-x" style="margin-top:12px"><table class="tbl"><thead><tr><th>Marknad</th><th class="r">Avgift när du säljer</th><th></th></tr></thead><tbody>${MARKETS.map(feeRow).join("")}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn ghost sm" id="feeReset">Återställ standardavgifter</button><button class="btn ghost sm" id="priceNow">Hämta nya priser nu</button><span class="muted small" id="priceInfo">${D.priceAge ? "Priser från " + esc(fmtDateTime(D.priceAge)) + " (" + esc(ago(D.priceAge)) + ")" : "Ingen prisdata"}</span></div>
      <p class="muted small">Avgifterna används för nettovärdet (vad du får ut). De ändras ibland hos marknaderna – justera här om något stämmer dåligt.</p>`)}
    ${sec("Backup och data", `<p class="small" style="margin-top:0">Du har <b>${items.length}</b> föremål, <b>${trades.length}</b> transaktioner, <b>${loadouts.length}</b> loadouts, <b>${watch.length}</b> bevakningar och <b>${snaps.length}</b> värdepunkter. Datan finns <b>bara här i webbläsaren</b> – ta backup ibland och innan du rensar webbläsardata.</p>
      <div class="row"><button class="btn" id="bk">Ladda ner backup</button><label class="btn ghost" style="cursor:pointer">Återställ från fil<input type="file" id="bkIn" accept=".json,application/json" hidden></label><span class="muted small">${lastBackup ? "Senaste backup: " + esc(fmtDateTime(lastBackup)) + " (" + esc(ago(lastBackup)) + ")" : "Ingen backup tagen än"}</span></div>
      <div class="row" style="margin-top:14px"><button class="btn ghost danger" id="wipe">Rensa all min data…</button><span class="muted small">Tar bort inventory, transaktioner, loadouts och bevakningar från den här webbläsaren.</span></div>`)}
    ${sec("Steam-import", `<div class="form" style="max-width:520px"><label>Adress till din Steam-proxy<input class="inp" id="px" value="${esc(proxy)}" placeholder="https://din-proxy.workers.dev" autocomplete="off"></label></div><p class="muted small">Behövs för att hämta ditt Steam-inventory. Se DEPLOY.md för hur du skapar den.</p>`)}
    ${sec("Appen", `<div class="row"><button class="btn ghost" id="reload">Rensa cache och ladda om</button></div><p class="muted small" style="margin-bottom:0">Version: ${esc((ver || "okänd").trim().slice(0, 14))} · Databas: ${D.skins.length.toLocaleString("sv-SE")} skins · Du kan installera sidan som app via webbläsarens meny (”Installera” / ”Lägg till på hemskärmen”).</p>`)}`;

  $("#pm", root).addEventListener("change", async e => { await setPriceMode(e.target.value); toast("Prisläge sparat"); const sel = $("#priceMode"); if (sel) sel.value = settings.priceMode; });
  $("#c2c", root).addEventListener("change", async e => { const v = parseDec(e.target.value); if (v >= 1 && v <= 100) { settings.creditToCash = v / 100; await saveSettings(); toast("Sparat"); } else toast("Ange ett värde mellan 1 och 100"); });
  root.querySelectorAll("[data-fee]").forEach(i => i.addEventListener("change", async () => {
    const m = MARKETS.find(x => x.key === i.dataset.fee), v = parseDec(i.value);
    if (v != null && v >= 0 && v <= 50) { m.fee = v / 100; await saveSettings(); toast("Avgift sparad"); } else { toast("Ange en avgift mellan 0 och 50 %"); i.value = dec(m.fee * 100, 1).replace(/\s/g, ""); }
  }));
  $("#feeReset", root).addEventListener("click", async () => { MARKETS.forEach(m => m.fee = DEFAULT_FEES[m.key]); settings.creditToCash = 0.7; await saveSettings(); toast("Standardavgifter återställda"); renderSettings(root); });
  $("#priceNow", root).addEventListener("click", async e => { e.target.disabled = true; $("#priceInfo", root).textContent = "Hämtar…"; const ok = await refreshLive(() => { }, true); $("#priceInfo", root).textContent = D.priceAge ? "Priser från " + fmtDateTime(D.priceAge) + (ok ? "" : " (ingen nyare finns)") : "Ingen prisdata"; e.target.disabled = false; });
  $("#bk", root).addEventListener("click", async () => { await backupNow(); toast("Backup sparad som fil"); renderSettings(root); });
  $("#bkIn", root).addEventListener("change", async e => {
    try { const data = JSON.parse(await e.target.files[0].text()); if (!await confirmBox("Detta ersätter all lokal data (inventory, transaktioner, loadouts m.m.). Fortsätta?", { ok: "Ersätt", danger: true })) return; await importAll(data); toast("Backup återställd"); renderSettings(root); } catch (err) { toast("Kunde inte läsa filen: " + err.message); }
  });
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
