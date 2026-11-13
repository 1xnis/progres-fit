# Rezultate load test

Generat de `npm run loadtest` la 2026-11-12: 50 conexiuni simultane, 10 secunde per scenariu,
toate cererile autentificate (fiecare cerere face și verificarea sesiunii în baza de date).

| Scenariu | Cerere | Cereri/s (medie) | p50 (ms) | p97.5 (ms) | p99 (ms) | max (ms) | Erori |
|---|---|---|---|---|---|---|---|
| Listă paginată | `GET /api/membri?limit=50` | 86 | 551 | 795 | 874 | 906 | 0 |
| Căutare după nume (ILIKE) | `GET /api/membri?q=popescu&limit=50` | 81 | 588 | 785 | 851 | 902 | 0 |
| Filtru pe coloană indexată | `GET /api/abonamente?membru_id=1234` | 87 | 552 | 755 | 840 | 884 | 0 |
| Listă cu 2 etichete FK | `GET /api/abonamente?limit=50` | 85 | 554 | 791 | 852 | 905 | 0 |
| Scriere (UPDATE) | `PUT /api/membri/1` | 86 | 555 | 704 | 795 | 879 | 0 |
