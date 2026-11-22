// Avkodar CS2 "masked" inspect-länkar helt på klientsidan (protobuf CEconItemPreviewDataBlock).
function readVarint(b, o) {
  let r = 0n, s = 0n;
  while (o.i < b.length) { const x = b[o.i++]; r |= BigInt(x & 0x7f) << s; if (!(x & 0x80)) break; s += 7n; }
  return r;
}
function parseMsg(b) {
  const o = { i: 0 }, out = [];
  while (o.i < b.length) {
    const tag = Number(readVarint(b, o)), f = tag >>> 3, wt = tag & 7;
    if (wt === 0) out.push({ f, v: readVarint(b, o) });
    else if (wt === 2) { const n = Number(readVarint(b, o)); if (o.i + n > b.length) throw new Error("avklippt data"); out.push({ f, v: b.slice(o.i, o.i + n) }); o.i += n; }
    else if (wt === 5) { if (o.i + 4 > b.length) throw new Error("avklippt data"); out.push({ f, v: new DataView(b.buffer, b.byteOffset + o.i, 4).getUint32(0, true) }); o.i += 4; }
    else if (wt === 1) { o.i += 8; }
    else throw new Error("Okänd protobuf-wiretyp");
  }
  return out;
}
const f32 = u => { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, Number(u)); return d.getFloat32(0); };
const first = (m, f) => m.find(x => x.f === f)?.v;

function parseAttachment(bytes) {
  const m = parseMsg(bytes), g = f => first(m, f);
  const a = { slot: Number(g(1) ?? 0), id: Number(g(2) ?? 0) };
  if (g(3) !== undefined) a.wear = f32(g(3));      // sticker: slitage (0 = ny, 1 = helt skrapad)
  if (g(7) !== undefined) a.x = f32(g(7));
  if (g(8) !== undefined) a.y = f32(g(8));
  if (g(10) !== undefined) a.pattern = Number(g(10));
  return a;
}

export function extractHex(input) {
  input = input.trim();
  const m = input.match(/csgo_econ_action_preview(?:%20|\s|\+)*([0-9A-Fa-f]{16,})\s*$/);
  if (m) return m[1];
  if (/^[0-9A-Fa-f]{16,}$/.test(input)) return input;
  return null;
}

export function decodeInspect(input) {
  const hex = extractHex(input);
  if (!hex) {
    if (/[SM]\d{10,}A\d+D\d+/.test(input)) throw new Error("Det här är en äldre länk (S/A/D) – dess data finns bara hos Steams spelserver och kan inte avkodas i webbläsaren. Använd en länk med lång hex-kod (från ett CS2-inventory) eller mata in float och seed manuellt.");
    throw new Error("Hittade ingen inspect-data i texten.");
  }
  let bytes = Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16)));
  const key = bytes[0];
  if (key) bytes = bytes.map(x => x ^ key);
  let msg;
  try { msg = parseMsg(bytes.slice(1, bytes.length - 4)); } catch { throw new Error("Länken kunde inte tolkas – är hex-koden komplett och oförändrad?"); }
  const g = f => first(msg, f);
  const dec = new TextDecoder();
  const res = {
    accountId: Number(g(1) ?? 0), itemId: String(g(2) ?? ""), defIndex: Number(g(3) ?? 0), paintIndex: Number(g(4) ?? 0),
    rarity: Number(g(5) ?? 0), quality: Number(g(6) ?? 0), float: g(7) !== undefined ? f32(g(7)) : null, seed: Number(g(8) ?? 0),
    stattrak: g(10) !== undefined ? Number(g(10)) : null, nametag: g(11) ? dec.decode(g(11)) : "",
    stickers: msg.filter(x => x.f === 12).map(x => parseAttachment(x.v)),
    charms: msg.filter(x => x.f === 20).map(x => parseAttachment(x.v)),
  };
  if (!res.defIndex) throw new Error("Länken kunde inte tolkas (ingen vapendata).");
  return res;
}
