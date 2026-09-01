/**
 * Runtime i18n: English is the source language written inline in $localize
 * tags; Spanish loads here via loadTranslations BEFORE the app modules are
 * imported (see main.ts — the bootstrap is a dynamic import for exactly this
 * reason). One SPA build serves both languages; the choice persists in
 * localStorage and defaults to the browser language.
 */
import { loadTranslations } from "@angular/localize";

export type Locale = "en" | "es";

const STORAGE_KEY = "sacbe-locale";

export function currentLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    /* storage unavailable — fall through to browser language */
  }
  return typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("es")
    ? "es"
    : "en";
}

const RESTORE_THREAD_KEY = "sacbe-restore-thread";

/**
 * Persist the choice and reload — translations bind at module-eval time, so
 * a live switch can't retranslate the SDK chat (labels/suggestions are bound
 * at bootstrap). The reload only re-skins the chrome: the active thread id is
 * stashed here and re-joined on boot (see app.config.ts), so the current
 * conversation survives. Messages already generated keep their language —
 * only static UI translates.
 */
export function setLocale(locale: Locale, activeThreadId?: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
    if (activeThreadId) {
      localStorage.setItem(RESTORE_THREAD_KEY, activeThreadId);
    }
  } catch {
    /* ignore */
  }
  location.reload();
}

/** One-shot read of the thread stashed by setLocale (cleared on read). */
export function consumeRestoredThreadId(): string | undefined {
  try {
    const id = localStorage.getItem(RESTORE_THREAD_KEY) ?? undefined;
    localStorage.removeItem(RESTORE_THREAD_KEY);
    return id;
  } catch {
    return undefined;
  }
}

const ES: Record<string, string> = {
  // masthead
  "masthead.eyebrow": "Sacbé · planificador de viajes",
  "masthead.defaultTripName": "Ponle nombre al viaje",
  "masthead.meta":
    "{$stops} en {$days} — planeado con el asistente, tuyo para ajustar.",
  "unit.stop.one": "1 parada",
  "unit.stop.many": "{$n} paradas",
  "unit.day.one": "1 día",
  "unit.day.many": "{$n} días",
  // board
  "board.days.aria": "Días del viaje",
  "board.day.empty": "Este día es camino abierto. Pídele al asistente que lo llene.",
  "board.empty.title": "El camino está vacío.",
  "board.empty.hint":
    "Pídele al asistente que planee un día — prueba con “Planea un día en Mérida”.",
  "board.remove": "Quitar {$title}",
  "board.details": "Detalles de {$title}",
  // chat shell
  "chat.title": "Asistente Sacbé",
  "chat.close": "Cerrar chat",
  "chat.open": "Abrir chat",
  // weather card
  "wx.eyebrow": "Pronóstico",
  "wx.pending": "Leyendo el cielo…",
  "wx.low": "mín {$min}°C",
  "wx.wind": "Viento",
  "wx.rain": "Lluvia",
  // weather hint phrases
  "hint.storm": "puede haber tormenta — planes flexibles",
  "hint.rain": "lluvia probable — lleva paraguas",
  "hint.shower": "podría caer un chubasco",
  "hint.hot": "calor — busca sombra y agua",
  "hint.clear": "cielo despejado",
  "hint.fine": "se ve bien",
  // search card
  "search.sources": "Fuentes",
  "search.sourcesFor": "Fuentes · {$place}",
  "search.pending": "Buscando…",
  "search.parseError": "No se pudieron leer los resultados.",
  // clear-trip approval card
  "clear.eyebrow": "Requiere tu aprobación",
  "clear.trip.question": "¿Vaciar todo el viaje?",
  "clear.day.question": "¿Quitar {$label} del viaje?",
  "clear.trip.approve": "Vaciar viaje",
  "clear.day.approve": "Quitar día",
  "clear.keep": "Conservar",
  "clear.approved": "Aprobado — hecho.",
  "clear.declined": "Rechazado — sin cambios.",
  "clear.someDay": "un día",
  // stop detail
  "detail.anytime": "a cualquier hora",
  "detail.pending": "Buscando información del lugar…",
  "detail.wikipedia": "De Wikipedia: {$title}",
  "detail.maps": "Abrir en Google Maps",
  "detail.menu": "Ver el menú",
  "detail.photos": "Más fotos",
  "detail.close": "Cerrar detalles",
  // suggestions
  "sug.plan.title": "Planear un día",
  "sug.plan.msg": "Planea un día completo en Mérida.",
  "sug.cenote.title": "Agregar un cenote",
  "sug.cenote.msg": "Agrega un chapuzón en cenote por la tarde.",
  "sug.weather.title": "Ver el clima",
  "sug.weather.msg": "¿Cómo estará el clima el día 1?",
  "sug.reset.title": "Empezar de nuevo",
  "sug.reset.msg": "Vacía todo el viaje.",
  // chat labels (CopilotKit)
  "chatlbl.placeholder": "Escribe un mensaje…",
  "chatlbl.welcome": "¿Cómo te ayudo hoy?",
  "chatlbl.disclaimer":
    "La IA puede cometer errores. Verifica la información importante.",
  // language toggle
  "lang.toggle": "English",
  "lang.toggleAria": "Switch to English",
};

export function initI18n(): Locale {
  const locale = currentLocale();
  if (locale === "es") {
    loadTranslations(ES);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  return locale;
}
