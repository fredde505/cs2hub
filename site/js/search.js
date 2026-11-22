// Global sökning med förslag medan man skriver (piltangenter, Enter, Esc). Snabbtangent: / eller Ctrl+K.
import { esc, imgUrl, krUsd, MISSING, debounce } from "./util.js";
import { D, fromPrice } from "./data.js";
import { KIND_LABEL, dispName } from "./views/common.js";

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
    const terms = q.split(/\s+/); hits = [];
    for (const e of D.catalog) {
      const name = (e.n + " " + (e.ph || "")).toLowerCase(), hay = name + " " + (e.w || "").toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;
      hits.push({ e, score: (name.startsWith(terms[0]) ? 0 : name.includes(" " + terms[0]) ? 1 : 2) + (e.wr?.length ? 0 : 0.5), href: "#/item/" + e.id });
    }
    hits.sort((a, b) => a.score - b.score || a.e.n.length - b.e.n.length);
    hits = hits.slice(0, 7);
    const cols = D.collections.filter(c => terms.every(t => c.n.toLowerCase().includes(t))).slice(0, 2).map(c => ({ col: c, href: "#/collections/" + c.id }));
    hits = hits.concat(cols);
    active = hits.length ? 0 : -1;
    drop.innerHTML = hits.length
      ? hits.map((h, i) => h.e
        ? `<a role="option" data-i="${i}" href="${esc(h.href)}"><img src="${esc(imgUrl(h.e.img, "96fx72f"))}" alt="" width="48" height="36"><span class="sn"><b>${esc(dispName(h.e))}</b><small>${esc(KIND_LABEL[h.e.kind] || "")}${h.e.r ? " · " + esc(h.e.r) : ""}</small></span><span class="sp">${fromPrice(h.e) ? krUsd(fromPrice(h.e)) : MISSING}</span></a>`
        : `<a role="option" data-i="${i}" href="${esc(h.href)}"><span class="sn" style="padding-left:6px"><b>${esc(h.col.n)}</b><small>Samling · ${h.col.items.length} föremål</small></span></a>`).join("") + `<a class="sall" href="#" data-all>Visa alla träffar i databasen ↵</a>`
      : `<div class="muted small" style="padding:12px">Inga träffar för "${esc(input.value.trim())}"</div>`;
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
