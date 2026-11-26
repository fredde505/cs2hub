import { $, $$, esc, imgUrl, kr, krm, dec, usd2sek, toast, rarityOrder, WEAR_LONG, copyText, MISSING } from "../util.js";
import { all, getKV, setKV } from "../store.js";
import { D, MARKETS, mhnFor, priceRow, lookup } from "../data.js";
import { pageHead, emptyState, priceNote } from "./common.js";
import { parseDec, parseMoney, inputMoney, curSym } from "../util.js";
import { analysePrice } from "../pricing.js";
import { planCollection, progress, COLLECTION_SORTS, sortCollections, cleanGoals } from "../planner-core.js";

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
    const flag = c && !o ? analysePrice(D.P.p[c.mhn] || null, { ageMs: D.priceAge ? Date.now() - D.priceAge : 0, mhn: c.mhn }) : null; // pristillförlitlighet för det billigaste alternativet
    return { s, o, c, flag };
  });
  return { col, rows, have, total: skins.length, cost, value, unpriced };
}

export async function renderCollections(root, args = []) {
  const owned = await ownedSkinIds();
  const goalsAll = cleanGoals(await getKV("colGoals", null)), bud = await getKV("colBudgets", null);
  const plan = { goalsAll, budgets: (typeof bud === "object" && bud && !Array.isArray(bud)) ? bud : {} };
  if (args[0] && D.colById.get(args[0])) return detail(root, analyse(D.colById.get(args[0]), owned), plan);
  list(root, owned, goalsAll);
}

const policySel = () => `<select class="inp" id="pol" aria-label="Slitagekrav">${Object.entries(POLICY).map(([k, [l]]) => `<option value="${k}" ${k === S.policy ? "selected" : ""}>${l}</option>`).join("")}</select>`;
const fallbackImgs = host => host.querySelectorAll("img[data-fb]").forEach(i => i.addEventListener("error", () => i.remove(), { once: true }));

function list(root, owned, goalsAll = {}) {
  const q = S.q.toLowerCase();
  let items = D.collections.map(c => analyse(c, owned)).filter(a => a.total && (!q || a.col.n.toLowerCase().includes(q)) && !(S.hideDone && a.have === a.total));
  items = sortCollections(items, S.sort); // kompletta sist, samlingar med saknade priser efter de fullt prissatta
  root.innerHTML = `${pageHead("Collection Tracker", "Se hur långt du kommit i varje samling, vilka skins du saknar och vad det billigaste sättet att komplettera den kostar.")}
  <div class="toolbar"><input class="inp" id="q" placeholder="Sök samling…" value="${esc(S.q)}" aria-label="Sök samling">${policySel()}
    <select class="inp" id="so" aria-label="Sortera">${Object.entries(COLLECTION_SORTS).map(([v, [l]]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <label class="chip ${S.hideDone ? "on" : ""}" id="hd">Dölj kompletta</label></div>
  ${items.length ? `<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${items.map(a => {
    const imgs = a.rows.filter(r => r.s.img).sort((x, y) => rarityOrder.indexOf(y.s.r) - rarityOrder.indexOf(x.s.r)).slice(0, 3).map(r => `<img loading="lazy" src="${esc(imgUrl(r.s.img, "128fx96f"))}" alt="" width="128" height="96" style="width:33%;height:64px;object-fit:contain">`).join("");
    return `<a class="card" href="#/collections/${esc(a.col.id)}"><div class="im" style="aspect-ratio:auto;padding:12px 6px;display:flex;position:relative">${imgs}${a.col.img ? `<img data-fb src="${esc(a.col.img)}" alt="" style="position:absolute;right:8px;top:8px;width:28px;height:28px;object-fit:contain;opacity:.8">` : ""}</div><div class="bar" style="--rc:${a.have === a.total ? "#7ec699" : "#555"}"></div>
      <div class="bd"><div class="t2" title="${esc(a.col.n)}">${esc(a.col.n)}</div><div class="t1">${a.have}/${a.total} ägda${a.col.rd ? " · " + esc(a.col.rd.slice(0, 4)) : ""}${goalsAll[a.col.id]?.length ? ` · ★ ${goalsAll[a.col.id].length} mål` : ""}</div>
      <div style="height:5px;background:var(--line);border-radius:3px;margin:6px 0"><div style="height:5px;width:${a.have / a.total * 100}%;background:${a.have === a.total ? "#7ec699" : "#8a9099"};border-radius:3px"></div></div>
      <div class="row spread small"><span class="muted">${a.have === a.total ? "Komplett" : "Kvar att köpa"}</span><span class="num">${a.have === a.total ? "✓" : a.cost || !a.unpriced ? kr(a.cost) : MISSING}</span></div>
      <div class="row spread small"><span class="muted">Samlingsvärde</span><span class="num">${a.value ? kr(a.value) : MISSING}</span></div>${a.unpriced ? `<div class="muted small">${a.unpriced} skins utan pris</div>` : ""}</div></a>`;
  }).join("")}</div>` : emptyState("Inga samlingar matchar", "Prova att ta bort något filter.")}
  <p class="muted small" style="margin-top:14px">"Äger" räknas från ditt inventory (valfritt slitage). ${esc(priceNote())} Billigaste vägen = lägsta pris bland riktiga marknadsplatser och tillåtna slitage.</p>`;
  fallbackImgs(root);
  $("#q", root).addEventListener("input", e => { S.q = e.target.value; clearTimeout(list.t); list.t = setTimeout(() => list(root, owned, goalsAll), 200); });
  $("#pol", root).addEventListener("change", e => { S.policy = e.target.value; list(root, owned, goalsAll); });
  $("#so", root).addEventListener("change", e => { S.sort = e.target.value; list(root, owned, goalsAll); });
  $("#hd", root).addEventListener("click", () => { S.hideDone = !S.hideDone; list(root, owned, goalsAll); });
}

