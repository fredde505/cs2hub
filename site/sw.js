// Cache: datafilerna (/data/) visas direkt från cachen och uppdateras i bakgrunden (stale-while-revalidate),
// appens egna filer hämtas nätverk-först med cache som reserv offline. Bilder från Steam cachas av webbläsaren själv
// (att lägga dem i Cache Storage skulle fylla lagringskvoten).
const V = "cs2hub-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const isData = u.pathname.includes("/data/");
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(e.request);
    const update = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (isData && hit) { update.catch(() => { }); return hit; } // SWR: svara direkt, uppdatera i bakgrunden
    try { return await update; } catch (err) { if (hit) return hit; throw err; }
  }));
});
