/**
 * Database schema, migrations and the audit trigger. Identical to the original application,
 * so an existing Citadel V3 database can be used without any migration.
 */
import type { Db } from "./db";
import { hashPassword, generateSalt } from "./auth";

export const DDL_SCHEMA_EXPORT = `-- === DEFINICJE STRUKTURY DANYCH (DDL) ===
CREATE TABLE IF NOT EXISTS kraje (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nazwa TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS regiony (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kraj_id BIGINT REFERENCES kraje(id) ON DELETE SET NULL,
    nazwa TEXT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS kola (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kraj_id BIGINT REFERENCES kraje(id) ON DELETE RESTRICT DEFAULT 1,
    nazwa TEXT NOT NULL,
    region_id BIGINT REFERENCES regiony(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by_region_id BIGINT REFERENCES regiony(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS uzytkownicy (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    haslo_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    imie_nazwisko TEXT NOT NULL,
    rola TEXT NOT NULL CHECK (rola IN ('ADMIN', 'SKARBNIK_KRAJOWY', 'SKARBNIK_REGIONU', 'SKARBNIK_KOLA')),
    kraj_id BIGINT REFERENCES kraje(id) ON DELETE SET NULL,
    region_id BIGINT REFERENCES regiony(id) ON DELETE SET NULL,
    kolo_id BIGINT REFERENCES kola(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    wymus_zmiane_hasla BOOLEAN NOT NULL DEFAULT FALSE,
    sesja_wersja INT NOT NULL DEFAULT 1,
    ostatnie_logowanie TIMESTAMPTZ,
    ostatnia_aktywnosc TIMESTAMPTZ,
    utworzono_o TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS czlonkowie (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kolo_id BIGINT NOT NULL DEFAULT 1 REFERENCES kola(id) ON DELETE RESTRICT,
    imie_nazwisko TEXT NOT NULL,
    data_urodzenia DATE NOT NULL,
    data_przystapienia DATE NOT NULL,
    saldo_startowe_gr BIGINT DEFAULT 0,
    reczny_parametr TEXT DEFAULT 'AUTO'
);
CREATE TABLE IF NOT EXISTS wplaty (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kolo_id BIGINT NOT NULL REFERENCES kola(id) ON DELETE RESTRICT,
    czlonek_id BIGINT REFERENCES czlonkowie(id) ON DELETE SET NULL,
    kwota_gr BIGINT NOT NULL,
    data_wplaty DATE NOT NULL,
    notatka TEXT,
    data_wpisu TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS wplaty_oczekujace (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kolo_id BIGINT NOT NULL REFERENCES kola(id) ON DELETE RESTRICT,
    czlonek_id BIGINT REFERENCES czlonkowie(id) ON DELETE SET NULL,
    zglosil_uzytkownik_id BIGINT REFERENCES uzytkownicy(id) ON DELETE SET NULL,
    kwota_gr BIGINT NOT NULL CHECK (kwota_gr > 0),
    data_wplaty DATE NOT NULL CHECK (data_wplaty >= '2015-01-01'),
    notatka TEXT,
    oswiadczenie TEXT NOT NULL CHECK (oswiadczenie IN ('MAM_POTWIERDZENIE', 'BRAK_POTWIERDZENIA')),
    status TEXT NOT NULL DEFAULT 'OCZEKUJE' CHECK (status IN ('OCZEKUJE', 'ZAAKCEPTOWANA', 'ODRZUCONA')),
    idempotency_key TEXT UNIQUE,
    data_zgloszenia TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rozpatrzyl_uzytkownik_id BIGINT REFERENCES uzytkownicy(id) ON DELETE SET NULL,
    data_rozpatrzenia TIMESTAMPTZ,
    powod_odrzucenia TEXT
);
CREATE TABLE IF NOT EXISTS naliczenia_reczne (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    czlonek_id BIGINT NOT NULL REFERENCES czlonkowie(id) ON DELETE CASCADE,
    kwota_gr BIGINT NOT NULL,
    data_naliczenia DATE NOT NULL,
    tytul TEXT NOT NULL,
    data_wpisu TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS korekty (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    czlonek_id BIGINT NOT NULL REFERENCES czlonkowie(id) ON DELETE CASCADE,
    delta_gr BIGINT NOT NULL,
    docelowe_saldo_gr BIGINT NOT NULL,
    data_korekty DATE NOT NULL,
    powod TEXT,
    data_wpisu TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS wydatki (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kolo_id BIGINT NOT NULL REFERENCES kola(id) ON DELETE RESTRICT,
    kwota_gr BIGINT NOT NULL,
    data_wydatku DATE NOT NULL,
    kategoria TEXT,
    opis TEXT,
    data_wpisu TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS korekty_kasy (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kolo_id BIGINT NOT NULL REFERENCES kola(id) ON DELETE RESTRICT,
    delta_gr BIGINT NOT NULL,
    docelowy_stan_gr BIGINT NOT NULL,
    data_korekty DATE NOT NULL,
    powod TEXT,
    data_wpisu TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabela VARCHAR(50) NOT NULL,
    operacja VARCHAR(10) NOT NULL,
    rekord_id BIGINT,
    stare_dane JSONB,
    nowe_dane JSONB,
    zmieniono_o TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS terminy_glosowan (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kolo_id BIGINT NOT NULL REFERENCES kola(id) ON DELETE CASCADE,
    data_glosowania DATE NOT NULL,
    data_zbiorki_od DATE,
    data_wymagalnosci_do DATE,
    dni_zbiorki_przed INT NOT NULL DEFAULT 14,
    dni_wymagalnosci_po INT NOT NULL DEFAULT 0,
    nazwa TEXT NOT NULL,
    opis TEXT,
    waga NUMERIC(3,2) NOT NULL DEFAULT 1.0,
    typ_terminu TEXT NOT NULL DEFAULT 'GLOSOWANIE',
    utworzono_o TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    utworzono_przez BIGINT REFERENCES uzytkownicy(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_wplaty_czlonek_data ON wplaty(czlonek_id, data_wplaty);
CREATE INDEX IF NOT EXISTS idx_wplaty_kolo_data ON wplaty(kolo_id, data_wplaty);
CREATE INDEX IF NOT EXISTS idx_czlonkowie_kolo ON czlonkowie(kolo_id);
CREATE INDEX IF NOT EXISTS idx_naliczenia_reczne_czlonek ON naliczenia_reczne(czlonek_id, data_naliczenia);
CREATE INDEX IF NOT EXISTS idx_korekty_czlonek ON korekty(czlonek_id, data_korekty);
CREATE INDEX IF NOT EXISTS idx_wydatki_kolo_data ON wydatki(kolo_id, data_wydatku);
CREATE INDEX IF NOT EXISTS idx_korekty_kasy_kolo ON korekty_kasy(kolo_id, data_korekty);
CREATE INDEX IF NOT EXISTS idx_kola_region ON kola(region_id);
CREATE INDEX IF NOT EXISTS idx_kola_kraj ON kola(kraj_id);
CREATE INDEX IF NOT EXISTS idx_regiony_kraj ON regiony(kraj_id);
CREATE INDEX IF NOT EXISTS idx_wplaty_oczekujace_kolo ON wplaty_oczekujace(kolo_id);
CREATE INDEX IF NOT EXISTS idx_terminy_glosowan_kolo_data ON terminy_glosowan(kolo_id, data_glosowania);
`;

