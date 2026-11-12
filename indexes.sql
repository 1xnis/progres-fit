-- Indecși justificați prin planurile de execuție din docs/planuri-executie.md
-- (generate cu `npm run explain`). PostgreSQL NU indexează automat coloanele FK.

CREATE INDEX IF NOT EXISTS idx_abonamente_membru   ON abonamente (membru_id);
CREATE INDEX IF NOT EXISTS idx_abonamente_expirare ON abonamente (data_sfarsit) WHERE status = 'activ';
CREATE INDEX IF NOT EXISTS idx_plati_platit_la     ON plati (platit_la);
CREATE INDEX IF NOT EXISTS idx_plati_abonament     ON plati (abonament_id);
CREATE INDEX IF NOT EXISTS idx_programari_membru   ON programari (membru_id);
