import { esc, modal, toast, uid, confirmBox } from "../util.js";
import { all, getKV, setKV, applyStores, saveSafety } from "../store.js";
import { lookup } from "../data.js";
import { STEAM_PROXY } from "../config.js";
import { parseInventory, planSteamImport } from "../steam-core.js";

// Integritet: inga tredjeparts-proxyer. Ditt Steam-ID skickas bara till din egen proxy (som i sin tur frågar Steam).
const okProxy = u => /^https:\/\/[\w.-]+(:\d+)?\/?$/.test(u);
let workerUrl = STEAM_PROXY;

/** Anrop till proxyn. Returnerar { status, json } eller null om proxyn inte kunde nås (offline, fel adress) eller anropet avbröts. */
async function workerGet(path, signal) {
  if (!workerUrl || !okProxy(workerUrl)) return null;
  try {
    const r = await fetch(workerUrl.replace(/\/+$/, "") + path, { cache: "no-store", signal });
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch { return null; }
}

async function resolveSteamId(input, signal) {
  input = input.trim();
  let m = input.match(/(\d{17})/); if (m) return { id: m[1] };
  m = input.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i) || (/^[\w-]{2,32}$/.test(input) ? [null, input] : null);
  if (!m) return { error: "Hittade inget SteamID – klistra in en /profiles/-länk eller ditt 17-siffriga SteamID64." };
  const w = await workerGet("/resolve?name=" + encodeURIComponent(m[1]), signal);
  if (w?.json?.id) return { id: w.json.id };
  if (!w) return { error: "Kunde inte nå proxyn för att slå upp namnet. Använd ett 17-siffrigt SteamID64 eller en /profiles/-länk i stället.", retry: true };
  return { error: w.json?.error || "Hittade ingen profil med det namnet." };
}

/** Hämtar inventoryt. Returnerar { json } eller { error, retry?, wait? } – retry = värt att försöka igen, wait = sekunder att vänta. */
async function fetchInventory(id, signal) {
  if (!workerUrl || !okProxy(workerUrl)) return { error: "Ingen proxy är inställd. Ange adressen till din Steam-proxy (se DEPLOY.md) eller klistra in inventory-JSON manuellt nedan." };
  const w = await workerGet("/inventory?id=" + id, signal);
  if (!w) return { error: "Kunde inte nå proxyn (offline eller fel adress). Dina data är orörda.", retry: true };
  if (w.status === 429) return { error: "Steam begränsar anropen just nu (429). Vänta en stund och försök igen – inget har importerats.", retry: true, wait: 30 };
  if (w.status === 403) return { error: "Inventoryt är privat. Ställ in Steam → Profil → Sekretess → Inventory: Offentligt och försök igen." };
  if (w.status === 404) return { error: "Inventoryt är tomt eller privat." };
  if (w.status >= 500) return { error: "Steam eller proxyn svarade med ett tillfälligt fel (" + w.status + "). Försök igen om en stund.", retry: true, wait: 10 };
  if (!w.json || w.json.error) return { error: w.json?.error || "Oväntat svar från proxyn.", retry: w.status !== 400 };
  return { json: w.json };
}

const list = (title, items, fmt, max = 40) => items.length ? `<details style="margin:6px 0"><summary class="small" style="cursor:pointer"><b>${title}</b> (${items.length})</summary><div class="small muted" style="margin:6px 0 0 12px;max-height:180px;overflow:auto;line-height:1.7">${items.slice(0, max).map(fmt).join("<br>")}${items.length > max ? `<br>… och ${items.length - max} till` : ""}</div></details>` : "";
const hasUser = i => i.float != null || i.seed != null || i.note || i.nametag || i.fav;

