// Portfolio Analytics: ren logik (inga DOM-anrop, inga lagringsanrop) så att den går att testa i tests.html.
// Princip: historiska värden kommer ENBART från sparade mätpunkter (snapshots). Inget gammalt värde gissas utifrån dagens priser.
// Saknas en mätpunkt så långt tillbaka säger vi det i stället för att räkna ut något.

const DAY = 864e5;
export const PERIODS = [["7", "7 dagar", 7], ["30", "30 dagar", 30], ["90", "90 dagar", 90], ["180", "6 månader", 180], ["365", "1 år", 365], ["all", "Allt", null]];

/** Mätpunkter inom de senaste `days` dygnen (null = alla), sorterade i tid. */
export function windowSnaps(snaps, days, now = Date.now()) {
  const s = [...snaps].filter(x => Number.isFinite(x?.ts)).sort((a, b) => a.ts - b.ts);
  return days == null ? s : s.filter(x => x.ts >= now - days * DAY);
}

/** Hur många dagar mätpunkterna täcker (första till sista, eller till nu). */
export const coverageDays = (snaps, now = Date.now()) => { const s = windowSnaps(snaps, null); return s.length ? Math.max(0, (now - s[0].ts) / DAY) : 0; };

/**
 * Värdeförändring jämfört med läget för `days` dygn sedan.
 * Utgångspunkt = den SENASTE mätpunkten som är minst `days` dygn gammal. Finns ingen sådan används den äldsta mätpunkten och
 * resultatet märks partial=true med den verkliga tiden (aldrig en gissning). Inga mätpunkter alls = null.
 * field: "cash" | "steam". valueNow = nuvarande totalvärde.
 */
export function changeSince(snaps, valueNow, field, days, now = Date.now()) {
  const s = windowSnaps(snaps, null).filter(x => Number.isFinite(x[field]));
  if (!s.length || !Number.isFinite(valueNow)) return null;
  const target = now - days * DAY;
  let base = null; for (const x of s) if (x.ts <= target) base = x;
  const partial = !base; if (!base) base = s[0];
  const spanDays = (now - base.ts) / DAY;
  if (spanDays < 0.04) return null; // mätpunkten är från alldeles nyss – ingen förändring att visa
  const change = valueNow - base[field];
  return { base, change, pct: base[field] > 0 ? change / base[field] * 100 : null, partial, spanDays, costThen: base.cost };
}

/** Delar upp värdeförändringen: hur mycket är nya köp (ökad registrerad kostnad) och hur mycket är marknadsrörelse. Kräver kostnad för alla föremål. */
export function splitChange(ch, costNow, allHaveCost) {
  if (!ch || !allHaveCost || !Number.isFinite(ch.costThen) || ch.costThen <= 0) return null;
  const invested = costNow - ch.costThen;
  return { invested, market: ch.change - invested };
}

/** Koncentration: andel av totalvärdet för de N största innehaven. values = värde per föremål. */
export function concentration(values) {
  const v = values.filter(x => x > 0).sort((a, b) => b - a), total = v.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const share = n => v.slice(0, n).reduce((a, b) => a + b, 0) / total * 100;
  const top1 = share(1), top5 = share(5);
  return { total, count: v.length, top1, top3: share(3), top5, top10: share(10), level: top1 > 40 || top5 > 80 ? "hög" : top5 > 60 ? "måttlig" : "låg" };
}

/** Ägartid: fördelar värdet på hur länge sedan första köpet (bara föremål med registrerat köp). rows: [{ value, firstBuy(ms)|null }] */
export const AGE_BUCKETS = [["Under 30 dagar", 0, 30], ["30–90 dagar", 30, 90], ["90 dagar–1 år", 90, 365], ["Över 1 år", 365, Infinity]];
export function holdingAge(rows, now = Date.now()) {
  const known = rows.filter(r => Number.isFinite(r.firstBuy)), unknown = rows.filter(r => !Number.isFinite(r.firstBuy));
  const buckets = AGE_BUCKETS.map(([label, a, b]) => ({ label, value: 0, count: 0 }));
  const ages = [];
  for (const r of known) {
    const age = Math.max(0, (now - r.firstBuy) / DAY); ages.push(age);
    const i = AGE_BUCKETS.findIndex(([, a, b]) => age >= a && age < b);
    buckets[i].value += r.value || 0; buckets[i].count++;
  }
  ages.sort((a, b) => a - b);
  const med = ages.length ? (ages.length % 2 ? ages[ages.length >> 1] : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2) : null;
  return { buckets, medianDays: med, oldestDays: ages.length ? ages[ages.length - 1] : null, known: known.length, unknown: unknown.length, unknownValue: unknown.reduce((s, r) => s + (r.value || 0), 0) };
}

/** Bidrag: största värden samt största vinster och förluster (kr). rows: [{ name, value, pl }] */
export function contributors(rows, n = 8) {
  const total = rows.reduce((s, r) => s + (r.value > 0 ? r.value : 0), 0);
  const byValue = [...rows].filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, n).map(r => ({ ...r, share: total ? r.value / total * 100 : 0 }));
  const withPl = rows.filter(r => Number.isFinite(r.pl));
  return { total, byValue, gains: [...withPl].filter(r => r.pl > 0).sort((a, b) => b.pl - a.pl).slice(0, n), losses: [...withPl].filter(r => r.pl < 0).sort((a, b) => a.pl - b.pl).slice(0, n) };
}
