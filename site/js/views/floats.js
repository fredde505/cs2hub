import { $, $$, esc, imgUrl, dec, wearFromFloat, WEARS, WEAR_LONG, WEAR_RANGE } from "../util.js";
import { all } from "../store.js";
import { D, lookup } from "../data.js";
import { pageHead, itemPicker } from "./common.js";

// Droppade floats fördelas jämnt över skinets intervall, så P(float ≤ x) = (x − min) / (max − min).
const pLow = (s, f) => Math.min(1, Math.max(0, (f - s.f[0]) / ((s.f[1] - s.f[0]) || 1)));
const odds = p => p <= 0 ? "unikt bästa" : p >= 0.5 ? `${dec(p * 100, 0)} %` : "1 på " + Math.round(1 / p).toLocaleString("sv-SE");
const pctTxt = p => dec(p * 100, p < 0.01 ? 3 : 1) + " %";
const S = { id: null, f: "" };

export async function renderFloats(root) {
  const items = (await all("items")).filter(i => i.float != null);
  root.innerHTML = `${pageHead("Float Ranking", "Hur bra är din float? Se sannolikheter, slitagefördelning och en rankning av dina egna floats.")}
  <div class="panel" style="margin-bottom:14px"><h2>Float Checker</h2><div id="pk"></div><div id="chk" style="margin-top:12px"></div></div>
  <div class="panel"><h2>Mina bästa floats</h2>${mine(items)}</div>
  <p class="muted small" style="margin-top:12px">Rankningen utgår från att floats vid drop fördelas jämnt över skinets intervall. En riktig global rankning bland alla existerande skins kräver en floatdatabas från marknadsplatser som CSFloat, vilken inte går att läsa fritt från webbläsaren.</p>`;
  itemPicker($("#pk", root), s => { if (!s.f) return $("#chk", root).innerHTML = `<div class="muted">${esc(s.n)} har ingen float (vanilla-kniv).</div>`; S.id = s.id; S.f = ((s.f[0] + s.f[1]) / 2).toFixed(4); check(root); }, { kinds: ["weapon", "knife", "glove"], placeholder: "Sök skin (t.ex. AK-47 Redline)…" });
  if (S.id) check(root);
}

function check(root) {
  const s = D.byId.get(S.id), host = $("#chk", root); if (!s?.f) return;
  const [lo, hi] = s.f, f = Math.min(hi, Math.max(lo, +S.f || lo)), p = pLow(s, f), w = wearFromFloat(f);
  const dist = WEARS.filter(x => s.wr.includes(x)).map(x => { const [a, b] = WEAR_RANGE[x]; const share = Math.max(0, Math.min(b, hi) - Math.max(a, lo)) / ((hi - lo) || 1); return { x, a: Math.max(a, lo), b: Math.min(b, hi), share }; }).filter(d => d.share > 0);
  host.innerHTML = `<div class="row" style="margin-bottom:10px"><img src="${esc(imgUrl(s.img, "128fx96f"))}" style="width:72px" alt=""><div><b>${esc(s.n)}</b><div class="muted small">Möjligt intervall ${dec(lo, 2)} – ${dec(hi, 2)}</div></div></div>
    <div class="form" style="max-width:420px"><label>Din float<input class="inp" id="ff" type="number" step="0.0001" min="${lo}" max="${hi}" value="${esc(S.f)}"></label></div>
    <div class="grid cols-3" style="margin:12px 0"><div class="panel stat"><div class="lbl">Slitage</div><div class="val" style="font-size:18px">${WEAR_LONG[w]}</div></div>
      <div class="panel stat"><div class="lbl">Lägre float vid drop</div><div class="val num" style="font-size:18px">${pctTxt(p)}</div><div class="sub">${odds(p)} är lägre</div></div>
      <div class="panel stat"><div class="lbl">Högre float vid drop</div><div class="val num" style="font-size:18px">${pctTxt(1 - p)}</div><div class="sub">${odds(1 - p)} är högre</div></div></div>
    <div class="fbar"><i style="left:${f * 100}%;width:3px"></i></div><div class="fscale"><span>0,00</span><span>0,07</span><span>0,15</span><span>0,38</span><span>0,45</span><span>1,00</span></div>
    <h2 style="margin-top:16px">Slitagefördelning vid drop</h2><table class="tbl"><tbody>${dist.map(d => `<tr><td>${WEAR_LONG[d.x]}</td><td class="num muted">${dec(d.a, 2)}–${dec(d.b, 2)}</td><td style="width:40%"><div style="height:5px;background:var(--line);border-radius:3px"><div style="height:5px;width:${d.share * 100}%;background:#8a9099;border-radius:3px"></div></div></td><td class="r num">${pctTxt(d.share)}</td></tr>`).join("")}</tbody></table>`;
  $("#ff", host).addEventListener("input", e => { S.f = e.target.value; clearTimeout(check.t); check.t = setTimeout(() => check(root), 350); });
}

function mine(items) {
  const rows = items.map(i => { const e = lookup(i.mhn)?.e; return e?.f ? { i, e, p: pLow(e, i.float) } : null; }).filter(Boolean);
  if (!rows.length) return `<div class="empty small">Inga föremål med float i ditt inventory. Lägg till float via Redigera, eller via Inspect &amp; Float.</div>`;
  const group = {}; rows.forEach(r => (group[r.e.id] ||= []).push(r));
  Object.values(group).forEach(g => g.sort((a, b) => a.i.float - b.i.float).forEach((r, k) => r.rank = k + 1));
  rows.forEach(r => { r.best = Math.min(r.p, 1 - r.p); r.dir = r.p <= 0.5 ? "Låg" : "Hög"; });
  rows.sort((a, b) => a.best - b.best);
  return `<div class="scroll-x"><table class="tbl"><thead><tr><th>Föremål</th><th class="r">Float</th><th>Slitage</th><th class="r">Placering</th><th class="r hide-m">Egen rank</th></tr></thead><tbody>${rows.map(r => `<tr><td><div class="nm"><span class="rar" style="--rc:${esc(r.e.rc)}"></span><img loading="lazy" src="${esc(imgUrl(r.e.img, "96fx72f"))}" alt=""><a class="n2" href="#/item/${esc(r.e.id)}">${esc(r.i.mhn)}</a></div></td>
    <td class="r num">${dec(r.i.float, 5)}</td><td>${wearFromFloat(r.i.float)}</td><td class="r num">${r.dir} float · topp ${pctTxt(r.best)}<div class="muted small">${odds(r.best)}</div></td><td class="r num hide-m">${r.rank}/${group[r.e.id].length}</td></tr>`).join("")}</tbody></table></div>`;
}