export async function steamImportModal(onDone = () => { }) {
  const saved = await getKV("steamId", "");
  workerUrl = (await getKV("proxyUrl", "")) || STEAM_PROXY;
  modal(`<h3 style="margin-top:0">Hämta Steam-inventory</h3><div id="stage"></div>`, {
    wide: true,
    onMount: (m, close) => {
      const stage = m.querySelector("#stage");
      let ctl = null, timer = null, lastInput = saved || ""; // det man skrev behålls när man försöker igen
      const stopTimer = () => { clearInterval(timer); timer = null; };

      const form = (msg = "", retry = null) => {
        stopTimer();
        stage.innerHTML = `<p class="muted small" style="margin-top:0">Ditt inventory måste vara <b>publikt</b> (Steam → Profil → Sekretess → Inventory: Offentligt). Klistra in profil-länken eller ditt SteamID64. Förfrågan går via din egen proxy – bara ditt publika Steam-ID skickas. Du får se vad som ändras <b>innan</b> något sparas.</p>
          <div class="form"><label class="full">Profil-URL, vanity-namn eller SteamID64<input class="inp" id="sid" placeholder="https://steamcommunity.com/profiles/7656119…" value="${esc(lastInput)}"></label>
          <label class="full">Din proxy-URL (valfritt, se DEPLOY.md)<input class="inp" id="px" placeholder="https://steam-proxy.dittnamn.workers.dev" value="${esc(workerUrl || "")}"></label></div>
          <div class="row" style="margin-top:12px"><button class="btn" id="go">Hämta</button><button class="btn ghost" data-close>Avbryt</button><span class="small" id="st" role="status" style="color:${retry ? "#d9b36a" : "var(--muted)"}">${esc(msg)}</span></div>
          <hr><details><summary class="muted small" style="cursor:pointer">Fungerar inte? Klistra in inventory-JSON manuellt</summary>
          <p class="muted small">Öppna <code>https://steamcommunity.com/inventory/DITT_ID/730/2?l=english&amp;count=2000</code> i en ny flik, markera allt och klistra in här. Har inventoryt fler än 2 000 föremål saknas resten – använd då proxyn.</p>
          <textarea class="inp" id="raw" rows="4" style="width:100%"></textarea><button class="btn ghost sm" id="goRaw" style="margin-top:8px">Förhandsgranska JSON</button></details>
          <p class="muted small">Importen lägger till nya föremål, uppdaterar antal och (om du vill) tar bort det som inte längre finns hos Steam. Dina egna uppgifter – inköp, float, seed, anteckningar, namntag, favoriter – och alla transaktioner ändras aldrig. Manuellt tillagda föremål rörs inte.</p>`;
        stage.querySelector("#px").addEventListener("change", async e => { const v = e.target.value.trim(); if (v && !okProxy(v)) return toast("Adressen ska se ut som https://namn.workers.dev"); workerUrl = v.replace(/\/$/, ""); await setKV("proxyUrl", workerUrl); });
        stage.querySelector("#go").addEventListener("click", go);
        stage.querySelector("[data-close]").addEventListener("click", close);
        stage.querySelector("#goRaw").addEventListener("click", async () => {
          let json; try { json = JSON.parse(stage.querySelector("#raw").value); } catch (e) { return form("Ogiltig JSON: " + e.message); }
          preview(json, null);
        });
        if (retry?.wait) countdown(retry.wait);
      };
      const countdown = secs => {
        const go_ = stage.querySelector("#go"); if (!go_) return;
        go_.textContent = `Försök igen om ${secs} s`; go_.disabled = true;
        timer = setInterval(() => { secs--; if (secs <= 0) { stopTimer(); go_.disabled = false; go_.textContent = "Försök igen"; } else go_.textContent = `Försök igen om ${secs} s`; }, 1000);
      };

      async function go() {
        const input = lastInput = stage.querySelector("#sid").value;
        ctl = new AbortController();
        stage.innerHTML = `<div class="row" style="align-items:center"><span class="muted" role="status" id="prog">Slår upp konto…</span><button class="btn ghost sm" id="cancel">Avbryt</button></div><p class="muted small">Stora inventories kan ta en stund. Du kan avbryta – inget sparas förrän du bekräftat.</p>`;
        stage.querySelector("#cancel").addEventListener("click", () => { ctl.abort(); form("Avbrutet – inget har importerats."); });
        const r = await resolveSteamId(input, ctl.signal); if (ctl.signal.aborted) return;
        if (r.error) return form(r.error, r);
        stage.querySelector("#prog").textContent = "Hämtar inventory från Steam…";
        const res = await fetchInventory(r.id, ctl.signal); if (ctl.signal.aborted) return;
        if (res.error) return form(res.error, res);
        preview(res.json, r.id);
      }

      async function preview(json, steamId) {
        const parsed = parseInventory(json);
        if (!parsed.ok) return form(parsed.error);
        const existing = await all("items");
        const plan = planSteamImport(parsed, existing, { known: mhn => !!lookup(mhn), mkId: uid });
        const S = plan.summary, nothing = !plan.add.length && !plan.update.length && !plan.remove.length;
        const kpi = (n, l, c = "") => `<div class="panel stat" style="padding:10px 12px"><div class="val num ${c}" style="font-size:20px">${n}</div><div class="lbl">${l}</div></div>`;
        stage.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:10px">${kpi(S.found, "föremål hos Steam")}${kpi(S.unique, "unika")}${kpi("+" + S.added, "nya", S.added ? "pos" : "")}${kpi(S.changed, "ändrat antal")}${kpi("−" + S.removed, "försvunna", S.removed ? "neg" : "")}${kpi(S.unchanged, "oförändrade")}</div>
          ${plan.warnings.map(w => `<p class="small" style="margin:6px 0;color:#d9b36a">⚠ ${esc(w)}</p>`).join("")}
          ${nothing ? `<p class="small">Inga ändringar – ditt inventory stämmer redan med Steam.</p>` : ""}
          ${list("Nya föremål", plan.add, i => `+ ${esc(i.mhn)} ×${i.qty}`)}${list("Ändrat antal", plan.update, u => `${esc(u.after.mhn)}: ${u.before.qty} → ${u.after.qty}`)}${list("Försvunna från Steam", plan.remove, i => `− ${esc(i.mhn)} ×${i.qty}${hasUser(i) ? ' <span style="color:#d9b36a">(har egna uppgifter)</span>' : ""}`)}
          ${plan.remove.length ? `<label class="small" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="rm" checked> Ta bort de ${plan.remove.length} föremål som inte längre finns hos Steam (säkerhetskopia sparas, du kan ångra under Inställningar)</label>` : ""}
          <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" id="back">Tillbaka</button><button class="btn" id="apply">${nothing ? "Klar" : "Importera"}</button></div>`;
        stage.querySelector("#back").addEventListener("click", () => form());
        let busy = false;
        stage.querySelector("#apply").addEventListener("click", async () => {
          if (busy) return; busy = true;
          try {
            const doRemove = !!stage.querySelector("#rm")?.checked, gone = doRemove ? plan.remove : [];
            if (gone.some(hasUser) && !await confirmBox("Några av de föremål som tas bort har egna uppgifter (float, seed, anteckning eller favorit). Fortsätta?", { ok: "Ta bort", danger: true })) { busy = false; return; }
            if (plan.writes.length || gone.length) { await saveSafety(); await applyStores({ items: plan.writes }, { deletes: { items: gone.map(i => i.id) } }); }
            if (steamId) await setKV("steamId", steamId);
            close(); toast(nothing ? "Inga ändringar" : `Importerat: +${S.added} nya, ${S.changed} ändrade${gone.length ? `, ${gone.length} borttagna` : ""}`); onDone();
          } catch (e) { busy = false; stage.querySelector("#apply").insertAdjacentHTML("beforebegin", `<span class="small neg" style="margin-right:auto">Importen misslyckades – inget ändrades: ${esc(e.message)}</span>`); }
        });
      }
      form();
    },
  });
}
