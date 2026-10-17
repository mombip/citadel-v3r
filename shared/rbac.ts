export type Role = "ADMIN" | "SKARBNIK_KRAJOWY" | "SKARBNIK_REGIONU" | "SKARBNIK_KOLA";
export const ROLES: Role[] = ["SKARBNIK_KOLA", "SKARBNIK_REGIONU", "SKARBNIK_KRAJOWY", "ADMIN"];

/** Single source of truth for authorisation (shared by API and UI). */
export const PERMISSIONS = {
  widzi_kraj: ["ADMIN", "SKARBNIK_KRAJOWY"],
  widzi_region: ["ADMIN", "SKARBNIK_KRAJOWY", "SKARBNIK_REGIONU"],
  akceptuje_wplaty: ["ADMIN", "SKARBNIK_KRAJOWY"],
  bezposrednie_ksiegowanie: ["ADMIN", "SKARBNIK_KRAJOWY"],
  reczne_naliczenia: ["ADMIN", "SKARBNIK_KRAJOWY"],
  korekty_salda: ["ADMIN", "SKARBNIK_KRAJOWY"],
  usuwa_czlonka: ["ADMIN", "SKARBNIK_KRAJOWY"],
  zarzadza_struktura: ["ADMIN", "SKARBNIK_KRAJOWY"],
  zarzadza_koszem: ["ADMIN"],
  zarzadza_kontami: ["ADMIN"],
  widzi_audyt: ["ADMIN"],
} as const satisfies Record<string, Role[]>;

export type Action = keyof typeof PERMISSIONS;

export function can(role: string | undefined | null, action: Action): boolean {
  return !!role && (PERMISSIONS[action] as readonly string[]).includes(role);
}

export function roleLabel(role: string): string {
  return (
    { ADMIN: "👑 Admin", SKARBNIK_KRAJOWY: "🇵🇱 Krajowy", SKARBNIK_REGIONU: "📊 Region", SKARBNIK_KOLA: "🏢 Koło" } as Record<string, string>
  )[role] ?? role;
}
