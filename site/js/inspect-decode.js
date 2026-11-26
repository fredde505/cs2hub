// Avkodar CS2 "masked" inspect-länkar helt på klientsidan (protobuf CEconItemPreviewDataBlock). Inget skickas någonstans.
// Länkdata är opålitlig indata: allt valideras (längd, hex, protobuf-struktur, rimliga värden) och felen beskrivs på svenska.
// OBS: länkens avslutande 4 byte (kontrollsumma) kontrolleras inte – bara att innehållet går att tolka och ger rimliga värden.

function readVarint(b, o) {
  let r = 0n, s = 0n;
  while (o.i < b.length) {
    const x = b[o.i++]; r |= BigInt(x & 0x7f) << s; if (!(x & 0x80)) return r;
    s += 7n; if (s > 70n) throw new Error("ogiltigt tal");
  }
  throw new Error("avklippt data");
}
function parseMsg(b) {
  const o = { i: 0 }, out = [];
  while (o.i < b.length) {
    const tag = Number(readVarint(b, o)), f = tag >>> 3, wt = tag & 7;
    if (f === 0) throw new Error("ogiltigt fält");
    if (wt === 0) out.push({ f, v: readVarint(b, o) });
    else if (wt === 2) { const n = Number(readVarint(b, o)); if (n < 0 || o.i + n > b.length) throw new Error("avklippt data"); out.push({ f, v: b.slice(o.i, o.i + n) }); o.i += n; }
    else if (wt === 5) { if (o.i + 4 > b.length) throw new Error("avklippt data"); out.push({ f, v: new DataView(b.buffer, b.byteOffset + o.i, 4).getUint32(0, true) }); o.i += 4; }
    else if (wt === 1) { if (o.i + 8 > b.length) throw new Error("avklippt data"); o.i += 8; }
    else throw new Error("Okänd protobuf-wiretyp");
  }
  return out;
}
const f32 = u => { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, Number(u)); return d.getFloat32(0); };
const first = (m, f) => m.find(x => x.f === f)?.v;
const finite = v => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function parseAttachment(bytes) {
  const m = parseMsg(bytes), g = f => first(m, f);
  const a = { slot: Number(g(1) ?? 0), id: Number(g(2) ?? 0) };
  if (g(3) !== undefined) a.wear = finite(f32(g(3)));      // sticker: slitage (0 = ny, 1 = helt skrapad)
  if (g(7) !== undefined) a.x = finite(f32(g(7)));
  if (g(8) !== undefined) a.y = finite(f32(g(8)));
  if (g(10) !== undefined) a.pattern = Number(g(10));
  if (!Number.isSafeInteger(a.slot) || a.slot < 0 || a.slot > 10) a.slot = 0;
  if (a.wear !== undefined && (a.wear < 0 || a.wear > 1)) delete a.wear; // orimligt slitage visas inte
  return a;
}

export function extractHex(input) {
  input = String(input ?? "").trim();
  const m = input.match(/csgo_econ_action_preview(?:%20|\s|\+)*([0-9A-Fa-f\s]{16,})\s*$/);
  if (m) return m[1].replace(/\s+/g, "");
  if (/^[0-9A-Fa-f\s]{16,}$/.test(input)) return input.replace(/\s+/g, "");
  return null;
}

/** Avkodar ett hex-block (utan steam://-prefix). Kastar Error med svenskt meddelande om det inte går. */
export function decodeHex(hex) {
  if (hex.length % 2) throw new Error("Hex-koden har ett udda antal tecken – den är troligen avklippt när länken kopierades.");
  if (hex.length < 40) throw new Error("Hex-koden är för kort för att vara en komplett inspect-länk.");
  let bytes = Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16)));
  const key = bytes[0];
  if (key) bytes = bytes.map(x => x ^ key);
  let msg;
  try { msg = parseMsg(bytes.slice(1, bytes.length - 4)); } catch { throw new Error("Länken kunde inte tolkas – är hex-koden komplett och oförändrad?"); }
  const g = f => first(msg, f);
  const dec = new TextDecoder("utf-8", { fatal: false });
  const warnings = [];
  const res = {
    accountId: Number(g(1) ?? 0), itemId: String(g(2) ?? ""), defIndex: Number(g(3) ?? 0), paintIndex: Number(g(4) ?? 0),
    rarity: Number(g(5) ?? 0), quality: Number(g(6) ?? 0), float: g(7) !== undefined ? f32(g(7)) : null, seed: Number(g(8) ?? 0),
    stattrak: g(10) !== undefined ? Number(g(10)) : null, nametag: g(11) ? dec.decode(g(11)).slice(0, 40) : "",
    stickers: msg.filter(x => x.f === 12).slice(0, 12).map(x => parseAttachment(x.v)),
    charms: msg.filter(x => x.f === 20).slice(0, 4).map(x => parseAttachment(x.v)),
    warnings,
  };
  if (!res.defIndex || res.defIndex > 100000) throw new Error("Länken kunde inte tolkas (ingen vapendata).");
  if (res.float !== null && !(Number.isFinite(res.float) && res.float >= 0 && res.float <= 1)) throw new Error("Länken innehåller ett ogiltigt float-värde – den är skadad eller har ändrats.");
  if (!Number.isInteger(res.seed) || res.seed < 0 || res.seed > 1000) throw new Error("Länken innehåller en ogiltig paint seed (måste vara 0–1000) – den är skadad eller har ändrats.");
  if (res.stattrak != null && !Number.isSafeInteger(res.stattrak)) res.stattrak = null;
  if (res.float === null) warnings.push("Länken innehåller ingen float (t.ex. ett föremål utan slitage). Inget float-värde har hittats på.");
  if (!res.itemId || res.itemId === "0") warnings.push("Länken saknar item-ID.");
  return res;
}

export function decodeInspect(input) {
  const text = String(input ?? "").trim();
  if (!text) throw new Error("Klistra in en inspect-länk eller hex-kod först.");
  const hex = extractHex(text);
  if (!hex) {
    if (/[SM]\d{10,}A\d+D\d+/.test(text)) throw new Error("Det här är en äldre länk (S/A/D) – dess data finns bara hos Steams spelserver och kan inte avkodas i webbläsaren. Använd en länk med lång hex-kod (från ett CS2-inventory) eller mata in float och seed manuellt.");
    if (/^https?:\/\//i.test(text)) throw new Error("Det här är en webbadress, inte en inspect-länk. Klistra in själva steam://-länken (eller dess hex-kod) som du får via Inspect i CS2.");
    throw new Error("Hittade ingen inspect-data i texten. En länk innehåller csgo_econ_action_preview följt av en lång hex-kod.");
  }
  return decodeHex(hex);
}
