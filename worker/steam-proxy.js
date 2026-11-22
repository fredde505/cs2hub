// Cloudflare Worker: liten proxy för Steams publika CS2-inventory (Steam saknar CORS, så webbläsaren kan inte anropa det direkt).
// Endpoints:
//   GET /inventory?id=<SteamID64>      -> { assets: [...], descriptions: [...] }
//   GET /resolve?name=<vanity-namn>    -> { id: "7656119..." }
// Valfri miljövariabel ALLOWED_ORIGIN (t.ex. https://cs2hub.pages.dev) begränsar vilka sidor som får använda proxyn.

const STEAM = "https://steamcommunity.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allowed === "*" ? "*" : allowed,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    const json = (obj, status = 200, extra = {}) =>
      new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors, ...extra } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (allowed !== "*" && origin && origin !== allowed) return json({ error: "Origin not allowed" }, 403);

    try {
      if (url.pathname === "/inventory") {
        const id = url.searchParams.get("id") || "";
        if (!/^\d{17}$/.test(id)) return json({ error: "Ogiltigt SteamID64" }, 400);
        return await cached(request, ctx, 60, async () => {
          const merged = { assets: [], descriptions: [] };
          let start = "";
          for (let page = 0; page < 6; page++) { // max ca 30 000 föremål
            const u = `${STEAM}/inventory/${id}/730/2?l=english&count=5000${start ? "&start_assetid=" + start : ""}`;
            const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (cs2hub-proxy)" }, cf: { cacheTtl: 60 } });
            if (r.status === 403) return json({ error: "Inventoryt är privat. Ställ in Sekretess → Inventory: Offentligt." }, 403);
            if (r.status === 429) return json({ error: "Steam begränsar anropen just nu. Vänta en minut." }, 429);
            if (!r.ok) return json({ error: "Steam svarade " + r.status }, 502);
            const j = await r.json();
            if (!j || !j.assets) return json({ error: "Tomt eller privat inventory" }, 404);
            merged.assets.push(...j.assets);
            merged.descriptions.push(...(j.descriptions || []));
            if (!j.more_items) break;
            start = j.last_assetid;
          }
          return json(merged, 200, { "Cache-Control": "public, max-age=60" });
        });
      }

      if (url.pathname === "/resolve") {
        const name = url.searchParams.get("name") || "";
        if (!/^[\w-]{2,32}$/.test(name)) return json({ error: "Ogiltigt namn" }, 400);
        const r = await fetch(`${STEAM}/id/${encodeURIComponent(name)}/?xml=1`, { headers: { "User-Agent": "Mozilla/5.0 (cs2hub-proxy)" }, cf: { cacheTtl: 3600 } });
        const m = (await r.text()).match(/<steamID64>(\d{17})<\/steamID64>/);
        return m ? json({ id: m[1] }, 200, { "Cache-Control": "public, max-age=3600" }) : json({ error: "Hittade ingen profil med det namnet" }, 404);
      }

      return json({ ok: true, endpoints: ["/inventory?id=", "/resolve?name="] });
    } catch (e) {
      return json({ error: "Proxyfel: " + e.message }, 500);
    }
  },
};

// Enkel edge-cache så att upprepade importer inte slår mot Steam.
async function cached(request, ctx, ttl, producer) {
  const cache = globalThis.caches && globalThis.caches.default;
  if (!cache) return producer(); // t.ex. vid lokal testning utan edge-cache
  const key = new Request(request.url, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await producer();
  if (res.status === 200) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
