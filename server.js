import express from 'express';
import PDFDocument from 'pdfkit';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query, exec } from './db.js';
import { PAROLA_DEMO } from './demo.js';
export { PAROLA_DEMO };

const fisier = (nume) => readFileSync(new URL(nume, import.meta.url), 'utf8');
const eroare = (status, mesaj) => Object.assign(new Error(mesaj), { status });

// ---------- Parole și sesiuni ----------
// Parola: scrypt cu salt aleator de 16 octeți, stocată ca "salt:hash" (hex).
// Sesiunea: token aleator de 256 biți în cookie HttpOnly; în BD se ține doar SHA-256 al lui,
// deci cine citește tabela `sesiuni` nu poate fura sesiuni.

const scryptAsync = promisify(scrypt);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const ORE_SESIUNE = 8;

export async function hashParola(parola) {
  const salt = randomBytes(16);
  return salt.toString('hex') + ':' + (await scryptAsync(parola, salt, 64)).toString('hex');
}

async function verificaParola(parola, stocat) {
  const [salt, hash] = stocat.split(':');
  return timingSafeEqual(await scryptAsync(parola, Buffer.from(salt, 'hex'), 64), Buffer.from(hash, 'hex'));
}

// ---------- Roluri și entități ----------
// O singură descriere per tabel: din ea rezultă rutele CRUD, drepturile și formularele din interfață.

const TOTI = ['admin', 'receptioner', 'antrenor'];
const RECEPTIE = ['admin', 'receptioner'];
const ADMIN = ['admin'];

const persoana = (a) => `${a}.nume || ' ' || ${a}.prenume`;

export const entitati = {
  membri: {
    titlu: 'Membri', citire: TOTI, scriere: RECEPTIE, eticheta: persoana,
    coloane: {
      nume: { obligatoriu: true }, prenume: { obligatoriu: true }, email: { tip: 'email', obligatoriu: true },
      telefon: { tip: 'tel' }, data_nasterii: { tip: 'date' }, data_inscrierii: { tip: 'date' },
    },
  },
  abonamente: {
    titlu: 'Abonamente', citire: RECEPTIE, scriere: RECEPTIE,
    eticheta: (a) => `(SELECT ${persoana('m')} FROM membri m WHERE m.id = ${a}.membru_id) || ' #' || ${a}.id`,
    coloane: {
      membru_id: { fk: 'membri', obligatoriu: true }, tip_id: { fk: 'tipuri_abonament', obligatoriu: true },
      data_start: { tip: 'date', obligatoriu: true }, data_sfarsit: { tip: 'date', obligatoriu: true },
      status: { optiuni: ['activ', 'suspendat', 'anulat'] },
    },
  },
  plati: {
    titlu: 'Plăți', citire: RECEPTIE, scriere: RECEPTIE,
    eticheta: (a) => `${a}.suma || ' lei #' || ${a}.id`,
    coloane: {
      abonament_id: { fk: 'abonamente', obligatoriu: true }, suma: { tip: 'number', obligatoriu: true },
      metoda: { optiuni: ['card', 'numerar', 'transfer'] }, platit_la: { tip: 'datetime-local' },
    },
  },
  clase: {
    titlu: 'Clase', citire: TOTI, scriere: ['admin', 'antrenor'],
    eticheta: (a) => `${a}.denumire || ' ' || to_char(${a}.incepe_la AT TIME ZONE 'Europe/Bucharest', 'DD.MM.YYYY HH24:MI')`,
    coloane: {
      denumire: { obligatoriu: true }, antrenor_id: { fk: 'antrenori', obligatoriu: true },
      incepe_la: { tip: 'datetime-local', obligatoriu: true }, durata_min: { tip: 'number' },
      capacitate: { tip: 'number', obligatoriu: true },
    },
  },
  programari: {
    titlu: 'Programări', citire: TOTI, scriere: TOTI,
    eticheta: (a) => `'#' || ${a}.id`,
    coloane: {
      clasa_id: { fk: 'clase', obligatoriu: true }, membru_id: { fk: 'membri', obligatoriu: true },
      status: { optiuni: ['confirmat', 'prezent', 'anulat'] },
    },
  },
  antrenori: {
    titlu: 'Antrenori', citire: TOTI, scriere: ADMIN, eticheta: persoana,
    coloane: {
      nume: { obligatoriu: true }, prenume: { obligatoriu: true }, specializare: { obligatoriu: true },
      telefon: { tip: 'tel' }, utilizator_id: { fk: 'utilizatori' },
    },
  },
  tipuri_abonament: {
    titlu: 'Tipuri de abonament', citire: TOTI, scriere: ADMIN,
    eticheta: (a) => `${a}.denumire || ' (' || ${a}.pret || ' lei)'`,
    coloane: {
      denumire: { obligatoriu: true }, durata_zile: { tip: 'number', obligatoriu: true },
      pret: { tip: 'number', obligatoriu: true },
    },
  },
  utilizatori: {
    titlu: 'Utilizatori', citire: ADMIN, scriere: ADMIN,
    eticheta: (a) => `${a}.nume || ' <' || ${a}.email || '>'`,
    coloane: {
      nume: { obligatoriu: true }, email: { tip: 'email', obligatoriu: true },
      rol: { optiuni: TOTI, obligatoriu: true },
      // `parola` nu e coloană reală: se transformă în parola_hash și nu se returnează niciodată
      parola: { tip: 'password', virtual: true },
    },
  },
  sesiuni: {
    // se creează doar prin autentificare; adminul le poate vedea, prelungi/expira și revoca
    titlu: 'Sesiuni', citire: ADMIN, scriere: ADMIN, faraCreare: true,
    eticheta: (a) => `'#' || ${a}.id`,
    coloane: { utilizator_id: { fk: 'utilizatori' }, creat_la: { tip: 'datetime-local' }, expira_la: { tip: 'datetime-local' } },
  },
};

