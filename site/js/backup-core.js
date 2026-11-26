// Backup: validering, migrering, tvätt, kontrollsumma och jämförelse. Ingen DOM och ingen lagring här, så det går att testa (tests.html).
// Principen: en backupfil är opålitlig indata. Den granskas och tvättas HELT innan något i den riktiga databasen berörs.

export const FORMAT = 2; // 1 = äldre backup (utan format/kontrollsumma), 2 = nuvarande
export const BACKUP_STORES = ["items", "trades", "snapshots", "watch", "loadouts", "kv"];
export const KEY_OF = { items: "id", trades: "id", snapshots: "ts", watch: "id", loadouts: "id", kv: "key" };
export const STORE_LABEL = { items: "Föremål", trades: "Transaktioner", snapshots: "Värdepunkter", watch: "Bevakningar", loadouts: "Loadouts", kv: "Inställningar" };

import { cleanPrefs } from "./prefs-core.js";
const fin = (v, d = 0) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(+v) ? +v : d;
const finOrNull = v => (v == null || v === "" ? null : (typeof v === "number" || typeof v === "string") && Number.isFinite(+v) ? +v : null);
const s = (v, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");

/** Djupkopia bara vanlig JSON-data (inga funktioner, inga farliga nycklar, begränsat djup och storlek). */
export function plain(v, depth = 0) {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v.slice(0, 5000);
  if (depth > 6) return null;
  if (Array.isArray(v)) return v.slice(0, 5000).map(x => plain(x, depth + 1));
  if (typeof v === "object") {
    const o = {}; let n = 0;
    for (const k of Object.keys(v)) { if (k === "__proto__" || k === "constructor" || k === "prototype") continue; if (++n > 200) break; o[k] = plain(v[k], depth + 1); }
    return o;
  }
  return null;
}

/** Tillåtna inställningar i en backup. Allt annat (cacher, växelkurs …) hör inte hemma där, och värdena typkontrolleras. */
const FEE_KEYS = ["skinport", "csfloat", "csmoney", "buff163", "swapgg", "steam"];
export const KV_RULES = {
  priceMode: v => (v === "steam" || v === "market" ? v : undefined),
  creditToCash: v => (typeof v === "number" && v > 0 && v <= 1 ? v : undefined),
  fees: v => { if (!v || typeof v !== "object") return undefined; const o = {}; for (const k of FEE_KEYS) if (typeof v[k] === "number" && v[k] >= 0 && v[k] < 0.6) o[k] = v[k]; return o; },
  lastBackup: v => (typeof v === "number" && Number.isFinite(v) ? v : undefined),
  firstSeen: v => (typeof v === "number" && Number.isFinite(v) ? v : undefined),
  backupSnooze: v => (typeof v === "number" && Number.isFinite(v) ? v : undefined),
  crafts: v => (Array.isArray(v) ? plain(v).slice(0, 500) : undefined),
  compare: v => (Array.isArray(v) ? v.filter(x => typeof x === "string").map(x => x.slice(0, 80)).slice(0, 8) : undefined),
  stickerCombos: v => (Array.isArray(v) ? v.slice(0, 200).filter(c => c && typeof c === "object").map(c => ({ id: typeof c.id === "string" ? c.id.slice(0, 60) : "", name: typeof c.name === "string" ? c.name.slice(0, 80) : "Kombination", ids: Array.isArray(c.ids) ? c.ids.map(Number).filter(n => Number.isInteger(n) && n > 0 && n < 1e8).slice(0, 4) : [], created: Number.isFinite(c.created) ? c.created : 0 })).filter(c => c.id && c.ids.length) : undefined),
  savedCompares: v => (Array.isArray(v) ? v.slice(0, 100).filter(c => c && typeof c === "object").map(c => ({ id: typeof c.id === "string" ? c.id.slice(0, 60) : "", name: typeof c.name === "string" ? c.name.slice(0, 80) : "Jämförelse", ids: Array.isArray(c.ids) ? [...new Set(c.ids.filter(x => typeof x === "string" && /^[\w-]{1,60}$/.test(x)))].slice(0, 4) : [], created: Number.isFinite(c.created) ? c.created : 0 })).filter(c => c.id && c.ids.length >= 2) : undefined),
  inspectSaved: v => { if (!Array.isArray(v)) return undefined; const out = []; for (const c of v.slice(0, 200)) { if (!c || typeof c !== "object" || typeof c.id !== "string") continue; const hex = typeof c.hex === "string" && /^[0-9a-fA-F]{40,4000}$/.test(c.hex) && c.hex.length % 2 === 0 ? c.hex : null; const s = c.sim && typeof c.sim === "object" ? { skin: typeof c.sim.skin === "string" && /^[\w-]{1,60}$/.test(c.sim.skin) ? c.sim.skin : null, float: typeof c.sim.float === "number" ? c.sim.float : NaN, seed: typeof c.sim.seed === "number" ? Math.floor(c.sim.seed) : NaN } : null; const sim = s && s.skin && Number.isFinite(s.float) && s.float >= 0 && s.float <= 1 && Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 1000 ? s : null; if (!hex && !sim) continue; out.push({ id: c.id.slice(0, 60), name: typeof c.name === "string" ? c.name.slice(0, 80) : "Sparat resultat", hex, sim, created: Number.isFinite(c.created) ? c.created : 0 }); } return out; },
  tradeupSaved: v => { if (!Array.isArray(v)) return undefined; const cl = (x, a, b) => Math.min(b, Math.max(a, x)); const out = []; for (const c of v.slice(0, 100)) { if (!c || typeof c !== "object" || typeof c.id !== "string") continue; const entries = (Array.isArray(c.entries) ? c.entries : []).slice(0, 10).map(e => ({ id: typeof e?.id === "string" && /^[\w-]{1,60}$/.test(e.id) ? e.id : null, float: typeof e?.float === "number" && Number.isFinite(e.float) ? cl(e.float, 0, 1) : null, count: typeof e?.count === "number" && Number.isFinite(e.count) ? cl(Math.floor(e.count), 1, 10) : null, price: typeof e?.price === "number" && Number.isFinite(e.price) && e.price >= 0 ? e.price : null })).filter(e => e.id && e.float != null && e.count != null); if (!entries.length) continue; out.push({ id: c.id.slice(0, 60), name: typeof c.name === "string" ? c.name.slice(0, 80) : "Trade-up", stattrak: !!c.stattrak, entries, created: Number.isFinite(c.created) ? c.created : 0 }); } return out; },
  prefs: v => (v && typeof v === "object" && !Array.isArray(v) ? cleanPrefs(v) : undefined),
  colorThemes: v => { if (!Array.isArray(v)) return undefined; const valid = ["red", "orange", "gold", "green", "cyan", "blue", "purple", "pink", "brown", "black", "white", "gray"]; const out = []; for (const t of v.slice(0, 100)) { if (!t || typeof t !== "object" || typeof t.id !== "string") continue; const colors = [...new Set((Array.isArray(t.colors) ? t.colors : []).filter(c => typeof c === "string" && valid.includes(c)))].slice(0, 3); if (!colors.length) continue; out.push({ id: t.id.slice(0, 60), name: (typeof t.name === "string" ? t.name.slice(0, 60) : "") || "Färgtema", colors }); } return out; },
  colGoals: v => { if (!v || typeof v !== "object" || Array.isArray(v)) return undefined; const o = {}; for (const k of Object.keys(v).slice(0, 300)) { if (["__proto__", "constructor", "prototype"].includes(k) || k.length > 80 || !Array.isArray(v[k])) continue; o[k] = [...new Set(v[k].filter(x => typeof x === "string" && x.length <= 80))].slice(0, 300); } return o; },
  colBudgets: v => { if (!v || typeof v !== "object" || Array.isArray(v)) return undefined; const o = {}; for (const k of Object.keys(v).slice(0, 300)) { if (["__proto__", "constructor", "prototype"].includes(k) || k.length > 80) continue; if (typeof v[k] === "number" && Number.isFinite(v[k]) && v[k] >= 0 && v[k] < 1e9) o[k] = v[k]; } return o; },
  steamId: v => (typeof v === "string" && /^\d{17}$/.test(v) ? v : undefined),
  // Proxy-adressen styr vart ditt Steam-ID skickas. En manipulerad backup får därför aldrig kunna byta den.
  // Därför tas den INTE med från en fil (se cleanKv) – bara från den här webbläsaren.
};
export const KV_EXPORT = Object.keys(KV_RULES);

export function cleanKv(list) {
  const out = [];
  for (const r of list) {
    if (!r || typeof r.key !== "string") continue;
    const rule = KV_RULES[r.key]; if (!rule) continue;
    const value = rule(r.value); if (value === undefined) continue;
    out.push({ key: r.key, value });
  }
  return out;
}

const CLEAN = {
  items: l => l.filter(i => i && typeof i.id === "string" && typeof i.mhn === "string").map(i => {
    const o = { ...plain(i), id: s(i.id, 80), mhn: s(i.mhn), qty: Math.max(1, Math.floor(fin(i.qty, 1))), float: finOrNull(i.float), seed: finOrNull(i.seed) };
    if (typeof o.rc !== "string" || !/^#[0-9a-f]{3,8}$/i.test(o.rc)) delete o.rc; // färgen hamnar i en style-sträng
    if (o.img != null && typeof o.img !== "string") delete o.img;
    return o;
  }),
  trades: l => l.filter(t => t && typeof t.id === "string" && typeof t.mhn === "string").map(t => ({ ...plain(t), id: s(t.id, 80), mhn: s(t.mhn), type: t.type === "sell" ? "sell" : "buy", qty: Math.max(1, Math.floor(fin(t.qty, 1))), price: Math.max(0, fin(t.price)), fee: Math.max(0, fin(t.fee)), date: fin(t.date, Date.now()), created: fin(t.created), pay: t.pay === "steam" ? "steam" : "cash", float: finOrNull(t.float), seed: finOrNull(t.seed), market: s(t.market, 60), note: s(t.note, 300) })),
  watch: l => l.filter(w => w && typeof w.id === "string" && typeof w.mhn === "string" && Number.isFinite(+w.target) && +w.target > 0).map(w => {
    const mode = w.mode === "pct" ? "pct" : "price", pct = mode === "pct" && Number.isFinite(+w.pct) ? Math.max(-99, Math.min(1000, +w.pct)) : null;
    return { ...plain(w), id: s(w.id, 80), mhn: s(w.mhn), target: +w.target, mode, pct, dir: mode === "pct" ? (pct < 0 ? "below" : "above") : (w.dir === "above" ? "above" : "below"), created: fin(w.created, Date.now()), startUsd: finOrNull(w.startUsd), paused: !!w.paused, group: s(w.group, 40).trim(), note: s(w.note, 200), notified: null };
  }),
  snapshots: l => l.filter(x => x && Number.isFinite(+x.ts) && x.ts !== null).map(x => ({ ts: +x.ts, steam: fin(x.steam), cash: fin(x.cash), cost: fin(x.cost) })),
  loadouts: l => l.filter(x => x && typeof x.id === "string").map(x => ({ ...plain(x), id: s(x.id, 80), name: s(x.name, 80) })),
  kv: cleanKv,
};

/** Stabil JSON (sorterade nycklar) för jämförelser. */
export const stable = v => JSON.stringify(v, (k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.keys(val).sort().map(x => [x, val[x]])) : val));

/* ---------------- kontrollsumma ---------------- */
function fnv1a(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
/** "sha256:<hex>" (eller "fnv1a:<hex>" om webbläsaren saknar crypto.subtle). Räknas över lagren i fast ordning. */
export async function checksumOf(stores, algo = null) {
  const text = JSON.stringify(BACKUP_STORES.map(k => stores[k] ?? []));
  const useSha = algo ? algo === "sha256" : !!globalThis.crypto?.subtle;
  if (useSha && globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return "sha256:" + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  return "fnv1a:" + fnv1a(text);
}

/** Bygger backupobjektet av lagrens innehåll. */
export async function buildBackup(stores, now = Date.now()) {
  const data = {};
  for (const k of BACKUP_STORES) data[k] = k === "kv" ? cleanKv(stores.kv || []) : (stores[k] || []);
  const counts = Object.fromEntries(BACKUP_STORES.map(k => [k, data[k].length]));
  return { app: "cs2hub", format: FORMAT, version: FORMAT, exported: now, counts, checksum: await checksumOf(data), ...data };
}

/* ---------------- validering + migrering ---------------- */
/**
 * Granskar en inläst backup. Rör ingen databas. Returnerar { ok, errors, warnings, notes, format, checksum, clean, counts, dropped }.
 * checksum: "ok" | "mismatch" | "none" | "unsupported".
 */
export async function validateBackup(raw) {
  const r = { ok: false, errors: [], warnings: [], notes: [], format: 1, checksum: "none", clean: null, counts: {}, dropped: {}, exported: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) { r.errors.push("Filen är inte en CS2 Hub-backup."); return r; }
  if (raw.app !== "cs2hub") { r.errors.push("Filen är inte en CS2 Hub-backup (fel app-märkning)."); return r; }
  r.format = Number.isInteger(raw.format) ? raw.format : 1;
  r.exported = Number.isFinite(+raw.exported) ? +raw.exported : null;
  if (r.format > FORMAT) { r.errors.push(`Backupen är skapad av en nyare version av CS2 Hub (format ${r.format}). Uppdatera sidan och försök igen.`); return r; }
  if (r.format < 1) { r.errors.push("Okänt backupformat."); return r; }
  if (!BACKUP_STORES.some(k => Array.isArray(raw[k]))) { r.errors.push("Backupfilen innehåller ingen data."); return r; }
  for (const k of BACKUP_STORES) if (raw[k] != null && !Array.isArray(raw[k])) r.errors.push(`${STORE_LABEL[k]} har fel format i filen.`);
  if (r.errors.length) return r;

  if (typeof raw.checksum === "string") {
    const algo = raw.checksum.split(":")[0];
    if (algo === "sha256" && !globalThis.crypto?.subtle) { r.checksum = "unsupported"; r.warnings.push("Kontrollsumman kunde inte kontrolleras i den här webbläsaren (kräver https eller localhost)."); }
    else if (algo === "sha256" || algo === "fnv1a") {
      const now = await checksumOf(Object.fromEntries(BACKUP_STORES.map(k => [k, raw[k] ?? []])), algo);
      r.checksum = now === raw.checksum ? "ok" : "mismatch";
      if (r.checksum === "mismatch") { r.errors.push("Kontrollsumman stämmer inte – filen har ändrats eller skadats efter att den skapades. Inget har importerats."); return r; }
    } else r.warnings.push("Okänd kontrollsumma – filen kunde inte kontrolleras.");
  } else if (r.format >= 2) r.warnings.push("Backupen saknar kontrollsumma.");

  if (r.format < FORMAT) r.notes.push(`Äldre backupformat (v${r.format}) – migreras automatiskt till v${FORMAT}. Din data ändras inte i sak.`);

  const clean = {};
  for (const k of BACKUP_STORES) {
    const list = Array.isArray(raw[k]) ? raw[k] : [];
    if (k === "kv" && list.some(x => x?.key === "proxyUrl")) r.notes.push("Proxy-adressen i filen ignoreras av säkerhetsskäl – den styr vart ditt Steam-ID skickas och behålls därför från den här webbläsaren.");
    const cleaned = CLEAN[k](list);
    r.dropped[k] = Math.max(0, list.length - cleaned.length);
    if (r.dropped[k]) r.warnings.push(`${r.dropped[k]} ${STORE_LABEL[k].toLowerCase()} i filen var ogiltiga och hoppas över.`);
    // dubbletter inom filen (samma id): den sista gäller
    const seen = new Map(); for (const o of cleaned) seen.set(o[KEY_OF[k]], o);
    if (seen.size < cleaned.length) r.warnings.push(`${cleaned.length - seen.size} dubbletter bland ${STORE_LABEL[k].toLowerCase()} i filen (samma id) – bara den sista av varje behålls.`);
    clean[k] = [...seen.values()];
    r.counts[k] = clean[k].length;
  }
  r.clean = clean; r.ok = true;
  return r;
}

/** Vad en import skulle göra, per lager. mode: "merge" (lägg bara till nytt) eller "replace" (ersätt allt). current: { store: [..] } */
export function planImport(clean, current, mode) {
  const out = {};
  for (const k of BACKUP_STORES) {
    const key = KEY_OF[k], cur = new Map((current[k] || []).map(o => [o[key], o])), file = clean[k] || [];
    let add = 0, same = 0, differ = 0;
    for (const o of file) { const c = cur.get(o[key]); if (!c) add++; else if (stable(c) === stable(o)) same++; else differ++; }
    const fileKeys = new Set(file.map(o => o[key]));
    const remove = mode === "replace" && k !== "kv" ? [...cur.keys()].filter(x => !fileKeys.has(x)).length : 0;
    // merge: poster som redan finns med andra värden behålls som de är hos dig (hoppas över); replace: de skrivs över
    out[k] = { file: file.length, add, same, differ, replaced: mode === "replace" ? differ : 0, skipped: mode === "merge" ? differ : 0, remove };
  }
  return out;
}

/** Det som ska skrivas till databasen. merge = bara poster som saknas lokalt, och inga inställningar skrivs över. */
export function payloadFor(clean, current, mode) {
  if (mode === "replace") return Object.fromEntries(BACKUP_STORES.map(k => [k, clean[k] || []]));
  const out = {};
  for (const k of BACKUP_STORES) { const key = KEY_OF[k], have = new Set((current[k] || []).map(o => o[key])); out[k] = (clean[k] || []).filter(o => !have.has(o[key])); }
  return out;
}