/** Constraints, views, indexes and column migrations (no triggers). Also used as the Netlify Database migration. */
export const EXTRA_DDL = `
INSERT INTO kraje (nazwa) VALUES ('Polska') ON CONFLICT (nazwa) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_uzytkownicy_login ON uzytkownicy(login);
CREATE UNIQUE INDEX IF NOT EXISTS uq_aktywne_kola_nazwa ON kola (nazwa) WHERE (is_deleted = FALSE);
CREATE UNIQUE INDEX IF NOT EXISTS uq_aktywne_regiony_nazwa ON regiony (kraj_id, nazwa) WHERE (is_deleted = FALSE);
CREATE OR REPLACE VIEW aktywne_regiony AS SELECT * FROM regiony WHERE is_deleted = FALSE;
CREATE OR REPLACE VIEW aktywne_kola AS SELECT * FROM kola WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_wplaty_oczekujace_status ON wplaty_oczekujace(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabela_czas ON audit_log(tabela, zmieniono_o DESC);

-- Backwards-compatible column migrations
ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS sesja_wersja INT NOT NULL DEFAULT 1;
ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS ostatnia_aktywnosc TIMESTAMPTZ;
ALTER TABLE wplaty_oczekujace ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE terminy_glosowan ADD COLUMN IF NOT EXISTS data_zbiorki_od DATE;
ALTER TABLE terminy_glosowan ADD COLUMN IF NOT EXISTS data_wymagalnosci_do DATE;
ALTER TABLE terminy_glosowan ADD COLUMN IF NOT EXISTS dni_zbiorki_przed INT NOT NULL DEFAULT 14;
ALTER TABLE terminy_glosowan ADD COLUMN IF NOT EXISTS dni_wymagalnosci_po INT NOT NULL DEFAULT 0;
ALTER TABLE terminy_glosowan ADD COLUMN IF NOT EXISTS typ_terminu TEXT NOT NULL DEFAULT 'GLOSOWANIE';
`;

