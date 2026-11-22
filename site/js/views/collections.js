import { $, $$, esc, imgUrl, kr, krm, dec, usd2sek, toast, rarityOrder, WEAR_LONG, copyText, MISSING } from "../util.js";
import { all } from "../store.js";
import { D, MARKETS, mhnFor, priceRow, lookup } from "../data.js";
import { pageHead, emptyState, priceNote } from "./common.js";

const POLICY = { any: ["Alla slitage", null], mw: ["Minimal Wear eller bättre", ["FN", "MW"]], ft: ["Field-Tested eller bättre", ["FN", "MW", "FT"]], fn: ["Endast Factory New", ["FN"]] };
const S = { policy: "any", sort: "cost", q: "", hideDone: false, show: "all" };

// Billigaste sättet att äga skinet: lägsta pris bland tillåtna slitage och marknadsplatser (BUFF163 utelämnas – svårtillgänglig).
function cheapest(s) {
  const allowed = POLICY[S.policy][1];
  let best = null;
  for (const w of (s.wr.length ? s.wr : [null])) {
    if (allowed && !allowed.includes(w)) continue;
    const mhn = mhnFor(s, w), row = priceRow(mhn); if (!row) continue;
    for (const m of MARKETS) {
      if (m.key === "buff163" || m.key === "steam" || !row[m.key]) continue;
      if (!best || row[m.key] < best.usd) best = { usd: row[m.key], wear: w, mhn, market: m.name };
    }
  }
  return best;
}

async function ownedSkinIds() {
  const items = await all("items"), ids = new Set();
  for (const it of items) { const e = lookup(it.mhn)?.e; if (e) ids.add(e.id); }
  return ids;
}

function analyse(col, owned) {
  const skins = col.items.map(id => D.byId.get(id)).filter(s => s && s.wr);
  let have = 0, cost = 0, value = 0, unpriced = 0;
  const rows = skins.map(s => {
    const o = owned.has(s.id), c = cheapest(s);
    if (c) value += usd2sek(c.usd);
    if (o) have++; else if (c) cost += usd2sek(c.usd); else unpriced++;
    return { s, o, c };
  });
  return { col, rows, have, total: skins.length, cost, value, unpriced };
}

export async function renderCollections(root, args = []) {
  const owned = await ownedSkinIds();
  if (args[0] && D.colById.get(args[0])) return detail(root, analyse(D.colById.get(args[0]), owned));
  list(root, owned);
}

const policySel = () => `<select class="inp" id="pol" aria-label="Slitagekrav">${Object.entries(POLICY).map(([k, [l]]) => `<option value="${k}" ${k === S.policy ? "selected" : ""}>${l}</option>`).join("")}</select>`;
const fallbackImgs = host => host.querySelectorAll("img[data-fb]").forEach(i => i.addEventListener("error", () => i.remove(), { once: true }));

function list(root, owned) {
  const q = S.q.toLowerCase();
  let items = D.collections.map(c => analyse(c, owned)).filter(a => a.total && (!q || a.col.n.toLowerCase().includes(q)) && !(S.hideDone && a.have === a.total));
  const eff = a => a.have === a.total ? 1e12 : a.cost === 0 && a.unpriced ? 1e13 : a.cost; // kompletta och prislösa sist
  const key = { cost: (a, b) => eff(a) - eff(b), prog: (a, b) => b.have / b.total - a.have / a.total, value: (a, b) => b.value - a.value, name: (a, b) => a.col.n.localeCompare(b.col.n), size: (a, b) => b.total - a.total }[S.sort];
  items.sort(key);
  root.innerHTML = `${pageHead("Collection Tracker", "Se hur långt du kommit i varje samling, vilka skins du saknar och vad det billigaste sättet att komplettera den kostar.")}
  <div class="toolbar"><input class="inp" id="q" placeholder="Sök samling…" value="${esc(S.q)}" aria-label="Sök samling">${policySel()}
    <select class="inp" id="so" aria-label="Sortera">${[["cost", "Billigast att slutföra"], ["value", "Högst samlingsvärde"], ["prog", "Mest klar"], ["size", "Störst"], ["name", "Namn"]].map(([v, l]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <label class="chip ${S.hideDone ? "on" : ""}" id="hd">Dölj kompletta</label></div>
  ${items.length ? `<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${items.map(a => {
    const imgs = a.rows.filter(r => r.s.img).sort((x, y) => rarityOrder.indexOf(y.s.r) - rarityOrder.indexOf(x.s.r)).slice(0, 3).map(r => `<img loading="lazy" src="${esc(imgUrl(r.s.img, "128fx96f"))}" alt="" width="128" height="96" style="width:33%;height:64px;object-fit:contain">`).join("");
    return `<a class="card" href="#/collections/${esc(a.col.id)}"><div class="im" style="aspect-ratio:auto;padding:12px 6px;display:flex;position:relative">${imgs}${a.col.img ? `<img data-fb src="${esc(a.col.img)}" alt="" style="position:absolute;right:8px;top:8px;width:28px;height:28px;object-fit:contain;opacity:.8">` : ""}</div><div class="bar" style="--rc:${a.have === a.total ? "#7ec699" : "#555"}"></div>
      <div class="bd"><div class="t2" title="${esc(a.col.n)}">${esc(a.col.n)}</div><div class="t1">${a.have}/${a.total} ägda${a.col.rd ? " · " + esc(a.col.rd.slice(0, 4)) : ""}</div>
      <div style="height:5px;background:var(--line);border-radius:3px;margin:6px 0"><div style="height:5px;width:${a.have / a.total * 100}%;background:${a.have === a.total ? "#7ec699" : "#8a9099"};border-radius:3px"></div></div>
      <div class="row spread small"><span class="muted">${a.have === a.total ? "Komplett" : "Kvar att köpa"}</span><span class="num">${a.have === a.total ? "✓" : a.cost || !a.unpriced ? kr(a.cost) : MISSING}</span></div>
      <div class="row spread small"><span class="muted">Samlingsvärde</span><span class="num">${a.value ? kr(a.value) : MISSING}</span></div>${a.unpriced ? `<div class="muted small">${a.unpriced} skins utan pris</div>` : ""}</div></a>`;
  }).join("")}</div>` : emptyState("Inga samlingar matchar", "Prova att ta bort något filter.")}
  <p class="muted small" style="margin-top:14px">"Äger" räknas från ditt inventory (valfritt slitage). ${esc(priceNote())} Billigaste vägen = lägsta pris bland riktiga marknadsplatser och tillåtna slitage.</p>`;
  fallbackImgs(root);
  $("#q", root).addEventListener("input", e => { S.q = e.target.value; clearTimeout(list.t); list.t = setTimeout(() => list(root, owned), 200); });
  $("#pol", root).addEventListener("change", e => { S.policy = e.target.value; list(root, owned); });
  $("#so", root).addEventListener("change", e => { S.sort = e.target.value; list(root, owned); });
  $("#hd", root).addEventListener("click", () => { S.hideDone = !S.hideDone; list(root, owned); });
}

