import { getKV, setKV } from "./store.js";
import { ui, money } from "./util.js";
import { DEFAULTS, cleanPrefs, resolveTheme, THEME_COLOR, imgScaleOf, bootMirror } from "./prefs-core.js";

let P = { ...DEFAULTS }, watching = false;
export const getPrefs = () => P;

/** Sätter attribut på <html> och bildskalan. Anropas vid start och varje gång en inställning ändras. */
export function applyPrefs() {
  const root = document.documentElement, mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const theme = resolveTheme(P, !!mq?.matches);
  root.dataset.theme = theme; root.dataset.density = P.density; root.dataset.motion = P.motion; root.dataset.cards = P.cards;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
  ui.imgScale = imgScaleOf(P.imageQuality);
  money.code = P.currency; // visningsvaluta (sparade belopp är alltid kronor)
  try { localStorage.setItem("cs2hub.ui", JSON.stringify(bootMirror(P))); } catch { /* lagring kan vara blockerad */ }
  if (mq && !watching) { watching = true; mq.addEventListener?.("change", () => { if (P.theme === "system") applyPrefs(); }); }
}
export async function loadPrefs() { P = cleanPrefs(await getKV("prefs", null)); applyPrefs(); return P; }
export async function savePrefs(patch) { P = cleanPrefs({ ...P, ...patch }); await setKV("prefs", P); applyPrefs(); return P; }
export async function resetPrefs() { P = { ...DEFAULTS }; await setKV("prefs", P); applyPrefs(); return P; }
