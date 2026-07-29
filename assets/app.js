/* APRELL — обучение менеджера. Ванильный JS, без сборки. */

const $ = (s, r = document) => r.querySelector(s);
const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };

const state = { parts: [], byslug: {}, current: null };

/* ---------- фронтматтер ---------- */
function splitFront(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  m[1].split(/\r?\n/).forEach(line => {
    const k = line.match(/^(\w+):\s*(.*)$/);
    if (k) meta[k[1]] = k[2].replace(/^["']|["']$/g, '');
  });
  return { meta, body: raw.slice(m[0].length) };
}

const slugify = s => s.toLowerCase().trim()
  .replace(/[^\wа-яё\s-]/gi, '').replace(/\s+/g, '-').slice(0, 60);

/* ---------- загрузка ---------- */
async function boot() {
  marked.setOptions({ gfm: true, breaks: false });

  let index;
  try {
    index = await (await fetch('content/index.json', { cache: 'no-cache' })).json();
  } catch {
    $('#loading').textContent = 'Не удалось загрузить содержание. Обновите страницу.';
    return;
  }

  const loaded = await Promise.all(index.map(async it => {
    const raw = await (await fetch('content/' + it.file, { cache: 'no-cache' })).text();
    const { meta, body } = splitFront(raw);
    return {
      slug: it.file.replace(/\.md$/, ''),
      title: meta.title || it.file,
      subtitle: meta.subtitle || '',
      order: Number(meta.order || it.order || 99),
      html: marked.parse(body)
    };
  }));

  loaded.sort((a, b) => a.order - b.order);
  state.parts = loaded;
  loaded.forEach(p => state.byslug[p.slug] = p);

  buildNav();
  buildSearchIndex();
  route();
  tickNow();
  setInterval(tickNow, 30000);
}

/* ---------- навигация ---------- */
function headingsOf(part) {
  const d = document.createElement('div');
  d.innerHTML = part.html;
  return [...d.querySelectorAll('h2')].map(h => ({ id: slugify(h.textContent), text: h.textContent }));
}

function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  state.parts.forEach((p, i) => {
    const li = el('li');
    const a = el('a', 'part');
    a.href = '#/' + p.slug;
    a.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span>
      <span class="ttl">${p.title}</span>
      <span class="sub">${p.subtitle}</span>`;
    li.appendChild(a);

    const ol = el('ol');
    headingsOf(p).forEach(h => {
      const s = el('li');
      const sa = el('a');
      sa.href = '#/' + p.slug + '/' + h.id;
      sa.textContent = h.text;
      s.appendChild(sa); ol.appendChild(s);
    });
    li.appendChild(ol);
    nav.appendChild(li);
  });
}

/* ---------- отрисовка раздела ---------- */
function render(slug, anchor) {
  const p = state.byslug[slug] || state.parts[0];
  if (!p) return;
  state.current = p.slug;

  const doc = $('#doc');
  doc.innerHTML = '';

  const head = el('header', 'doc-head');
  const n = state.parts.indexOf(p) + 1;
  head.innerHTML = `<div class="doc-eyebrow">Часть ${n}</div>
    <h1>${p.title}</h1><p>${p.subtitle}</p>`;
  doc.appendChild(head);

  const wrap = el('div');
  wrap.innerHTML = p.html;

  wrap.querySelectorAll('h2,h3').forEach(h => h.id = slugify(h.textContent));
  wrap.querySelectorAll('input[type=checkbox]').forEach(i => i.disabled = false);
  wrap.querySelectorAll('table').forEach(t => {
    const box = el('div', 'tw');
    t.parentNode.insertBefore(box, t); box.appendChild(t);
  });
  wrap.querySelectorAll('blockquote').forEach(q => {
    const phrase = q.innerText.trim();
    const b = el('button', 'copy');
    b.type = 'button'; b.textContent = 'Копировать';
    b.addEventListener('click', () => {
      navigator.clipboard.writeText(phrase)
        .then(() => {
          b.textContent = 'Скопировано'; b.classList.add('done');
          setTimeout(() => { b.textContent = 'Копировать'; b.classList.remove('done'); }, 1600);
        })
        .catch(() => { b.textContent = 'Выделите вручную'; });
    });
    q.appendChild(b);
  });

  [...wrap.childNodes].forEach(n => doc.appendChild(n));

  $('#results').hidden = true;
  doc.hidden = false;

  document.querySelectorAll('.nav a').forEach(a => a.removeAttribute('aria-current'));
  const cur = document.querySelector(`.nav a.part[href="#/${p.slug}"]`);
  if (cur) cur.setAttribute('aria-current', 'true');

  if (anchor) {
    const t = document.getElementById(anchor);
    const sub = document.querySelector(`.nav ol a[href="#/${p.slug}/${anchor}"]`);
    if (sub) sub.setAttribute('aria-current', 'true');
    if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  }
  window.scrollTo({ top: 0 });
}

/* ---------- поиск ---------- */
let INDEX = [];

function buildSearchIndex() {
  INDEX = [];
  state.parts.forEach(p => {
    const d = document.createElement('div');
    d.innerHTML = p.html;
    let h2 = '';
    [...d.children].forEach(node => {
      if (node.tagName === 'H2') { h2 = node.textContent; return; }
      if (node.tagName === 'TABLE') {
        node.querySelectorAll('tbody tr').forEach(tr => {
          const cells = [...tr.children].map(td => td.textContent.trim());
          INDEX.push({ part: p, h2, id: slugify(h2), text: cells.join(' · ') });
        });
        return;
      }
      const txt = node.textContent.trim();
      if (txt.length > 12) INDEX.push({ part: p, h2, id: slugify(h2), text: txt });
    });
  });
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function search(q) {
  const box = $('#results');
  const query = q.trim();
  if (query.length < 2) { box.hidden = true; $('#doc').hidden = false; return; }

  const re = new RegExp(esc(query), 'i');
  const hits = INDEX.filter(i => re.test(i.text)).slice(0, 40);

  box.innerHTML = '';
  const meta = el('p', 'results-meta');
  meta.textContent = hits.length
    ? `Найдено: ${hits.length}`
    : 'Ничего не нашлось';
  box.appendChild(meta);

  if (!hits.length) {
    const e = el('p', 'empty');
    e.textContent = 'Попробуйте другое слово — например, название региона, модель или «догон».';
    box.appendChild(e);
  }

  hits.forEach(h => {
    const a = el('a', 'hit');
    a.href = '#/' + h.part.slug + '/' + h.id;
    let t = h.text;
    if (t.length > 240) {
      const at = t.search(new RegExp(esc(query), 'i'));
      t = (at > 90 ? '…' : '') + t.slice(Math.max(0, at - 90), Math.max(0, at - 90) + 240) + '…';
    }
    a.innerHTML = `<div class="hit-where">${h.part.title}${h.h2 ? ' · ' + h.h2 : ''}</div>
      <p class="hit-text">${t.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
        .replace(new RegExp(esc(query), 'gi'), m => `<mark>${m}</mark>`)}</p>`;
    box.appendChild(a);
  });

  box.hidden = false;
  $('#doc').hidden = true;
  window.scrollTo({ top: 0 });
}

/* ---------- «Сейчас» ---------- */
function tickNow() {
  const msk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const h = msk.getHours() + msk.getMinutes() / 60;
  const hh = String(msk.getHours()).padStart(2, '0');
  const mm = String(msk.getMinutes()).padStart(2, '0');

  $('#nowTime').textContent = `${hh}:${mm}`;

  let shift, shortShift;
  if (h >= 8 && h < 14) { shift = 'Утренняя смена · до 17:00'; shortShift = 'утренняя'; }
  else if (h >= 14 && h < 17) { shift = 'Обе смены — время передачи'; shortShift = 'передача смены'; }
  else if (h >= 17 && h < 23) { shift = 'Вечерняя смена · до 23:00'; shortShift = 'вечерняя'; }
  else { shift = 'Вне смен — отвечает бот'; shortShift = 'вне смен'; }
  $('#nowShift').textContent = shift + ' · Мск';
  $('#nowShiftShort').textContent = shortShift;

  const early = h < 15;
  $('#nowSlot').textContent = early
    ? 'сегодня в 21:00 — вечерней смене'
    : 'завтра в 08:00 — утренней смене';
  $('#nowSlotShort').textContent = early ? 'догон сегодня 21:00' : 'догон завтра 08:00';
}

/* ---------- маршрутизация ---------- */
function route() {
  const m = location.hash.match(/^#\/([\w-]+)(?:\/([^/]*))?/);
  if (!m) { render(state.parts[0]?.slug); return; }
  render(m[1], m[2] ? decodeURIComponent(m[2]) : null);
  closeSide();
}

/* ---------- события ---------- */
window.addEventListener('hashchange', route);

const side = $('#side'), scrim = $('#scrim');
function openSide() { side.classList.add('open'); scrim.hidden = false; $('#burger').setAttribute('aria-expanded', 'true'); }
function closeSide() { side.classList.remove('open'); scrim.hidden = true; $('#burger').setAttribute('aria-expanded', 'false'); }

$('#burger').addEventListener('click', () => side.classList.contains('open') ? closeSide() : openSide());
scrim.addEventListener('click', closeSide);
$('#findBtn').addEventListener('click', () => { openSide(); setTimeout(() => $('#q').focus(), 220); });

let timer;
$('#q').addEventListener('input', e => {
  clearTimeout(timer);
  timer = setTimeout(() => search(e.target.value), 130);
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#q').focus(); }
  if (e.key === 'Escape') { $('#q').value = ''; search(''); $('#q').blur(); closeSide(); }
});

boot();
