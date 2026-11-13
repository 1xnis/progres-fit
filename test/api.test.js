// Teste de integrare pe un PostgreSQL în memorie: autentificare, roluri, CRUD, constrângeri, PDF.
process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { app, init, PAROLA_DEMO } = await import('../server.js');
let server, baza;

before(async () => {
  await init();
  server = app.listen(0);
  baza = `http://localhost:${server.address().port}/api/`;
});
after(() => server.close());

async function login(email, parola = PAROLA_DEMO) {
  const r = await fetch(baza + 'login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, parola }),
  });
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

const cerere = (cookie) => async (url, method = 'GET', body) => {
  const r = await fetch(baza + url, {
    method, headers: { cookie, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
  });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() };
};

test('fără sesiune sau cu parolă greșită: 401', async () => {
  assert.equal((await fetch(baza + 'membri')).status, 401);
  assert.equal((await login('admin@progresfit.ro', 'gresita')).status, 401);
  assert.equal((await login('nimeni@progresfit.ro')).status, 401);
});

test('fixtures: datele de test există după pornire', async () => {
  const admin = cerere((await login('admin@progresfit.ro')).cookie);
  assert.equal((await admin('membri?limit=200')).body.length, 200);
  assert.equal((await admin('tipuri_abonament')).body.length, 5);
  const abon = (await admin('abonamente?membru_id=10')).body;
  assert.ok(abon.length > 0 && abon.every((a) => a.membru_id === 10 && a.membru_id_eticheta));
});

test('recepționer: CRUD complet pe membri + constrângeri', async () => {
  const rec = cerere((await login('receptie@progresfit.ro')).cookie);
  // campurile goale vin asa din formular si trebuie sa ia valoarea implicita
  const nou = { nume: 'Test', prenume: 'Membru', email: 'Test.Membru@Example.com', telefon: '', data_inscrierii: '' };
  const creat = await rec('membri', 'POST', nou);
  assert.equal(creat.status, 201);
  const { id } = creat.body;

  assert.equal((await rec('membri', 'POST', nou)).status, 409, 'email duplicat');
  assert.equal((await rec('membri', 'POST', { nume: 'X', prenume: 'Y', email: 'fara-arond' })).status, 400, 'CHECK email');
  assert.equal((await rec('membri', 'POST', { nume: 'X' })).status, 400, 'NOT NULL');
  assert.equal((await rec('membri', 'POST', { parola_hash: 'x', id: 1 })).status, 400, 'coloane nepermise');

  assert.equal((await rec(`membri/${id}`, 'PUT', { telefon: '0700123456' })).status, 200);
  const citit = (await rec(`membri?id=${id}`)).body[0];
  assert.equal(citit.telefon, '0700123456');
  assert.match(citit.data_inscrierii, /^\d{4}-\d\d-\d\d$/);
  assert.equal(citit.email, 'test.membru@example.com');

  // abonament cu perioadă inversată -> CHECK; membru cu abonament -> FK RESTRICT la ștergere
  const abon = { membru_id: id, tip_id: 1, data_start: '2026-01-10', data_sfarsit: '2026-01-01' };
  assert.equal((await rec('abonamente', 'POST', abon)).status, 400);
  const a = await rec('abonamente', 'POST', { ...abon, data_sfarsit: '2026-02-09' });
  assert.equal(a.status, 201);
  assert.equal((await rec(`membri/${id}`, 'DELETE')).status, 409);
  assert.equal((await rec(`abonamente/${a.body.id}`, 'DELETE')).status, 204);
  assert.equal((await rec(`membri/${id}`, 'DELETE')).status, 204);
  assert.equal((await rec(`membri/${id}`, 'DELETE')).status, 404);
});

test('rolurile au drepturi diferite', async () => {
  const rec = cerere((await login('receptie@progresfit.ro')).cookie);
  const ant = cerere((await login('antrenor@progresfit.ro')).cookie);
  assert.equal((await rec('utilizatori')).status, 403);
  assert.equal((await rec('tipuri_abonament', 'POST', { denumire: 'X', durata_zile: 1, pret: 1 })).status, 403);
  assert.equal((await rec('rapoarte/venituri')).status, 403);
  assert.equal((await ant('plati')).status, 403);
  assert.equal((await ant('membri', 'POST', { nume: 'A', prenume: 'B', email: 'a@b.ro' })).status, 403);
  assert.equal((await ant('membri')).status, 200);
  assert.equal((await ant('rapoarte/expirari')).status, 403);
  assert.deepEqual(Object.keys((await ant('me')).body.rapoarte), ['ocupare']);
});

