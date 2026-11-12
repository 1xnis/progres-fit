// Load test al API-ului cu autocannon. Serverul trebuie să ruleze deja (`npm start`).
// Utilizare: npm run loadtest [-- conexiuni durata_secunde]
import autocannon from 'autocannon';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PAROLA_DEMO } from '../demo.js';

const baza = process.env.BAZA_URL ?? 'http://localhost:3000';
const conexiuni = Number(process.argv[2]) || 50;
const durata = Number(process.argv[3]) || 10;

const login = await fetch(baza + '/api/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@progresfit.ro', parola: PAROLA_DEMO }),
});
if (!login.ok) throw new Error('Autentificarea a eșuat: pornește serverul cu `npm start`');
const cookie = login.headers.get('set-cookie').split(';')[0];

const scenarii = [
  ['Listă paginată', 'GET', '/api/membri?limit=50'],
  ['Căutare după nume (ILIKE)', 'GET', '/api/membri?q=popescu&limit=50'],
  ['Filtru pe coloană indexată', 'GET', '/api/abonamente?membru_id=1234'],
  ['Listă cu 2 etichete FK', 'GET', '/api/abonamente?limit=50'],
  ['Scriere (UPDATE)', 'PUT', '/api/membri/1', JSON.stringify({ telefon: '0700000001' })],
];

const linii = [];
for (const [titlu, method, path, body] of scenarii) {
  const r = await autocannon({
    url: baza + path, method, body, connections: conexiuni, duration: durata,
    headers: { cookie, 'Content-Type': 'application/json' },
  });
  const erori = r.errors + r.timeouts + r.non2xx;
  linii.push(`| ${titlu} | \`${method} ${path}\` | ${r.requests.average.toFixed(0)} | ${r.latency.p50} | ${r.latency.p97_5} | ${r.latency.p99} | ${r.latency.max} | ${erori} |`);
  console.log(linii.at(-1));
}

const md = `# Rezultate load test

Generat de \`npm run loadtest\` la ${new Date().toISOString().slice(0, 10)}: ${conexiuni} conexiuni simultane, ${durata} secunde per scenariu,
toate cererile autentificate (fiecare cerere face și verificarea sesiunii în baza de date).

| Scenariu | Cerere | Cereri/s (medie) | p50 (ms) | p97.5 (ms) | p99 (ms) | max (ms) | Erori |
|---|---|---|---|---|---|---|---|
${linii.join('\n')}
`;
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/load-test.md', import.meta.url), md);
await fetch(baza + '/api/logout', { method: 'POST', headers: { cookie } });
