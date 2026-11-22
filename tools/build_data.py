"""
Bygger site/data/*.json från CS2:s item-schema (ByMykel/CSGO-API) och färganalyserar skinbilder i förväg.

Körning:  python tools/build_data.py [--raw <mapp med schema-json>] [--no-colors]
Schemafilerna hämtas automatiskt om --raw saknas.
"""
import argparse, colorsys, concurrent.futures as cf, io, json, os, re, sys, urllib.request
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data")
CACHE = os.path.join(ROOT, "tools", ".cache")
API = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/"
STEAM_IMG = "https://community.akamai.steamstatic.com/economy/image/"
FILES = ["skins", "stickers", "crates", "keychains", "agents", "music_kits", "patches", "graffiti", "collections"]

WEAR_SHORT = {"Factory New": "FN", "Minimal Wear": "MW", "Field-Tested": "FT", "Well-Worn": "WW", "Battle-Scarred": "BS"}
WEAR_RANGE = {"FN": (0.0, 0.07), "MW": (0.07, 0.15), "FT": (0.15, 0.38), "WW": (0.38, 0.45), "BS": (0.45, 1.0)}
RARITY_ORDER = {  # sorteringsvikt
    "Consumer Grade": 0, "Industrial Grade": 1, "Mil-Spec Grade": 2, "Restricted": 3, "Classified": 4,
    "Covert": 5, "Contraband": 6, "Extraordinary": 6,
}


def fetch_raw(raw_dir):
    os.makedirs(CACHE, exist_ok=True)
    data = {}
    for f in FILES:
        p = os.path.join(raw_dir, f + ".json") if raw_dir else os.path.join(CACHE, f + ".json")
        if not os.path.exists(p):
            print("hämtar", f)
            urllib.request.urlretrieve(API + f + ".json", p)
        with open(p, encoding="utf8") as fh:
            data[f] = json.load(fh)
    return data


def short_img(url):
    if not url:
        return ""
    return url[len(STEAM_IMG):] if url.startswith(STEAM_IMG) else url


# ---------------------------------------------------------------- färganalys
HUE_NAMES = [  # (max hue grader, namn)
    (14, "red"), (38, "orange"), (68, "gold"), (165, "green"), (198, "cyan"),
    (258, "blue"), (292, "purple"), (338, "pink"), (361, "red"),
]


def hue_name(h):
    for mx, n in HUE_NAMES:
        if h < mx:
            return n
    return "red"


ACHROMATIC = ("black", "white", "gray")


def histogram(img_bytes):
    """Pixelhistogram per färgnamn: {namn: [antal, sum_mättnad, r, g, b]}."""
    from PIL import Image
    im = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    im.thumbnail((64, 64))
    px = [p for p in im.getdata() if p[3] > 140]
    if len(px) < 20:
        return None
    hist = {}
    for r, g, b, _ in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if v < 0.14:
            n = "black"
        elif s < 0.18:
            n = "white" if v > 0.8 else "gray"
        else:
            n = hue_name(h * 360)
            if n == "orange" and v < 0.5:
                n = "brown"
            if n == "red" and s < 0.4 and v > 0.7:
                n = "pink"
        e = hist.setdefault(n, [0, 0.0, 0, 0, 0])
        e[0] += 1; e[1] += s; e[2] += r; e[3] += g; e[4] += b
    return hist


