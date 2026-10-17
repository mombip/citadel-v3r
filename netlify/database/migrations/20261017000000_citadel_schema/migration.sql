-- Citadel for NG schema (identical to Citadel V3). Audit triggers are installed by the app on start-up.
-- === DEFINICJE STRUKTURY DANYCH (DDL) ===
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

