import { $, esc, imgUrl, kr, dec, MISSING, copyText, usd2sek, modal, toast, rarityOrder } from "../util.js";
import { D, lookup, bestUsd } from "../data.js";
import { pageHead, KIND_LABEL } from "./common.js";

/* Delning utan server: hela samlingen packas (deflate) i länkens #-del – inget laddas upp någonstans. */
const b64 = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

export async function encodeShare(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === "undefined") return "r" + b64(raw);
  return "z" + b64(await pipe(raw, new CompressionStream("deflate-raw")));
}
export async function decodeShare(s) {
  const bytes = unb64(s.slice(1));
  const raw = s[0] === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

export function shareModal(rows) {
  const favs = rows.filter(r => r.it.fav).length;
  modal(`<h3>Dela din samling</h3>
    <p class="muted small" style="margin-top:0">Skapar en länk som innehåller listan direkt i adressen – ingen server och inget konto. Alla som öppnar länken ser en skrivskyddad kopia med dagens priser.</p>
    <div class="form"><label class="full">Visningsnamn<input class="inp" id="sn" maxlength="40" placeholder="t.ex. Mina favoriter"></label>
      <label>Vad ska delas?<select class="inp" id="sc"><option value="fav" ${favs ? "selected" : ""}>Endast favoriter (${favs})</option><option value="all" ${favs ? "" : "selected"}>Allt utom dolda</option></select></label>
      <label>Visa<select class="inp" id="sv"><option value="1">Föremål med värden</option><option value="0">Endast föremål (inga värden)</option></select></label>
      <label class="full" style="grid-auto-flow:column;justify-content:start;align-items:center;gap:8px"><input type="checkbox" id="sf"> Visa float</label></div>
    <label class="muted small" style="display:grid;gap:4px;margin-top:10px">Länk<input class="inp" id="out" readonly style="width:100%"></label>
    <div class="muted small" id="info" style="margin-top:6px"></div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" data-close>Stäng</button><button class="btn" id="cp">Kopiera länk</button></div>`, {
    onMount: m => {
      const upd = async () => {
        const scope = $("#sc", m).value, items = rows.filter(r => !r.it.hidden && (scope === "all" || r.it.fav));
        const payload = { v: 1, n: $("#sn", m).value.trim(), t: Date.now(), sv: +$("#sv", m).value, i: items.map(r => { const a = [r.mhn, r.qty]; if (r.it.fav) a.push(1); else a.push(0); if ($("#sf", m).checked && r.float != null) a.push(+r.float.toFixed(5)); return a; }) };
        const url = location.origin + location.pathname + "#/share/" + await encodeShare(payload);
        $("#out", m).value = url;
        $("#info", m).innerHTML = `${items.length} föremål · ${url.length.toLocaleString("sv-SE")} tecken${url.length > 8000 ? ' · <span class="neg">långt – kan klippas av i vissa appar, prova bara favoriter</span>' : ""}`;
      };
      m.querySelectorAll("select,input").forEach(i => i.addEventListener(i.type === "text" ? "input" : "change", upd));
      $("#cp", m).addEventListener("click", () => copyText($("#out", m).value, "Länk kopierad"));
      upd();
    },
  });
}

export async function renderShare(root, token) {
  let p;
  try { p = await decodeShare(token); if (!Array.isArray(p.i)) throw 0; } catch { root.innerHTML = `<div class="empty">Länken är trasig eller för gammal.</div>`; return; }
  // Allt från länken är opålitligt: tvätta till rena typer (annars kan en manipulerad länk injicera HTML).
  const rows = p.i.slice(0, 5000).filter(a => Array.isArray(a) && typeof a[0] === "string").map(([mhn, qty, fav, fl]) => {
    const e = lookup(mhn)?.e, u = bestUsd(mhn);
    return { mhn: String(mhn).slice(0, 200), qty: Math.min(9999, Math.max(1, Math.floor(+qty) || 1)), fav: fav ? 1 : 0, fl: Number.isFinite(+fl) && fl !== null && fl !== 0 ? +(+fl).toFixed(5) : null, e, p: u ? usd2sek(u) : null };
  });
  p.t = Number(p.t) || Date.now(); p.sv = p.sv ? 1 : 0; p.n = typeof p.n === "string" ? p.n.slice(0, 60) : "";
  rows.sort((a, b) => (b.fav || 0) - (a.fav || 0) || (b.p ?? 0) * b.qty - (a.p ?? 0) * a.qty);
  const total = rows.reduce((t, r) => t + (r.p || 0) * r.qty, 0), count = rows.reduce((t, r) => t + r.qty, 0);
  const byKind = {}; for (const r of rows) { const k = r.e?.kind || "other"; byKind[k] = (byKind[k] || 0) + r.qty; }
  root.innerHTML = `${pageHead(p.n || "Delad samling", `${count} föremål · delad ${new Date(p.t).toLocaleDateString("sv-SE")} · skrivskyddad`)}
  <div class="row" style="margin-bottom:14px">${p.sv ? `<div class="panel stat"><div class="lbl">Uppskattat värde (lägsta marknadspris, idag)</div><div class="val num">${kr(total)}</div></div>` : ""}
    <div class="chips">${Object.entries(byKind).map(([k, n]) => `<span class="chip">${esc(KIND_LABEL[k] || k)} · ${n}</span>`).join("")}</div></div>
  <div class="cards">${rows.map(r => r.e ? `<a class="card" href="#/item/${esc(r.e.id)}" style="--rc:${esc(r.e.rc || "#666")}"><div class="im"><img loading="lazy" src="${esc(imgUrl(r.e.img))}" alt="">${r.fav ? '<span class="fav on" style="position:absolute;right:6px;top:6px">★</span>' : ""}${r.qty > 1 ? `<span class="tag">×${r.qty}</span>` : ""}</div><div class="bar"></div>
    <div class="bd"><div class="t1">${esc(r.e.w || KIND_LABEL[r.e.kind] || "")}</div><div class="t2" title="${esc(r.mhn)}">${esc(r.mhn.replace(/^.*?\| /, "").replace(/ \(.*\)$/, "") || r.mhn)}</div><div class="t1">${esc((r.mhn.match(/\(([^)]+)\)$/) || [])[1] || "")}${r.fl != null ? " · float " + dec(r.fl, 4) : ""}</div>${p.sv ? `<div class="pr">${r.p ? kr(r.p * r.qty) : MISSING}</div>` : ""}</div></a>`
    : `<div class="card"><div class="bd"><div class="t2">${esc(r.mhn)}</div>${r.qty > 1 ? `<div class="t1">×${r.qty}</div>` : ""}</div></div>`).join("")}</div>
  <p class="muted small" style="margin-top:16px">Vill du göra en egen? <a href="#/inventory" style="text-decoration:underline">Öppna My Inventory</a>.</p>`;
}