function detail(root, a) {
  const missing = a.rows.filter(r => !r.o && r.c);
  const groups = [...new Set(a.rows.map(r => r.s.r))].sort((x, y) => rarityOrder.indexOf(y) - rarityOrder.indexOf(x));
  const text = `${a.col.n} – saknas (${missing.length})\n` + missing.map(r => `- ${r.c.mhn}: ${kr(usd2sek(r.c.usd))} (${r.c.market})`).join("\n") + `\nTotalt: ${kr(a.cost)}`;
  const visible = r => S.show === "all" || (S.show === "own") === r.o;
  root.innerHTML = `<a class="muted small" href="#/collections">← Alla samlingar</a>${pageHead(a.col.n, `${a.have} av ${a.total} ägda${a.col.rd ? " · släppt " + a.col.rd : ""}`)}
  <div class="grid cols-4" style="margin-bottom:14px"><div class="panel stat"><div class="lbl">Framsteg</div><div class="val num">${Math.round(a.have / a.total * 100)} %</div><div class="sub">${a.have}/${a.total} skins</div></div>
    <div class="panel stat"><div class="lbl">Kvar att köpa</div><div class="val num">${kr(a.cost)}</div><div class="sub">${missing.length} skins · billigaste vägen</div></div>
    <div class="panel stat"><div class="lbl">Samlingsvärde</div><div class="val num">${a.value ? kr(a.value) : "–"}</div><div class="sub">alla skins, lägsta pris</div></div>
    <div class="panel stat"><div class="lbl">Slitagekrav</div>${policySel()}</div></div>
  <div class="toolbar"><div class="seg" id="showSeg">${[["all", "Alla"], ["own", "Äger"], ["miss", "Saknas"]].map(([v, l]) => `<button data-v="${v}" class="${S.show === v ? "on" : ""}">${l}</button>`).join("")}</div>${missing.length ? `<button class="btn ghost" id="cp">Kopiera inköpslista</button>` : ""}</div>
  ${groups.map(g => { const rs = a.rows.filter(r => r.s.r === g && visible(r)).sort((x, y) => (usd2sek(y.c?.usd) || 0) - (usd2sek(x.c?.usd) || 0)); return rs.length ? `<h2 style="margin-top:18px">${esc(g)}</h2><div class="cards">${rs.map(r => `<a class="card" href="#/item/${esc(r.s.id)}" style="--rc:${esc(r.s.rc)};${r.o ? "opacity:.6" : ""}"><div class="im"><img loading="lazy" src="${esc(imgUrl(r.s.img, "192fx144f"))}" alt="" width="192" height="144"><span class="tag ${r.o ? "pos" : ""}">${r.o ? "✓ Äger" : "Saknas"}</span></div><div class="bar"></div>
      <div class="bd"><div class="t1">${esc(r.s.w)}</div><div class="t2">${esc(r.s.p || r.s.n)}</div><div class="pr num">${r.c ? kr(usd2sek(r.c.usd)) : MISSING}</div>${r.c ? `<div class="faint small">${r.c.wear ? WEAR_LONG[r.c.wear] + " · " : ""}${esc(r.c.market)}</div>` : ""}</div></a>`).join("")}</div>` : ""; }).join("") || emptyState("Inga skins att visa", "Byt filter ovan.")}
  <p class="muted small" style="margin-top:14px">${esc(priceNote())}</p>`;
  $("#pol", root).addEventListener("change", e => { S.policy = e.target.value; renderCollections(root, [a.col.id]); });
  $$("#showSeg button", root).forEach(b => b.addEventListener("click", () => { S.show = b.dataset.v; detail(root, a); }));
  $("#cp", root)?.addEventListener("click", () => copyText(text, "Inköpslistan kopierad"));
}
