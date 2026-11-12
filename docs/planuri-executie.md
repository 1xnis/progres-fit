# Planuri de execuție: înainte și după indecși

Generat automat de `npm run explain` la 2026-11-12, pe PostgreSQL încorporat (PGlite).
Număr de rânduri: abonamente = 20000, plati = 19500, programari = 7200.

| Index | Interogare | Înainte | După |
|---|---|---|---|
| `idx_abonamente_membru` | Abonamentele unui membru (lista filtrată din interfață) | Seq Scan, 1.765 ms | Bitmap Heap Scan, 0.065 ms |
| `idx_abonamente_expirare` | Raportul „abonamente care expiră în 7 zile” | Seq Scan, 3.874 ms | Bitmap Heap Scan, 0.571 ms |
| `idx_plati_platit_la` | Încasările unei zile (baza raportului de venituri) | Seq Scan, 3.366 ms | Bitmap Heap Scan, 0.223 ms |
| `idx_plati_abonament` | Plățile unui abonament | Seq Scan, 1.906 ms | Index Scan, 0.043 ms |
| `idx_programari_membru` | Programările unui membru | Seq Scan, 0.680 ms | Index Scan, 0.029 ms |

## Abonamentele unui membru (lista filtrată din interfață)

Index: `idx_abonamente_membru`

```sql
SELECT * FROM abonamente WHERE membru_id = 1234
```

**Înainte (fără index):**

```
Seq Scan on abonamente  (cost=0.00..398.00 rows=4 width=26) (actual time=0.127..1.747 rows=4.00 loops=1)
  Filter: (membru_id = 1234)
  Rows Removed by Filter: 19996
  Buffers: shared hit=148
Planning Time: 0.095 ms
Execution Time: 1.765 ms
```

**După (cu index):**

```
Bitmap Heap Scan on abonamente  (cost=4.32..18.40 rows=4 width=26) (actual time=0.036..0.043 rows=4.00 loops=1)
  Recheck Cond: (membru_id = 1234)
  Heap Blocks: exact=4
  Buffers: shared hit=6
  ->  Bitmap Index Scan on idx_abonamente_membru  (cost=0.00..4.32 rows=4 width=0) (actual time=0.009..0.010 rows=4.00 loops=1)
        Index Cond: (membru_id = 1234)
        Index Searches: 1
        Buffers: shared hit=2
Planning Time: 0.116 ms
Execution Time: 0.065 ms
```

## Raportul „abonamente care expiră în 7 zile”

Index: `idx_abonamente_expirare`

```sql
SELECT * FROM abonamente WHERE status = 'activ' AND data_sfarsit BETWEEN current_date AND current_date + 7
```

**Înainte (fără index):**

```
Seq Scan on abonamente  (cost=0.00..648.00 rows=166 width=26) (actual time=0.031..3.728 rows=175.00 loops=1)
  Filter: ((status = 'activ'::text) AND (data_sfarsit >= CURRENT_DATE) AND (data_sfarsit <= (CURRENT_DATE + 7)))
  Rows Removed by Filter: 19825
  Buffers: shared hit=148
Planning Time: 0.128 ms
Execution Time: 3.874 ms
```

**După (cu index):**

```
Bitmap Heap Scan on abonamente  (cost=6.00..165.21 rows=166 width=26) (actual time=0.051..0.410 rows=175.00 loops=1)
  Recheck Cond: ((data_sfarsit >= CURRENT_DATE) AND (data_sfarsit <= (CURRENT_DATE + 7)) AND (status = 'activ'::text))
  Heap Blocks: exact=55
  Buffers: shared hit=57
  ->  Bitmap Index Scan on idx_abonamente_expirare  (cost=0.00..5.96 rows=166 width=0) (actual time=0.021..0.022 rows=175.00 loops=1)
        Index Cond: ((data_sfarsit >= CURRENT_DATE) AND (data_sfarsit <= (CURRENT_DATE + 7)))
        Index Searches: 1
        Buffers: shared hit=2
Planning Time: 0.175 ms
Execution Time: 0.571 ms
```

## Încasările unei zile (baza raportului de venituri)

Index: `idx_plati_platit_la`

```sql
SELECT count(*), sum(suma) FROM plati WHERE platit_la >= current_date - 30 AND platit_la < current_date - 29
```

**Înainte (fără index):**

```
Aggregate  (cost=631.64..631.65 rows=1 width=40) (actual time=3.318..3.320 rows=1.00 loops=1)
  Buffers: shared hit=144
  ->  Seq Scan on plati  (cost=0.00..631.50 rows=28 width=5) (actual time=0.045..3.265 rows=29.00 loops=1)
        Filter: ((platit_la >= (CURRENT_DATE - 30)) AND (platit_la < (CURRENT_DATE - 29)))
        Rows Removed by Filter: 19471
        Buffers: shared hit=144
Planning Time: 0.214 ms
Execution Time: 3.366 ms
```

**După (cu index):**

```
Aggregate  (cost=76.28..76.29 rows=1 width=40) (actual time=0.179..0.181 rows=1.00 loops=1)
  Buffers: shared hit=31
  ->  Bitmap Heap Scan on plati  (cost=4.58..76.14 rows=28 width=5) (actual time=0.112..0.152 rows=29.00 loops=1)
        Recheck Cond: ((platit_la >= (CURRENT_DATE - 30)) AND (platit_la < (CURRENT_DATE - 29)))
        Heap Blocks: exact=29
        Buffers: shared hit=31
        ->  Bitmap Index Scan on idx_plati_platit_la  (cost=0.00..4.58 rows=28 width=0) (actual time=0.025..0.025 rows=29.00 loops=1)
              Index Cond: ((platit_la >= (CURRENT_DATE - 30)) AND (platit_la < (CURRENT_DATE - 29)))
              Index Searches: 1
              Buffers: shared hit=2
Planning Time: 0.427 ms
Execution Time: 0.223 ms
```

## Plățile unui abonament

Index: `idx_plati_abonament`

```sql
SELECT * FROM plati WHERE abonament_id = 4321
```

**Înainte (fără index):**

```
Seq Scan on plati  (cost=0.00..387.75 rows=1 width=28) (actual time=0.407..1.880 rows=1.00 loops=1)
  Filter: (abonament_id = 4321)
  Rows Removed by Filter: 19499
  Buffers: shared hit=144
Planning Time: 0.156 ms
Execution Time: 1.906 ms
```

**După (cu index):**

```
Index Scan using idx_plati_abonament on plati  (cost=0.29..8.30 rows=1 width=28) (actual time=0.019..0.022 rows=1.00 loops=1)
  Index Cond: (abonament_id = 4321)
  Index Searches: 1
  Buffers: shared hit=3
Planning Time: 0.159 ms
Execution Time: 0.043 ms
```

## Programările unui membru

Index: `idx_programari_membru`

```sql
SELECT * FROM programari WHERE membru_id = 1234
```

**Înainte (fără index):**

```
Seq Scan on programari  (cost=0.00..143.00 rows=1 width=28) (actual time=0.226..0.662 rows=1.00 loops=1)
  Filter: (membru_id = 1234)
  Rows Removed by Filter: 7199
  Buffers: shared hit=53
Planning Time: 0.130 ms
Execution Time: 0.680 ms
```

**După (cu index):**

```
Index Scan using idx_programari_membru on programari  (cost=0.28..8.30 rows=1 width=28) (actual time=0.012..0.014 rows=1.00 loops=1)
  Index Cond: (membru_id = 1234)
  Index Searches: 1
  Buffers: shared hit=3
Planning Time: 0.170 ms
Execution Time: 0.029 ms
```