const coloaneReale = (e) => Object.keys(e.coloane).filter((c) => !e.coloane[c].virtual);

// ---------- Rapoarte (PDF) ----------

const rapoarte = {
  venituri: {
    titlu: 'Venituri pe luni și tipuri de abonament (ultimele 12 luni)', roluri: ADMIN,
    sql: `SELECT to_char(date_trunc('month', p.platit_la), 'YYYY-MM') AS "Luna", t.denumire AS "Tip abonament",
                 count(*)::int AS "Nr. plăți", sum(p.suma) AS "Total (lei)"
          FROM plati p JOIN abonamente a ON a.id = p.abonament_id JOIN tipuri_abonament t ON t.id = a.tip_id
          WHERE p.platit_la >= date_trunc('month', now()) - interval '11 months'
          GROUP BY 1, 2 ORDER BY 1, 2`,
  },
  expirari: {
    titlu: 'Abonamente active care expiră în următoarele 7 zile', roluri: RECEPTIE,
    sql: `SELECT ${persoana('m')} AS "Membru", m.telefon AS "Telefon", t.denumire AS "Abonament", a.data_sfarsit AS "Expiră la"
          FROM abonamente a JOIN membri m ON m.id = a.membru_id JOIN tipuri_abonament t ON t.id = a.tip_id
          WHERE a.status = 'activ' AND a.data_sfarsit BETWEEN current_date AND current_date + 7
          ORDER BY a.data_sfarsit, 1`,
  },
  ocupare: {
    titlu: 'Gradul de ocupare al claselor din următoarele 7 zile', roluri: TOTI,
    sql: `SELECT to_char(c.incepe_la AT TIME ZONE 'Europe/Bucharest', 'DD.MM.YYYY HH24:MI') AS "Data", c.denumire AS "Clasa",
                 ${persoana('an')} AS "Antrenor",
                 count(p.id) FILTER (WHERE p.status <> 'anulat')::int AS "Rezervări", c.capacitate AS "Capacitate"
          FROM clase c JOIN antrenori an ON an.id = c.antrenor_id LEFT JOIN programari p ON p.clasa_id = c.id
          WHERE c.incepe_la >= now() AND c.incepe_la < now() + interval '7 days'
          GROUP BY c.id, an.id ORDER BY c.incepe_la`,
  },
};

// shortcut: fontul Helvetica inclus în PDF nu are ș/ț/ă, deci diacriticele se elimină;
// pentru diacritice corecte se înregistrează un font TTF cu doc.registerFont.
const faraDiacritice = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '');

function trimitePdf(res, titlu, randuri, autor) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.type('application/pdf');
  doc.pipe(res);
  doc.fontSize(16).text('Progres Fit');
  doc.fontSize(12).text(faraDiacritice(titlu));
  doc.fontSize(8).fillColor('#555').text(faraDiacritice(
    `Generat la ${new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })} de ${autor} - ${randuri.length} randuri`));
  doc.moveDown().fillColor('#000').fontSize(9);
  if (randuri.length) {
    doc.table({ data: [Object.keys(randuri[0]), ...randuri.map(Object.values)].map((r) => r.map(faraDiacritice)) });
  } else {
    doc.text('Nu exista date pentru acest raport.');
  }
  doc.end();
}

