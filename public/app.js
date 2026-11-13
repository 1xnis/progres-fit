// toata interfata se construieste din ce intoarce /api/me (entitati + drepturi),
// asa ca o singura pagina de lista si un singur formular ajung pentru toate tabelele

const $ = (s) => document.querySelector(s);
const PE_PAGINA = 50;
let eu, ent, pagina = 0, cautare = '';

// cum apar in meniu; ce nu are voie rolul curent nu vine deloc de la server
const GRUPURI = [
  ['Zi de zi', ['membri', 'abonamente', 'plati', 'programari', 'clase']],
  ['Administrare', ['antrenori', 'tipuri_abonament', 'utilizatori', 'sesiuni']],
];

// numele coloanelor din baza de date nu au diacritice, aici sunt cele de afisat
const DENUMIRI = {
  membru_id: 'Membru', tip_id: 'Tip abonament', abonament_id: 'Abonament', clasa_id: 'Clasă',
  antrenor_id: 'Antrenor', utilizator_id: 'Utilizator', data_nasterii: 'Data nașterii',
  data_inscrierii: 'Data înscrierii', data_start: 'De la', data_sfarsit: 'Până la', suma: 'Sumă',
  metoda: 'Metodă', platit_la: 'Plătit la', incepe_la: 'Începe la', durata_min: 'Durată (min)',
  durata_zile: 'Durată (zile)', pret: 'Preț', creat_la: 'Creată la', expira_la: 'Expiră la', parola: 'Parolă',
};
const nume = (c) => DENUMIRI[c] ?? c.replace(/^./, (l) => l.toUpperCase());

// h('td', { className: 'x' }, 'text') - fac elementele asa ca sa nu folosesc innerHTML
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
  if (!r.ok) throw new Error(date?.eroare ?? 'Ceva nu a mers. Încearcă din nou.');
  return date;
}

let ceasMesaj;
function mesaj(text, eEroare) {
  const m = $('#mesaj');
  m.textContent = text;
  m.className = eEroare ? 'eroare' : '';
  m.hidden = false;
  clearTimeout(ceasMesaj);
  ceasMesaj = setTimeout(() => { m.hidden = true; }, eEroare ? 7000 : 3000);
}

// ---- login / logout

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
  $('#cine').replaceChildren(h('strong', { textContent: eu.utilizator.nume }), h('span', { textContent: eu.utilizator.rol }));

  const buton = (text, actiune) => h('button', { textContent: text, onclick: actiune });
  $('#nav').replaceChildren(
    buton('Azi', arataAzi),
    ...GRUPURI.flatMap(([titlu, chei]) => {
      const mele = chei.filter((k) => eu.entitati[k]);
      return mele.length ? [h('p', { textContent: titlu }), ...mele.map((k) => buton(eu.entitati[k].titlu, () => deschide(k)))] : [];
    }),
    h('p', { textContent: 'Situații' }),
    buton('Rapoarte', arataRapoarte),
  );
  arataAzi();
}

