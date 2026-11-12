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
  const nou = { nume: 'Test', prenume: 'Membru', email: 'Test.Membru@Example.com' };
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

test('rapoartele sunt PDF-uri valide', async () => {
  const admin = cerere((await login('admin@progresfit.ro')).cookie);
  for (const r of ['venituri', 'expirari', 'ocupare']) {
    const { status, body } = await admin('rapoarte/' + r);
    assert.equal(status, 200);
    assert.equal(Buffer.from(body).subarray(0, 5).toString(), '%PDF-');
    assert.ok(body.byteLength > 2000, `${r} are conținut`);
  }
});
