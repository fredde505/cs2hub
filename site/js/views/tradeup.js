import { $, $$, esc, imgUrl, kr, krm, dec, pct, cls, signKr, usd2sek, wearFromFloat, WEAR_LONG, notice, MISSING } from "../util.js";
import { D, mhnFor, priceInfo, cashUsd } from "../data.js";
import { pageHead, itemPicker, dispName, emptyState, priceNote } from "./common.js";

// CS2:s trade-up-regler: 10 skins av samma rarity (inte Covert/Contraband), alla StatTrak™ eller inga, ingen Souvenir.
const NEXT = { "Consumer Grade": "Industrial Grade", "Industrial Grade": "Mil-Spec Grade", "Mil-Spec Grade": "Restricted", "Restricted": "Classified", "Classified": "Covert" };
const st = { entries: [], stattrak: false }; // entries: {id, float, count, price|null}

const mhnOf = (s, fl) => mhnFor(s, wearFromFloat(fl), { st: st.stattrak });
const unitPrice = (s, fl) => { const i = priceInfo(mhnOf(s, fl)); return i ? usd2sek(i.usd) : null; };
const unitNet = (s, fl) => { const c = cashUsd(mhnOf(s, fl)); return c ? usd2sek(c) : null; };
const total = () => st.entries.reduce((t, e) => t + e.count, 0);

function outcomes() {
  if (total() !== 10) return null;
  const perCol = new Map(); let normSum = 0;
  for (const e of st.entries) {
    const s = D.byId.get(e.id), [lo, hi] = s.f;
    normSum += e.count * (Math.min(Math.max(e.float, lo), hi) - lo) / ((hi - lo) || 1);
    const c = s.col[0]; perCol.set(c, (perCol.get(c) || 0) + e.count);
  }
  const avgNorm = normSum / 10, next = NEXT[D.byId.get(st.entries[0].id).r];
  const out = [];
  for (const [cid, cnt] of perCol) {
    const col = D.colById.get(cid);
    const pool = (col?.items || []).map(i => D.byId.get(i)).filter(s => s && s.f && s.r === next && (!st.stattrak || s.st));
    for (const s of pool) {
      const fl = s.f[0] + avgNorm * (s.f[1] - s.f[0]), w = wearFromFloat(fl);
      out.push({ s, col, prob: cnt / 10 / pool.length, fl, w, price: unitPrice(s, fl), net: unitNet(s, fl) });
    }
  }
  return out.sort((a, b) => b.prob - a.prob || (b.price ?? 0) - (a.price ?? 0));
}

/** Kontrollera kontraktet mot reglerna – returnerar [{ok, text}]. */
function rules() {
  const n = total(), skins = st.entries.map(e => D.byId.get(e.id));
  const rar = new Set(skins.map(s => s.r)), first = skins[0];
  return [
    { ok: n === 10, text: `Exakt 10 skins (${n}/10)` },
    { ok: !skins.length || rar.size === 1, text: "Alla skins har samma rarity" + (first ? ` (${first.r})` : "") },
    { ok: !skins.length || !!NEXT[first.r], text: "Rarity får inte vara Covert eller högre (inget tier över)" },
    { ok: !st.stattrak || skins.every(s => s.st), text: st.stattrak ? "Alla skins finns som StatTrak™" : "Inga StatTrak™-skins blandas in" },
    { ok: skins.every(s => s.col.length > 0), text: "Alla skins tillhör en samling" },
  ];
}

