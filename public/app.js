// Interfața e generată din descrierea entităților primită de la /api/me:
// o singură pagină generică (tabel + formular) servește toate tabelele.

const $ = (s) => document.querySelector(s);
const PE_PAGINA = 50;
let eu, ent, pagina = 0, cautare = '';

// h('td', { className: 'x' }, 'text') – construiește DOM fără innerHTML (fără risc de XSS)
function h(tag, props = {}, ...copii) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...copii.filter((c) => c != null));
  return el;
}

async function api(url, metoda = 'GET', body) {
  const r = await fetch('/api/' + url, {
    method: metoda,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  if (r.status === 401 && url !== 'login') arataLogin();
  const date = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(date?.eroare ?? 'Eroare');
  return date;
}

// ---------- Autentificare ----------

function arataLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  try {
    await api('login', 'POST', { email: f.email.value, parola: f.parola.value });
    f.reset();
    f.querySelector('.eroare').textContent = '';
    await porneste();
  } catch (e) {
    f.querySelector('.eroare').textContent = e.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('logout', 'POST');
  arataLogin();
});

async function porneste() {
  try { eu = await api('me'); } catch { return; }
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#cine').textContent = `${eu.utilizator.nume} (${eu.utilizator.rol})`;
  $('#nav').replaceChildren(
    ...Object.entries(eu.entitati).map(([k, e]) => h('button', { onclick: () => deschide(k), textContent: e.titlu })),
    h('button', { onclick: arataRapoarte, textContent: 'Rapoarte' }),
  );
  deschide(Object.keys(eu.entitati)[0]);
}

function marcheazaNav(titlu) {
  for (const b of $('#nav').children) b.setAttribute('aria-current', b.textContent === titlu ? 'page' : 'false');
}

// ---------- Listă ----------

function deschide(k) {
  ent = k; pagina = 0; cautare = '';
  incarca();
}

const dataLocala = (v) => new Date(v).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });

function celula(rand, c, def) {
  const v = rand[c];
  if (v == null) return '–';
  if (def.fk) return rand[c + '_eticheta'] ?? `#${v}`;
  if (def.tip === 'datetime-local') return dataLocala(v);
  return String(v);
}

async function incarca() {
  const e = eu.entitati[ent];
  marcheazaNav(e.titlu);
  const cols = Object.entries(e.coloane).filter(([, d]) => !d.virtual);
  let randuri;
  try {
    randuri = await api(`${ent}?limit=${PE_PAGINA}&offset=${pagina * PE_PAGINA}&q=${encodeURIComponent(cautare)}`);
  } catch (err) {
    return $('#continut').replaceChildren(h('p', { className: 'eroare', textContent: err.message }));
  }
  const cauta = h('input', { type: 'search', placeholder: 'Caută…', value: cautare, ariaLabel: 'Caută în ' + e.titlu });
  cauta.addEventListener('change', () => { cautare = cauta.value; pagina = 0; incarca(); });

  $('#continut').replaceChildren(
    h('div', { className: 'bara' },
      h('h1', { textContent: e.titlu }), cauta,
      e.scriere && !e.faraCreare ? h('button', { textContent: '+ Adaugă', onclick: () => formular() }) : null),
    h('div', { className: 'tabel' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', { textContent: 'ID' }),
        ...cols.map(([c]) => h('th', { textContent: nume(c) })), e.scriere ? h('th', { textContent: 'Acțiuni' }) : null)),
      h('tbody', {}, ...randuri.map((r) => h('tr', {}, h('td', { textContent: r.id }),
        ...cols.map(([c, d]) => h('td', { textContent: celula(r, c, d) })),
        e.scriere ? h('td', {},
          h('button', { className: 'secundar', textContent: 'Editează', onclick: () => formular(r) }),
          h('button', { className: 'pericol', textContent: 'Șterge', onclick: () => sterge(r) })) : null))))),
    randuri.length ? null : h('p', { textContent: 'Nicio înregistrare.' }),
    h('div', { className: 'bara' },
      h('button', { className: 'secundar', textContent: '← Înapoi', disabled: pagina === 0, onclick: () => { pagina--; incarca(); } }),
      h('span', { textContent: `Pagina ${pagina + 1}` }),
      h('button', { className: 'secundar', textContent: 'Înainte →', disabled: randuri.length < PE_PAGINA, onclick: () => { pagina++; incarca(); } })),
  );
}

