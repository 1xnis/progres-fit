-- Fixtures: date de test introduse automat la prima pornire (când tabela utilizatori e goală).
-- Conturile demo sunt inserate din server.js (parolele trebuie hash-uite în aplicație).
-- Datele sunt relative la data curentă, ca rapoartele să aibă mereu conținut.

INSERT INTO tipuri_abonament (denumire, durata_zile, pret) VALUES
  ('Lunar', 30, 150), ('Trimestrial', 90, 400), ('Anual', 365, 1400),
  ('Student lunar', 30, 110), ('O zi', 1, 30);

INSERT INTO antrenori (utilizator_id, nume, prenume, specializare, telefon) VALUES
  ((SELECT id FROM utilizatori WHERE email = 'antrenor@progresfit.ro'), 'Ionescu', 'Andrei', 'Forță', '0722000001'),
  (NULL, 'Marin', 'Elena', 'Yoga', '0722000002'),
  (NULL, 'Stan', 'Radu', 'CrossFit', '0722000003'),
  (NULL, 'Dobre', 'Ioana', 'Pilates', '0722000004'),
  (NULL, 'Voicu', 'Mihai', 'Box', '0722000005'),
  (NULL, 'Enache', 'Diana', 'Spinning', '0722000006');

INSERT INTO membri (nume, prenume, email, telefon, data_nasterii, data_inscrierii)
SELECT
  (ARRAY['Popescu','Ionescu','Popa','Stoica','Dumitru','Gheorghe','Stan','Munteanu','Matei','Constantin',
         'Marin','Rusu','Moldovan','Lazăr','Florea','Nistor','Toma','Dinu','Sandu','Barbu'])[1 + i % 20],
  (ARRAY['Andrei','Maria','Alexandru','Elena','Mihai','Ioana','Cristian','Ana','Ștefan','Daniela',
         'Vlad','Raluca','George','Bianca','Radu','Simona','Paul','Alina','Tudor','Carmen'])[1 + (i / 20) % 20],
  'membru' || i || '@example.com',
  '07' || lpad(i::text, 8, '0'),
  date '1965-01-01' + (i * 37 % 14000),
  current_date - (i % 730)
FROM generate_series(1, 5000) i;

INSERT INTO abonamente (membru_id, tip_id, data_start, data_sfarsit, status)
SELECT 1 + i % 5000, t.id, s.d, s.d + t.durata_zile,
       CASE WHEN i % 40 = 0 THEN 'anulat' WHEN i % 55 = 0 THEN 'suspendat' ELSE 'activ' END
FROM generate_series(1, 20000) i
JOIN tipuri_abonament t ON t.id = 1 + (i / 3) % 5
CROSS JOIN LATERAL (SELECT current_date - (i % 700) AS d) s;

INSERT INTO plati (abonament_id, suma, metoda, platit_la)
SELECT a.id, t.pret, (ARRAY['card', 'numerar', 'transfer'])[1 + a.id % 3],
       a.data_start + time '08:00' + (a.id % 720) * interval '1 minute'
FROM abonamente a
JOIN tipuri_abonament t ON t.id = a.tip_id
WHERE a.status <> 'anulat';

-- 4 clase pe zi, de acum 120 de zile până peste 30 de zile
INSERT INTO clase (denumire, antrenor_id, incepe_la, durata_min, capacitate)
SELECT (ARRAY['Yoga', 'Pilates', 'CrossFit', 'Spinning', 'Zumba', 'Box'])[1 + i % 6],
       1 + i % 6,
       date_trunc('day', now()) + (i / 4 - 120) * interval '1 day' + (8 + (i % 4) * 3) * interval '1 hour',
       60, 15 + (i % 3) * 5
FROM generate_series(0, 599) i;

INSERT INTO programari (clasa_id, membru_id, status)
SELECT 1 + i % 600, 1 + (i * 7) % 5000,
       CASE WHEN i % 12 = 0 THEN 'anulat' WHEN i % 600 < 480 THEN 'prezent' ELSE 'confirmat' END
FROM generate_series(1, 7200) i
ON CONFLICT DO NOTHING;

ANALYZE;
