// Collection Completion Planner: ren logik (ingen DOM, ingen lagring) så att den går att testa i tests.html.
// Alla belopp är i kronor och bygger på lägsta utropspris (listning) – inte genomförda försäljningar.

/**
 * Plan för att slutföra en samling.
 * rows: [{ id, name, owned, cost (kr eller null om pris saknas) }]
 * opt.budget: kr (eller null = ingen budget). opt.goals: Set med id (tomt/null = alla saknade skins räknas).
 * Billigaste vägen = köp de billigaste först (det maximerar antalet skins inom en budget).
 */
export function planCollection(rows, { budget = null, goals = null } = {}) {
  const useGoals = !!(goals && goals.size);
  const missing = rows.filter(r => !r.owned);
  const scope = useGoals ? missing.filter(r => goals.has(r.id)) : missing;
  const priced = scope.filter(r => Number.isFinite(r.cost)).sort((a, b) => a.cost - b.cost || String(a.name).localeCompare(String(b.name)));
  const unpriced = scope.filter(r => !Number.isFinite(r.cost));
  let cum = 0;
  const order = priced.map(r => ({ ...r, cum: (cum += r.cost) }));
  const totalCost = cum;
  const hasBudget = Number.isFinite(budget) && budget >= 0;
  const buy = hasBudget ? order.filter(r => r.cum <= budget + 1e-9) : [];
  const spent = buy.length ? buy[buy.length - 1].cum : 0;
  const left = hasBudget ? order.slice(buy.length) : [];
  return {
    useGoals, scopeCount: scope.length, missingCount: missing.length, order, unpriced, totalCost,
    expensive: [...priced].sort((a, b) => b.cost - a.cost).slice(0, 5),
    completable: unpriced.length === 0,
    hasBudget, buy, spent, left, budgetLeft: hasBudget ? budget - spent : null,
    shortfall: hasBudget ? Math.max(0, totalCost - budget) : null,
    fitsAll: hasBudget && left.length === 0 && unpriced.length === 0,
  };
}

/** Framsteg: ägda av alla, och ägda av målen (om några mål är satta). */
export function progress(rows, goals = null) {
  const total = rows.length, have = rows.filter(r => r.owned).length;
  const g = goals && goals.size ? rows.filter(r => goals.has(r.id)) : [];
  return { total, have, pct: total ? have / total * 100 : 0, goalTotal: g.length, goalHave: g.filter(r => r.owned).length };
}

/** Sortering av samlingar. a: { col:{n}, have, total, cost (kr kvar, bara prissatta), unpriced (antal saknade utan pris), value }. */
export const COLLECTION_SORTS = {
  cost: ["Lägst återstående kostnad", (a, b) => rank(a) - rank(b) || a.cost - b.cost],
  costhi: ["Högst återstående kostnad", (a, b) => (a.have === a.total) - (b.have === b.total) || b.cost - a.cost],
  prog: ["Mest färdig", (a, b) => b.have / b.total - a.have / a.total || a.cost - b.cost],
  left: ["Minst antal kvar", (a, b) => (a.have === a.total) - (b.have === b.total) || (a.total - a.have) - (b.total - b.have)],
  value: ["Högst samlingsvärde", (a, b) => b.value - a.value],
  size: ["Störst", (a, b) => b.total - a.total],
  name: ["Namn", (a, b) => a.col.n.localeCompare(b.col.n)],
};
// kompletta samlingar sist, och de där något saknar pris (kostnaden är då ofullständig) efter de fullt prissatta
const rank = a => (a.have === a.total ? 2 : a.unpriced ? 1 : 0);
export const sortCollections = (list, key) => [...list].sort((COLLECTION_SORTS[key] || COLLECTION_SORTS.cost)[1]);

/** Tvättar sparade mål ({ samlingsid: [skin-id] }) från lagring/backup. */
export function cleanGoals(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const k of Object.keys(v).slice(0, 300)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype" || typeof k !== "string" || k.length > 80) continue;
    if (Array.isArray(v[k])) out[k] = [...new Set(v[k].filter(x => typeof x === "string" && x.length <= 80))].slice(0, 300);
  }
  return out;
}
