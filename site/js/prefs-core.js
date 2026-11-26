// Användarinställningar (utseende och beteende): ren logik utan DOM/lagring så att den går att testa i tests.html.
// Inställningarna sparas lokalt (kv-nyckeln "prefs") och ändrar bara HUR saker visas – aldrig din sparade data.

export const OPTIONS = {
  theme: ["dark", "light", "system"],
  density: ["normal", "compact"],
  motion: ["auto", "on", "off"],
  cards: ["small", "normal", "large"],
  imageQuality: ["low", "normal", "high"],
  invView: ["cards", "table"],
  invSort: ["value", "name", "pl", "plr", "float"],
  invTab: ["holdings", "trades", "profit", "sell", "portfolio", "analysis"],
  invMode: ["cash", "steam"],
  calcMarket: ["skinport", "csfloat", "csmoney", "buff163", "swapgg", "steam"],
  currency: ["SEK", "USD", "EUR", "NOK", "DKK"],
};
export const DEFAULTS = { theme: "dark", density: "normal", motion: "auto", cards: "normal", imageQuality: "normal", invView: "cards", invSort: "value", invTab: "holdings", invMode: "cash", calcMarket: "csfloat", currency: "SEK", notifications: true, minKr: null };

/** Tvättar sparade inställningar: okända eller ogiltiga värden ersätts med standardvärdet. */
export function cleanPrefs(raw) {
  const o = { ...DEFAULTS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return o;
  for (const k of Object.keys(OPTIONS)) if (OPTIONS[k].includes(raw[k])) o[k] = raw[k];
  if (typeof raw.notifications === "boolean") o.notifications = raw.notifications;
  if (raw.minKr === null) o.minKr = null; else if (typeof raw.minKr === "number" && Number.isFinite(raw.minKr) && raw.minKr >= 0 && raw.minKr <= 1e6) o.minKr = raw.minKr;
  return o;
}

/** Vilket tema som faktiskt används. systemDark = webbläsarens/OS:ets mörka läge. */
export const resolveTheme = (p, systemDark) => (p.theme === "system" ? (systemDark ? "dark" : "light") : p.theme === "light" ? "light" : "dark");
export const THEME_COLOR = { dark: "#111214", light: "#f5f6f8" };

/** Skalfaktor för bildstorlek. */
export const imgScaleOf = q => ({ low: 0.6, normal: 1, high: 1.5 }[q] || 1);
/** "256fx192f" -> skalad storlek (max 600 px). Andra format lämnas orörda. */
export function scaleImgSize(size, scale) {
  const m = /^(\d{1,4})fx(\d{1,4})f$/.exec(size || "");
  if (!m || scale === 1) return size;
  const w = Math.max(32, Math.min(600, Math.round(+m[1] * scale))), h = Math.max(24, Math.min(600, Math.round(+m[2] * scale)));
  return `${w}fx${h}f`;
}

/** Det som speglas till localStorage så att temat kan sättas innan sidan ritas (ingen blixt av fel tema). */
export const bootMirror = p => ({ theme: p.theme, density: p.density, motion: p.motion, cards: p.cards });