def classify(hist):
    """(primär, sekundär, multicolor, hex). Kromatiska färger går före metall/grått."""
    if not hist:
        return None
    total = sum(e[0] for e in hist.values())
    chrom = sorted(((n, e[0]) for n, e in hist.items() if n not in ACHROMATIC), key=lambda x: -x[1])
    achro = sorted(((n, e[0]) for n, e in hist.items() if n in ACHROMATIC), key=lambda x: -x[1])
    chrom_total = sum(c for _, c in chrom)
    if chrom and chrom_total / total >= 0.10:
        primary = chrom[0][0]
        secondary = None
        for n, c in chrom[1:]:
            if c / chrom_total >= 0.22 and c / total >= 0.04:
                secondary = n
                break
        if not secondary and achro and achro[0][1] / total >= 0.30 and achro[0][0] != "gray":
            secondary = achro[0][0]
    else:
        primary = achro[0][0] if achro else chrom[0][0]
        secondary = achro[1][0] if len(achro) > 1 and achro[1][1] / total >= 0.2 else None
    multi = len([1 for _, c in chrom if c / total >= 0.13]) >= 3
    e = hist[primary]
    hexv = "#%02x%02x%02x" % (e[2] // e[0], e[3] // e[0], e[4] // e[0])
    p1 = round(100 * e[0] / total)                                   # andel av vapnets pixlar i primär färg
    p2 = round(100 * hist[secondary][0] / total) if secondary else 0 # ... i sekundär färg
    return primary, secondary, multi, hexv, p1, p2


def analyse(img_bytes):
    return histogram(img_bytes)


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cs2hub-build/1.0"})
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:
            pass
    return None


def color_pass(skins):
    cache_p = os.path.join(CACHE, "colors.json")
    cache = {}
    if os.path.exists(cache_p):
        cache = json.load(open(cache_p, encoding="utf8"))
    todo = [s for s in skins if cache.get(s["id"]) is None and s["img"]]
    print(f"färganalys: {len(todo)} nya av {len(skins)}")

    def work(s):
        b = download(s["img"] if s["img"].startswith("http") else STEAM_IMG + s["img"] + "/128fx96f")
        return s["id"], (analyse(b) if b else None)

    done = 0
    with cf.ThreadPoolExecutor(max_workers=24) as ex:
        for sid, res in ex.map(work, todo):
            cache[sid] = res
            done += 1
            if done % 250 == 0:
                print(" ", done, "/", len(todo))
                json.dump(cache, open(cache_p, "w", encoding="utf8"))
    json.dump(cache, open(cache_p, "w", encoding="utf8"))
    return cache


# ---------------------------------------------------------------- bygg
def build(data, do_colors=True):
    os.makedirs(OUT, exist_ok=True)
    colls = {}
    for c in data["collections"]:
        colls[c["id"]] = c

    skins = []
    for s in data["skins"]:
        cat = s["category"]["name"] if s.get("category") else ""
        weapon = s["weapon"]["name"] if s.get("weapon") else ""
        pat = (s.get("pattern") or {}).get("name") or ""
        wears = [WEAR_SHORT.get(w["name"], w["name"]) for w in (s.get("wears") or [])]
        kind = {"Gloves": "glove", "Knives": "knife"}.get(cat, "weapon")
        skins.append({
            "id": s["id"],
            "n": s["name"],                    # fullt namn
            "w": weapon,                       # vapen
            "p": pat,                          # mönster/skinnamn
            "c": cat,                          # kategori (Rifles, Pistols, SMGs, Heavy, Knives, Gloves)
            "k": kind,
            "r": (s.get("rarity") or {}).get("name", ""),
            "rc": (s.get("rarity") or {}).get("color", "#888"),
            "f": [s.get("min_float"), s.get("max_float")],
            "wr": wears,
            "st": bool(s.get("stattrak")),
            "sv": bool(s.get("souvenir")),
            "col": [x["id"] for x in (s.get("collections") or [])],
            "cn": [x["name"] for x in (s.get("collections") or [])],
            "cr": [x["id"] for x in (s.get("crates") or [])],
            "t": (s.get("team") or {}).get("id", "both"),
            "pi": s.get("paint_index"),
            "wi": (s.get("weapon") or {}).get("weapon_id"),   # defindex (för inspect-länkar)
            "lg": bool(s.get("legacy_model")),                # gammal modell (skiljer dubbletter med samma namn)
            "d": (s.get("description") or "").replace("\\n", "\n"),
            "img": short_img(s.get("image")),
        })

    if do_colors:
        cache = color_pass(skins)
        for s in skins:
            r = classify(cache.get(s["id"]))
            if r:
                s["c1"], s["c2"], s["mc"], s["hx"], s["p1"], s["p2"] = r[0], r[1], bool(r[2]), r[3], r[4], r[5]
            else:
                s["c1"], s["c2"], s["mc"], s["hx"], s["p1"], s["p2"] = None, None, False, "#888888", 0, 0

    # kategori: normalisera
    # stickers
    stickers = [{
        "id": x["id"], "n": x["name"], "r": (x.get("rarity") or {}).get("name", ""),
        "rc": (x.get("rarity") or {}).get("color", "#888"),
        "ty": x.get("type") or "", "ef": x.get("effect") or "",
        "tn": (x.get("tournament") or {}).get("name", ""),
        "mh": x.get("market_hash_name"), "img": short_img(x.get("image")),
    } for x in data["stickers"]]

    def simple(lst, kind, extra=lambda x: {}):
        out = []
        for x in lst:
            d = {"id": x["id"], "n": x["name"], "r": (x.get("rarity") or {}).get("name", ""),
                 "rc": (x.get("rarity") or {}).get("color", "#888"),
                 "mh": x.get("market_hash_name"), "img": short_img(x.get("image")), "ty": kind,
                 "d": (x.get("description") or "").replace("\\n", "\n")[:300]}
            d.update(extra(x))
            out.append(d)
        return out

    other = []
    other += simple(data["crates"], "crate", lambda x: {
        "ct": x.get("type") or "", "fs": x.get("first_sale_date"),
        "ci": [c["id"] for c in (x.get("contains") or [])],
        "cx": [c["id"] for c in (x.get("contains_rare") or [])]})
    other += simple(data["keychains"], "charm")
    other += simple(data["agents"], "agent", lambda x: {"t": (x.get("team") or {}).get("id", "")})
    other += simple(data["music_kits"], "music")
    other += simple(data["patches"], "patch")
    other += simple(data["graffiti"], "graffiti", lambda x: {"tint": x.get("tint")})

    collections = [{
        "id": c["id"], "n": c["name"], "rd": c.get("release_date"), "img": c.get("image"),
        "items": [i["id"] for i in (c.get("contains") or [])],
    } for c in data["collections"]]

    def dump(name, obj):
        p = os.path.join(OUT, name)
        with open(p, "w", encoding="utf8") as fh:
            json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
        print(f"{name}: {os.path.getsize(p)/1024:.0f} kB, {len(obj)} poster")

    dump("skins.json", skins)
    dump("stickers.json", stickers)
    dump("other.json", other)
    dump("collections.json", collections)
    dump("meta.json", {"built": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                       "imgBase": STEAM_IMG, "counts": {"skins": len(skins), "stickers": len(stickers), "other": len(other)}})


# ---------------------------------------------------------------- priser (snapshot som reserv)
PRICE_BASE = "https://prices.csgotrader.app/latest/"
PRICE_SOURCES = ["steam", "skinport", "buff163", "csfloat", "csmoney", "swapgg"]


def _num(v):
    return round(v, 2) if isinstance(v, (int, float)) and v > 0 else None


def _pick(src, v):
    if v is None:
        return None
    if src == "steam":
        return _num(v.get("last_24h") or v.get("last_7d") or v.get("last_30d"))
    if src in ("skinport", "buff163"):
        sa = v.get("starting_at")
        return _num(sa.get("price") if isinstance(sa, dict) else sa)
    if src in ("csfloat", "csmoney"):
        return _num(v.get("price"))
    return _num(v)  # swapgg: ren siffra


def build_prices():
    os.makedirs(OUT, exist_ok=True)
    table, trend = {}, {}
    for i, src in enumerate(PRICE_SOURCES):
        print("pris:", src)
        req = urllib.request.Request(PRICE_BASE + src + ".json", headers={"User-Agent": "cs2hub-build/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
            if raw[:2] == b"\x1f\x8b":
                raw = __import__("gzip").decompress(raw)
            feed = json.loads(raw.decode("utf8"))
        for name, v in feed.items():
            if src == "steam" and isinstance(v, dict):
                tr = [_num(v.get(k)) for k in ("last_24h", "last_7d", "last_30d", "last_90d")]
                if (tr[0] or tr[1] or 0) >= 0.5 and tr[1] and tr[2]:
                    trend[name] = tr
            p = _pick(src, v)
            row = table.setdefault(name, [None] * (len(PRICE_SOURCES) + 1))
            row[i] = p
            if src == "buff163" and isinstance(v, dict):
                ho = v.get("highest_order")
                row[-1] = _num(ho.get("price") if isinstance(ho, dict) else ho)
    table = {k: v for k, v in table.items() if any(x for x in v)}
    out = {"t": __import__("time").time(), "src": PRICE_SOURCES + ["buff163_order"], "p": table, "tr": trend}
    p = os.path.join(OUT, "prices.json")
    with open(p, "w", encoding="utf8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"prices.json: {os.path.getsize(p)/1024:.0f} kB, {len(table)} föremål")


# ---------------------------------------------------------------- mönsterdata (seed -> Fade % / Blue Gem %)
# Källor (MIT, chescos): csgo-fade-percentage-calculator och csgo-blue-gem-calculator.
def build_patterns():
    gh = "https://raw.githubusercontent.com/chescos/"
    def get(u):
        req = urllib.request.Request(u, headers={"User-Agent": "cs2hub-build/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf8"))
    fade_src = get(gh + "csgo-fade-percentage-calculator/master/generated/fade-percentages.json")
    blue_src = get(gh + "csgo-blue-gem-calculator/master/gen/result.json")
    fade = {}
    for w in fade_src:
        arr = [None] * 1001
        for p in w["percentages"]:
            arr[p["seed"]] = round(p["percentage"], 2)
        fade[w["weapon"]] = arr
    blue = {}
    for wk, variants in blue_src.items():
        for vk, sides in variants.items():
            for sk, flat in sides.items():
                # 4 värden per seed: [blå, lila, guld, övrigt] (%)
                blue.setdefault(wk, {}).setdefault(vk, {})[sk] = [[round(flat[i * 4 + j], 1) for j in range(3)] for i in range(1001)]
    out = {"fade": fade, "blue": blue}
    p = os.path.join(OUT, "patterns.json")
    with open(p, "w", encoding="utf8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"patterns.json: {os.path.getsize(p)/1024:.0f} kB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--patterns", action="store_true", help="bygg bara mönsterdata")
    ap.add_argument("--raw")
    ap.add_argument("--no-colors", action="store_true")
    ap.add_argument("--prices", action="store_true", help="bygg bara prissnapshot")
    a = ap.parse_args()
    if a.patterns:
        build_patterns()
    elif a.prices:
        build_prices()
    else:
        build_patterns()
        build(fetch_raw(a.raw), not a.no_colors)
        build_prices()