/** Audit trigger function and per-table triggers (installed by the app on start-up, as in the original). */
export const AUDIT_TRIGGER_DDL = `
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_stare_dane JSONB := NULL;
    v_nowe_dane JSONB := NULL;
    v_rekord_id BIGINT := NULL;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_stare_dane := to_jsonb(OLD);
        v_rekord_id := OLD.id;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Skip activity/login-only updates so the audit log does not bloat
        IF TG_TABLE_NAME = 'uzytkownicy' THEN
            IF (OLD.login = NEW.login AND
                OLD.haslo_hash = NEW.haslo_hash AND
                OLD.salt = NEW.salt AND
                OLD.imie_nazwisko = NEW.imie_nazwisko AND
                OLD.rola = NEW.rola AND
                OLD.kraj_id IS NOT DISTINCT FROM NEW.kraj_id AND
                OLD.region_id IS NOT DISTINCT FROM NEW.region_id AND
                OLD.kolo_id IS NOT DISTINCT FROM NEW.kolo_id AND
                OLD.is_active = NEW.is_active AND
                OLD.wymus_zmiane_hasla = NEW.wymus_zmiane_hasla AND
                OLD.sesja_wersja = NEW.sesja_wersja) THEN
                RETURN NEW;
            END IF;
        END IF;
        v_stare_dane := to_jsonb(OLD);
        v_nowe_dane := to_jsonb(NEW);
        v_rekord_id := NEW.id;
    ELSIF (TG_OP = 'INSERT') THEN
        v_nowe_dane := to_jsonb(NEW);
        v_rekord_id := NEW.id;
    END IF;

    IF TG_TABLE_NAME = 'uzytkownicy' THEN
        IF v_stare_dane IS NOT NULL THEN v_stare_dane := v_stare_dane - 'haslo_hash' - 'salt'; END IF;
        IF v_nowe_dane IS NOT NULL THEN v_nowe_dane := v_nowe_dane - 'haslo_hash' - 'salt'; END IF;
    END IF;

    INSERT INTO audit_log (tabela, operacja, rekord_id, stare_dane, nowe_dane, zmieniono_o)
    VALUES (TG_TABLE_NAME, TG_OP, v_rekord_id, v_stare_dane, v_nowe_dane, CURRENT_TIMESTAMP);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
    tabele TEXT[] := ARRAY['kraje', 'regiony', 'kola', 'uzytkownicy', 'czlonkowie',
        'wplaty', 'wplaty_oczekujace', 'naliczenia_reczne', 'korekty', 'wydatki', 'korekty_kasy', 'terminy_glosowan'];
BEGIN
    FOREACH t IN ARRAY tabele LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I;', t, t);
        EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();', t, t);
    END LOOP;
END $$;
`;

export const AUDITED_TABLES = [
  "kraje", "regiony", "kola", "uzytkownicy", "czlonkowie", "wplaty", "wplaty_oczekujace",
  "naliczenia_reczne", "korekty", "wydatki", "korekty_kasy", "terminy_glosowan", "audit_log",
];

export const DEFAULT_ADMIN_PASSWORD = "Centauri2026!";

/**
 * Supabase only (no-op elsewhere): the `public` schema is reachable through Supabase's Data API with the publishable
 * key, and new tables get default grants for the API roles. The app talks to PostgreSQL directly as the owner, so the
 * API roles need nothing: revoke them, enable RLS without policies (defence in depth) and make the views run with the
 * caller's rights. Idempotent; runs on every cold start together with the rest of the schema.
 */
export const SUPABASE_HARDENING_DDL = `
DO $$
DECLARE t text;
BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) = 2 THEN
    FOR t IN SELECT unnest(ARRAY[${AUDITED_TABLES.map((t) => `'${t}'`).join(", ")}]) LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END LOOP;
    FOR t IN SELECT unnest(ARRAY['aktywne_regiony', 'aktywne_kola']) LOOP
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END LOOP;
    FOR t IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', t);
    END LOOP;
    REVOKE EXECUTE ON FUNCTION public.audit_trigger_func() FROM anon, authenticated;
  END IF;
END $$;
`;

export async function initSchema(db: Db): Promise<void> {
  await db.exec(DDL_SCHEMA_EXPORT);
  await db.exec(EXTRA_DDL);
  await db.exec(AUDIT_TRIGGER_DDL);
  await db.exec(SUPABASE_HARDENING_DDL);
  const admins = await db.scalar<number>("SELECT COUNT(*) FROM uzytkownicy WHERE rola = 'ADMIN'");
  if (Number(admins) === 0) {
    const salt = generateSalt();
    await db.query(
      `INSERT INTO uzytkownicy (login, haslo_hash, salt, imie_nazwisko, rola, is_active, wymus_zmiane_hasla, sesja_wersja)
       VALUES ('admin', $1, $2, 'Super Administrator', 'ADMIN', TRUE, TRUE, 1)`,
      [hashPassword(DEFAULT_ADMIN_PASSWORD, salt), salt],
    );
  }
}
