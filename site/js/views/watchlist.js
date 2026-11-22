import { esc, imgUrl, kr, krm, pct, cls, usd2sek, modal, toast, uid, $, fmtDate, fmtDateTime, WEAR_LONG, MISSING, confirmBox } from "../util.js";
import { all, put, putMany, del } from "../store.js";
import { D, lookup, bestUsd, mhnFor, priceInfo, refreshLive } from "../data.js";
import { pageHead, itemPicker, emptyState } from "./common.js";

const hit = (w, cur) => cur != null && (w.dir === "below" ? cur <= w.target : cur >= w.target);

export async function checkAlerts() {
  const ws = await all("watch");
  return ws.filter(w => hit(w, usd2sek(bestUsd(w.mhn))));
}

/** Webbläsarnotiser: kontrollerar bevakningar regelbundet medan sidan är öppen och aviserar nya träffar en gång. */
export async function notifyNewHits() {
  const ws = await all("watch"), fresh = []; let changed = false;
  for (const w of ws) {
    const h = hit(w, usd2sek(bestUsd(w.mhn)));
    if (h && !w.notified) { w.notified = Date.now(); fresh.push(w); changed = true; }
    else if (!h && w.notified) { w.notified = null; changed = true; } // återställ så att nästa träff aviseras igen
  }
  if (changed) await putMany("watch", ws);
  if (!fresh.length) return 0;
  if ("Notification" in window && Notification.permission === "granted") {
    for (const w of fresh.slice(0, 3)) new Notification("Målpris nått", { body: `${w.mhn}: ${kr(usd2sek(bestUsd(w.mhn)))} (mål ${w.dir === "below" ? "≤" : "≥"} ${kr(w.target)})`, tag: "w" + w.id });
  }
  return fresh.length;
}
let pollTimer = null;
export function startWatchPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => { await refreshLive(() => { }, true).catch(() => { }); notifyNewHits(); }, 15 * 60e3);
}

export function addWatch(mhn, done) {
  const ref = lookup(mhn), e = ref?.e;
  const cur = usd2sek(bestUsd(mhn));
  modal(`<h3>Bevaka pris</h3>
    <div class="form"><label class="full">Föremål<input class="inp" id="wm" value="${esc(mhn)}" readonly></label>
    ${e?.wr?.length ? `<label>Slitage<select class="inp" id="ww">${e.wr.map(w => `<option value="${w}" ${ref.wear === w ? "selected" : ""}>${WEAR_LONG[w]}</option>`).join("")}</select></label>${e.st ? `<label>Variant<select class="inp" id="wv"><option value="">Normal</option><option value="st" ${ref.st ? "selected" : ""}>StatTrak™</option></select></label>` : ""}` : ""}
    <label>Avisera när priset är<select class="inp" id="wd"><option value="below">under eller lika med</option><option value="above">över eller lika med</option></select></label>
    <label>Målpris (kr)<input class="inp" id="wt" type="number" min="0" step="1" value="${cur ? Math.round(cur * 0.9) : ""}"></label></div>
    <p class="muted small" id="wn">Nuvarande pris: ${cur != null ? "<b>" + kr(cur) + "</b>" : MISSING}</p>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn ghost" data-close>Avbryt</button><button class="btn" id="ws">Spara</button></div>`, {
    onMount: (m, close) => {
      const name = () => e?.wr?.length ? mhnFor(e, m.querySelector("#ww").value, { st: m.querySelector("#wv")?.value === "st" }) : mhn;
      const upd = () => { const n = name(); m.querySelector("#wm").value = n; const c = usd2sek(bestUsd(n)); m.querySelector("#wn").innerHTML = "Nuvarande pris: " + (c != null ? "<b>" + kr(c) + "</b>" : MISSING); if (c != null) m.querySelector("#wt").value = Math.round(c * 0.9); };
      m.querySelectorAll("#ww,#wv").forEach(x => x.addEventListener("change", upd));
      m.querySelector("#ws").addEventListener("click", async () => {
        const target = +m.querySelector("#wt").value; if (!(target > 0)) return toast("Ange ett målpris");
        const n = name(), startUsd = bestUsd(n);
        await put("watch", { id: uid(), mhn: n, target, dir: m.querySelector("#wd").value, created: Date.now(), startUsd: startUsd ?? null });
        close(); toast("Tillagd i bevakningslistan"); done && done();
        if ("Notification" in window && Notification.permission === "default") toast("Tips: aktivera webbläsarnotiser på Watchlist-sidan.");
      });
    },
  });
}

