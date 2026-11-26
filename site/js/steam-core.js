// Steam-import: tolkning av inventory-JSON och en importplan (vad som läggs till, ändras och tas bort). Ren logik utan DOM/lagring (testas i tests.html).
// Steams svar är opålitlig indata: allt valideras och tvättas här. Importen rör aldrig användarens egna uppgifter (float, seed, anteckning, namntag, favorit, dold).

const MAX_ASSETS = 60000;
const s = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

export function guessKind(d) {
  const n = d.market_hash_name || "", ty = (d.type || "").toLowerCase();
  if (n.startsWith("Sticker |")) return "sticker"; if (n.startsWith("Charm |")) return "charm"; if (n.startsWith("Patch |")) return "patch";
  if (n.startsWith("Sealed Graffiti")) return "graffiti"; if (n.startsWith("Music Kit |") || ty.includes("music kit")) return "music";
  if (ty.includes("agent")) return "agent"; if (ty.includes("container") || ty.includes("case")) return "case"; if (n.startsWith("★")) return "knife";
  return "other";
}

/**
 * Tolkar Steams inventory-JSON ({assets, descriptions, more_items?, truncated?}).
 * Returnerar { ok, error, groups: Map(mhn -> {qty, d}), assets, unique, warnings }.
 */
export function parseInventory(json) {
  const r = { ok: false, error: null, groups: new Map(), assets: 0, unique: 0, warnings: [] };
  if (!json || typeof json !== "object" || Array.isArray(json)) { r.error = "Svaret är inte ett Steam-inventory."; return r; }
  if (!Array.isArray(json.assets) || !Array.isArray(json.descriptions)) { r.error = "Svaret saknar föremållistan (assets/descriptions) – är inventoryt privat eller tomt?"; return r; }
  if (json.assets.length > MAX_ASSETS) { r.error = "Inventoryt är orimligt stort – avbryter."; return r; }
  const desc = new Map();
  for (const d of json.descriptions) {
    if (!d || typeof d !== "object") continue;
    const mhn = s(d.market_hash_name, 200); if (!mhn) continue;
    desc.set(String(d.classid) + "_" + String(d.instanceid), {
      market_hash_name: mhn, type: s(d.type, 80), marketable: d.marketable === 0 || d.marketable === false || d.marketable === "0" ? 0 : 1,
      icon_url: /^[\w-]{10,600}$/.test(d.icon_url || "") ? d.icon_url : "", name_color: /^[0-9a-f]{6}$/i.test(d.name_color || "") ? d.name_color : "",
    });
  }
  let unknownAssets = 0;
  for (const a of json.assets) {
    if (!a || typeof a !== "object") continue;
    const d = desc.get(String(a.classid) + "_" + String(a.instanceid));
    if (!d) { unknownAssets++; continue; }
    r.assets++;
    const amount = Math.min(1e6, Math.max(1, Math.floor(+a.amount) || 1));
    const g = r.groups.get(d.market_hash_name) || { qty: 0, d };
    g.qty += amount; r.groups.set(d.market_hash_name, g);
  }
  if (unknownAssets) r.warnings.push(`${unknownAssets} föremål saknade beskrivning i svaret och hoppades över.`);
  if (json.more_items) r.warnings.push("Steam säger att det finns fler föremål än de som skickades (fler sidor). Importen kan vara ofullständig – försök igen om en stund.");
  if (json.truncated) r.warnings.push("Proxyn hann inte hämta hela inventoryt (gränsen nåddes). Importen är ofullständig.");
  if (!r.groups.size) { r.error = "Inga CS2-föremål hittades i svaret."; return r; }
  r.unique = r.groups.size; r.ok = true;
  return r;
}

const userData = it => it.float != null || it.seed != null || !!it.note || !!it.nametag || !!it.fav;

/**
 * Jämför Steam-inventoryt med det som finns lokalt. Rör inget – returnerar bara en plan.
 *  existing: alla föremål i databasen. known(mhn): finns föremålet i vår katalog? mk(): id-generator. now: tidsstämpel.
 * Plan: { add[], update[{before,after}], unchanged[], remove[], writes[] (poster att skriva), manualOverlap[], warnings[], summary }
 */
export function planSteamImport(parsed, existing, { known = () => true, mkId = () => Math.random().toString(36).slice(2), now = Date.now() } = {}) {
  const steamItems = existing.filter(i => i.source === "steam"), manual = existing.filter(i => i.source !== "steam");
  const byMhn = new Map(); const dupes = [];
  for (const i of steamItems) { if (byMhn.has(i.mhn)) dupes.push(i); else byMhn.set(i.mhn, i); }
  const plan = { add: [], update: [], unchanged: [], remove: [], writes: [], manualOverlap: [], warnings: [...parsed.warnings] };
  for (const [mhn, g] of parsed.groups) {
    const nm = g.d.marketable === 0;
    const prev = byMhn.get(mhn);
    if (!prev) {
      const item = { id: mkId(), mhn, qty: g.qty, source: "steam", float: null, seed: null, added: now, nm, steamQty: g.qty };
      if (!known(mhn)) Object.assign(item, { name: mhn, img: g.d.icon_url || undefined, kind: guessKind(g.d), rc: g.d.name_color ? "#" + g.d.name_color : undefined });
      plan.add.push(item); plan.writes.push(item);
    } else {
      const after = { ...prev, qty: g.qty, nm, steamQty: g.qty }; // spridning = alla egna fält (float, seed, anteckning, namntag, favorit, dold) följer med
      const visible = prev.qty !== g.qty || !!prev.nm !== nm;
      if (visible) plan.update.push({ before: prev, after }); else plan.unchanged.push(prev);
      if (visible || prev.steamQty !== g.qty) plan.writes.push(after); // steamQty (vad Steam senast angav) uppdateras tyst även när inget syns för användaren
    }
    const m = manual.filter(i => i.mhn === mhn).reduce((n, i) => n + (Math.max(1, Math.floor(+i.qty) || 1)), 0);
    if (m) plan.manualOverlap.push({ mhn, manualQty: m, steamQty: g.qty });
  }
  for (const [mhn, i] of byMhn) if (!parsed.groups.has(mhn)) plan.remove.push(i);
  if (dupes.length) plan.warnings.push(`${dupes.length} Steam-importerade dubbletter finns sedan tidigare och lämnas orörda.`);
  if (plan.manualOverlap.length) plan.warnings.push(`${plan.manualOverlap.length} föremål finns både som manuellt tillagda och i Steam-inventoryt – de räknas då dubbelt. Ta bort eller justera de manuella efteråt om det inte stämmer.`);
  const had = steamItems.length;
  if (had >= 10 && plan.remove.length > had * 0.5) plan.warnings.push(`Mer än hälften (${plan.remove.length} av ${had}) av dina tidigare importerade föremål saknas i det här svaret. Det kan bero på ett ofullständigt svar – kontrollera listan innan du fortsätter.`);
  const withData = plan.remove.filter(userData);
  if (withData.length) plan.warnings.push(`${withData.length} föremål som tas bort har egna uppgifter (float, seed, anteckning eller favorit) som försvinner med dem.`);
  plan.summary = { found: parsed.assets, unique: parsed.unique, added: plan.add.length, changed: plan.update.length, removed: plan.remove.length, unchanged: plan.unchanged.length };
  return plan;
}
