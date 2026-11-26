// Global sökning med förslag medan man skriver (piltangenter, Enter, Esc). Snabbtangent: / eller Ctrl+K.
import { esc, imgUrl, krUsd, usd2sek, curSym, MISSING, debounce, searchTerms } from "./util.js";
import { D, fromPrice, ensureStickers } from "./data.js";
import { KIND_LABEL, dispName } from "./views/common.js";

const COLOR_WORDS = { röd: "red", rött: "red", red: "red", orange: "orange", guld: "gold", gul: "gold", gult: "gold", gold: "gold", yellow: "gold", grön: "green", grönt: "green", green: "green", cyan: "cyan", turkos: "cyan", blå: "blue", blått: "blue", blue: "blue", lila: "purple", purple: "purple", rosa: "pink", pink: "pink", brun: "brown", brunt: "brown", brown: "brown", svart: "black", svarta: "black", black: "black", vit: "white", vitt: "white", vita: "white", white: "white", grå: "gray", grått: "gray", gray: "gray", grey: "gray" };
const KIND_WORDS = { kniv: "knife", knivar: "knife", knife: "knife", knives: "knife", handske: "glove", handskar: "glove", glove: "glove", gloves: "glove" };
const SV_LABEL = { red: "röd", orange: "orange", gold: "guld/gul", green: "grön", cyan: "cyan", blue: "blå", purple: "lila", pink: "rosa", brown: "brun", black: "svart", white: "vit", gray: "grå" };
const NUM = "(\\d[\\d\\s.,]*\\d|\\d)";
/** Förstår enkla frågor som "blå kniv under 3000 kr", "röda handskar", "ak-47 över 500", "100-500 kr". Resten blir vanlig textsökning. */
export function parseQuery(raw) {
  let s = " " + String(raw).toLowerCase() + " "; const out = { colors: [], kind: null, min: null, max: null, text: "", tags: [] };
  const toNum = v => { const n = parseFloat(String(v).replace(/\s/g, "").replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
  s = s.replace(new RegExp(`\\s${NUM}\\s*-\\s*${NUM}\\s*(kr|sek|nok|dkk|eur|usd|€|\\$|:-)?(?=\\s)`, "g"), (_, a, b) => { out.min = toNum(a); out.max = toNum(b); return " "; });
  s = s.replace(new RegExp(`\\s(under|max|högst|upp till|billigare än|below|less than|<)\\s*${NUM}\\s*(kr|sek|nok|dkk|eur|usd|€|\\$|:-)?(?=\\s)`, "g"), (_, w, n) => { out.max = toNum(n); return " "; });
  s = s.replace(new RegExp(`\\s(över|minst|min|dyrare än|above|over|>)\\s*${NUM}\\s*(kr|sek|nok|dkk|eur|usd|€|\\$|:-)?(?=\\s)`, "g"), (_, w, n) => { out.min = toNum(n); return " "; });
  const words = [];
  for (const w of s.split(/\s+/).filter(Boolean)) {
    const stem = w.replace(/a$/, "") ; // "röda" → "röd"
    if (COLOR_WORDS[w]) { if (!out.colors.includes(COLOR_WORDS[w])) out.colors.push(COLOR_WORDS[w]); }
    else if (w.length > 3 && w.endsWith("a") && COLOR_WORDS[stem]) { if (!out.colors.includes(COLOR_WORDS[stem])) out.colors.push(COLOR_WORDS[stem]); }
    else if (KIND_WORDS[w]) out.kind = KIND_WORDS[w];
    else words.push(w);
  }
  out.text = words.join(" ");
  if (out.colors.length) out.tags.push(out.colors.map(c => SV_LABEL[c]).join(" / "));
  if (out.kind) out.tags.push(out.kind === "knife" ? "knivar" : "handskar");
  if (out.min != null) out.tags.push("över " + out.min + " " + curSym());
  if (out.max != null) out.tags.push("under " + out.max + " " + curSym());
  out.smart = !!(out.colors.length || out.kind || out.min != null || out.max != null);
  return out;
}

export function initSearch(input, onEnter) {
  const host = input.parentElement; host.style.position = "relative";
  const drop = document.createElement("div"); drop.className = "sdrop"; drop.hidden = true; drop.setAttribute("role", "listbox"); host.appendChild(drop);
  let hits = [], active = -1;
  const close = () => { drop.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); };
  const mark = () => drop.querySelectorAll("[data-i]").forEach(el => el.classList.toggle("on", +el.dataset.i === active));
  const go = h => { close(); input.blur(); input.value = ""; location.hash = h.href; };

  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) return close();
    if (!D.stickersReady) ensureStickers().then(() => { if (input.value.trim().toLowerCase() === q) run(); }); /* stickers saknas i katalogen tills de har laddats: sök om då */
    const pq = parseQuery(q), terms = searchTerms(pq.text); hits = [];
    if (!terms.length && !pq.smart) return close();
    const kr1 = usd2sek(1), WORD = /^(stattrak™?|souvenir)$/;
    for (const pass of [0, 1]) { /* pass 1: reservsökning utan StatTrak/Souvenir (katalogen har dem oftast som flagga, inte i namnet) */
    if (pass && (hits.length || !terms.some(t => WORD.test(t)))) break;
    const T = pass ? terms.filter(t => !WORD.test(t)) : terms;
    for (const e of D.catalog) {
      if (pq.smart) {
        if (pq.colors.length && !(pq.colors.includes(e.c1) || pq.colors.includes(e.c2))) continue;
        if (pq.kind && e.kind !== pq.kind) continue;
        if (pq.min != null || pq.max != null) { const p = fromPrice(e); if (p == null) continue; const k = p * kr1; if ((pq.min != null && k < pq.min) || (pq.max != null && k > pq.max)) continue; }
      }
      const hay = e._h || (e._nl = (e.n + " " + (e.ph || "")).toLowerCase(), e._h = e._nl + " " + (e.w || "").toLowerCase()); // gemener beräknas en gång per föremål, inte vid varje tangenttryck
      let ok = true; for (const t of T) if (!hay.includes(t)) { ok = false; break; }
      if (!ok) continue;
      const name = e._nl;
      hits.push({ e, score: terms.length ? (name.startsWith(terms[0]) ? 0 : name.includes(" " + terms[0]) ? 1 : 2) + (e.wr?.length ? 0 : 0.5) : 0, href: "#/item/" + e.id, price: pq.smart && !terms.length ? fromPrice(e) || 0 : 0 }); // pris behövs bara för att sortera smarta sökningar utan namn
    }
    }
    // Smarta sökningar utan namn sorteras på pris (dyrast först), vanliga på träffkvalitet
    hits.sort(pq.smart && !terms.length ? (a, b) => b.price - a.price : (a, b) => a.score - b.score || a.e.n.length - b.e.n.length);
    hits = hits.slice(0, 7);
    const cols = pq.smart ? [] : D.collections.filter(c => terms.every(t => c.n.toLowerCase().includes(t))).slice(0, 2).map(c => ({ col: c, href: "#/collections/" + c.id }));
    hits = hits.concat(cols);
    active = hits.length ? 0 : -1;
    const tagLine = pq.smart ? `<div class="small muted" style="padding:8px 12px 2px">Filter: ${pq.tags.map(t => `<span class="chip" style="padding:1px 8px">${esc(t)}</span>`).join(" ")}</div>` : "";
    drop.innerHTML = tagLine + (hits.length
      ? hits.map((h, i) => h.e
        ? `<a role="option" data-i="${i}" href="${esc(h.href)}"><img src="${esc(imgUrl(h.e.img, "96fx72f"))}" alt="" width="48" height="36"><span class="sn"><b>${esc(dispName(h.e))}</b><small>${esc(KIND_LABEL[h.e.kind] || "")}${h.e.r ? " · " + esc(h.e.r) : ""}</small></span><span class="sp">${fromPrice(h.e) ? krUsd(fromPrice(h.e)) : MISSING}</span></a>`
        : `<a role="option" data-i="${i}" href="${esc(h.href)}"><span class="sn" style="padding-left:6px"><b>${esc(h.col.n)}</b><small>Samling · ${h.col.items.length} föremål</small></span></a>`).join("") + `<a class="sall" href="#" data-all>Visa alla träffar i databasen ↵</a>`
      : `<div class="muted small" style="padding:12px">${D.stickersReady ? `Inga träffar för "${esc(input.value.trim())}"` : "Laddar klistermärken… sökningen uppdateras strax."}</div>`);
    drop.hidden = false; input.setAttribute("aria-expanded", "true"); mark();
    drop.querySelectorAll("a[data-i]").forEach(a => a.addEventListener("mouseenter", () => { active = +a.dataset.i; mark(); }));
    drop.querySelectorAll("a[data-i]").forEach(a => a.addEventListener("click", () => { close(); input.value = ""; }));
    drop.querySelector("[data-all]")?.addEventListener("click", ev => { ev.preventDefault(); const v = input.value.trim(); close(); input.blur(); onEnter(v); });
  };
  input.setAttribute("role", "combobox"); input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-autocomplete", "list");
  input.addEventListener("input", debounce(run, 120));
  input.addEventListener("focus", () => input.value.trim().length >= 2 && run());
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!hits.length || drop.hidden) return; e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length; mark(); drop.querySelector(".on")?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { const v = input.value.trim(); if (!v) return; if (!drop.hidden && active >= 0 && hits[active]) go(hits[active]); else { close(); input.blur(); onEnter(v); } }
    else if (e.key === "Escape") { close(); input.blur(); }
  });
  document.addEventListener("pointerdown", e => { if (!host.contains(e.target)) close(); });
  document.addEventListener("keydown", e => {
    const t = e.target, typing = t.matches?.("input,textarea,select,[contenteditable]");
    if ((e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); input.focus(); input.select(); }
  });
}