// ---------- Aplicația ----------

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.static(fileURLToPath(new URL('public', import.meta.url))));

// dupa 10 parole gresite la rand pe acelasi cont (de la acelasi IP) blochez 15 minute
// e tinut in memorie, deci se reseteaza la repornirea serverului
const greseli = new Map();
const MAX_GRESELI = 10, BLOCAJ_MS = 15 * 60e3;

app.post('/api/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const parola = String(req.body?.parola ?? '');
  const cheie = req.ip + ' ' + email;
  const g = greseli.get(cheie);
  if (g && g.n >= MAX_GRESELI && Date.now() - g.ultima < BLOCAJ_MS) {
    throw eroare(429, 'Prea multe încercări greșite. Încearcă din nou peste 15 minute.');
  }
  const u = (await query('SELECT id, parola_hash FROM utilizatori WHERE email = $1', [email])).rows[0];
  // același mesaj pentru email inexistent și parolă greșită
  if (!u || !(await verificaParola(parola, u.parola_hash))) {
    greseli.set(cheie, { n: (g && Date.now() - g.ultima < BLOCAJ_MS ? g.n : 0) + 1, ultima: Date.now() });
    throw eroare(401, 'Email sau parolă incorectă');
  }
  greseli.delete(cheie);
  const token = randomBytes(32).toString('hex');
  await query('DELETE FROM sesiuni WHERE expira_la < now()');
  await query(`INSERT INTO sesiuni (token_hash, utilizator_id, expira_la) VALUES ($1, $2, now() + $3 * interval '1 hour')`,
    [sha256(token), u.id, ORE_SESIUNE]);
  // SameSite=Strict: cookie-ul nu pleacă la cereri venite de pe alte site-uri (protecție CSRF)
  res.cookie('sid', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: ORE_SESIUNE * 3600e3 });
  res.json({ ok: true });
});

