// Justificarea indecșilor: rulează EXPLAIN ANALYZE pe interogările reale ale aplicației,
// întâi fără indecși, apoi cu ei, și scrie rezultatul în docs/planuri-executie.md.
// Se rulează cu serverul oprit dacă se folosește baza locală (PGlite acceptă un singur proces).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { query, exec, close } from '../db.js';
import { init } from '../server.js';

await init();

const interogari = [
  ['idx_abonamente_membru', 'Abonamentele unui membru (lista filtrată din interfață)',
    'SELECT * FROM abonamente WHERE membru_id = 1234'],
  ['idx_abonamente_expirare', 'Raportul „abonamente care expiră în 7 zile”',
    `SELECT * FROM abonamente WHERE status = 'activ' AND data_sfarsit BETWEEN current_date AND current_date + 7`],
  ['idx_plati_platit_la', 'Încasările unei zile (baza raportului de venituri)',
    `SELECT count(*), sum(suma) FROM plati WHERE platit_la >= current_date - 30 AND platit_la < current_date - 29`],
  ['idx_plati_abonament', 'Plățile unui abonament',
    'SELECT * FROM plati WHERE abonament_id = 4321'],
  ['idx_programari_membru', 'Programările unui membru',
    'SELECT * FROM programari WHERE membru_id = 1234'],
];

async function planuri() {
  const rez = [];
  for (const [, , sql] of interogari) {
    const { rows } = await query('EXPLAIN (ANALYZE, BUFFERS) ' + sql);
    rez.push(rows.map((r) => r['QUERY PLAN']).join('\n'));
  }
  return rez;
}

const timp = (plan) => /Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? '?';
const nod = (plan) => /(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan)/.exec(plan)?.[1] ?? '?';

await exec(interogari.map(([idx]) => `DROP INDEX IF EXISTS ${idx};`).join('\n'));
await planuri(); // încălzire: primul rulaj include încărcarea paginilor în cache
const inainte = await planuri();
await exec(readFileSync(new URL('../indexes.sql', import.meta.url), 'utf8') + '\nANALYZE;');
await planuri();
const dupa = await planuri();

const marimi = (await query(
  `SELECT relname, n_live_tup::int AS n FROM pg_stat_user_tables WHERE relname IN ('abonamente', 'plati', 'programari') ORDER BY 1`)).rows;

let md = `# Planuri de execuție: înainte și după indecși

Generat automat de \`npm run explain\` la ${new Date().toISOString().slice(0, 10)}, pe ${process.env.DATABASE_URL ? 'PostgreSQL (DATABASE_URL)' : 'PostgreSQL încorporat (PGlite)'}.
Număr de rânduri: ${marimi.map((m) => `${m.relname} = ${m.n}`).join(', ')}.

| Index | Interogare | Înainte | După |
|---|---|---|---|
${interogari.map(([idx, titlu], i) => `| \`${idx}\` | ${titlu} | ${nod(inainte[i])}, ${timp(inainte[i])} ms | ${nod(dupa[i])}, ${timp(dupa[i])} ms |`).join('\n')}
`;
interogari.forEach(([idx, titlu, sql], i) => {
  md += `\n## ${titlu}\n\nIndex: \`${idx}\`\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n**Înainte (fără index):**\n\n\`\`\`\n${inainte[i]}\n\`\`\`\n\n**După (cu index):**\n\n\`\`\`\n${dupa[i]}\n\`\`\`\n`;
});

mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/planuri-executie.md', import.meta.url), md);
console.log(md.split('\n## ')[0]);
await close();
