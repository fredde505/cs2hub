// All användardata lever lokalt i webbläsarens IndexedDB – ingen server behövs.
import { buildBackup, BACKUP_STORES, KEY_OF } from "./backup-core.js";
const DB_NAME = "cs2hub", VERSION = 2; // v2: lagret "safety" (säkerhetskopia före senaste återställning)
const STORES = { items: "id", trades: "id", snapshots: "ts", watch: "id", loadouts: "id", kv: "key", safety: "id" };
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, VERSION);
    rq.onupgradeneeded = () => {
      for (const [n, k] of Object.entries(STORES)) if (!rq.result.objectStoreNames.contains(n)) rq.result.createObjectStore(n, { keyPath: k });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode); const s = t.objectStore(store);
    const r = fn(s); t.oncomplete = () => res(r && r.result !== undefined ? r.result : undefined); t.onerror = () => rej(t.error);
  });
};

// IndexedDB kan saknas (privat läge) – då faller vi tillbaka på minne så sidan fortfarande fungerar.
const mem = Object.fromEntries(Object.keys(STORES).map(k => [k, new Map()]));
let useMem = false;
async function guard(fn, fb) { if (useMem) return fb(); try { return await fn(); } catch (e) { useMem = true; return fb(); } }

export const all = store => guard(() => tx(store, "readonly", s => s.getAll()), () => [...mem[store].values()]);
export const put = (store, obj) => guard(() => tx(store, "readwrite", s => s.put(obj)), () => void mem[store].set(obj[STORES[store]], obj));
export const putMany = (store, objs) => guard(() => tx(store, "readwrite", s => { objs.forEach(o => s.put(o)); }), () => objs.forEach(o => mem[store].set(o[STORES[store]], o)));
export const del = (store, id) => guard(() => tx(store, "readwrite", s => s.delete(id)), () => void mem[store].delete(id));
export const clear = store => guard(() => tx(store, "readwrite", s => s.clear()), () => mem[store].clear());
export async function getKV(key, def = null) {
  const r = await guard(() => tx("kv", "readonly", s => s.get(key)), () => mem.kv.get(key));
  if (!r) return def;
  // Skadad/manipulerad lagring: värdet måste ha samma typ som standardvärdet (lista, tal eller text), annars används standardvärdet
  const v = r.value;
  if (Array.isArray(def)) return Array.isArray(v) ? v : def;
  if (typeof def === "number") return typeof v === "number" && Number.isFinite(v) ? v : def;
  if (typeof def === "string") return typeof v === "string" ? v : def;
  return v;
}
export const setKV = (key, value) => put("kv", { key, value });

/** Allt som ingår i en backup, som { lager: [poster] }. */
export async function readStores() {
  const out = {};
  for (const s of BACKUP_STORES) out[s] = await all(s);
  return out;
}
/** Backupobjekt (format 2, med kontrollsumma). */
export async function exportAll() { return buildBackup(await readStores()); }

/**
 * Skriver flera lager i EN transaktion: lyckas något inte, avbryts allt och databasen är som förut (inget halvt resultat).
 * payload: { lager: [poster] }. replace=true tömmer lagret först (inställningar, "kv", töms aldrig – de skrivs bara över).
 */
export async function applyStores(payload, { replace = false, deletes = {} } = {}) {
  // deletes: { lager: [nycklar] } tas bort i samma transaktion (används av Steam-importen)
  const names = BACKUP_STORES.filter(n => Array.isArray(payload[n]) || Array.isArray(deletes[n]));
  const memApply = () => {
    const snap = Object.fromEntries(names.map(n => [n, new Map(mem[n])]));
    try { for (const n of names) { if (replace && n !== "kv") mem[n].clear(); for (const k of deletes[n] || []) mem[n].delete(k); for (const o of payload[n] || []) mem[n].set(o[KEY_OF[n]], o); } } catch (e) { for (const n of names) mem[n] = snap[n]; throw e; }
  };
  if (useMem) return memApply();
  let db; try { db = await open(); } catch { useMem = true; return memApply(); }
  await new Promise((res, rej) => {
    let t; try { t = db.transaction(names, "readwrite"); } catch (e) { return rej(e); }
    try { for (const n of names) { const st = t.objectStore(n); if (replace && n !== "kv") st.clear(); for (const k of deletes[n] || []) st.delete(k); for (const o of payload[n] || []) st.put(o); } }
    catch (e) { try { t.abort(); } catch { /* redan avbruten */ } return rej(e); } // en ogiltig post mitt i får aldrig lämna en halv databas
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error("avbröts"));
  }).catch(e => { throw new Error("Det gick inte att spara – ingenting ändrades i din databas (" + (e?.message || e) + ")"); });
}

/** Sparar en säkerhetskopia av nuläget (ett enda exemplar, skrivs över) så att en återställning kan ångras. */
export async function saveSafety() {
  const data = await exportAll();
  await put("safety", { id: "last", t: Date.now(), data });
  return data;
}
export const getSafety = async () => (await all("safety")).find(x => x.id === "last") || null;
