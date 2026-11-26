import { all, put } from "./store.js";
import { loadState, buildRows, totals } from "./finance.js";

/** Sparar en mätpunkt av inventoryvärdet (högst var 6:e timme, eller direkt vid nytt köp/sälj). Egen modul så att startsidan inte behöver ladda hela inventory-vyn. */
export async function recordSnapshot() {
  const { items, trades } = await loadState();
  if (!items.length) return;
  const { rows, pos } = buildRows(items, trades);
  const t = totals(rows, pos);
  const snaps = await all("snapshots");
  const lastSnap = snaps.sort((a, b) => a.ts - b.ts)[snaps.length - 1];
  const last = lastSnap?.ts || 0, age = Date.now() - last;
  const costChanged = lastSnap && Math.abs((lastSnap.cost || 0) - t.cost) > 0.01; // nytt köp/sälj → spara direkt så grafen visar steget
  if ((age > 6 * 3600e3 || (costChanged && age > 5 * 60e3)) && t.steam > 0) await put("snapshots", { ts: Date.now(), steam: t.steam, cash: t.cash, cost: t.cost });
}
