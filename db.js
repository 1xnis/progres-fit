// Conexiunea la PostgreSQL. Cu DATABASE_URL (ex. Supabase) folosește driverul `pg`;
// fără, pornește un PostgreSQL încorporat (PGlite) în ./data, pentru dezvoltare și teste offline.
// Coloanele DATE (oid 1082) rămân text 'YYYY-MM-DD', ca să nu se decaleze cu fusul orar.

let query, exec, close;

if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(1082, (v) => v);
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    // shortcut: conexiunea e criptată, dar certificatul serverului nu e verificat;
    // pentru producție se descarcă certificatul CA din Supabase și se pune în ssl.ca.
    ssl: local ? false : { rejectUnauthorized: false },
  });
  query = (text, params) => pool.query(text, params);
  exec = (text) => pool.query(text);
  close = () => pool.end();
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(process.env.PGLITE_DIR ?? './data', { parsers: { 1082: (v) => v } });
  query = (text, params) => db.query(text, params);
  exec = (text) => db.exec(text);
  close = () => db.close();
}

export { query, exec, close };
