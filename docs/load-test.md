# Rezultate load test

Generat de `npm run loadtest` la 2026-11-12: 50 conexiuni simultane, 10 secunde per scenariu,
toate cererile autentificate (fiecare cerere face și verificarea sesiunii în baza de date).

| Scenariu | Cerere | Cereri/s (medie) | p50 (ms) | p97.5 (ms) | p99 (ms) | max (ms) | Erori |
|---|---|---|---|---|---|---|---|
| Listă paginată | `GET /api/membri?limit=50` | 489 | 97 | 145 | 185 | 194 | 0 |
| Căutare după nume (ILIKE) | `GET /api/membri?q=popescu&limit=50` | 167 | 292 | 384 | 388 | 430 | 0 |
| Filtru pe coloană indexată | `GET /api/abonamente?membru_id=1234` | 584 | 79 | 131 | 171 | 390 | 0 |
| Listă cu 2 etichete FK | `GET /api/abonamente?limit=50` | 321 | 150 | 199 | 209 | 269 | 0 |
| Scriere (UPDATE) | `PUT /api/membri/1` | 902 | 51 | 78 | 90 | 300 | 0 |