const nume = (c) => c.replace(/_id$/, '').replaceAll('_', ' ').replace(/^./, (l) => l.toUpperCase());

async function sterge(r) {
  if (!confirm(`Ștergi definitiv „${r.eticheta}”?`)) return;
  try { await api(`${ent}/${r.id}`, 'DELETE'); incarca(); } catch (e) { alert(e.message); }
}

// ---------- Formular adăugare / editare ----------

// ISO (UTC) -> valoare pentru <input type="datetime-local"> în ora locală
const laInputLocal = (iso) => { const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function camp(c, def, rand) {
  const v = rand?.[c];
  let input;
  if (def.optiuni) {
    input = h('select', {}, ...def.optiuni.map((o) => h('option', { textContent: o, selected: o === v })));
  } else if (def.fk) {
    // căutare în tabelul referit: opțiunile sunt „id – etichetă”, la salvare se trimite doar id-ul
    const lista = h('datalist', { id: 'lista-' + c });
    input = h('input', { placeholder: 'Scrie pentru a căuta…', autocomplete: 'off', value: v == null ? '' : `${v} – ${rand[c + '_eticheta']}` });
    input.setAttribute('list', lista.id);
    const cauta = async () => {
      if (/^\d+ – /.test(input.value)) return;
      const r = await api(`${def.fk}?limit=20&q=${encodeURIComponent(input.value)}`).catch(() => []);
      lista.replaceChildren(...r.map((x) => h('option', { value: `${x.id} – ${x.eticheta}` })));
    };
    input.addEventListener('input', cauta);
    cauta();
    return h('label', {}, nume(c), input, lista);
  } else {
    input = h('input', { type: def.tip ?? 'text' });
    if (def.tip === 'number') input.step = 'any';
    if (def.tip === 'password') { input.autocomplete = 'new-password'; input.minLength = 8; }
    if (v != null) input.value = def.tip === 'datetime-local' ? laInputLocal(v) : v;
  }
  // parola e obligatorie doar la creare
  input.required = !!def.obligatoriu || (c === 'parola' && !rand);
  input.name = c;
  return h('label', {}, nume(c) + (c === 'parola' && rand ? ' (gol = neschimbată)' : ''), input);
}

function formular(rand) {
  const e = eu.entitati[ent];
  const f = $('#form-ent');
  f.querySelector('h2').textContent = (rand ? 'Editează: ' : 'Adaugă: ') + e.titlu;
  f.querySelector('.eroare').textContent = '';
  $('#campuri').replaceChildren(...Object.entries(e.coloane).map(([c, d]) => {
    const l = camp(c, d, rand);
    l.querySelector('input, select').name = c;
    if (d.obligatoriu) l.querySelector('input, select').required = true;
    return l;
  }));
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const body = {};
    for (const [c, d] of Object.entries(e.coloane)) {
      const v = f.elements[c].value;
      if (c === 'parola' && !v) continue;
      body[c] = d.fk ? (parseInt(v, 10) || '') : d.tip === 'datetime-local' && v ? new Date(v).toISOString() : v;
    }
    try {
      await api(rand ? `${ent}/${rand.id}` : ent, rand ? 'PUT' : 'POST', body);
      $('#dialog').close();
      incarca();
    } catch (err) {
      f.querySelector('.eroare').textContent = err.message;
    }
  };
  $('#dialog').showModal();
}

$('#renunta').addEventListener('click', () => $('#dialog').close());

// ---------- Rapoarte ----------

function arataRapoarte() {
  marcheazaNav('Rapoarte');
  $('#continut').replaceChildren(
    h('h1', { textContent: 'Rapoarte' }),
    h('p', { textContent: 'Rapoartele se generează din datele curente, în format PDF.' }),
    h('ul', { className: 'rapoarte' }, ...Object.entries(eu.rapoarte).map(([k, titlu]) =>
      h('li', {}, h('a', { href: `/api/rapoarte/${k}`, target: '_blank', textContent: titlu + ' (PDF)' })))),
  );
}

porneste().then(() => { if ($('#app').hidden) arataLogin(); });