export function renderTradeup(root) {
  const draw = () => {
    const n = total(), rl = rules(), valid = rl.every(r => r.ok);
    const lines = st.entries.map(e => { const s = D.byId.get(e.id), p = e.price ?? unitPrice(s, e.float); return { e, s, p }; });
    const cost = lines.reduce((t, l) => t + (l.p ?? 0) * l.e.count, 0), missIn = lines.filter(l => l.p == null).length;
    const res = valid ? outcomes() : null;
    const ev = res ? res.reduce((t, o) => t + o.prob * (o.price ?? 0), 0) : null;
    const evNet = res ? res.reduce((t, o) => t + o.prob * (o.net ?? 0), 0) : null;
    const win = res ? res.filter(o => (o.price ?? 0) > cost).reduce((t, o) => t + o.prob, 0) : null;
    const missOut = res ? res.filter(o => o.price == null).length : 0;
    const avgF = n ? st.entries.reduce((t, e) => t + e.count * e.float, 0) / n : 0;
    root.innerHTML = `${pageHead("Trade-up Calculator", "Välj 10 skins av samma rarity. Se möjliga utfall, sannolikheter, genomsnittlig float, förväntat värde och break-even.")}
    <div class="grid split" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start">
      <div class="panel"><div class="row spread"><h2 style="margin:0">Input (${n}/10)</h2><label class="chip ${st.stattrak ? "on" : ""}" id="stt">StatTrak™</label></div>
        <div style="margin:10px 0" id="pk"></div>
        ${st.entries.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Skin</th><th class="r">Float</th><th class="r">Antal</th><th class="r">Pris/st</th><th class="r">Summa</th><th></th></tr></thead><tbody>${lines.map(({ e, s, p }, i) => `<tr><td><div class="n2">${esc(dispName(s))}</div><div class="muted small">${esc(s.r)} · ${esc(s.cn[0] || "")}</div></td>
          <td class="r"><input class="inp" data-f="${i}" type="number" step="0.001" min="${s.f[0]}" max="${s.f[1]}" value="${e.float}" style="width:84px" aria-label="Float"></td>
          <td class="r"><input class="inp" data-c="${i}" type="number" min="1" max="10" value="${e.count}" style="width:56px" aria-label="Antal"></td>
          <td class="r"><input class="inp" data-p="${i}" type="number" min="0" step="0.01" placeholder="${p != null ? dec(p, 2) : "pris saknas"}" value="${e.price ?? ""}" style="width:96px" aria-label="Pris per st"></td>
          <td class="r num">${p != null ? kr(p * e.count) : MISSING}</td>
          <td class="r"><button class="btn ghost sm danger" data-x="${i}" aria-label="Ta bort">✕</button></td></tr>`).join("")}</tbody></table></div>` : emptyState("Inga skins tillagda", "Sök och lägg till skins ovan. Alla 10 måste ha samma rarity.")}
        <div class="row spread" style="margin-top:12px"><span class="muted small">Snittfloat ${n ? dec(avgF, 4) : "–"}</span><b class="num">Kostnad: ${kr(cost)}</b></div>
        ${missIn ? `<div class="small" style="margin-top:6px"><span class="miss">Pris saknas</span> <span class="muted">för ${missIn} skin – fyll i pris själv så räknas det med.</span></div>` : ""}
        <div class="small" style="margin-top:12px"><b>Kontroll mot CS2:s regler</b>${rl.map(r => `<div class="${r.ok ? "pos" : "neg"}">${r.ok ? "✓" : "✗"} ${esc(r.text)}</div>`).join("")}</div>
        <button class="btn ghost sm" id="clr" style="margin-top:8px">Töm</button></div>
      <div class="panel"><h2>Resultat</h2>${res ? summary(res, cost, ev, evNet, win, missOut) : emptyState(valid ? "" : "Kontraktet är inte komplett", n < 10 ? `Lägg till ${10 - n} skins till för att se utfall.` : "Åtgärda punkterna med ✗ till vänster för att se utfall.")}</div></div>
    <p class="muted small" style="margin-top:14px">${esc(priceNote())} Priserna räknar inte med att kontraktet kan ge föremål med annan float än antagen.</p>`;
    bind();
  };

  const bind = () => {
    itemPicker($("#pk", root), s => {
      if (!s.wr || !s.f || !NEXT[s.r] || !s.col.length) return notice("Den här skinen kan inte användas i ett trade-up här (rarity eller samling saknas, eller så är den en kniv/handske).");
      if (st.entries.length && D.byId.get(st.entries[0].id).r !== s.r) return notice("Alla skins måste ha samma rarity (" + D.byId.get(st.entries[0].id).r + ").");
      if (st.stattrak && !s.st) return notice("Skinen finns inte som StatTrak™.");
      const ex = st.entries.find(e => e.id === s.id);
      if (ex) ex.count = Math.min(10, ex.count + 1); else st.entries.push({ id: s.id, float: +((s.f[0] + s.f[1]) / 2).toFixed(3), count: Math.max(1, Math.min(10 - total(), 10)), price: null });
      draw();
    }, { kinds: ["weapon"], placeholder: "Sök skin att lägga till…" });
    $("#stt", root).addEventListener("click", () => { st.stattrak = !st.stattrak; draw(); });
    $("#clr", root).addEventListener("click", () => { st.entries = []; draw(); });
    const num = (sel, key, fn) => $$(sel, root).forEach(el => el.addEventListener("change", () => { fn(st.entries[+el.dataset[key]], el.value); draw(); }));
    num("[data-f]", "f", (e, v) => e.float = Math.max(0, Math.min(1, +v || 0)));
    num("[data-c]", "c", (e, v) => e.count = Math.max(1, Math.min(10, Math.floor(+v) || 1)));
    num("[data-p]", "p", (e, v) => e.price = v === "" || !Number.isFinite(+v) ? null : +v);
    $$("[data-x]", root).forEach(b => b.addEventListener("click", () => { st.entries.splice(+b.dataset.x, 1); draw(); }));
  };
  draw();
}

function summary(res, cost, ev, evNet, win, missOut) {
  const roi = cost ? (ev / cost - 1) * 100 : null, breakEven = ev;
  return `<div class="grid cols-2" style="margin-bottom:12px"><div><div class="muted small">Förväntat värde (marknadspris)</div><div class="num" style="font-size:22px;font-weight:600">${kr(ev)}</div><div class="muted small">≈ ${kr(evNet)} netto efter avgift</div></div>
    <div><div class="muted small">Förväntad vinst</div><div class="num ${cls(ev - cost)}" style="font-size:22px;font-weight:600">${signKr(ev - cost)}</div><div class="small ${cls(roi)}">${pct(roi)}</div></div></div>
    <div class="grid cols-2" style="margin-bottom:10px"><div class="muted small">Break-even-kostnad<br><b class="num" style="color:var(--text)">${kr(breakEven)}</b> totalt (${kr(breakEven / 10)} per skin)</div><div class="muted small">Chans till vinst<br><b class="num" style="color:var(--text)">${dec(win * 100, 1)} %</b> · ${res.length} utfall</div></div>
    ${missOut ? `<div class="small" style="margin-bottom:8px"><span class="miss">Pris saknas</span> <span class="muted">för ${missOut} utfall – förväntat värde är därför lägre än verkligheten kan vara.</span></div>` : ""}
    <div class="scroll-x"><table class="tbl"><thead><tr><th>Utfall</th><th class="r">Chans</th><th class="r hide-m">Float</th><th class="r">Värde</th></tr></thead><tbody>${res.slice(0, 40).map(o => `<tr><td><div class="nm"><span class="rar" style="--rc:${esc(o.s.rc)}"></span><img loading="lazy" src="${esc(imgUrl(o.s.img, "96fx72f"))}" alt="" width="56" height="42"><div><div class="n2">${esc(o.s.p ? `${o.s.w} | ${o.s.p}` : o.s.n)}</div><div class="n1">${esc(o.col?.n || "")}</div></div></div></td>
      <td class="r num">${dec(o.prob * 100, 1)} %</td><td class="r num hide-m">${dec(o.fl, 4)}<div class="muted small">${o.w}</div></td><td class="r num ${(o.price ?? 0) > cost ? "pos" : ""}">${krm(o.price)}</td></tr>`).join("")}</tbody></table></div>
    ${res.length > 40 ? `<div class="muted small">Visar 40 av ${res.length}.</div>` : ""}
    <div class="muted small" style="margin-top:8px">Output-float = lägsta + snitt av input (normaliserad) × spannet.</div>`;
}
