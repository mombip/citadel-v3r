/** Global UI state (Svelte 5 runes): theme, session, navigation and toast notifications. */
import { get, onSessionEvent, post } from "./api";

export type Theme = "fiolet" | "dark_mono" | "light_mono";
export const THEME_CYCLE: Theme[] = ["fiolet", "dark_mono", "light_mono"];
export const THEME_LABELS: Record<Theme, string> = { fiolet: "💜 Fiolet", dark_mono: "🖤 Ciemny", light_mono: "🤍 Jasny" };

export interface User {
  id: number;
  login: string;
  imie_nazwisko: string;
  rola: string;
  kraj_id: number | null;
  region_id: number | null;
  kolo_id: number | null;
  wymus_zmiane_hasla: boolean;
  sesja_wersja: number;
}

export interface Dictionaries {
  kraje: { id: number; nazwa: string }[];
  regiony: { id: number; nazwa: string }[];
  kolaBezRegionu: number;
  userRegionId: number | null;
  pendingCount: number;
  today: string;
}

export type ViewMode = "🏢 Koło" | "📊 Statystyki Regionu" | "🇵🇱 Statystyki Kraju";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("citadel.theme") as Theme | null;
    return t && THEME_CYCLE.includes(t) ? t : "fiolet";
  } catch {
    return "fiolet";
  }
}

export interface Toast { id: number; kind: "info" | "success" | "warning" | "error"; text: string }

class AppState {
  theme = $state<Theme>(readTheme());
  user = $state<User | null>(null);
  booted = $state(false);
  sessionNotice = $state<string | null>(null);
  dict = $state<Dictionaries | null>(null);
  krajId = $state<number | null>(null);
  regionId = $state<number | null>(null);
  viewMode = $state<ViewMode>("🏢 Koło");
  koloId = $state<number | null>(null);
  /** Bumps whenever data changed on the server; views re-fetch on change. */
  version = $state(0);
  toasts = $state<Toast[]>([]);

  isLight = $derived(this.theme === "light_mono");

  cycleTheme() {
    const idx = THEME_CYCLE.indexOf(this.theme);
    this.setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  }

  setTheme(t: Theme) {
    this.theme = t;
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("citadel.theme", t); } catch { /* ignore */ }
  }

  async boot() {
    onSessionEvent((reason) => {
      if (reason === "expired") {
        this.user = null;
        this.sessionNotice = "⚠️ Twoja sesja wygasła lub konto zostało zablokowane / zmodyfikowane. Zaloguj się ponownie.";
      } else if (reason === "passwordChange" && this.user) {
        this.user = { ...this.user, wymus_zmiane_hasla: true };
      }
    });
    try {
      const r = await get<{ user: User | null }>("/auth/me");
      this.user = r.user;
    } catch {
      this.user = null;
    }
    this.booted = true;
    // Like Streamlit's per-rerun check: re-verify the session periodically and when the tab regains focus,
    // so a blocked account or bumped session version logs the user out promptly.
    const verify = async () => {
      if (!this.user) return;
      try {
        const r = await get<{ user: User | null }>("/auth/me");
        if (!r.user) {
          this.user = null;
          this.sessionNotice = "⚠️ Twoja sesja wygasła lub konto zostało zablokowane / zmodyfikowane. Zaloguj się ponownie.";
        } else if (r.user.wymus_zmiane_hasla !== this.user.wymus_zmiane_hasla || r.user.rola !== this.user.rola) {
          this.user = r.user;
        }
      } catch { /* network hiccup: keep the session */ }
    };
    setInterval(verify, 20_000);
    window.addEventListener("focus", verify);
  }

  async loadDictionaries() {
    if (!this.user) return;
    const d = await get<Dictionaries>(`/dictionaries${this.krajId ? `?krajId=${this.krajId}` : ""}`);
    this.dict = d;
    if (this.krajId === null) this.krajId = this.user.kraj_id ?? d.kraje[0]?.id ?? 1;
    const opts = d.regiony.map((r) => r.id);
    if (this.user.rola === "SKARBNIK_REGIONU" || this.user.rola === "SKARBNIK_KOLA") {
      this.regionId = d.userRegionId;
    } else if (this.regionId === null || (!opts.includes(this.regionId) && this.regionId !== -1)) {
      this.regionId = opts[0] ?? (d.kolaBezRegionu > 0 ? -1 : null);
    }
  }

  async logout() {
    await post("/auth/logout");
    this.user = null;
    this.dict = null;
    this.koloId = null;
    this.viewMode = "🏢 Koło";
  }

  refresh() {
    this.version += 1;
  }

  toast(kind: Toast["kind"], text: string, ms = 4500) {
    const id = Date.now() + Math.random();
    this.toasts = [...this.toasts, { id, kind, text }];
    setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), ms);
  }
}

export const app = new AppState();
