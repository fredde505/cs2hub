import { esc, modal, toast, uid } from "../util.js";
import { all, putMany, del, getKV, setKV } from "../store.js";
import { lookup } from "../data.js";
import { STEAM_PROXY } from "../config.js";

const PROXIES = [u => u, u => "https://corsproxy.io/?url=" + encodeURIComponent(u), u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u)];

async function tryFetch(url, asText = false) {
  for (const p of PROXIES) {
    try {
      const r = await fetch(p(url), { cache: "no-store" });
      if (!r.ok) continue;
      return asText ? await r.text() : await r.json();
    } catch { /* nästa */ }
  }
  return null;
}

// Egen proxy (Cloudflare Worker, se worker/steam-proxy.js) provas först; publika proxyer är reserv.
let workerUrl = STEAM_PROXY;
async function workerGet(path) {
  if (!workerUrl) return null;
  try {
    const r = await fetch(workerUrl.replace(/\/+$/, "") + path, { cache: "no-store" });
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch { return null; } // proxyn onåbar -> reserv
}

async function resolveSteamId(input) {
  input = input.trim();
  let m = input.match(/(\d{17})/); if (m) return m[1];
  m = input.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i) || (/^[\w-]{2,32}$/.test(input) ? [null, input] : null);
  if (!m) return null;
  const w = await workerGet("/resolve?name=" + encodeURIComponent(m[1]));
  if (w?.json?.id) return w.json.id;
  const xml = await tryFetch(`https://steamcommunity.com/id/${encodeURIComponent(m[1])}/?xml=1`, true);
  const id = xml && xml.match(/<steamID64>(\d{17})<\/steamID64>/);
  return id ? id[1] : null;
}

/** Returnerar { json } eller { error } med ett begripligt fel. */
async function fetchInventory(id) {
  const w = await workerGet("/inventory?id=" + id);
  if (w?.json?.assets) return { json: w.json };
  if (w && w.json?.error) return { error: w.json.error };
  const json = await tryFetch(`https://steamcommunity.com/inventory/${id}/730/2?l=english&count=2000`);
  return json?.assets ? { json } : { error: "Kunde inte hämta (privat inventory eller proxyn är nere). Prova manuell JSON nedan." };
}

function guessKind(d) {
  const n = d.market_hash_name || "", ty = (d.type || "").toLowerCase();
  if (n.startsWith("Sticker |")) return "sticker"; if (n.startsWith("Charm |")) return "charm"; if (n.startsWith("Patch |")) return "patch";
  if (n.startsWith("Sealed Graffiti")) return "graffiti"; if (n.startsWith("Music Kit |") || ty.includes("music kit")) return "music";
  if (ty.includes("agent")) return "agent"; if (ty.includes("container") || ty.includes("case")) return "case"; if (n.startsWith("★")) return "knife";
  return "other";
}

async function importSteamJSON(json, steamId) {
  const desc = new Map((json.descriptions || []).map(d => [d.classid + "_" + d.instanceid, d]));
  const groups = new Map();
  for (const a of json.assets || []) {
    const d = desc.get(a.classid + "_" + a.instanceid); if (!d?.market_hash_name) continue;
    const g = groups.get(d.market_hash_name) || { d, qty: 0 };
    g.qty += +a.amount || 1; groups.set(d.market_hash_name, g);
  }
  if (!groups.size) throw new Error("Inga CS2-föremål hittades");
  const old = (await all("items")).filter(i => i.source === "steam");
  const flags = new Map(old.map(i => [i.mhn, i]));
  for (const o of old) await del("items", o.id);
  const items = [];
  for (const [mhn, g] of groups) {
    const prev = flags.get(mhn), ref = lookup(mhn);
    items.push({ id: prev?.id || uid(), mhn, qty: g.qty, source: "steam", fav: prev?.fav, hidden: prev?.hidden, float: prev?.float ?? null, seed: prev?.seed ?? null, added: prev?.added || Date.now(), nm: g.d.marketable === 0 || g.d.marketable === false,
      name: ref ? undefined : mhn, img: ref ? undefined : g.d.icon_url, kind: ref ? undefined : guessKind(g.d), rc: ref ? undefined : (g.d.name_color ? "#" + g.d.name_color : undefined) });
  }
  await putMany("items", items);
  await setKV("steamId", steamId || null);
  return items.length;
}

export async function steamImportModal(onDone = () => { }) {
  const saved = await getKV("steamId", "");
  workerUrl = (await getKV("proxyUrl", "")) || STEAM_PROXY;
  modal(`<h3>Hämta Steam-inventory</h3>
    <p class="muted small" style="margin-top:0">Ditt inventory måste vara <b>publikt</b> (Steam → Profil → Sekretess → Inventory: Offentligt). Klistra in profil-länken eller ditt SteamID64. Steam tillåter inte direktanrop från webbläsaren, så förfrågan går via din egen proxy (om du lagt in en nedan) eller annars en publik CORS-proxy – bara ditt publika Steam-ID skickas.</p>
    <div class="form"><label class="full">Profil-URL, vanity-namn eller SteamID64<input class="inp" id="sid" placeholder="https://steamcommunity.com/profiles/7656119…" value="${esc(saved || "")}"></label>
    <label class="full">Din proxy-URL (valfritt, se DEPLOY.md)<input class="inp" id="px" placeholder="https://steam-proxy.dittnamn.workers.dev" value="${esc(workerUrl || "")}"></label></div>
    <div class="row" style="margin-top:12px"><button class="btn" id="go">Hämta</button><span class="muted small" id="st" role="status"></span></div>
    <hr><details><summary class="muted small" style="cursor:pointer">Fungerar inte? Klistra in inventory-JSON manuellt</summary>
    <p class="muted small">Öppna <code>https://steamcommunity.com/inventory/DITT_ID/730/2?l=english&amp;count=2000</code> i en ny flik, markera allt och klistra in här.</p>
    <textarea class="inp" id="raw" rows="4" style="width:100%"></textarea><button class="btn ghost sm" id="goRaw" style="margin-top:8px">Importera JSON</button></details>
    <p class="muted small">Importen ersätter tidigare Steam-importerade föremål (favoriter och dolda behålls). Manuellt tillagda föremål och transaktioner rörs inte. Steam ger inte float eller seed – lägg till dem via Redigera.</p>`, {
    onMount: (m, close) => {
      const st = m.querySelector("#st");
      m.querySelector("#px").addEventListener("change", async e => { workerUrl = e.target.value.trim(); await setKV("proxyUrl", workerUrl); });
      m.querySelector("#go").addEventListener("click", async () => {
        st.textContent = "Hämtar…";
        const id = await resolveSteamId(m.querySelector("#sid").value);
        if (!id) { st.textContent = "Hittade inget SteamID – prova en /profiles/-länk eller 17-siffrigt ID."; return; }
        const res = await fetchInventory(id);
        if (res.error) { st.textContent = res.error; return; }
        try { const n = await importSteamJSON(res.json, id); close(); toast(`Importerade ${n} unika föremål`); onDone(); } catch (e) { st.textContent = e.message; }
      });
      m.querySelector("#goRaw").addEventListener("click", async () => {
        try { const n = await importSteamJSON(JSON.parse(m.querySelector("#raw").value), null); close(); toast(`Importerade ${n} unika föremål`); onDone(); } catch (e) { st.textContent = "Ogiltig JSON: " + e.message; }
      });
    },
  });
}