export async function renderWatchlist(root) {
  const ws = (await all("watch")).sort((a, b) => b.created - a.created);
  const canNotify = "Notification" in window, perm = canNotify ? Notification.permission : "unsupported";
  const age = D.priceAge ? fmtDateTime(D.priceAge) : "okänt";
  root.innerHTML = `${pageHead("Watchlist", "Bevaka priser och få besked när målpriset nås. Du kan ha flera bevakningar per föremål, till exempel olika slitage eller olika målpriser.")}
    <div class="panel" style="margin-bottom:14px"><div id="pk"></div></div>
    <div class="row spread" style="margin-bottom:10px"><span class="muted small">Senast kontrollerade priser: ${esc(age)}. Bevakningarna kontrolleras när sidan öppnas och var 15:e minut medan den är öppen.</span>
      ${perm === "granted" ? '<span class="pos small">● Webbläsarnotiser är på</span>' : perm === "denied" ? '<span class="muted small">Notiser är blockerade i webbläsaren</span>' : canNotify ? '<button class="btn ghost sm" id="notif">Aktivera webbläsarnotiser</button>' : ""}</div>
    ${ws.length ? `<div class="panel scroll-x" style="padding:0"><table class="tbl"><thead><tr><th>Föremål</th><th class="r">Pris nu</th><th class="r">Mål</th><th class="r hide-m">Avstånd</th><th class="r hide-m">Sedan start</th><th>Status</th><th></th></tr></thead><tbody>
    ${ws.map(w => {
      const e = lookup(w.mhn)?.e, cur = usd2sek(bestUsd(w.mhn)), h = hit(w, cur);
      const dist = cur != null ? (w.dir === "below" ? (cur / w.target - 1) * 100 : (w.target / cur - 1) * 100) : null;
      const since = w.startUsd && cur != null ? (cur / usd2sek(w.startUsd) - 1) * 100 : null;
      return `<tr style="${h ? "background:rgba(126,198,153,.07)" : ""}"><td><div class="nm"><span class="rar" style="--rc:${esc(e?.rc || "#666")}"></span>${e ? `<img loading="lazy" src="${esc(imgUrl(e.img, "96fx72f"))}" alt="" width="56" height="42">` : ""}<div><div class="n2">${esc(w.mhn)}</div><div class="n1">skapad ${fmtDate(w.created)}</div></div></div></td>
      <td class="r num">${krm(cur)}</td><td class="r num">${w.dir === "below" ? "≤" : "≥"} ${kr(w.target)}</td><td class="r num hide-m">${dist != null ? pct(dist) : "–"}</td><td class="r num hide-m ${cls(since)}">${since != null ? pct(since) : "–"}</td>
      <td>${h ? '<b class="pos">● Målpris nått</b>' : cur == null ? '<span class="muted">Väntar på prisdata</span>' : '<span class="muted">Bevakar</span>'}</td>
      <td class="r"><button class="btn ghost sm danger" data-del="${esc(w.id)}" aria-label="Ta bort bevakning">Ta bort</button></td></tr>`;
    }).join("")}</tbody></table></div>` : emptyState("Din bevakningslista är tom", "Sök ett föremål ovan eller använd ☆ på ett föremåls sida för att bevaka priset.")}`;
  itemPicker($("#pk", root), e => addWatch(e.wr ? mhnFor(e, e.wr.includes("FT") ? "FT" : e.wr[0] || null) : e.mh, () => renderWatchlist(root)));
  root.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { if (await confirmBox("Ta bort bevakningen?", { ok: "Ta bort", danger: true })) { await del("watch", b.dataset.del); renderWatchlist(root); } }));
  $("#notif", root)?.addEventListener("click", async () => { const p = await Notification.requestPermission(); toast(p === "granted" ? "Notiser aktiverade" : "Notiser inte tillåtna"); renderWatchlist(root); });
}
