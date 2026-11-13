# Planuri de execuție: înainte și după indecși

Generat automat de `npm run explain` la 2026-11-12, pe PostgreSQL (DATABASE_URL).
Număr de rânduri: abonamente = 20000, plati = 19500, programari = 7200.

| Index | Interogare | Înainte | După |
|---|---|---|---|
| `idx_abonamente_membru` | Abonamentele unui membru (lista filtrată din interfață) | Seq Scan, 1.527 ms | Index Scan, 0.037 ms |
| `idx_abonamente_expirare` | Raportul „abonamente care expiră în 7 zile” | Seq Scan, 3.232 ms | Bitmap Heap Scan, 0.144 ms |
| `idx_plati_platit_la` | Încasările unei zile (baza raportului de venituri) | Seq Scan, 3.242 ms | Bitmap Heap Scan, 0.106 ms |
| `idx_plati_abonament` | Plățile unui abonament | Seq Scan, 1.484 ms | Index Scan, 0.031 ms |
| `idx_programari_membru` | Programările unui membru | Index Scan, 0.260 ms | Index Scan, 0.028 ms |

## Abonamentele unui membru (lista filtrată din interfață)

Index: `idx_abonamente_membru`

```sql
SELECT * FROM abonamente WHERE membru_id = 1234
```

**Înainte (fără index):**

```
Seq Scan on abonamente  (cost=0.00..398.00 rows=4 width=26) (actual time=0.107..1.505 rows=4 loops=1)
  Filter: (membru_id = 1234)
  Rows Removed by Filter: 19996
  Buffers: shared hit=148
Planning Time: 0.062 ms
Execution Time: 1.527 ms
```

**După (cu index):**

```
Index Scan using idx_abonamente_membru on abonamente  (cost=0.29..5.65 rows=4 width=26) (actual time=0.009..0.014 rows=4 loops=1)
  Index Cond: (membru_id = 1234)
  Buffers: shared hit=6
Planning Time: 0.077 ms
Execution Time: 0.037 ms
```

## Raportul „abonamente care expiră în 7 zile”

Index: `idx_abonamente_expirare`

```sql
SELECT * FROM abonamente WHERE status = 'activ' AND data_sfarsit BETWEEN current_date AND current_date + 7
```

**Înainte (fără index):**

```
Seq Scan on abonamente  (cost=0.00..648.00 rows=166 width=26) (actual time=0.018..3.202 rows=175 loops=1)
  Filter: ((status = 'activ'::text) AND (data_sfarsit >= CURRENT_DATE) AND (data_sfarsit <= (CURRENT_DATE + 7)))
  Rows Removed by Filter: 19825
  Buffers: shared hit=148
Planning Time: 0.090 ms
Execution Time: 3.232 ms
```

**După (cu index):**

```
Bitmap Heap Scan on abonamente  (cost=3.10..115.85 rows=166 width=26) (actual time=0.028..0.114 rows=175 loops=1)
  Recheck Cond: ((data_sfarsit >= CURRENT_DATE) AND (data_sfarsit <= (CURRENT_DATE + 7)) AND (status = 'activ'::text))
  Heap Blocks: exact=55
  Buffers: shared hit=57
  ->  Bitmap Index Scan on idx_abonamente_expirare  (cost=0.00..3.06 rows=166 width=0) (actual time=0.016..0.016 rows=175 loops=1)
        Index Cond: ((data_sfarsit >= CURRENT_DATE) AND (data_sfarsit <= (CURRENT_DATE + 7)))
        Buffers: shared hit=2
Planning Time: 0.118 ms
Execution Time: 0.144 ms
```

## Încasările unei zile (baza raportului de venituri)

Index: `idx_plati_platit_la`

```sql
SELECT count(*), sum(suma) FROM plati WHERE platit_la >= current_date - 30 AND platit_la < current_date - 29
```

**Înainte (fără index):**

```
Aggregate  (cost=631.64..631.65 rows=1 width=40) (actual time=3.212..3.213 rows=1 loops=1)
  Buffers: shared hit=144
  ->  Seq Scan on plati  (cost=0.00..631.50 rows=28 width=5) (actual time=0.019..3.200 rows=29 loops=1)
        Filter: ((platit_la >= (CURRENT_DATE - 30)) AND (platit_la < (CURRENT_DATE - 29)))
        Rows Removed by Filter: 19471
        Buffers: shared hit=144
Planning Time: 0.093 ms
Execution Time: 3.242 ms
```

**După (cu index):**

```
Aggregate  (cost=30.02..30.03 rows=1 width=40) (actual time=0.074..0.075 rows=1 loops=1)
  Buffers: shared hit=31
  ->  Bitmap Heap Scan on plati  (cost=1.68..29.88 rows=28 width=5) (actual time=0.025..0.062 rows=29 loops=1)
        Recheck Cond: ((platit_la >= (CURRENT_DATE - 30)) AND (platit_la < (CURRENT_DATE - 29)))
        Heap Blocks: exact=29
        Buffers: shared hit=31
        ->  Bitmap Index Scan on idx_plati_platit_la  (cost=0.00..1.68 rows=28 width=0) (actual time=0.015..0.016 rows=29 loops=1)
              Index Cond: ((platit_la >= (CURRENT_DATE - 30)) AND (platit_la < (CURRENT_DATE - 29)))
              Buffers: shared hit=2
Planning Time: 0.114 ms
Execution Time: 0.106 ms
```

## Plățile unui abonament

Index: `idx_plati_abonament`

```sql
SELECT * FROM plati WHERE abonament_id = 4321
```

**Înainte (fără index):**

```
Seq Scan on plati  (cost=0.00..387.75 rows=1 width=28) (actual time=0.327..1.461 rows=1 loops=1)
  Filter: (abonament_id = 4321)
  Rows Removed by Filter: 19499
  Buffers: shared hit=144
Planning Time: 0.079 ms
Execution Time: 1.484 ms
```

**După (cu index):**

```
Index Scan using idx_plati_abonament on plati  (cost=0.29..2.51 rows=1 width=28) (actual time=0.010..0.011 rows=1 loops=1)
  Index Cond: (abonament_id = 4321)
  Buffers: shared hit=3
Planning Time: 0.072 ms
Execution Time: 0.031 ms
```

## Programările unui membru

Index: `idx_programari_membru`

```sql
SELECT * FROM programari WHERE membru_id = 1234
```

**Înainte (fără index):**

```
Index Scan using programari_unic on programari  (cost=0.28..87.29 rows=1 width=28) (actual time=0.212..0.239 rows=1 loops=1)
  Index Cond: (membru_id = 1234)
  Buffers: shared hit=29
Planning Time: 0.090 ms
Execution Time: 0.260 ms
```

**După (cu index):**

```
Index Scan using idx_programari_membru on programari  (cost=0.28..2.50 rows=1 width=28) (actual time=0.009..0.010 rows=1 loops=1)
  Index Cond: (membru_id = 1234)
  Buffers: shared hit=3
Planning Time: 0.077 ms
Execution Time: 0.028 ms
```