async function autentificat(req, res, next) {
  const token = /(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
  req.u = token && (await query(
    `SELECT u.id, u.email, u.nume, u.rol, s.id AS sesiune_id
     FROM sesiuni s JOIN utilizatori u ON u.id = s.utilizator_id
     WHERE s.token_hash = $1 AND s.expira_la > now()`, [sha256(token)])).rows[0];
  if (!req.u) throw eroare(401, 'Neautentificat');
  next();
}
app.use('/api', autentificat);

app.post('/api/logout', async (req, res) => {
  await query('DELETE FROM sesiuni WHERE id = $1', [req.u.sesiune_id]);
  res.clearCookie('sid').status(204).end();
});

// Tot ce are nevoie interfața: cine sunt și ce am voie să văd/modific.
app.get('/api/me', async (req, res) => {
  const { rol } = req.u;
  const antrenor = rol === 'antrenor' &&
    (await query('SELECT id FROM antrenori WHERE utilizator_id = $1', [req.u.id])).rows[0];
  res.json({
    utilizator: req.u,
    antrenor_id: antrenor ? antrenor.id : null,
    entitati: Object.fromEntries(Object.entries(entitati).filter(([, e]) => e.citire.includes(rol)).map(([k, e]) =>
      [k, { titlu: e.titlu, coloane: e.coloane, scriere: e.scriere.includes(rol), faraCreare: !!e.faraCreare }])),
    rapoarte: Object.fromEntries(Object.entries(rapoarte).filter(([, r]) => r.roluri.includes(rol)).map(([k, r]) => [k, r.titlu])),
  });
});

// cifrele si clasele de pe pagina "Azi"; banii si abonamentele nu ajung la antrenor
app.get('/api/azi', async (req, res) => {
  const azi = `(now() AT TIME ZONE 'Europe/Bucharest')::date`;
  const cifre = (await query(`SELECT
      (SELECT count(*)::int FROM membri) AS membri,
      (SELECT count(*)::int FROM abonamente WHERE status = 'activ' AND data_sfarsit >= current_date) AS abonamente_active,
      (SELECT count(*)::int FROM abonamente WHERE status = 'activ' AND data_sfarsit BETWEEN current_date AND current_date + 7) AS expira,
      (SELECT coalesce(sum(suma), 0) FROM plati WHERE platit_la >= date_trunc('month', now())) AS incasari_luna`)).rows[0];
  if (!RECEPTIE.includes(req.u.rol)) {
    delete cifre.abonamente_active; delete cifre.expira; delete cifre.incasari_luna;
  }
  const clase = (await query(`SELECT c.id, c.denumire, c.incepe_la, c.capacitate, c.antrenor_id, ${persoana('an')} AS antrenor,
        count(p.id) FILTER (WHERE p.status <> 'anulat')::int AS rezervari
      FROM clase c JOIN antrenori an ON an.id = c.antrenor_id LEFT JOIN programari p ON p.clasa_id = c.id
      WHERE (c.incepe_la AT TIME ZONE 'Europe/Bucharest')::date = ${azi}
      GROUP BY c.id, an.id ORDER BY c.incepe_la`)).rows;
  res.json({ cifre, clase });
});

app.get('/api/rapoarte/:nume', async (req, res) => {
  const r = rapoarte[req.params.nume];
  if (!r) throw eroare(404, 'Raport necunoscut');
  if (!r.roluri.includes(req.u.rol)) throw eroare(403, `Acces interzis pentru rolul „${req.u.rol}”`);
  trimitePdf(res, r.titlu, (await query(r.sql)).rows, req.u.nume);
});

// ---------- CRUD generic ----------

function entitate(req, drept) {
  const e = Object.hasOwn(entitati, req.params.ent) && entitati[req.params.ent];
  if (!e) throw eroare(404, 'Entitate necunoscută');
  if (!e[drept].includes(req.u.rol)) throw eroare(403, `Acces interzis pentru rolul „${req.u.rol}”`);
  return e;
}

function idDin(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw eroare(404, 'Înregistrare inexistentă');
  return id;
}

// Păstrează din body doar coloanele declarate; restul validării o fac constrângerile din BD.
async function valori(e, body, laCreare) {
  const v = {};
  for (const [c, def] of Object.entries(e.coloane)) {
    if (!body || !Object.hasOwn(body, c)) continue;
    let x = body[c] === '' ? null : body[c];
    // la creare sar peste campurile goale, ca sa se puna DEFAULT-ul din tabel
    if (x == null && laCreare) continue;
    if (def.tip === 'email' && typeof x === 'string') x = x.trim().toLowerCase();
    if (c === 'parola') {
      if (x == null) continue;
      if (String(x).length < 8) throw eroare(400, 'Parola trebuie să aibă minimum 8 caractere');
      v.parola_hash = await hashParola(String(x));
    } else v[c] = x;
  }
  if (!Object.keys(v).length) throw eroare(400, 'Niciun câmp valid în cerere');
  return v;
}

// antrenorul umbla doar la clasele lui; pentru restul intoarce null si nu se schimba nimic
async function antrenorulMeu(req) {
  if (req.params.ent !== 'clase' || req.u.rol !== 'antrenor') return null;
  const a = (await query('SELECT id FROM antrenori WHERE utilizator_id = $1', [req.u.id])).rows[0];
  if (!a) throw eroare(403, 'Contul tău nu e legat de niciun antrenor');
  return a.id;
}

app.get('/api/:ent', async (req, res) => {
  const e = entitate(req, 'citire');
  const tabel = req.params.ent;
  const cols = coloaneReale(e);
  const select = ['t.id', ...cols.map((c) => `t.${c}`), `${e.eticheta('t')} AS eticheta`,
    ...cols.filter((c) => e.coloane[c].fk).map((c) =>
      `(SELECT ${entitati[e.coloane[c].fk].eticheta('r')} FROM ${e.coloane[c].fk} r WHERE r.id = t.${c}) AS ${c}_eticheta`)];
  const unde = [], p = [];
  if (req.query.q) { p.push(`%${req.query.q}%`); unde.push(`${e.eticheta('t')} ILIKE $${p.length}`); }
  for (const c of ['id', ...cols]) {
    if (typeof req.query[c] === 'string') { p.push(req.query[c]); unde.push(`t.${c} = $${p.length}`); }
  }
  p.push(Math.min(Number(req.query.limit) || 50, 200), Math.max(Number(req.query.offset) || 0, 0));
  const { rows } = await query(
    `SELECT ${select.join(', ')} FROM ${tabel} t ${unde.length ? 'WHERE ' + unde.join(' AND ') : ''}
     ORDER BY t.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p);
  res.json(rows);
});

app.post('/api/:ent', async (req, res) => {
  const e = entitate(req, 'scriere');
  if (e.faraCreare) throw eroare(405, 'Sesiunile se creează doar prin autentificare');
  const v = await valori(e, req.body, true);
  const meu = await antrenorulMeu(req);
  if (meu) v.antrenor_id = meu;
  const k = Object.keys(v);
  const { rows } = await query(
    `INSERT INTO ${req.params.ent} (${k.join(', ')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`,
    Object.values(v));
  res.status(201).json(rows[0]);
});

app.put('/api/:ent/:id', async (req, res) => {
  const e = entitate(req, 'scriere');
  const id = idDin(req);
  const v = await valori(e, req.body);
  const meu = await antrenorulMeu(req);
  if (meu) v.antrenor_id = meu; // sa nu-si poata muta clasa pe alt antrenor
  const k = Object.keys(v);
  const { rows } = await query(
    `UPDATE ${req.params.ent} SET ${k.map((c, i) => `${c} = $${i + 1}`).join(', ')}
     WHERE id = $${k.length + 1} ${meu ? 'AND antrenor_id = ' + meu : ''} RETURNING id`,
    [...Object.values(v), id]);
  if (!rows.length) throw meu ? eroare(403, 'Poți modifica doar clasele tale') : eroare(404, 'Înregistrare inexistentă');
  // o parolă schimbată invalidează sesiunile vechi ale acelui utilizator
  if (v.parola_hash) await query('DELETE FROM sesiuni WHERE utilizator_id = $1 AND id <> $2', [id, req.u.sesiune_id]);
  res.json(rows[0]);
});

app.delete('/api/:ent/:id', async (req, res) => {
  entitate(req, 'scriere');
  const id = idDin(req);
  if (req.params.ent === 'utilizatori' && id === req.u.id) throw eroare(400, 'Nu îți poți șterge propriul cont');
  const meu = await antrenorulMeu(req);
  const { rows } = await query(
    `DELETE FROM ${req.params.ent} WHERE id = $1 ${meu ? 'AND antrenor_id = ' + meu : ''} RETURNING id`, [id]);
  if (!rows.length) throw meu ? eroare(403, 'Poți șterge doar clasele tale') : eroare(404, 'Înregistrare inexistentă');
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ eroare: 'Rută inexistentă' }));

// Erorile de constrângere din PostgreSQL devin răspunsuri 4xx cu mesaj pe înțelesul utilizatorului.
const eroriPg = {
  23505: [409, 'Există deja o înregistrare cu aceste valori'],
  23503: [409, 'Operație blocată de o legătură cu alte înregistrări (cheie străină)'],
  23001: [409, 'Nu se poate șterge: există înregistrări care depind de aceasta'],
  23514: [400, 'Valoare respinsă de o regulă de validare'],
  23502: [400, 'Lipsește un câmp obligatoriu'],
};
app.use((err, req, res, next) => {
  // P0001 = RAISE EXCEPTION din trigger (clasa plina), mesajul e deja scris pentru utilizator
  if (err.code === 'P0001') return res.status(409).json({ eroare: err.message });
  const [status, mesaj] = eroriPg[err.code] ?? (String(err.code).startsWith('22') ? [400, 'Valoare cu format invalid'] : []);
  if (status) return res.status(status).json({ eroare: `${mesaj} (${err.constraint ?? err.column ?? err.code})` });
  if (err.status) return res.status(err.status).json({ eroare: err.status < 500 && err.type ? 'Cerere invalidă' : err.message });
  console.error(err);
  res.status(500).json({ eroare: 'Eroare internă' });
});

// ---------- Pornire: schemă + fixtures ----------

// Conturi demo, doar pentru date de test. Parola comună este în DOCUMENTATIE.md.
const CONTURI_DEMO = [
  ['admin@progresfit.ro', 'Ana Administrator', 'admin'],
  ['receptie@progresfit.ro', 'Radu Recepție', 'receptioner'],
  ['antrenor@progresfit.ro', 'Andrei Ionescu', 'antrenor'],
];

export async function init() {
  await exec(fisier('schema.sql'));
  await exec(fisier('indexes.sql'));
  if ((await query('SELECT count(*)::int AS n FROM utilizatori')).rows[0].n) return;
  console.log('Bază de date goală: introduc datele de test...');
  for (const [email, nume, rol] of CONTURI_DEMO) {
    await query('INSERT INTO utilizatori (email, nume, rol, parola_hash) VALUES ($1, $2, $3, $4)',
      [email, nume, rol, await hashParola(PAROLA_DEMO)]);
  }
  await exec(fisier('seed.sql'));
}

if (import.meta.main) {
  await init();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Progres Fit rulează pe http://localhost:${port}`));
}