/** Planeraren: budget, mål och billigaste ordningen att slutföra samlingen. */
function plannerHtml(a, pr, goals, budget) {
  const rowsP = a.rows.map(r => ({ id: r.s.id, name: (r.s.w ? r.s.w + " | " : "") + (r.s.p || r.s.n), owned: r.o, cost: r.c ? usd2sek(r.c.usd) : null, r }));
  const p = planCollection(rowsP, { budget, goals });
  const prog = progress(rowsP, goals);
  const inBuy = new Set(p.buy.map(x => x.id));
  const missingAll = rowsP.filter(r => !r.owned);
  if (!missingAll.length) return { html: `<div class="panel" style="margin-bottom:14px"><h2>Planerare</h2><p class="small" style="margin:0">✓ Samlingen är komplett – inget att planera.</p></div>`, p };
  const line = (x, extra = "") => `<tr style="${p.hasBudget && !inBuy.has(x.id) && Number.isFinite(x.cost) ? "opacity:.55" : ""}"><td class="num faint">${extra}</td><td><a href="#/item/${esc(x.id)}" class="n2">${esc(x.name)}</a>${x.r.flag && (x.r.flag.level === "uncertain" || x.r.flag.level === "stale") ? ` <span class="miss" title="${esc(x.r.flag.reasons.join(" "))}">${esc(x.r.flag.label)}</span>` : ""}<div class="faint small">${x.r.c ? (x.r.c.wear ? WEAR_LONG[x.r.c.wear] + " · " : "") + esc(x.r.c.market) : "pris saknas"}</div></td>
    <td class="r num">${Number.isFinite(x.cost) ? kr(x.cost) : MISSING}</td><td class="r num hide-m">${x.cum != null ? kr(x.cum) : ""}</td><td class="r">${p.hasBudget && inBuy.has(x.id) ? '<span class="pos small">✓ ryms</span> ' : ""}<label class="chip ${goals.has(x.id) ? "on" : ""}" style="cursor:pointer"><input type="checkbox" data-goal="${esc(x.id)}" ${goals.has(x.id) ? "checked" : ""} hidden>★ Mål</label></td></tr>`;
  // alla saknade, prissatta i köpordning (billigast först) och prislösa sist – oavsett om mål är valda (målen markeras, planen räknas på dem)
  const allPlan = planCollection(rowsP, { budget, goals: null }), shown = [...allPlan.order, ...allPlan.unpriced.map(x => ({ ...x, cum: null }))];
  const sum = [];
  sum.push(`Saknas: <b>${missingAll.length}</b> skins${p.useGoals ? ` · mål: <b>${prog.goalTotal}</b> (${prog.goalHave} redan ägda)` : ""}. Billigaste vägen för ${p.useGoals ? "målen" : "hela samlingen"}: <b>${kr(p.totalCost)}</b>${p.unpriced.length ? ` + ${p.unpriced.length} utan pris (kostnaden är ofullständig)` : ""}.`);
  if (p.hasBudget) sum.push(p.fitsAll ? `Med budgeten ${kr(budget)} <b class="pos">räcker det till allt</b>${p.useGoals ? " du markerat" : ""} – kvar ${kr(p.budgetLeft)}.` : `Med budgeten ${kr(budget)} kan du köpa <b>${p.buy.length}</b> av ${p.order.length} prissatta (billigaste först) för ${kr(p.spent)}, kvar ${kr(p.budgetLeft)}. För att ta allt behövs <b>${kr(p.shortfall)}</b> till.`);
  if (p.expensive.length) sum.push(`Dyraste kvar: ${p.expensive.slice(0, 3).map(x => `${esc(x.name)} (${kr(x.cost)})`).join(", ")}.`);
  const html = `<div class="panel" id="plan" style="margin-bottom:14px"><div class="row spread" style="flex-wrap:wrap;gap:10px"><h2 style="margin:0">Planerare</h2>
      <div class="row" style="gap:8px"><label class="muted small">Budget (${curSym()}) <input class="inp" id="bud" inputmode="decimal" value="${budget != null ? esc(inputMoney(budget, 0)) : ""}" placeholder="ingen" style="width:110px"></label><button class="btn ghost sm" id="goalAll">Alla saknade som mål</button><button class="btn ghost sm" id="goalNone" ${goals.size ? "" : "disabled"}>Rensa mål</button></div></div>
      <div class="small" style="margin:10px 0;line-height:1.7">${sum.map(s => `<div>${s}</div>`).join("")}</div>
      <div class="panel scroll-x" style="padding:0"><table class="tbl"><thead><tr><th>#</th><th>Skin (köpordning: billigast först)</th><th class="r">Pris</th><th class="r hide-m">Totalt hittills</th><th class="r">Mål</th></tr></thead><tbody>${shown.map((x, i) => line(x, x.cum != null ? i + 1 : "–")).join("")}</tbody></table></div>
      <p class="muted small" style="margin:8px 0 0">Billigaste ordningen maximerar antalet skins inom budgeten. Priserna är lägsta utropspris på riktiga marknadsplatser med ditt slitagekrav. Mål och budget sparas i den här webbläsaren. Skins markerade med ”Osäkert pris” kan bli dyrare i verkligheten.</p></div>`;
  return { html, p, rowsP };
}