test('admin: utilizatori fără hash în răspuns, parolă nouă funcțională, logout', async () => {
  const { cookie } = await login('admin@progresfit.ro');
  const admin = cerere(cookie);
  const lista = (await admin('utilizatori')).body;
  assert.ok(lista.length >= 3 && lista.every((u) => !('parola_hash' in u) && !('parola' in u)));

  assert.equal((await admin('utilizatori', 'POST', { nume: 'N', email: 'nou@progresfit.ro', rol: 'antrenor', parola: 'scurta' })).status, 400);
  const u = await admin('utilizatori', 'POST', { nume: 'N', email: 'nou@progresfit.ro', rol: 'antrenor', parola: 'o-parola-lunga' });
  assert.equal(u.status, 201);
  assert.equal((await login('nou@progresfit.ro', 'o-parola-lunga')).status, 200);
  assert.equal((await admin(`utilizatori/${u.body.id}`, 'DELETE')).status, 204);
  assert.equal((await login('nou@progresfit.ro', 'o-parola-lunga')).status, 401);

  assert.equal((await admin('sesiuni', 'POST', { utilizator_id: 1 })).status, 405);
  assert.equal((await admin('logout', 'POST')).status, 204);
  assert.equal((await admin('membri')).status, 401, 'sesiunea e invalidă după logout');
});

test('triggerul nu lasă mai multe programări decât locuri', async () => {
  const admin = cerere((await login('admin@progresfit.ro')).cookie);
  const clasa = (await admin('clase', 'POST', { denumire: 'Mica', antrenor_id: 2, incepe_la: '2027-01-10T10:00:00Z', capacitate: 1 })).body.id;
  const p1 = await admin('programari', 'POST', { clasa_id: clasa, membru_id: 1 });
  assert.equal(p1.status, 201);
  const plin = await admin('programari', 'POST', { clasa_id: clasa, membru_id: 2 });
  assert.equal(plin.status, 409);
  assert.match(plin.body.eroare, /plină/);
  // o programare anulata elibereaza locul
  assert.equal((await admin(`programari/${p1.body.id}`, 'PUT', { status: 'anulat' })).status, 200);
  const p2 = await admin('programari', 'POST', { clasa_id: clasa, membru_id: 2 });
  assert.equal(p2.status, 201);
  assert.equal((await admin(`programari/${p1.body.id}`, 'PUT', { status: 'confirmat' })).status, 409, 'nu se poate reactiva peste capacitate');
  assert.equal((await admin(`clase/${clasa}`, 'DELETE')).status, 204);
});

test('antrenorul modifică doar clasele lui', async () => {
  const ant = cerere((await login('antrenor@progresfit.ro')).cookie);
  // in fixtures clasa 1 e a antrenorului 1 (contul demo), clasa 2 e a altuia
  assert.equal((await ant('clase/1', 'PUT', { capacitate: 30 })).status, 200);
  assert.equal((await ant('clase/2', 'PUT', { capacitate: 30 })).status, 403);
  assert.equal((await ant('clase/2', 'DELETE')).status, 403);
  // chiar daca cere alt antrenor, clasa noua ramane pe el
  const noua = await ant('clase', 'POST', { denumire: 'Test', antrenor_id: 3, incepe_la: '2027-01-10T10:00:00Z', capacitate: 10 });
  assert.equal(noua.status, 201);
  assert.equal((await ant(`clase?id=${noua.body.id}`)).body[0].antrenor_id, 1);
  assert.equal((await ant(`clase/${noua.body.id}`, 'PUT', { antrenor_id: 3 })).status, 200);
  assert.equal((await ant(`clase?id=${noua.body.id}`)).body[0].antrenor_id, 1);
  assert.equal((await ant(`clase/${noua.body.id}`, 'DELETE')).status, 204);
});

test('pagina Azi: antrenorul nu vede banii', async () => {
  const admin = cerere((await login('admin@progresfit.ro')).cookie);
  const ant = cerere((await login('antrenor@progresfit.ro')).cookie);
  const a = (await admin('azi')).body;
  assert.equal(a.cifre.membri, 5000);
  assert.ok('incasari_luna' in a.cifre);
  assert.equal(a.clase.length, 4, 'fixtures pun 4 clase pe zi');
  const b = (await ant('azi')).body;
  assert.deepEqual(Object.keys(b.cifre), ['membri']);
  assert.equal((await ant('me')).body.antrenor_id, 1);
});

test('contul se blochează după 10 parole greșite', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await login('blocat@progresfit.ro', 'gresita')).status, 401);
  assert.equal((await login('blocat@progresfit.ro', 'gresita')).status, 429);
  // celelalte conturi nu sunt afectate
  assert.equal((await login('admin@progresfit.ro')).status, 200);
});

test('rapoartele sunt PDF-uri valide', async () => {
  const admin = cerere((await login('admin@progresfit.ro')).cookie);
  for (const r of ['venituri', 'expirari', 'ocupare']) {
    const { status, body } = await admin('rapoarte/' + r);
    assert.equal(status, 200);
    assert.equal(Buffer.from(body).subarray(0, 5).toString(), '%PDF-');
    assert.ok(body.byteLength > 2000, `${r} are conținut`);
  }
});
