-- Progres Fit: schema bazei de date (PostgreSQL). Rulată la fiecare pornire; este idempotentă.

CREATE TABLE IF NOT EXISTS utilizatori (
  id           int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        text NOT NULL UNIQUE CHECK (email LIKE '%_@_%' AND email = lower(email)),
  nume         text NOT NULL CHECK (nume <> ''),
  rol          text NOT NULL CHECK (rol IN ('admin', 'receptioner', 'antrenor')),
  parola_hash  text NOT NULL,
  creat_la     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sesiuni (
  id             int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash     text NOT NULL UNIQUE,
  utilizator_id  int NOT NULL REFERENCES utilizatori (id) ON DELETE CASCADE,
  creat_la       timestamptz NOT NULL DEFAULT now(),
  expira_la      timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS membri (
  id               int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nume             text NOT NULL CHECK (nume <> ''),
  prenume          text NOT NULL CHECK (prenume <> ''),
  email            text NOT NULL UNIQUE CHECK (email LIKE '%_@_%' AND email = lower(email)),
  telefon          text,
  data_nasterii    date CHECK (data_nasterii < current_date),
  data_inscrierii  date NOT NULL DEFAULT current_date
);

CREATE TABLE IF NOT EXISTS antrenori (
  id             int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  utilizator_id  int UNIQUE REFERENCES utilizatori (id) ON DELETE SET NULL,
  nume           text NOT NULL CHECK (nume <> ''),
  prenume        text NOT NULL CHECK (prenume <> ''),
  specializare   text NOT NULL,
  telefon        text
);

CREATE TABLE IF NOT EXISTS tipuri_abonament (
  id           int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  denumire     text NOT NULL UNIQUE CHECK (denumire <> ''),
  durata_zile  int NOT NULL CHECK (durata_zile > 0),
  pret         numeric(8, 2) NOT NULL CHECK (pret >= 0)
);

-- Expirarea se deduce din data_sfarsit; statusul reține doar deciziile manuale.
CREATE TABLE IF NOT EXISTS abonamente (
  id            int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  membru_id     int NOT NULL REFERENCES membri (id) ON DELETE RESTRICT,
  tip_id        int NOT NULL REFERENCES tipuri_abonament (id) ON DELETE RESTRICT,
  data_start    date NOT NULL DEFAULT current_date,
  data_sfarsit  date NOT NULL,
  status        text NOT NULL DEFAULT 'activ' CHECK (status IN ('activ', 'suspendat', 'anulat')),
  CONSTRAINT abonamente_perioada_check CHECK (data_sfarsit >= data_start)
);

CREATE TABLE IF NOT EXISTS clase (
  id           int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  denumire     text NOT NULL CHECK (denumire <> ''),
  antrenor_id  int NOT NULL REFERENCES antrenori (id) ON DELETE RESTRICT,
  incepe_la    timestamptz NOT NULL,
  durata_min   int NOT NULL DEFAULT 60 CHECK (durata_min BETWEEN 15 AND 240),
  capacitate   int NOT NULL CHECK (capacitate > 0)
);

CREATE TABLE IF NOT EXISTS programari (
  id         int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clasa_id   int NOT NULL REFERENCES clase (id) ON DELETE CASCADE,
  membru_id  int NOT NULL REFERENCES membri (id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'confirmat' CHECK (status IN ('confirmat', 'prezent', 'anulat')),
  creat_la   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programari_unic UNIQUE (clasa_id, membru_id)
);

CREATE TABLE IF NOT EXISTS plati (
  id            int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  abonament_id  int NOT NULL REFERENCES abonamente (id) ON DELETE RESTRICT,
  suma          numeric(8, 2) NOT NULL CHECK (suma > 0),
  metoda        text NOT NULL CHECK (metoda IN ('card', 'numerar', 'transfer')),
  platit_la     timestamptz NOT NULL DEFAULT now()
);

-- Supabase expune automat schema `public` printr-un API REST public. Cu RLS activat și nicio
-- politică definită, acel API nu poate citi nimic; aplicația se conectează ca proprietar al
-- tabelelor (rolul postgres), care nu este afectat de RLS.
ALTER TABLE utilizatori      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiuni          ENABLE ROW LEVEL SECURITY;
ALTER TABLE membri           ENABLE ROW LEVEL SECURITY;
ALTER TABLE antrenori        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipuri_abonament ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonamente       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clase            ENABLE ROW LEVEL SECURITY;
ALTER TABLE programari       ENABLE ROW LEVEL SECURITY;
ALTER TABLE plati            ENABLE ROW LEVEL SECURITY;
