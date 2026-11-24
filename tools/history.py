"""Bygger upp en egen prishistorik: lägger till dagens lägsta pris för de mest handlade föremålen.

Användning:  python tools/history.py <prices.json> <tidigare history.json> <ny history.json>

Format (history.json):  {"v":1, "d":["2026-11-24", ...], "p":{"<marknadsnamn>":[pris_usd_per_dag_eller_null, ...]}}
Priset är lägsta pris bland Skinport/CSFloat/CS.MONEY/Swap.gg (samma sätt som i appen). Max MAX_DAYS dagar sparas.
"""
import json
import sys
import datetime

MAX_DAYS = 120   # hur många dagar historik som behålls
MAX_ITEMS = 5000  # hur många föremål som följs
EXT = (1, 3, 4, 5)  # index i prisraden: skinport, csfloat, csmoney, swapgg (buff163 och Steam räknas inte)


def lowest(row):
    vals = [row[i] for i in EXT if i < len(row) and row[i]]
    return round(min(vals), 2) if vals else None


def update(prices, prev, today):
    rows = prices["p"]
    days = list(prev.get("d", []))
    hist = {k: list(v) for k, v in prev.get("p", {}).items()}
    if days and days[-1] == today:
        pass  # samma dag igen: skriv över dagens värde
    else:
        days.append(today)
        for v in hist.values():
            v.append(None)
    n = len(days)
    # Redan följda föremål följs vidare; nya väljs bland de mest likvida (flest marknader, sedan högst pris)
    cands = []
    for name, row in rows.items():
        p = lowest(row)
        if p is None or p < 0.3:
            continue
        cands.append((sum(1 for i in EXT if i < len(row) and row[i]), p, name))
    cands.sort(reverse=True)
    # Redan följda föremål behålls om de fortfarande är hyfsat likvida (rank < 1,3 x MAX_ITEMS) – håller filen på rimlig storlek
    rank = {c[2]: i for i, c in enumerate(cands)}
    keep_prev = {k for k in hist if rank.get(k, 10**9) < int(MAX_ITEMS * 1.3)}
    wanted = keep_prev | {c[2] for c in cands[:MAX_ITEMS]}
    hist = {k: v for k, v in hist.items() if k in wanted}
    for name in wanted:
        row = rows.get(name)
        series = hist.get(name) or [None] * n
        if len(series) < n:
            series = [None] * (n - len(series)) + series
        series[n - 1] = lowest(row) if row else None
        hist[name] = series
    # Trimma gamla dagar och släpp föremål utan några värden
    if n > MAX_DAYS:
        cut = n - MAX_DAYS
        days = days[cut:]
        hist = {k: v[cut:] for k, v in hist.items()}
    hist = {k: v for k, v in hist.items() if any(x is not None for x in v)}
    return {"v": 1, "d": days, "p": hist}


def main():
    prices_path, prev_path, out_path = sys.argv[1:4]
    prices = json.load(open(prices_path, encoding="utf8"))
    try:
        prev = json.load(open(prev_path, encoding="utf8"))
        if not isinstance(prev, dict) or prev.get("v") != 1:
            prev = {}
    except Exception:
        prev = {}
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    out = update(prices, prev, today)
    with open(out_path, "w", encoding="utf8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"history.json: {len(out['d'])} dagar, {len(out['p'])} föremål")


if __name__ == "__main__":
    main()
