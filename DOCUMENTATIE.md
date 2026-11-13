# Progres Fit – documentația proiectului

Aplicație web de gestiune pentru o sală de fitness fictivă, **Progres Fit**.
Proiect individual la disciplina *Baze de date avansate*.

## Cuprins

1. [Domeniul temei](#1-domeniul-temei)
2. [Tehnologii și pornire](#2-tehnologii-și-pornire)
3. [Modelul de date](#3-modelul-de-date)
4. [Fixtures](#4-fixtures)
5. [Operații CRUD și API](#5-operații-crud-și-api)
6. [Autentificare](#6-autentificare)
7. [Roluri](#7-roluri)
8. [Paginile interfeței](#8-paginile-interfeței)
9. [Indecși](#9-indecși)
10. [Load test](#10-load-test)
11. [Rapoarte](#11-rapoarte)
12. [Teste automate](#12-teste-automate)
13. [Limitări cunoscute](#13-limitări-cunoscute)

---

## 1. Domeniul temei

O sală de fitness are nevoie să țină evidența:

- **membrilor** înscriși și a datelor lor de contact;
- **abonamentelor** cumpărate de fiecare membru (ce tip, de când până când, în ce stare);
- **plăților** încasate pentru abonamente;
- **antrenorilor** și a **claselor** de grup pe care le țin (Yoga, CrossFit etc.);
- **programărilor** membrilor la clase;
- **angajaților** care folosesc aplicația și a drepturilor fiecăruia.

Aplicația este folosită de personalul sălii, nu de membri. Există trei tipuri de angajați:
administratorul, recepționerul și antrenorul (vezi [Roluri](#7-roluri)).

## 2. Tehnologii și pornire

| Componentă | Tehnologie |
|---|---|
| SGBD (unul singur, relațional) | **PostgreSQL**, găzduit în Supabase |
| Server / API | Node.js 24 + Express 5 |
| Acces la baza de date | driverul `pg`, SQL scris de mână (fără ORM) |
| Autentificare | implementare proprie: `scrypt` + sesiuni în tabelul `sesiuni` |
| Interfață | HTML, CSS și JavaScript simplu, fără framework |
| Rapoarte PDF | `pdfkit` |
| Load test | `autocannon` |
| Teste | `node:test` (inclus în Node) |

Din Supabase se folosește **doar baza de date PostgreSQL**. Nu se folosesc Supabase Auth și nici
API-ul REST generat automat: autentificarea și API-ul sunt scrise în `server.js`.

### Pornire

Este nevoie de **Node.js 24** sau mai nou.

```bash
npm install
```

Se copiază `.env.example` în `.env` și se completează `DATABASE_URL` cu connection string-ul din
Supabase (*Connect → Connection string → Session pooler*, format URI). Apoi:

```bash
npm start
```

Aplicația rulează pe <http://localhost:3000>. La prima pornire creează tabelele și introduce
datele de test.

Dacă `DATABASE_URL` lipsește, aplicația pornește cu un PostgreSQL încorporat (PGlite), cu datele
în folderul `data/`. Este același motor PostgreSQL și același SQL; e util pentru lucru fără internet.

### Conturi demo

| Rol | Email | Parolă |
|---|---|---|
| admin | `admin@progresfit.ro` | `ProgresFit2026!` |
| receptioner | `receptie@progresfit.ro` | `ProgresFit2026!` |
| antrenor | `antrenor@progresfit.ro` | `ProgresFit2026!` |

### Structura proiectului

| Fișier | Rol |
|---|---|
| `schema.sql` | tabelele, relațiile și constrângerile |
| `indexes.sql` | indecșii |
| `seed.sql` | datele de test (fixtures) |
| `db.js` | conexiunea la PostgreSQL |
| `server.js` | API-ul: autentificare, roluri, CRUD, rapoarte, pornire |
| `public/` | interfața web |
| `scripts/explain.js` | generează planurile de execuție înainte/după indecși |
| `scripts/loadtest.js` | rulează load testul |
| `test/api.test.js` | teste automate |
| `docs/` | rezultatele generate: planuri de execuție și load test |

## 3. Modelul de date

Nouă tabele (cerința minimă: șase), definite în [`schema.sql`](schema.sql).

```mermaid
erDiagram
    utilizatori ||--o{ sesiuni : "are"
    utilizatori |o--o| antrenori : "cont de acces"
    membri ||--o{ abonamente : "cumpără"
    tipuri_abonament ||--o{ abonamente : "definește"
    abonamente ||--o{ plati : "este plătit prin"
    antrenori ||--o{ clase : "ține"
    clase ||--o{ programari : "primește"
    membri ||--o{ programari : "face"

    utilizatori { int id PK
        text email UK
        text nume
        text rol
        text parola_hash
        timestamptz creat_la }
    sesiuni { int id PK
        text token_hash UK
        int utilizator_id FK
        timestamptz creat_la
        timestamptz expira_la }
    membri { int id PK
        text nume
        text prenume
        text email UK
        text telefon
        date data_nasterii
        date data_inscrierii }
    antrenori { int id PK
        int utilizator_id FK
        text nume
        text prenume
        text specializare
        text telefon }
    tipuri_abonament { int id PK
        text denumire UK
        int durata_zile
        numeric pret }
    abonamente { int id PK
        int membru_id FK
        int tip_id FK
        date data_start
        date data_sfarsit
        text status }
    clase { int id PK
        text denumire
        int antrenor_id FK
        timestamptz incepe_la
        int durata_min
        int capacitate }
    programari { int id PK
        int clasa_id FK
        int membru_id FK
        text status
        timestamptz creat_la }
    plati { int id PK
        int abonament_id FK
        numeric suma
        text metoda
        timestamptz platit_la }
```

### Tabele

| Tabel | Ce reține |
|---|---|
| `utilizatori` | angajații care se pot autentifica, cu rolul și hash-ul parolei |
| `sesiuni` | sesiunile de autentificare active |
| `membri` | clienții sălii |
| `antrenori` | antrenorii; opțional legați de un cont din `utilizatori` |
| `tipuri_abonament` | oferta sălii: denumire, durată, preț |
| `abonamente` | abonamentul unui membru, pe o perioadă |
| `clase` | o clasă de grup programată la o dată și oră |
| `programari` | înscrierea unui membru la o clasă |
| `plati` | o încasare pentru un abonament |

### Relații și comportament la ștergere

| Cheie străină | Tip relație | La ștergerea părintelui |
|---|---|---|
| `sesiuni.utilizator_id → utilizatori` | N:1 | `CASCADE`: sesiunile dispar odată cu utilizatorul |
| `antrenori.utilizator_id → utilizatori` | 1:1 opțional (`UNIQUE`) | `SET NULL`: antrenorul rămâne, fără cont |
| `abonamente.membru_id → membri` | N:1 | `RESTRICT`: nu se șterge un membru cu abonamente |
| `abonamente.tip_id → tipuri_abonament` | N:1 | `RESTRICT` |
| `plati.abonament_id → abonamente` | N:1 | `RESTRICT`: istoricul financiar nu se pierde |
| `clase.antrenor_id → antrenori` | N:1 | `RESTRICT` |
| `programari.clasa_id → clase` | N:1 | `CASCADE` |
| `programari.membru_id → membri` | N:1 | `CASCADE` |

`programari` realizează relația N:M dintre `membri` și `clase`.

### Constrângeri

- **Chei primare**: `id` generat automat (`GENERATED ALWAYS AS IDENTITY`) în toate tabelele.
- **`NOT NULL`** pe toate câmpurile obligatorii.
- **`UNIQUE`**: emailul utilizatorilor și al membrilor, denumirea tipului de abonament,
  `token_hash`, perechea `(clasa_id, membru_id)` (un membru nu se poate programa de două ori la aceeași clasă).
- **`CHECK` pe valori permise**: `rol`, `status` (abonamente și programări), `metoda` de plată.
- **`CHECK` pe intervale**: `pret >= 0`, `suma > 0`, `durata_zile > 0`, `capacitate > 0`,
  `durata_min` între 15 și 240, `data_nasterii` în trecut.
- **`CHECK` între coloane**: `data_sfarsit >= data_start`.
- **`CHECK` pe format**: emailul conține `@` și este scris cu litere mici (unicitatea nu poate fi ocolită prin majuscule).
- **`DEFAULT`**: data înscrierii, data plății, statusul.

### Trigger: capacitatea clasei

O regulă care nu se poate scrie ca `CHECK`, pentru că depinde de alte rânduri: o clasă nu poate
avea mai multe programări decât locuri. Funcția `verifica_capacitate()` rulează
`BEFORE INSERT OR UPDATE` pe `programari`:

1. programările cu status `anulat` trec fără verificare (nu ocupă loc);
2. blochează rândul clasei cu `SELECT ... FOR UPDATE`, ca două programări simultane să nu ia
   amândouă ultimul loc;
3. numără programările neanulate ale clasei, fără cea curentă;
4. dacă nu mai sunt locuri, oprește operația cu `RAISE EXCEPTION`, iar utilizatorul vede
   mesajul „Clasa este plină".

Triggerul rulează și la `UPDATE`, deci o programare anulată nu poate fi reactivată dacă între
timp locul s-a ocupat.

Validarea datelor este făcută de aceste constrângeri. Serverul traduce erorile PostgreSQL în
răspunsuri HTTP: `23505` (unicitate) și `23503`/`23001` (cheie străină) devin `409`, iar
`23514` (CHECK), `23502` (NOT NULL) și clasa `22` (format invalid) devin `400`, iar `P0001`
(excepția din trigger) devine `409`.

Pe toate tabelele este activat **Row Level Security** fără nicio politică. Astfel API-ul REST
public pe care Supabase îl generează automat nu poate citi nimic; aplicația se conectează ca
proprietar al tabelelor și nu este afectată.

## 4. Fixtures

Datele de test se introduc **automat la pornirea serviciului**, în funcția `init()` din
`server.js`, dacă tabelul `utilizatori` este gol:

1. se rulează `schema.sql` și `indexes.sql` (idempotente, cu `IF NOT EXISTS`);
2. se inserează cele trei conturi demo, cu parola hash-uită în aplicație;
3. se rulează [`seed.sql`](seed.sql), care generează restul datelor cu `generate_series`.

| Tabel | Rânduri |
|---|---|
| `utilizatori` | 3 |
| `tipuri_abonament` | 5 |
| `antrenori` | 6 |
| `membri` | 5 000 |
| `abonamente` | 20 000 |
| `plati` | 19 500 |
| `clase` | 600 |
| `programari` | 7 200 |

Volumul este ales intenționat mare, ca indecșii și load testul să fie relevanți. Datele sunt
relative la data curentă (clase de acum 120 de zile până peste 30 de zile), deci rapoartele au
conținut oricând este pornită aplicația.

## 5. Operații CRUD și API

Toate entitățile au creare, citire, actualizare și ștergere, prin aceleași patru rute generice.
Fiecare tabel este descris o singură dată în obiectul `entitati` din `server.js` (coloane,
chei străine, drepturi), iar rutele și formularele din interfață rezultă din acea descriere.

| Operație | Rută | Răspuns |
|---|---|---|
| Citire (listă) | `GET /api/:entitate` | `200` + listă JSON |
| Creare | `POST /api/:entitate` | `201` + `{ id }` |
| Actualizare | `PUT /api/:entitate/:id` | `200` + `{ id }` |
| Ștergere | `DELETE /api/:entitate/:id` | `204` |

`:entitate` este unul dintre: `membri`, `abonamente`, `plati`, `clase`, `programari`,
`antrenori`, `tipuri_abonament`, `utilizatori`, `sesiuni`.

Parametri pentru listă:

- `limit` (implicit 50, maximum 200) și `offset` pentru paginare;
- `q` pentru căutare în eticheta înregistrării (de exemplu numele membrului);
- orice coloană a tabelului, pentru filtrare exactă: `GET /api/abonamente?membru_id=1234`.

Pentru fiecare cheie străină, lista întoarce și eticheta înregistrării referite
(`membru_id_eticheta: "Popescu Ana"`), ca interfața să nu afișeze doar numere.

Cazuri speciale:

- **`utilizatori`**: câmpul `parola` trimis de client este transformat în `parola_hash`.
  Hash-ul nu este returnat de nicio rută.
- **`sesiuni`**: crearea se face doar prin autentificare (`POST /api/sesiuni` răspunde `405`).
  Adminul le poate lista, le poate modifica data de expirare și le poate șterge (revocare).

Alte rute: `POST /api/login`, `POST /api/logout`, `GET /api/me`, `GET /api/azi` (cifrele și
clasele pentru pagina de start), `GET /api/rapoarte/:nume`.

Protecție împotriva SQL injection: valorile ajung în interogări doar ca parametri (`$1`, `$2`…),
iar numele de tabele și coloane provin exclusiv din descrierea de pe server, niciodată din cerere.

## 6. Autentificare

Implementare explicită, în `server.js`, fără biblioteci de autentificare.

### Stocarea parolelor

- Parola este trecută prin **scrypt** (`node:crypto`), o funcție de derivare lentă și costisitoare
  ca memorie, gândită să îngreuneze atacurile prin forță brută.
- Pentru fiecare parolă se generează un **salt aleator de 16 octeți**, deci două parole identice
  au hash-uri diferite.
- În coloana `parola_hash` se stochează `salt:hash` în hexazecimal. Parola în clar nu se
  stochează și nu se scrie în loguri.
- La verificare, comparația se face cu `timingSafeEqual`, în timp constant.
- Parola are minimum 8 caractere.

### Sesiuni

1. La `POST /api/login` cu email și parolă corecte, serverul generează un **token aleator de 256 de biți**.
2. În tabelul `sesiuni` se salvează doar **SHA-256 al tokenului**, împreună cu utilizatorul și
   data expirării (8 ore). Cine ar citi tabelul nu poate reconstitui tokenurile.
3. Tokenul ajunge la browser într-un cookie `sid` cu atributele:
   - `HttpOnly`: JavaScript-ul din pagină nu îl poate citi (protecție la XSS);
   - `SameSite=Strict`: nu este trimis la cereri pornite de pe alte site-uri (protecție la CSRF);
   - `Secure` atunci când conexiunea este HTTPS.
4. La fiecare cerere către `/api`, serverul caută hash-ul tokenului în `sesiuni`, verifică
   `expira_la > now()` și încarcă utilizatorul și rolul lui.
5. `POST /api/logout` șterge sesiunea din baza de date, deci tokenul devine inutilizabil imediat.

Alte măsuri:

- mesajul de eroare este același pentru email inexistent și pentru parolă greșită;
- schimbarea parolei unui utilizator îi șterge celelalte sesiuni;
- ștergerea unui utilizator îi șterge sesiunile (`ON DELETE CASCADE`);
- sesiunile expirate sunt curățate la fiecare autentificare;
- după 10 parole greșite la rând pe același cont, de la aceeași adresă IP, autentificarea este
  blocată 15 minute (răspuns `429`). Contorul este ținut în memoria serverului.

## 7. Roluri

Trei roluri, reținute în `utilizatori.rol` și verificate pe server la fiecare cerere
(funcția `entitate()`). O cerere fără drept primește `403`. Interfața ascunde ce nu este
permis, dar decizia se ia întotdeauna pe server.

| Entitate | admin | receptioner | antrenor |
|---|---|---|---|
| Membri | citire + scriere | citire + scriere | citire |
| Abonamente | citire + scriere | citire + scriere | fără acces |
| Plăți | citire + scriere | citire + scriere | fără acces |
| Clase | citire + scriere | citire | citire + scriere doar la clasele proprii |
| Programări | citire + scriere | citire + scriere | citire + scriere |
| Antrenori | citire + scriere | citire | citire |
| Tipuri de abonament | citire + scriere | citire | citire |
| Utilizatori | citire + scriere | fără acces | fără acces |
| Sesiuni | citire + scriere | fără acces | fără acces |
| Raport venituri | da | nu | nu |
| Raport expirări | da | da | nu |
| Raport ocupare clase | da | da | da |

Pe scurt: **adminul** configurează sala și vede banii, **recepționerul** lucrează cu membrii,
abonamentele și încasările, iar **antrenorul** își gestionează clasele și prezența, fără acces
la date financiare.

Antrenorul poate modifica și șterge doar clasele la care este el antrenor (legătura se face prin
`antrenori.utilizator_id`). O clasă creată de el îi este atribuită automat, indiferent ce antrenor
trimite în cerere. Pentru clasa altcuiva primește `403`.

## 8. Paginile interfeței

Interfața este o singură pagină (`public/index.html`) care își schimbă conținutul. Meniul
afișează doar secțiunile permise rolului autentificat. Culorile sunt cele ale discurilor de
haltere (albastru, galben, roșu, verde), pe un fond gri-ardezie.

### Autentificare

Formular cu email și parolă. La date greșite afișează mesajul de eroare sub câmpuri. Apare
automat și atunci când sesiunea a expirat.

### Meniul din stânga

Prezent pe toate paginile după autentificare. Conține pagina **Azi**, secțiunile grupate în
„Zi de zi" și „Administrare", **Rapoarte**, iar jos numele și rolul utilizatorului cu butonul
**Ieși din cont**. Secțiunea curentă este marcată cu o bară galbenă. Pe telefon meniul trece
în partea de sus și se derulează pe orizontală.

### Azi (pagina de start)

Prima pagină după autentificare:

- un rând de cifre: membri înscriși, abonamente active, abonamente care expiră în 7 zile și
  încasările lunii curente. Fiecare duce la secțiunea corespunzătoare. Antrenorul vede doar
  numărul de membri;
- **clasele de azi**, în ordinea orei: ora, denumirea, antrenorul și gradul de ocupare, desenat
  ca un șir de pătrățele, câte unul pentru fiecare loc (albastru = rezervat, roșu = clasă plină).
  Clasele care au trecut sunt estompate, iar la antrenor clasele lui sunt marcate cu „(tu)".

### Paginile de listă (câte una pentru fiecare entitate)

Toate au aceeași structură:

- titlul secțiunii și un câmp de **căutare**, care filtrează pe măsură ce scrii;
- butonul **Adaugă** (doar dacă rolul are drept de scriere);
- tabelul cu înregistrările, câte 50 pe pagină, cele mai noi primele;
- pentru fiecare rând, butoanele **Editează** și **Șterge** (doar cu drept de scriere);
- butoanele **Pagina anterioară** și **Pagina următoare**.

Datele sunt afișate ca `zz.ll.aaaa`, sumele în lei, iar statusurile cu un punct colorat lângă
cuvânt. La clase, antrenorul vede butoanele de editare și ștergere doar pe rândurile lui.

Ștergerea cere confirmare. După o salvare sau o ștergere apare jos un mesaj scurt („Salvat.",
„Șters."). Dacă baza de date refuză ștergerea (de exemplu un membru care are abonamente),
mesajul apare în același loc, iar înregistrarea rămâne în listă.

| Pagină | Ce afișează | Căutare după |
|---|---|---|
| Membri | nume, prenume, email, telefon, data nașterii, data înscrierii | nume și prenume |
| Abonamente | membrul, tipul, perioada, statusul | numele membrului |
| Plăți | abonamentul, suma, metoda, data plății | sumă |
| Clase | denumirea, antrenorul, data și ora, durata, capacitatea | denumire și dată |
| Programări | clasa, membrul, statusul | număr |
| Antrenori | nume, prenume, specializare, telefon, contul asociat | nume și prenume |
| Tipuri de abonament | denumire, durata în zile, preț | denumire |
| Utilizatori | nume, email, rol | nume și email |
| Sesiuni | utilizatorul, data creării, data expirării | număr |

### Fereastra de adăugare / editare

Se deschide peste listă, cu câte un câmp pentru fiecare coloană:

- câmpurile de dată au selector de calendar;
- coloanele cu valori fixe (status, rol, metodă de plată) sunt liste derulante;
- cheile străine sunt câmpuri cu **căutare**: se scrie o parte din nume și se alege din
  sugestii (de exemplu membrul unui abonament);
- câmpurile care pot rămâne goale sunt marcate „(opțional)" și primesc valoarea implicită din baza de date;
- la utilizatori, parola este obligatorie la creare și opțională la editare.

Erorile de validare venite din baza de date apar în fereastră, fără a pierde datele completate.

### Rapoarte

Lista rapoartelor disponibile rolului curent, fiecare cu butonul **Deschide PDF**. Raportul se
generează în acel moment și se deschide într-o filă nouă, de unde poate fi salvat sau tipărit.
Nu se păstrează ca fișier pe server.

## 9. Indecși

PostgreSQL creează automat indecși doar pentru chei primare și constrângeri `UNIQUE`, **nu și
pentru chei străine**. Indecșii din [`indexes.sql`](indexes.sql) acoperă interogările pe care
aplicația le face efectiv:

| Index | Interogarea deservită | Înainte | După |
|---|---|---|---|
| `idx_abonamente_membru` pe `abonamente(membru_id)` | abonamentele unui membru | Seq Scan, 1.527 ms | Index Scan, 0.037 ms |
| `idx_abonamente_expirare` pe `abonamente(data_sfarsit) WHERE status = 'activ'` | raportul de expirări | Seq Scan, 3.232 ms | Bitmap Heap Scan, 0.144 ms |
| `idx_plati_platit_la` pe `plati(platit_la)` | încasările dintr-o perioadă | Seq Scan, 3.242 ms | Bitmap Heap Scan, 0.106 ms |
| `idx_plati_abonament` pe `plati(abonament_id)` | plățile unui abonament | Seq Scan, 1.484 ms | Index Scan, 0.031 ms |
| `idx_programari_membru` pe `programari(membru_id)` | programările unui membru | Index Scan pe `programari_unic`, 0.260 ms | Index Scan, 0.028 ms |

Măsurătorile sunt făcute pe baza din Supabase (PostgreSQL 17). Timpii sunt cei de execuție
raportați de server, deci nu includ rețeaua.

Planurile complete (`EXPLAIN (ANALYZE, BUFFERS)`), înainte și după, sunt în
[`docs/planuri-executie.md`](docs/planuri-executie.md). Se regenerează cu:

```bash
npm run explain
```

Scriptul șterge indecșii, măsoară, îi recreează și măsoară din nou.

Exemplu, pentru abonamentele unui membru. Fără index, PostgreSQL citește toate cele 20 000 de
rânduri (148 de pagini) și aruncă 19 996 dintre ele:

```
Seq Scan on abonamente  (cost=0.00..398.00 rows=4 width=26) (actual time=0.107..1.505 rows=4 loops=1)
  Filter: (membru_id = 1234)
  Rows Removed by Filter: 19996
  Buffers: shared hit=148
Execution Time: 1.527 ms
```

Cu index, citește doar 6 pagini, iar costul estimat scade de la 398 la 5,65:

```
Index Scan using idx_abonamente_membru on abonamente  (cost=0.29..5.65 rows=4 width=26) (actual time=0.009..0.014 rows=4 loops=1)
  Index Cond: (membru_id = 1234)
  Buffers: shared hit=6
Execution Time: 0.037 ms
```

Observații:

- La `programari`, și fără indexul nostru planificatorul evită scanarea secvențială: parcurge
  în întregime indexul constrângerii `UNIQUE (clasa_id, membru_id)`, unde `membru_id` este a
  doua coloană (29 de pagini citite). Indexul dedicat reduce citirea la 3 pagini și costul
  estimat de la 87 la 2,5.

- `idx_abonamente_expirare` este un **index parțial**: conține doar abonamentele active,
  singurele care interesează raportul, deci este mai mic decât un index pe toată coloana.
- Pe `programari(clasa_id)` nu există index separat, pentru că este prima coloană din
  constrângerea `UNIQUE (clasa_id, membru_id)`, al cărei index o acoperă deja.
- Pe `clase` nu s-a adăugat index: la 600 de rânduri tabelul încape în câteva pagini și
  planificatorul alege oricum scanarea secvențială.
- Căutarea după nume (`ILIKE '%text%'`) nu poate folosi un index B-tree și rămâne scanare
  secvențială. Efectul se vede în load test.

## 10. Load test

Testul rulează cu `autocannon` asupra serverului pornit:

```bash
npm run loadtest
```

Implicit sunt 50 de conexiuni simultane, 10 secunde per scenariu. Alte valori:
`npm run loadtest -- 100 20`. Rezultatele se scriu în [`docs/load-test.md`](docs/load-test.md).

Testul a fost rulat de două ori, cu același cod și aceleași date: 50 de conexiuni, 10 secunde
per scenariu. Serverul Node rulează pe calculatorul local în ambele cazuri.

### Pe Supabase (baza folosită de proiect)

Baza de date este în regiunea `eu-north-1` (Stockholm). O interogare simplă (`SELECT 1`) durează
în medie **52 ms** dus-întors de pe calculatorul de test.

| Scenariu | Cerere | Cereri/s | p50 (ms) | p97.5 (ms) | p99 (ms) | max (ms) | Erori |
|---|---|---|---|---|---|---|---|
| Listă paginată | `GET /api/membri?limit=50` | 86 | 551 | 795 | 874 | 906 | 0 |
| Căutare după nume (ILIKE) | `GET /api/membri?q=popescu&limit=50` | 81 | 588 | 785 | 851 | 902 | 0 |
| Filtru pe coloană indexată | `GET /api/abonamente?membru_id=1234` | 87 | 552 | 755 | 840 | 884 | 0 |
| Listă cu 2 etichete FK | `GET /api/abonamente?limit=50` | 85 | 554 | 791 | 852 | 905 | 0 |
| Scriere (UPDATE) | `PUT /api/membri/1` | 86 | 555 | 704 | 795 | 879 | 0 |

### Pe baza locală (PGlite), pentru comparație

| Scenariu | Cerere | Cereri/s | p50 (ms) | p97.5 (ms) | p99 (ms) | max (ms) | Erori |
|---|---|---|---|---|---|---|---|
| Listă paginată | `GET /api/membri?limit=50` | 489 | 97 | 145 | 185 | 194 | 0 |
| Căutare după nume (ILIKE) | `GET /api/membri?q=popescu&limit=50` | 167 | 292 | 384 | 388 | 430 | 0 |
| Filtru pe coloană indexată | `GET /api/abonamente?membru_id=1234` | 584 | 79 | 131 | 171 | 390 | 0 |
| Listă cu 2 etichete FK | `GET /api/abonamente?limit=50` | 321 | 150 | 199 | 209 | 269 | 0 |
| Scriere (UPDATE) | `PUT /api/membri/1` | 902 | 51 | 78 | 90 | 300 | 0 |

### Interpretare

- Nicio cerere nu a eșuat sub sarcină, în niciunul dintre teste.
- **Pe Supabase limita este rețeaua, nu baza de date.** Toate scenariile dau aproximativ același
  rezultat (81–87 cereri/s), indiferent cât de grea este interogarea. Explicația: fiecare cerere
  face două interogări (verificarea sesiunii și operația propriu-zisă), fiecare durează circa
  52 ms din cauza distanței, iar aplicația are un pool de 10 conexiuni. Rezultă un maxim teoretic
  de 10 / (2 × 0,052 s) ≈ 96 cereri/s, foarte aproape de ce s-a măsurat.
- Timpul de execuție din PostgreSQL este de sub 4 ms chiar și fără indecși (capitolul 9), deci
  este neglijabil față de cei 52 ms de rețea.
- Latența mare (p50 ≈ 550 ms) vine din așteptarea la coadă: 50 de clienți împart 10 conexiuni.
- **Pe baza locală, fără rețea, se văd diferențele dintre interogări**: filtrarea pe coloana
  indexată este cea mai rapidă citire, iar căutarea cu `ILIKE` este de aproximativ 3,5 ori mai
  lentă, pentru că scanează tot tabelul `membri`.
- Ce ar îmbunătăți rezultatul pe Supabase: rularea serverului în aceeași regiune cu baza de
  date, un pool mai mare, sau unirea verificării sesiunii cu operația într-o singură interogare.

## 11. Rapoarte

Rapoartele sunt generate la cerere, din datele curente, în format **PDF** (`pdfkit`), la
`GET /api/rapoarte/:nume`. Fiecare conține titlul, data generării, numele utilizatorului care
l-a cerut și un tabel cu datele.

| Raport | Conținut | Roluri |
|---|---|---|
| `venituri` | totalul încasărilor pe luni și pe tipuri de abonament, ultimele 12 luni (agregare cu `GROUP BY` peste `plati`, `abonamente`, `tipuri_abonament`) | admin |
| `expirari` | abonamentele active care expiră în următoarele 7 zile, cu telefonul membrului | admin, receptioner |
| `ocupare` | clasele din următoarele 7 zile, cu numărul de rezervări față de capacitate | toate |

## 12. Teste automate

```bash
npm test
```

Testele din `test/api.test.js` pornesc aplicația pe o bază PostgreSQL în memorie și verifică:

- respingerea cererilor fără sesiune și a parolelor greșite;
- existența datelor de test după pornire;
- CRUD complet pe membri și respectarea constrângerilor (unicitate, CHECK, NOT NULL, cheie străină);
- drepturile diferite ale celor trei roluri;
- triggerul de capacitate: clasa plină refuză programarea, anularea eliberează locul;
- că antrenorul poate modifica doar clasele lui;
- că pagina Azi nu trimite antrenorului date financiare;
- blocarea autentificării după 10 parole greșite;
- că hash-ul parolei nu apare în răspunsuri, că o parolă nouă funcționează și că sesiunea
  este invalidă după logout;
- că cele trei rapoarte sunt PDF-uri valide.

## 13. Limitări cunoscute

- **Diacritice în PDF**: fontul standard din PDF nu conține `ș`, `ț`, `ă`, deci rapoartele sunt
  scrise fără diacritice. Rezolvarea este includerea unui font TTF.
- **Limita de încercări la autentificare** este ținută în memorie: se resetează la repornirea
  serverului și nu ar funcționa cu mai multe servere în paralel.
- **Fonturile** interfeței se încarcă de la Google Fonts; fără internet se folosește fontul sistemului.
- **Certificatul TLS** al bazei de date nu este verificat (conexiunea este criptată, dar
  identitatea serverului nu este confirmată). Pentru producție se configurează certificatul CA din Supabase.
- **Căutarea după nume** nu folosește index (vezi capitolele 9 și 10).
