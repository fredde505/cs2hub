// All användardata lever lokalt i webbläsarens IndexedDB – ingen server behövs.
const DB_NAME = "cs2hub", VERSION = 1;
const STORES = { items: "id", trades: "id", snapshots: "ts", watch: "id", loadouts: "id", kv: "key" };
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
  return r ? r.value : def;
}
export const setKV = (key, value) => put("kv", { key, value });

export async function exportAll() {
  const out = { app: "cs2hub", version: 1, exported: Date.now() };
  for (const s of Object.keys(STORES)) out[s] = await all(s);
  return out;
}
export async function importAll(data) {
  if (!data || data.app !== "cs2hub") throw new Error("Ogiltig backupfil");
  // Backupfilen är opålitlig indata: tvätta tal så att de aldrig kan bära HTML.
  const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;
  const clean = {
    items: l => l.filter(i => i && typeof i.id === "string" && typeof i.mhn === "string").map(i => ({ ...i, qty: Math.max(1, Math.floor(num(i.qty, 1))), float: i.float == null ? null : num(i.float, null), seed: i.seed == null ? null : num(i.seed, null) })),
    trades: l => l.filter(t => t && typeof t.id === "string" && typeof t.mhn === "string").map(t => ({ ...t, type: t.type === "sell" ? "sell" : "buy", qty: Math.max(1, Math.floor(num(t.qty, 1))), price: num(t.price), fee: num(t.fee), date: num(t.date, Date.now()), created: num(t.created) })),
    snapshots: l => l.filter(s => s && Number.isFinite(+s.ts)).map(s => ({ ts: +s.ts, steam: num(s.steam), cash: num(s.cash), cost: num(s.cost) })),
  };
  for (const s of Object.keys(STORES)) {
    await clear(s);
    const list = Array.isArray(data[s]) ? data[s] : [];
    if (list.length) await putMany(s, clean[s] ? clean[s](list) : list);
  }
}