function detail(root, a, pl = { goalsAll: {}, budgets: {} }) {
  const goals = new Set(pl.goalsAll[a.col.id] || []), budget = Number.isFinite(pl.budgets[a.col.id]) ? pl.budgets[a.col.id] : null;
  const planner = plannerHtml(a, pl, goals, budget);
  const missing = a.rows.filter(r => !r.o && r.c);
  const groups = [...new Set(a.rows.map(r => r.s.r))].sort((x, y) => rarityOrder.indexOf(y) - rarityOrder.indexOf(x));
  // Inköpslistan följer planen: bara det som ryms i budgeten om en budget är satt, annars mål eller alla saknade – i köpordning
  const listRows = planner.p.hasBudget ? planner.p.buy : planner.p.order, listTotal = listRows.length ? listRows[listRows.length - 1].cum : 0;
  const text = `${a.col.n} – inköpslista (${listRows.length})${planner.p.hasBudget ? ` inom budget ${kr(budget)}` : ""}\n` + listRows.map(r => `- ${r.r.c.mhn}: ${kr(r.cost)} (${r.r.c.market})`).join("\n") + `\nTotalt: ${kr(listTotal)}`;
  const visible = r => S.show === "all" || (S.show === "own") === r.o;
  root.innerHTML = `<a class="muted small" href="#/collections">← Alla samlingar</a>${pageHead(a.col.n, `${a.have} av ${a.total} ägda${a.col.rd ? " · släppt " + a.col.rd : ""}`)}
  <div class="grid cols-4" style="margin-bottom:14px"><div class="panel stat"><div class="lbl">Framsteg</div><div class="val num">${Math.round(a.have / a.total * 100)} %</div><div class="sub">${a.have}/${a.total} skins</div></div>
    <div class="panel stat"><div class="lbl">Kvar att köpa</div><div class="val num">${kr(a.cost)}</div><div class="sub">${missing.length} skins · billigaste vägen</div></div>
    <div class="panel stat"><div class="lbl">Samlingsvärde</div><div class="val num">${a.value ? kr(a.value) : "–"}</div><div class="sub">alla skins, lägsta pris</div></div>
    <div class="panel stat"><div class="lbl">Slitagekrav</div>${policySel()}</div></div>
  ${planner.html}
  <div class="toolbar"><div class="seg" id="showSeg">${[["all", "Alla"], ["own", "Äger"], ["miss", "Saknas"]].map(([v, l]) => `<button data-v="${v}" class="${S.show === v ? "on" : ""}">${l}</button>`).join("")}</div>${listRows.length ? `<button class="btn ghost" id="cp">Kopiera inköpslista (${listRows.length})</button>` : ""}</div>
  ${groups.map(g => { const rs = a.rows.filter(r => r.s.r === g && visible(r)).sort((x, y) => (usd2sek(y.c?.usd) || 0) - (usd2sek(x.c?.usd) || 0)); return rs.length ? `<h2 style="margin-top:18px">${esc(g)}</h2><div class="cards">${rs.map(r => `<a class="card" href="#/item/${esc(r.s.id)}" style="--rc:${esc(r.s.rc)};${r.o ? "opacity:.6" : ""}"><div class="im"><img loading="lazy" src="${esc(imgUrl(r.s.img, "192fx144f"))}" alt="" width="192" height="144"><span class="tag ${r.o ? "pos" : ""}">${r.o ? "✓ Äger" : "Saknas"}</span></div><div class="bar"></div>
      <div class="bd"><div class="t1">${esc(r.s.w)}</div><div class="t2">${esc(r.s.p || r.s.n)}</div><div class="pr num">${r.c ? kr(usd2sek(r.c.usd)) : MISSING}</div>${r.c ? `<div class="faint small">${r.c.wear ? WEAR_LONG[r.c.wear] + " · " : ""}${esc(r.c.market)}</div>` : ""}</div></a>`).join("")}</div>` : ""; }).join("") || emptyState("Inga skins att visa", "Byt filter ovan.")}
  <p class="muted small" style="margin-top:14px">${esc(priceNote())}</p>`;
  $("#pol", root).addEventListener("change", e => { S.policy = e.target.value; renderCollections(root, [a.col.id]); });
  $$("#showSeg button", root).forEach(b => b.addEventListener("click", () => { S.show = b.dataset.v; detail(root, a, pl); }));
  $("#cp", root)?.addEventListener("click", () => copyText(text, "Inköpslistan kopierad"));
  // Planerare: mål och budget sparas lokalt per samling
  const saveGoals = async set => { pl.goalsAll[a.col.id] = [...set]; if (!set.size) delete pl.goalsAll[a.col.id]; await setKV("colGoals", pl.goalsAll); detail(root, a, pl); };
  root.querySelectorAll("#plan [data-goal]").forEach(c => c.closest("label").addEventListener("click", e => { e.preventDefault(); const id = c.dataset.goal, s = new Set(goals); s.has(id) ? s.delete(id) : s.add(id); saveGoals(s); }));
  $("#goalAll", root)?.addEventListener("click", () => saveGoals(new Set(a.rows.filter(r => !r.o).map(r => r.s.id))));
  $("#goalNone", root)?.addEventListener("click", () => saveGoals(new Set()));
  $("#bud", root)?.addEventListener("change", async e => {
    const raw = e.target.value.trim(), v = raw === "" ? null : parseMoney(raw); // budgeten sparas i kronor
    if (raw !== "" && (v == null || v < 0)) { toast("Ange en budget i kronor, t.ex. 2500"); return detail(root, a, pl); }
    if (v == null) delete pl.budgets[a.col.id]; else pl.budgets[a.col.id] = v;
    await setKV("colBudgets", pl.budgets); detail(root, a, pl);
  });
}
