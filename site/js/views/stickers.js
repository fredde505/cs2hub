import { $, esc, imgUrl, kr, dec, parseMoney, curSym, usd2sek, uid, toast, copyText, COLORS, COLOR_LABEL, debounce } from "../util.js";
import { D, priceInfo } from "../data.js";
import { getKV, setKV } from "../store.js";
import { analysePrice } from "../pricing.js";
import { THEMES, stickerMeta, colorScore, findCombos, workshopHash, numericId, cleanCombos } from "../sticker-core.js";
import { pageHead, emptyState } from "./common.js";

/** Sticker Combination Finder: sök stickers, välj färgtema och budget och få kombinationer som passar ihop – som kan skickas till Workshop. */
const SF = { q: "", tn: "", ty: "", ef: "", theme: [], count: "4", budget: "", dup: false, sort: "match" };
const TYPE_LABEL = { Autograph: "Spelare (autograph)", Team: "Lag", Event: "Event", Other: "Övrigt" };
const costOf = s => { const i = s.mh ? priceInfo(s.mh) : null; return i ? usd2sek(i.usd) : null; };
const meta = s => s._m || (s._m = stickerMeta(s));
const dots = s => [s.c1, s.c2].filter(Boolean).map(c => `<i class="dot" title="${esc(COLOR_LABEL[c] || c)}" style="background:${esc(COLORS[c] || "#888")}"></i>`).join("");
const flag = s => { const a = analysePrice(D.P.p[s.mh] || null, { ageMs: D.priceAge ? Date.now() - D.priceAge : 0, mhn: s.mh || "" }); return a.level === "uncertain" || a.level === "stale" ? `<span class="miss" title="${esc(a.reasons.join(" "))}">${esc(a.label)}</span>` : ""; };