function marcheazaNav(titlu) {
  for (const b of $('#nav').querySelectorAll('button')) {
    if (b.textContent === titlu) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}

// ---- formatari

const oraLocala = (v) => new Date(v).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
const dataOra = (v) => new Date(v).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
const doarData = (v) => v.split('-').reverse().join('.');
const lei = (v) => Number(v).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
const intreg = (v) => Number(v).toLocaleString('ro-RO');

function celula(rand, c, def) {
  const v = rand[c];
  if (v == null) return h('td', { className: 'gol', textContent: '–' });
  if (def.fk) return h('td', { textContent: rand[c + '_eticheta'] ?? `#${v}` });
  if (def.optiuni) return h('td', {}, h('span', { className: 'stare ' + v, textContent: v }));
  if (def.tip === 'datetime-local') return h('td', { textContent: dataOra(v) });
  if (def.tip === 'date') return h('td', { textContent: doarData(v) });
  if (c === 'suma' || c === 'pret') return h('td', { className: 'numar', textContent: lei(v) });
  if (def.tip === 'number') return h('td', { className: 'numar', textContent: v });
  return h('td', { textContent: v });
}

// patratele: cate unul pentru fiecare loc din clasa, pline = rezervate
function locuri(rezervari, capacitate) {
  const el = h('span', { className: 'locuri' + (rezervari >= capacitate ? ' plina' : ''), role: 'img',
    ariaLabel: `${rezervari} din ${capacitate} locuri ocupate` });
  for (let i = 0; i < capacitate; i++) el.append(h('i', { className: i < rezervari ? 'ocupat' : '' }));
  return el;
}

// ---- pagina Azi

async function arataAzi() {
  ent = null;
  marcheazaNav('Azi');
  let d;
  try { d = await api('azi'); } catch (e) { return $('#continut').replaceChildren(h('p', { className: 'eroare', textContent: e.message })); }
  const c = d.cifre;
  const cifra = (valoare, text, laClick) => h('li', {},
    h('strong', { textContent: valoare }),
    laClick ? h('button', { className: 'legatura', textContent: text, onclick: laClick }) : h('span', { textContent: text }));

  $('#continut').replaceChildren(
    h('h1', { textContent: new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (l) => l.toUpperCase()) }),
    h('ul', { className: 'cifre' },
      cifra(intreg(c.membri), 'membri înscriși', () => deschide('membri')),
      'abonamente_active' in c ? cifra(intreg(c.abonamente_active), 'abonamente active', () => deschide('abonamente')) : null,
      'expira' in c ? cifra(intreg(c.expira), 'expiră în 7 zile', arataRapoarte) : null,
      'incasari_luna' in c ? cifra(lei(c.incasari_luna), 'încasați luna aceasta', () => deschide('plati')) : null),
    h('h2', { textContent: 'Clasele de azi' }),
    d.clase.length
      ? h('ol', { className: 'orar' }, ...d.clase.map((k) => h('li', { className: new Date(k.incepe_la) < new Date() ? 'trecuta' : '' },
        h('time', { textContent: oraLocala(k.incepe_la) }),
        h('div', {}, h('strong', { textContent: k.denumire }),
          h('span', { textContent: k.antrenor + (k.antrenor_id === eu.antrenor_id ? ' (tu)' : '') })),
        locuri(k.rezervari, k.capacitate),
        h('span', { className: 'numar', textContent: `${k.rezervari} din ${k.capacitate} locuri` }))))
      : h('p', { className: 'nimic', textContent: 'Azi nu e programată nicio clasă. Poți adăuga una din secțiunea Clase.' }),
  );
}

// ---- lista unei entitati

function deschide(k) {
  ent = k; pagina = 0; cautare = '';
  incarca();
}

// antrenorul vede butoanele doar la clasele lui (serverul verifica oricum)
const amVoie = (e, rand) => e.scriere && !(ent === 'clase' && eu.utilizator.rol === 'antrenor' && rand.antrenor_id !== eu.antrenor_id);

let ceasCautare;
async function incarca(pastreazaFocus) {
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
  cauta.addEventListener('input', () => {
    clearTimeout(ceasCautare);
    ceasCautare = setTimeout(() => { cautare = cauta.value; pagina = 0; incarca(true); }, 300);
  });
  const areActiuni = randuri.some((r) => amVoie(e, r));

  $('#continut').replaceChildren(
    h('div', { className: 'bara' },
      h('h1', { textContent: e.titlu }), cauta,
      e.scriere && !e.faraCreare ? h('button', { textContent: 'Adaugă', onclick: () => formular() }) : null),
    randuri.length
      ? h('div', { className: 'tabel' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { textContent: 'Nr.' }),
          ...cols.map(([c, d]) => h('th', { textContent: nume(c), className: d.tip === 'number' ? 'numar' : '' })),
          areActiuni ? h('th', {}, h('span', { className: 'ascuns', textContent: 'Acțiuni' })) : null)),
        h('tbody', {}, ...randuri.map((r) => h('tr', {}, h('td', { className: 'gol', textContent: r.id }),
          ...cols.map(([c, d]) => celula(r, c, d)),
          areActiuni ? h('td', { className: 'actiuni' }, ...(amVoie(e, r) ? [
            h('button', { className: 'secundar', textContent: 'Editează', onclick: () => formular(r) }),
            h('button', { className: 'pericol', textContent: 'Șterge', onclick: () => sterge(r) })] : [])) : null)))))
      : h('p', { className: 'nimic', textContent: cautare ? `Nimic găsit pentru „${cautare}”.` : 'Încă nu există nicio înregistrare aici.' }),
    h('div', { className: 'bara pagini' },
      h('button', { className: 'secundar', textContent: 'Pagina anterioară', disabled: pagina === 0, onclick: () => { pagina--; incarca(); } }),
      h('span', { textContent: `Pagina ${pagina + 1}` }),
      h('button', { className: 'secundar', textContent: 'Pagina următoare', disabled: randuri.length < PE_PAGINA, onclick: () => { pagina++; incarca(); } })),
  );
  if (pastreazaFocus) { cauta.focus(); cauta.setSelectionRange(cautare.length, cautare.length); }
}

