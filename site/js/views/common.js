import { esc, imgUrl, krUsd, MISSING, COLORS, debounce, searchTerms } from "../util.js";
import { D, fromPrice, mhnFor, priceInfo, priceTip } from "../data.js";

export const KINDS = [
  { k: "weapon", label: "Vapenskins" }, { k: "knife", label: "Knivar" }, { k: "glove", label: "Handskar" },
  { k: "sticker", label: "Stickers" }, { k: "charm", label: "Charms" }, { k: "agent", label: "Agents" },
  { k: "case", label: "Cases" }, { k: "capsule", label: "Capsules" }, { k: "music", label: "Music Kits" },
  { k: "patch", label: "Patches" }, { k: "graffiti", label: "Graffiti" }, { k: "collection", label: "Samlingar" },
];
export const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.k, k.label]));
KIND_LABEL.other = "Övrigt";

/** Visningsnamn med fas/variant (Doppler-faser, Legacy …). */
export const dispName = e => e.n + (e.ph ? " · " + e.ph : "");

export function itemCard(e, { price, sub, extra = "" } = {}) {
  const p = price !== undefined ? price : fromPrice(e);
  const t1 = e.w || (e.tn || e.ty || KIND_LABEL[e.kind] || "");
  const t2 = (e.p || e.n.replace(/^(Sticker|Charm|Patch|Sealed Graffiti|Music Kit) \| /, "")) + (e.ph ? " · " + e.ph : "");
  const tip = e.wr ? priceTip(mhnFor(e, e.wr.includes("FT") ? "FT" : e.wr[0] || null)) : priceTip(e.mh);
  const flags = (e.st ? '<span class="mini" title="StatTrak™ finns">ST™</span>' : "") + (e.sv ? '<span class="mini" title="Souvenir finns">SV</span>' : "");
  return `<a class="card" href="#/item/${esc(e.id)}" style="--rc:${esc(e.rc || "#666")}">
    <div class="im"><img loading="lazy" decoding="async" src="${esc(imgUrl(e.img, "192fx144f"))}" alt="" width="192" height="144">${e.c1 ? `<span class="tag"><i class="dot" style="background:${esc(e.hx || COLORS[e.c1] || "#888")}"></i></span>` : ""}</div>
    <div class="bar"></div>
    <div class="bd"><div class="t1">${esc(t1)}</div><div class="t2" title="${esc(e.n)}">${esc(t2)}</div>
    <div class="pr" title="${esc(tip)}">${sub ?? (p ? (e.wr?.length > 1 && price === undefined ? '<span class="faint small">från </span>' : "") + krUsd(p) : MISSING)}${flags ? `<span class="flags">${flags}</span>` : ""}</div>${extra}</div></a>`;
}

/** Skelettkort som visas medan data laddas. */
export const skeletonCards = (n = 12) => `<div class="cards">${Array.from({ length: n }, () => `<div class="card skel"><div class="im"></div><div class="bar"></div><div class="bd"><div class="t1">&nbsp;</div><div class="t2">&nbsp;</div></div></div>`).join("")}</div>`;

/** Tomt läge med förklaring och tydligt nästa steg. */
export const emptyState = (title, text, cta = "") => `<div class="empty"><div class="empty-ico" aria-hidden="true">◇</div><b>${esc(title)}</b><div class="muted" style="margin:6px auto 14px;max-width:460px">${esc(text)}</div>${cta}</div>`;

/** Sök-och-välj-lista över hela katalogen (för att lägga till föremål). onPick(entry) */
export function itemPicker(host, onPick, { kinds = null, placeholder = "Sök föremål (t.ex. AK-47 Redline)…", filter = null } = {}) {
  host.innerHTML = `<input class="inp" style="width:100%" placeholder="${esc(placeholder)}" autocomplete="off" aria-label="${esc(placeholder)}"><div class="pick" hidden></div>`;
  const inp = host.querySelector("input"), list = host.querySelector(".pick");
  const run = debounce(() => {
    const q = inp.value.trim().toLowerCase();
    if (q.length < 2) { list.hidden = true; return; }
    const terms = searchTerms(q);
    if (!terms.length) { list.hidden = true; return; }
    const hits = [];
    for (const e of D.catalog) {
      if (kinds && !kinds.includes(e.kind)) continue;
      if (filter && !filter(e)) continue;
      const s = (e.n + " " + (e.w || "") + " " + (e.ph || "")).toLowerCase();
      if (terms.every(t => s.includes(t))) { hits.push(e); if (hits.length >= 40) break; }
    }
    list.hidden = false;
    list.innerHTML = hits.length ? hits.map((e, i) => `<button type="button" data-i="${i}"><img src="${esc(imgUrl(e.img, "96fx72f"))}" alt=""><span><b>${esc(dispName(e))}</b><br><span class="muted small">${esc(e.r || "")}${e.wr?.length ? " · " + e.wr.join("/") : ""}</span></span></button>`).join("") : `<div class="muted small" style="padding:10px">Inga träffar</div>`;
    list.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { list.hidden = true; onPick(hits[+b.dataset.i]); }));
  });
  inp.addEventListener("input", run);
  return { focus: () => inp.focus(), clear: () => { inp.value = ""; list.hidden = true; } };
}

export const pageHead = (title, lead = "") => `<h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : '<div style="height:14px"></div>'}`;

export function stat(label, val, sub = "", valCls = "") {
  return `<div class="panel stat"><div class="lbl">${esc(label)}</div><div class="val num ${valCls}">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}

/** Liten rad som förklarar prisernas källa, typ och ålder – visas under prisvisningar. */
export function priceNote() {
  const d = D.priceAge ? new Date(D.priceAge).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "okänt";
  return `Pris = lägsta utropspris (listning, inte genomförd försäljning) på riktiga marknadsplatser – prisdata från ${d}. Steam-priser är Steam-krediter som inte går att ta ut.`;
}

export function placeholderView(title, lead, items) {
  return `${pageHead(title, lead)}<div class="panel"><h2>Planerat i nästa fas</h2><ul style="margin:0;padding-left:18px;line-height:1.9" class="muted">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
}
