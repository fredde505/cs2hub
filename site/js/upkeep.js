// Underhåll i bakgrunden: "ny version finns", gamla priser och påminnelse om backup.
import { $, toast, download, fmtDateTime, ago } from "./util.js";
import { all, getKV, setKV, exportAll } from "./store.js";
import { D } from "./data.js";

const bar = (id, html) => {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("div"); el.id = id; el.className = "netbanner"; el.setAttribute("role", "status"); $("#netBanner").after(el); }
  el.innerHTML = html; el.hidden = false; return el;
};
const hide = id => { const el = document.getElementById(id); if (el) el.hidden = true; };

/* ---- Ny version: version.txt skrivs av Cloudflare-bygget; ändras den medan sidan är öppen erbjuds omladdning ---- */
export function initUpdateCheck() {
  let base = null, last = 0;
  const read = async () => { try { const r = await fetch("version.txt?" + Date.now(), { cache: "no-store" }); return r.ok ? (await r.text()).trim() : null; } catch { return null; } };
  const check = async () => {
    last = Date.now(); const v = await read();
    if (v == null) return;
    if (base == null) { base = v; return; }
    if (v !== base) {
      const el = bar("verBanner", `Det finns en ny version av CS2 Hub. <button class="btn sm" id="verGo" style="margin-left:8px">Uppdatera nu</button>`);
      el.querySelector("#verGo").addEventListener("click", async () => {
        try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch { /* ignorera */ }
        location.reload();
      });
    }
  };
  check();
  setInterval(check, 10 * 60e3);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - last > 5 * 60e3) check(); });
}

/* ---- Priserna är gamla (prisjobbet kan ha stannat) ---- */
export function checkPriceAge() {
  if (!D.priceAge) return hide("ageBanner");
  const h = (Date.now() - D.priceAge) / 3600e3;
  if (h > 24) bar("ageBanner", `Priserna är ca ${h < 48 ? Math.round(h) + " timmar" : Math.round(h / 24) + " dagar"} gamla (senast uppdaterade ${fmtDateTime(D.priceAge)}). Värden och vinster kan avvika från marknaden just nu.`);
  else hide("ageBanner");
}

/* ---- Påminnelse om backup: datan finns bara i den här webbläsaren ---- */
export async function backupNow() {
  download("cs2hub-backup.json", JSON.stringify(await exportAll()));
  await setKV("lastBackup", Date.now());
}
export async function checkBackupReminder() {
  const now = Date.now();
  let first = await getKV("firstSeen", 0); if (!first) { first = now; await setKV("firstSeen", now); }
  const [items, trades, loadouts, crafts] = [await all("items"), await all("trades"), await all("loadouts"), await getKV("crafts", [])];
  const amount = trades.length + loadouts.length + crafts.length + (items.length > 10 ? items.length : 0);
  if (amount < 3 || now - first < 3 * 864e5) return;
  const lastBackup = await getKV("lastBackup", 0), snooze = await getKV("backupSnooze", 0);
  if ((lastBackup && now - lastBackup < 30 * 864e5) || now < snooze) return;
  const el = bar("bkBanner", `Din data finns bara i den här webbläsaren (${trades.length} transaktioner, ${items.length} föremål, ${loadouts.length} loadouts). ${lastBackup ? "Senaste backup " + ago(lastBackup) + "." : "Du har ingen backup än."} <button class="btn sm" id="bkGo" style="margin-left:8px">Ta backup nu</button> <button class="btn ghost sm" id="bkLater">Påminn senare</button>`);
  el.querySelector("#bkGo").addEventListener("click", async () => { await backupNow(); hide("bkBanner"); toast("Backup sparad som fil"); });
  el.querySelector("#bkLater").addEventListener("click", async () => { await setKV("backupSnooze", now + 14 * 864e5); hide("bkBanner"); });
}