async function sterge(r) {
  if (!confirm(`Ștergi definitiv „${r.eticheta}”?`)) return;
  try {
    await api(`${ent}/${r.id}`, 'DELETE');
    mesaj('Șters.');
    incarca();
  } catch (e) {
    mesaj(e.message, true);
  }
}

// ---- formular adaugare / editare

// din ISO (UTC) in ce vrea <input type="datetime-local">, adica ora locala fara fus
const laInputLocal = (iso) => { const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function camp(c, def, rand) {
  const v = rand?.[c];
  let input, lista;
  if (def.optiuni) {
    input = h('select', {}, ...def.optiuni.map((o) => h('option', { textContent: o, selected: o === v })));
  } else if (def.fk) {
    // scrii un nume, alegi din sugestii; in camp ramane "id – nume" si la salvare trimit doar id-ul
    lista = h('datalist', { id: 'lista-' + c });
    input = h('input', { placeholder: 'Scrie un nume și alege din listă', autocomplete: 'off', value: v == null ? '' : `${v} – ${rand[c + '_eticheta']}` });
    input.setAttribute('list', lista.id);
    const cauta = async () => {
      if (/^\d+ – /.test(input.value)) return;
      const r = await api(`${def.fk}?limit=20&q=${encodeURIComponent(input.value)}`).catch(() => []);
      lista.replaceChildren(...r.map((x) => h('option', { value: `${x.id} – ${x.eticheta}` })));
    };
    input.addEventListener('input', cauta);
    cauta();
  } else {
    input = h('input', { type: def.tip ?? 'text' });
    if (def.tip === 'number') input.step = 'any';
    if (def.tip === 'password') { input.autocomplete = 'new-password'; input.minLength = 8; }
    if (v != null) input.value = def.tip === 'datetime-local' ? laInputLocal(v) : v;
  }
  input.name = c;
  // parola e obligatorie doar cand creezi contul
  input.required = !!def.obligatoriu || (c === 'parola' && !rand);
  const ajutor = c === 'parola' ? (rand ? 'Lasă gol ca să rămână parola actuală.' : 'Minimum 8 caractere.') : null;
  return h('label', {}, nume(c) + (input.required ? '' : ' (opțional)'), input, lista, ajutor && h('small', { textContent: ajutor }));
}

function formular(rand) {
  const e = eu.entitati[ent];
  const f = $('#form-ent');
  f.querySelector('h2').textContent = (rand ? 'Editează: ' : 'Adaugă: ') + e.titlu.toLowerCase();
  f.querySelector('.eroare').textContent = '';
  $('#campuri').replaceChildren(...Object.entries(e.coloane).map(([c, d]) => camp(c, d, rand)));
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
      mesaj('Salvat.');
      incarca();
    } catch (err) {
      f.querySelector('.eroare').textContent = err.message;
    }
  };
  $('#dialog').showModal();
}

$('#renunta').addEventListener('click', () => $('#dialog').close());

// ---- rapoarte

function arataRapoarte() {
  ent = null;
  marcheazaNav('Rapoarte');
  $('#continut').replaceChildren(
    h('h1', { textContent: 'Rapoarte' }),
    h('p', { textContent: 'Fiecare raport se face pe loc din datele de acum și se deschide ca PDF într-o filă nouă.' }),
    h('ul', { className: 'rapoarte' }, ...Object.entries(eu.rapoarte).map(([k, titlu]) =>
      h('li', {}, h('span', { textContent: titlu }),
        h('a', { href: `/api/rapoarte/${k}`, target: '_blank', textContent: 'Deschide PDF' })))),
  );
}

porneste().then(() => { if ($('#app').hidden) arataLogin(); });