export async function renderStickers(root) {
  const stickers = D.stickers, hasColor = stickers.some(s => s.c1);
  const tns = Object.entries(stickers.reduce((m, s) => (s.tn && (m[s.tn] = (m[s.tn] || 0) + 1), m), {})).sort((a, b) => a[0].localeCompare(b[0]));
  const efs = [...new Set(stickers.map(s => s.ef).filter(Boolean))].sort();
  let saved = cleanCombos(await getKV("stickerCombos", null));

  root.innerHTML = `${pageHead("Sticker Finder", "Hitta stickers som passar ihop i färg och pris. Välj ett färgtema, en budget och hur många stickers du vill ha – och skicka kombinationen till Workshop.")}
    ${hasColor ? "" : `<div class="panel small" style="margin-bottom:12px;border-color:#6b5a2e">⚠ Stickerfärger saknas i databasen. Kör <code>python tools/build_data.py --stickers</code> för att skapa dem. Tills dess går det inte att filtrera på färgtema.</div>`}
    <div class="panel" style="margin-bottom:14px"><div class="form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">
      <label class="full">Sök (namn, spelare, lag)<input class="inp" id="sq" value="${esc(SF.q)}" placeholder="t.ex. s1mple, Vitality, Katowice"></label>
      <label>Turnering<select class="inp" id="stn"><option value="">Alla</option>${tns.map(([t, n]) => `<option value="${esc(t)}" ${SF.tn === t ? "selected" : ""}>${esc(t)} (${n})</option>`).join("")}</select></label>
      <label>Typ<select class="inp" id="sty"><option value="">Alla</option>${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${SF.ty === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Effekt<select class="inp" id="sef"><option value="">Alla</option>${efs.map(e => `<option ${SF.ef === e ? "selected" : ""}>${esc(e)}</option>`).join("")}</select></label>
      <label>Antal stickers<select class="inp" id="sct">${[1, 2, 3, 4].map(n => `<option ${SF.count === String(n) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Budget totalt (${curSym()})<input class="inp" id="sbud" inputmode="decimal" value="${esc(SF.budget)}" placeholder="ingen"></label>
      <label>Sortera kombinationer<select class="inp" id="sso">${[["match", "Bäst färgmatchning"], ["cheap", "Billigast"], ["dear", "Dyrast"]].map(([v, l]) => `<option value="${v}" ${SF.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div style="margin-top:10px"><div class="muted small" style="margin-bottom:6px">Färgtema ${hasColor ? "(välj ett eller flera)" : ""}</div><div class="chips" id="stheme">${Object.entries(THEMES).map(([k, [l]]) => `<button class="chip ${SF.theme.join() === THEMES[k][1].join() ? "on" : ""}" data-t="${k}" ${hasColor ? "" : "disabled"}>${l}</button>`).join("")}<span class="muted small" style="margin:0 4px">eller enskilda färger:</span>${Object.keys(COLORS).map(c => `<button class="chip ${SF.theme.includes(c) && SF.theme.join() !== "" && !Object.values(THEMES).some(t => t[1].join() === SF.theme.join()) ? "on" : ""}" data-c="${c}" ${hasColor ? "" : "disabled"}><i class="dot" style="background:${COLORS[c]}"></i> ${COLOR_LABEL[c]}</button>`).join("")}<button class="chip" id="sclr">Rensa färg</button></div></div>
      <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="sdup" ${SF.dup ? "checked" : ""}> Tillåt samma sticker flera gånger (t.ex. 4 × samma)</label></div>
    <div id="sout"></div>
    <div id="ssaved"></div>
    <p class="muted small" style="margin-top:14px">Färgerna är vår egen uppskattning från stickerbilden (primär och sekundär färg) – inte en officiell färgsättning. Priserna är lägsta utropspris och kan svänga kraftigt för stickers; stickers utan marknadspris kan inte köpas och tas inte med. Kombinationerna väljs bland de ca 40 bäst passande kandidaterna.</p>`;

  const read = () => {
    SF.q = $("#sq", root).value; SF.tn = $("#stn", root).value; SF.ty = $("#sty", root).value; SF.ef = $("#sef", root).value; SF.count = $("#sct", root).value; SF.budget = $("#sbud", root).value; SF.sort = $("#sso", root).value; SF.dup = $("#sdup", root).checked;
  };
  const filtered = () => {
    const q = SF.q.toLowerCase().split(/\s+/).filter(Boolean);
    return stickers.filter(s => (!SF.tn || s.tn === SF.tn) && (!SF.ty || s.ty === SF.ty) && (!SF.ef || s.ef === SF.ef) && (!q.length || q.every(t => s.n.toLowerCase().includes(t))));
  };
  const paint = () => {
    read();
    const out = $("#sout", root), pool = filtered(), budget = SF.budget.trim() === "" ? null : parseMoney(SF.budget), theme = SF.theme.length ? SF.theme : null;
    if (SF.budget.trim() !== "" && (budget == null || budget < 0)) { out.innerHTML = `<div class="panel neg small">Ange budgeten som ett tal, t.ex. 800.</div>`; return; }
    const hasFilter = !!(SF.q.trim() || SF.tn || SF.ty || SF.ef || theme);
    // 1) kombinationer
    let combosHtml = "";
    if (!hasFilter) combosHtml = `<div class="panel muted small">Välj ett färgtema eller sök/filtrera på turnering, spelare eller lag för att få kombinationer.</div>`;
    else {
      const r = findCombos(pool, costOf, { count: +SF.count, budget, theme, sort: SF.sort, duplicates: SF.dup, limit: 12 });
      if (!r.combos.length) combosHtml = emptyState("Inga kombinationer hittades", r.candidates < +SF.count && !SF.dup ? `Bara ${r.candidates} stickers med pris matchar dina val – för få för ${SF.count} olika. Prova färre stickers, tillåt samma sticker flera gånger eller bredda filtren/budgeten.` : "Prova en högre budget, fler färger eller färre filter.");
      else combosHtml = `<h2 style="margin:0 0 4px">Kombinationer</h2><p class="muted small" style="margin:0 0 8px">${r.candidates} stickers med pris matchar${theme ? " temat" : ""}; kombinerar de ${r.poolCount} bästa${r.capped ? " (sökningen avbröts vid en gräns – resultaten kan vara ofullständiga)" : ""}. ${theme ? "Matchning = hur väl stickernas färger passar temat." : "Matchning = hur lika varandra stickernas färger är."}</p>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr));gap:10px">${r.combos.map((c, i) => comboCard(c, i)).join("")}</div>`;
      out._combos = r.combos;
    }
    // 2) enskilda träffar
    const singles = pool.map(s => ({ s, cost: costOf(s), sc: theme ? colorScore(s, theme) : (s.c1 ? 100 : null) })).filter(x => x.cost != null && (!theme || (x.sc != null && x.sc >= 60)) && (budget == null || x.cost <= budget))
      .sort((a, b) => (theme ? b.sc - a.sc : 0) || a.cost - b.cost).slice(0, 24);
    const sHtml = hasFilter && singles.length ? `<h2 style="margin:18px 0 6px">Enskilda stickers <span class="muted small" style="font-weight:400">(${theme ? "bäst färgmatchning" : "billigast"} först)</span></h2><div class="cards">${singles.map(x => `<a class="card" href="#/item/${esc(x.s.id)}" style="--rc:${esc(x.s.rc)}"><div class="im"><img loading="lazy" src="${esc(imgUrl(x.s.img, "192fx144f"))}" alt="" width="192" height="144">${x.s.c1 ? `<span class="tag">${dots(x.s)}</span>` : ""}</div><div class="bar"></div><div class="bd"><div class="t1">${esc(meta(x.s).event || x.s.tn || "")}</div><div class="t2">${esc(meta(x.s).who)}${x.s.ef && x.s.ef !== "Other" ? ` · ${esc(x.s.ef)}` : ""}</div><div class="pr num">${kr(x.cost)}${theme ? ` <span class="faint small">${x.sc} %</span>` : ""}</div></div></a>`).join("")}</div>` : "";
    out.innerHTML = combosHtml + sHtml;
    out.querySelectorAll("[data-ws]").forEach(b => b.addEventListener("click", () => { const c = out._combos[+b.dataset.ws]; location.hash = workshopHash(c.items.map(numericId)); }));
    out.querySelectorAll("[data-save]").forEach(b => b.addEventListener("click", async () => { const c = out._combos[+b.dataset.save]; await saveCombo(c); }));
    out.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => { const c = out._combos[+b.dataset.copy]; copyText(c.items.map(s => `- ${s.mh || s.n}: ${kr(costOf(s))}`).join("\n") + `\nTotalt: ${kr(c.cost)}`, "Inköpslistan kopierad"); }));
  };
  function comboCard(c, i) {
    const names = c.items.map(s => `${esc(meta(s).who)}${s.ef && s.ef !== "Other" ? ` <span class="faint">(${esc(s.ef)})</span>` : ""} <span class="faint small">${esc(meta(s).event)}</span>`);
    const warn = c.items.some(s => flag(s));
    return `<div class="panel" style="padding:10px"><div class="row" style="gap:4px;flex-wrap:nowrap;justify-content:center">${c.items.map(s => `<img loading="lazy" src="${esc(imgUrl(s.img, "128fx96f"))}" alt="${esc(s.n)}" width="80" height="60" style="width:25%;height:auto;object-fit:contain" title="${esc(s.n)}">`).join("")}</div>
      <div class="small" style="margin:6px 0;line-height:1.5">${names.join("<br>")}</div>
      <div class="row spread small"><span class="num"><b>${kr(c.cost)}</b></span><span class="muted">${SF.theme.length ? "färgmatchning" : "färglikhet"} <b>${c.score} %</b></span></div>${warn ? `<div class="small" style="color:#d9b36a;margin-top:4px">⚠ minst ett pris är osäkert</div>` : ""}
      <div class="row" style="margin-top:8px;gap:6px"><button class="btn sm" data-ws="${i}">Öppna i Workshop</button><button class="btn ghost sm" data-save="${i}">Spara</button><button class="btn ghost sm" data-copy="${i}">Kopiera lista</button></div></div>`;
  }
  async function saveCombo(c) {
    const theme = SF.theme.length ? (Object.values(THEMES).find(t => t[1].join() === SF.theme.join())?.[0] || SF.theme.map(x => COLOR_LABEL[x]).join("/")) : "";
    const name = `${theme ? theme + " · " : ""}${meta(c.items[0]).who}${c.items.length > 1 ? " +" + (c.items.length - 1) : ""}`;
    saved = [{ id: uid(), name, ids: c.items.map(numericId), created: Date.now() }, ...saved].slice(0, 200);
    await setKV("stickerCombos", saved); toast("Kombinationen sparad"); paintSaved();
  }
  function paintSaved() {
    const host = $("#ssaved", root);
    if (!saved.length) { host.innerHTML = ""; return; }
    host.innerHTML = `<h2 style="margin:22px 0 6px">Sparade kombinationer (${saved.length})</h2><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr));gap:10px">${saved.map((c, i) => {
      const items = c.ids.map(id => D.byId.get("sticker-" + id)).filter(Boolean), costs = items.map(costOf), total = costs.every(x => x != null) ? costs.reduce((a, b) => a + b, 0) : null;
      return `<div class="panel" style="padding:10px"><div class="row spread"><b class="small">${esc(c.name)}</b><button class="btn ghost sm danger" data-del="${i}" aria-label="Ta bort">✕</button></div>
        <div class="row" style="gap:4px;flex-wrap:nowrap;justify-content:center;margin:6px 0">${items.map(s => `<img loading="lazy" src="${esc(imgUrl(s.img, "128fx96f"))}" alt="${esc(s.n)}" width="80" height="60" style="width:25%;height:auto;object-fit:contain" title="${esc(s.n)}">`).join("")}</div>
        <div class="row spread small"><span class="num">${total != null ? "<b>" + kr(total) + "</b> idag" : "pris saknas för någon"}</span><button class="btn sm" data-sws="${i}">Öppna i Workshop</button></div></div>`;
    }).join("")}</div>`;
    host.querySelectorAll("[data-sws]").forEach(b => b.addEventListener("click", () => { location.hash = workshopHash(saved[+b.dataset.sws].ids); }));
    host.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { saved.splice(+b.dataset.del, 1); await setKV("stickerCombos", saved); paintSaved(); }));
  }

  const go = debounce(paint, 200);
  for (const id of ["#sq", "#sbud"]) $(id, root).addEventListener("input", go);
  for (const id of ["#stn", "#sty", "#sef", "#sct", "#sso", "#sdup"]) $(id, root).addEventListener("change", paint);
  const syncChips = () => { root.querySelectorAll("#stheme [data-t]").forEach(b => b.classList.toggle("on", THEMES[b.dataset.t][1].join() === SF.theme.join())); root.querySelectorAll("#stheme [data-c]").forEach(b => b.classList.toggle("on", SF.theme.includes(b.dataset.c) && !Object.values(THEMES).some(t => t[1].join() === SF.theme.join()))); };
  root.querySelectorAll("#stheme [data-t]").forEach(b => b.addEventListener("click", () => { const t = THEMES[b.dataset.t][1]; SF.theme = SF.theme.join() === t.join() ? [] : [...t]; syncChips(); paint(); }));
  root.querySelectorAll("#stheme [data-c]").forEach(b => b.addEventListener("click", () => { const c = b.dataset.c; if (Object.values(THEMES).some(t => t[1].join() === SF.theme.join())) SF.theme = []; SF.theme = SF.theme.includes(c) ? SF.theme.filter(x => x !== c) : [...SF.theme, c].slice(0, 3); syncChips(); paint(); }));
  $("#sclr", root).addEventListener("click", () => { SF.theme = []; syncChips(); paint(); });
  paint(); paintSaved();
}
