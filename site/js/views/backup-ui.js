import { esc, modal, toast, notice, confirmBox, fmtDateTime, download } from "../util.js";
import { readStores, applyStores, saveSafety, getSafety, exportAll, setKV } from "../store.js";
import { validateBackup, planImport, payloadFor, BACKUP_STORES, STORE_LABEL } from "../backup-core.js";

/** Backup med ett klick: fil med datum i namnet, format 2 och kontrollsumma. */
export async function backupNow() {
  const b = await exportAll();
  download(`cs2hub-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b));
  await setKV("lastBackup", Date.now());
  return b;
}

const DATA_STORES = ["items", "trades", "watch", "loadouts"];
const hasData = cur => DATA_STORES.some(k => cur[k]?.length);

/** Läser en vald backupfil, granskar den och visar en förhandsvisning innan något ändras. */
export async function restoreFromFile(file, onDone = () => { }) {
  if (!file) return;
  if (file.size > 60e6) return notice("Filen är för stor för att vara en backup (över 60 MB).");
  let raw; try { raw = JSON.parse(await file.text()); } catch { return notice("Filen går inte att läsa som JSON – den är skadad eller inte en backup. Din data har inte ändrats."); }
  const v = await validateBackup(raw);
  if (!v.ok) return notice(v.errors.join(" ") + " Din data har inte ändrats.");
  const current = await readStores();
  preview(v, current, onDone);
}

function preview(v, current, onDone) {
  const local = hasData(current);
  const plans = { merge: planImport(v.clean, current, "merge"), replace: planImport(v.clean, current, "replace") };
  let mode = local ? "merge" : "replace";
  const csTxt = { ok: "✓ Kontrollsumman stämmer", none: "Ingen kontrollsumma (äldre backup)", unsupported: "Kontrollsumma kunde inte kontrolleras", mismatch: "✗ Kontrollsumman stämmer inte" }[v.checksum];
  const body = () => {
    const p = plans[mode];
    return `<table class="tbl"><thead><tr><th>Typ</th><th class="r">I filen</th><th class="r">Nya</th><th class="r">${mode === "merge" ? "Finns redan (behålls)" : "Skrivs över"}</th><th class="r">Oförändrade</th>${mode === "replace" ? '<th class="r">Tas bort</th>' : ""}</tr></thead><tbody>
      ${BACKUP_STORES.filter(k => k !== "kv").map(k => `<tr><td>${STORE_LABEL[k]}</td><td class="r num">${p[k].file}</td><td class="r num ${p[k].add ? "pos" : ""}">${p[k].add}</td><td class="r num">${mode === "merge" ? p[k].skipped : p[k].replaced}</td><td class="r num">${p[k].same}</td>${mode === "replace" ? `<td class="r num ${p[k].remove ? "neg" : ""}">${p[k].remove}</td>` : ""}</tr>`).join("")}</tbody></table>`;
  };
  const html = `<h3 style="margin-top:0">Återställ från backup</h3>
    <p class="small muted" style="margin-top:0">Skapad ${esc(v.exported ? fmtDateTime(v.exported) : "okänt datum")} · format v${v.format} · ${esc(csTxt)}</p>
    ${v.notes.map(n => `<p class="small" style="margin:6px 0">ℹ ${esc(n)}</p>`).join("")}
    ${v.warnings.map(n => `<p class="small" style="margin:6px 0;color:#d9b36a">⚠ ${esc(n)}</p>`).join("")}
    <div class="seg" id="rsMode" style="margin:10px 0"><button data-m="merge" class="${mode === "merge" ? "on" : ""}">Slå ihop</button><button data-m="replace" class="${mode === "replace" ? "on" : ""}">Ersätt allt</button></div>
    <p class="small muted" id="rsHelp" style="margin:0 0 10px"></p>
    <div class="scroll-x" id="rsTable"></div>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" data-close>Avbryt</button><button class="btn" id="rsGo">Återställ</button></div>`;
  modal(html, {
    wide: true, onMount: (box, close) => {
      const help = { merge: "Lägger bara till det som saknas hos dig. Det du redan har ändras inte, och dina inställningar behålls.", replace: "Ersätter ditt inventory, dina transaktioner, bevakningar och loadouts med filens innehåll. En säkerhetskopia av nuläget sparas först så att du kan ångra." };
      const paint = () => { box.querySelector("#rsTable").innerHTML = body(); box.querySelector("#rsHelp").textContent = help[mode]; box.querySelectorAll("#rsMode button").forEach(b => b.classList.toggle("on", b.dataset.m === mode)); box.querySelector("#rsGo").classList.toggle("danger-solid", mode === "replace" && local); };
      box.querySelectorAll("#rsMode button").forEach(b => b.addEventListener("click", () => { mode = b.dataset.m; paint(); }));
      paint();
      box.querySelector("#rsGo").addEventListener("click", async e => {
        e.target.disabled = true;
        try {
          if (mode === "replace" && local) {
            const p = plans.replace, rem = DATA_STORES.reduce((n, k) => n + p[k].remove, 0);
            if (!await confirmBox(`Ersätta din data med backupen? ${rem ? rem + " poster som inte finns i filen tas bort. " : ""}Ett säkerhetskopia av nuläget sparas så att du kan ångra.`, { ok: "Ersätt", danger: true })) { e.target.disabled = false; return; }
          }
          if (local) await saveSafety();
          await applyStores(payloadFor(v.clean, current, mode), { replace: mode === "replace" });
          close(); toast(mode === "merge" ? "Backup sammanslagen" : "Backup återställd"); onDone();
        } catch (err) { e.target.disabled = false; notice("Återställningen misslyckades: " + err.message); }
      });
    },
  });
}

/** Ångra senaste återställning (säkerhetskopian som sparades precis före den). */
export async function undoLastRestore(onDone = () => { }) {
  const s = await getSafety();
  if (!s) return notice("Det finns ingen säkerhetskopia att ångra till.");
  const v = await validateBackup(s.data);
  if (!v.ok) return notice("Säkerhetskopian är skadad och kan inte användas: " + v.errors.join(" "));
  if (!await confirmBox(`Ångra återställningen och gå tillbaka till läget ${fmtDateTime(s.t)}?`, { ok: "Ångra", danger: true })) return;
  try { await applyStores(payloadFor(v.clean, {}, "replace"), { replace: true }); toast("Tillbaka till läget före återställningen"); onDone(); } catch (err) { notice("Det gick inte: " + err.message); }
}
export const safetyInfo = async () => { const s = await getSafety(); return s ? s.t : null; };
