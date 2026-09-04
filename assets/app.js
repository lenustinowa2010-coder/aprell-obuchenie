/* APRELL — обучение менеджера. Ванильный JS, без сборки. */

const $ = (s, r = document) => r.querySelector(s);
const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
const CONTENT_VERSION = '20260813-5';

const state = { parts: [], byslug: {}, links: [], cdekCities: {}, current: null };

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
  if (typeof marked === "undefined") {
    $("#loading").textContent = "Не удалось загрузить движок отображения. Проверьте интернет и обновите страницу.";
    return;
  }
  marked.setOptions({ gfm: true, breaks: false });

  let index;
  try {
    index = await (await fetch('content/index.json', { cache: 'no-cache' })).json();
  } catch {
    $('#loading').textContent = 'Не удалось загрузить содержание. Обновите страницу.';
    return;
  }

  const loaded = await Promise.all(index.map(async it => {
    const raw = await (await fetch('content/' + it.file + '?v=' + CONTENT_VERSION,
      { cache: 'no-store' })).text();
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

  try {
    const lj = await (await fetch('content/links.json', { cache: 'no-cache' })).json();
    state.links = Array.isArray(lj) ? lj : (lj.items || []);
  } catch { state.links = []; }

  await loadDeliveryCities();
  await loadCatalogParts();

  buildNav();
  buildSearchIndex();
  route();
  tickNow();
  setInterval(tickNow, 30000);
}

async function loadDeliveryCities() {
  try {
    const data = await (await fetch('content/cdek-cities.json', { cache: 'no-cache' })).json();
    state.cdekCities = data || {};
  } catch { state.cdekCities = {}; }
}

/* ---------- каталог: те же данные, свои разделы ---------- */
async function loadCatalogParts() {
  if (typeof window.buildDataParts !== 'function') return;
  let d;
  try { d = await (await fetch('katalog/data.json', { cache: 'no-cache' })).json(); }
  catch { return; }
  try {
    d.liveMedia = await (await fetch('katalog/yadisk-media.json', { cache: 'no-cache' })).json();
  } catch (e) { d.liveMedia = { models: [] }; }
  // доп. фото из админки (extra_photos.json) — подмешиваем к моделям по артикулу
  try {
    const ex = await (await fetch('katalog/extra_photos.json', { cache: 'no-cache' })).json();
    const key = a => String(a || '').toLowerCase().replace(/[^0-9a-z]/g, '');
    const map = {};
    (ex.items || []).forEach(it => {
      if (it && it.art && it.photos && it.photos.length)
        map[key(it.art)] = { photos: it.photos, color: it.color || '' };
    });
    (d.models || []).forEach(m => {
      const extra = map[key(m.full)] || map[key(m.art)];
      if (extra && extra.photos.length) {
        m.extra = extra.photos;
        m.extraColor = extra.color;
      }
    });
  } catch (e) { /* файла может не быть — не страшно */ }
  try {
    window.buildDataParts(d).forEach(p => {
      state.parts.push(p);
      state.byslug[p.slug] = p;
    });
    state.parts.sort((a, b) => a.order - b.order);
  } catch (e) { console.error('Каталог не собрался:', e); }
}

/* ---------- навигация ---------- */
function headingsOf(part) {
  const d = document.createElement('div');
  d.innerHTML = part.html;
  return [...d.querySelectorAll('h2')].map(h => ({ id: h.id || slugify(h.textContent), text: h.textContent }));
}

function prepareDeliveryContent(root, part, interactive = false) {
  if (part.slug !== '03-delivery') return;

  let sectionId = '';
  let sectionName = '';
  [...root.children].forEach(node => {
    if (node.tagName === 'H2') {
      if (!node.id) node.id = slugify(node.textContent);
      sectionId = node.id;
      sectionName = node.textContent.trim();
      return;
    }
    if (node.tagName !== 'TABLE' || !sectionId) return;
    [...node.querySelectorAll('tbody tr')].forEach(row => {
      const region = row.cells[0]?.textContent.trim();
      if (!region) return;
      row.id = `${sectionId}-${slugify(region)}`;
      row.classList.add('delivery-region-row');
      if (sectionName !== 'Полная таблица') return;

      const cities = state.cdekCities[region];
      if (!Array.isArray(cities) || !cities.length) return;

      const cityRow = el('tr', 'delivery-cities-row');
      cityRow.id = `${row.id}-города`;
      cityRow.hidden = true;
      cityRow.dataset.deliveryRegion = region;
      const cityCell = el('td');
      cityCell.colSpan = row.cells.length;
      const cityList = el('div', 'delivery-city-list');
      cities.forEach(city => {
        const item = el('span', 'delivery-city');
        item.id = `${row.id}-${slugify(city)}`;
        item.textContent = city;
        item.dataset.deliveryCity = city;
        cityList.appendChild(item);
      });
      cityCell.appendChild(cityList);
      cityRow.appendChild(cityCell);
      row.after(cityRow);

      const firstCell = row.cells[0];
      firstCell.textContent = '';
      const toggle = el('button', 'delivery-region-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', cityRow.id);
      toggle.innerHTML = `<span class="delivery-region-plus" aria-hidden="true">+</span>
        <span>${escHtml(region)}</span><small>${cities.length} г.</small>`;
      if (interactive) {
        toggle.addEventListener('click', () => {
          const opening = cityRow.hidden;
          cityRow.hidden = !opening;
          toggle.setAttribute('aria-expanded', String(opening));
          toggle.querySelector('.delivery-region-plus').textContent = opening ? '\u2212' : '+';
        });
      }
      firstCell.appendChild(toggle);
    });
  });
}

/* Отдельный стабильный якорь для каждого блока, который попадает в поиск. */
function prepareSearchAnchors(root) {
  root.querySelectorAll('h2,h3').forEach(h => {
    if (!h.id) h.id = slugify(h.textContent);
  });

  let sectionId = 'раздел';
  let sequence = 0;
  [...root.children].forEach(node => {
    if (node.tagName === 'H2') {
      sectionId = node.id;
      sequence = 0;
      return;
    }
    if (node.tagName === 'TABLE' || node.textContent.trim().length <= 12) return;
    if (!node.id) node.id = `${sectionId}-поиск-${++sequence}`;
    node.dataset.searchAnchor = 'true';
  });
}

function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = '';

  (state.links || []).forEach(l => {
    if (!l || !l.url) return;
    const li = el('li');
    const a = el('a', 'part link-out');
    a.href = l.url;
    a.innerHTML = `<span class="num">→</span>
      <span class="ttl">${l.title || l.url}</span>
      <span class="sub">${l.subtitle || ''}</span>`;
    li.appendChild(a);
    if (Array.isArray(l.sections) && l.sections.length) {
      const ol = el('ol');
      l.sections.forEach(sec => {
        if (!sec || !sec.url) return;
        const s2 = el('li'), a2 = el('a');
        a2.href = sec.url; a2.textContent = sec.title || sec.url;
        s2.appendChild(a2); ol.appendChild(s2);
      });
      li.appendChild(ol);
    }
    nav.appendChild(li);
  });

  state.parts.forEach((p, i) => {
    const li = el('li');
    const a = el('a', 'part');
    a.href = '#/' + p.slug;
    a.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span>
      <span class="ttl">${p.title}</span>
      <span class="sub">${p.subtitle}</span>`;
    li.appendChild(a);

    if (p.noSub) { nav.appendChild(li); return; }
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

function textForClipboard(node) {
  if (!node.querySelector('br')) return node.innerText.trim();
  const copy = node.cloneNode(true);
  copy.querySelectorAll('br').forEach(br => {
    br.replaceWith(document.createTextNode('\n'));
  });
  return copy.textContent.replace(/\r\n?/g, '\n').trim();
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* для браузеров, где Clipboard API недоступен */ }

  const input = el('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Не удалось скопировать текст');
}

/* ---------- медиа каталога: загружаем только раскрытый цвет ---------- */
const mediaImageQueue = [];
let activeMediaImages = 0;
const MEDIA_IMAGE_LIMIT = 4;

function runMediaImageQueue() {
  while (activeMediaImages < MEDIA_IMAGE_LIMIT && mediaImageQueue.length) {
    const image = mediaImageQueue.shift();
    if (!image.isConnected || !image.dataset.src) continue;
    activeMediaImages++;
    let settled = false;
    let timeoutId;
    const finish = loaded => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
      activeMediaImages--;
      delete image.dataset.queued;
      if (loaded) {
        delete image.dataset.src;
      } else if (image.isConnected && Number(image.dataset.retries || 0) < 1) {
        image.dataset.retries = String(Number(image.dataset.retries || 0) + 1);
        image.removeAttribute('src');
        image.dataset.queued = '1';
        setTimeout(() => {
          mediaImageQueue.push(image);
          runMediaImageQueue();
        }, 700);
      }
      runMediaImageQueue();
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    image.addEventListener('load', onLoad);
    image.addEventListener('error', onError);
    image.src = image.dataset.src;
    timeoutId = setTimeout(() => {
      image.removeAttribute('src');
      finish(false);
    }, 12000);
  }
}

function queueMediaImages(root) {
  root.querySelectorAll('img[data-src]:not([data-queued])').forEach(image => {
    image.dataset.queued = '1';
    mediaImageQueue.push(image);
  });
  runMediaImageQueue();
}

function clearLiveMedia(group) {
  const row = group.querySelector('[data-live-media]');
  if (!row || !row.dataset.mounted) return;
  row.querySelectorAll('video').forEach(video => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  });
  row.replaceChildren();
  delete row.dataset.mounted;
  delete row.dataset.next;
}

function appendLiveMediaBatch(group) {
  const row = group.querySelector('[data-live-media]');
  const template = group.querySelector('.live-media-template');
  if (!row || !template) return;
  row.querySelector('.live-media-more')?.remove();
  const items = [...template.content.children];
  const start = Number(row.dataset.next || 0);
  const end = Math.min(start + 8, items.length);
  const batch = document.createDocumentFragment();
  items.slice(start, end).forEach(item => batch.appendChild(item.cloneNode(true)));
  row.appendChild(batch);
  row.dataset.next = String(end);
  if (end < items.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'live-media-more';
    more.textContent = `Показать ещё (${items.length - end})`;
    row.appendChild(more);
  }
  queueMediaImages(row);
}

function mountLiveMedia(group) {
  const card = group.closest('.model-card');
  if (!group.open || (card && !card.open)) return;
  const row = group.querySelector('[data-live-media]');
  const template = group.querySelector('.live-media-template');
  if (!row || !template || row.dataset.mounted) return;
  row.dataset.mounted = '1';
  row.dataset.next = '0';
  appendLiveMediaBatch(group);
}

function mountExtraMedia(card) {
  card.querySelectorAll('[data-extra-media]').forEach(row => {
    if (row.dataset.mounted) return;
    const template = row.nextElementSibling;
    if (!template?.matches('.extra-media-template')) return;
    row.appendChild(template.content.cloneNode(true));
    row.dataset.mounted = '1';
    queueMediaImages(row);
  });
}

function clearExtraMedia(card) {
  card.querySelectorAll('[data-extra-media][data-mounted]').forEach(row => {
    row.replaceChildren();
    delete row.dataset.mounted;
  });
}

function setupLazyMedia(root) {
  const groups = [...root.querySelectorAll('.media-color')];
  groups.forEach(group => {
    const row = group.querySelector('[data-live-media]');
    group.addEventListener('toggle', () => {
      if (group.open) {
        mountLiveMedia(group);
      } else {
        clearLiveMedia(group);
      }
    });
    row?.addEventListener('click', event => {
      const more = event.target.closest('.live-media-more');
      if (more) {
        appendLiveMediaBatch(group);
        return;
      }
      const button = event.target.closest('.live-video-play');
      if (!button) return;
      const video = document.createElement('video');
      video.src = button.dataset.videoSrc;
      video.poster = button.dataset.videoPoster || '';
      video.controls = true;
      video.autoplay = true;
      video.preload = 'metadata';
      video.playsInline = true;
      button.replaceWith(video);
    });
  });

  root.querySelectorAll('.model-card').forEach(card => {
    card.addEventListener('toggle', () => {
      if (card.open) mountExtraMedia(card);
      else clearExtraMedia(card);
      card.querySelectorAll('.media-color').forEach(group => {
        if (card.open && group.open) mountLiveMedia(group);
        else if (!card.open) clearLiveMedia(group);
      });
    });
  });
}

/* ---------- отрисовка раздела ---------- */
function render(slug, anchor) {
  const p = state.byslug[slug] || state.parts[0];
  if (!p) return;
  state.current = p.slug;

  const doc = $('#doc');
  doc.innerHTML = '';
  const isCatalog = p.slug === 'models' || p.slug === 'accessories';
  doc.classList.toggle('catalog-doc', isCatalog);
  document.body.classList.toggle('catalog-page', isCatalog);

  const head = el('header', 'doc-head');
  const n = state.parts.indexOf(p) + 1;
  head.innerHTML = `<div class="doc-eyebrow">Часть ${n}</div>
    <h1>${p.title}</h1><p>${p.subtitle}</p>
    <button type="button" class="fb-open">\u{1F4AC} Замечание</button>`;
  head.querySelector('.fb-open').addEventListener('click', () => openFeedback(p.title));
  doc.appendChild(head);

  const wrap = el('div');
  wrap.innerHTML = p.html;

  wrap.querySelectorAll('h2,h3').forEach(h => { if (!h.id) h.id = slugify(h.textContent); });
  prepareDeliveryContent(wrap, p, true);
  prepareSearchAnchors(wrap);
  wrap.querySelectorAll('input[type=checkbox]').forEach(i => i.disabled = false);
  wrap.querySelectorAll('table').forEach(t => {
    const box = el('div', 'tw');
    t.parentNode.insertBefore(box, t); box.appendChild(t);
  });
  wrap.querySelectorAll('blockquote').forEach(q => {
    const phrase = textForClipboard(q);
    const b = el('button', 'copy');
    b.type = 'button'; b.textContent = 'Копировать';
    b.addEventListener('click', () => {
      writeClipboard(phrase)
        .then(() => {
          b.textContent = 'Скопировано'; b.classList.add('done');
          setTimeout(() => { b.textContent = 'Копировать'; b.classList.remove('done'); }, 1600);
        })
        .catch(() => { b.textContent = 'Выделите вручную'; });
    });
    q.appendChild(b);
  });

  wrap.querySelectorAll('button.zipall').forEach(btn => {
    btn.addEventListener('click', () => zipDownload(btn));
  });

  [...wrap.childNodes].forEach(n => doc.appendChild(n));
  setupLazyMedia(doc);

  const modelQ = doc.querySelector('#model-q');
  if (modelQ) {
    const cards = [...doc.querySelectorAll('.model-card')];
    const chips = [...doc.querySelectorAll('[data-model-chip]')];
    const count = doc.querySelector('#model-count');
    const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е')
      .replace(/[^0-9a-zа-я]+/gi, ' ').trim();
    modelQ.addEventListener('input', () => {
      const words = norm(modelQ.value).split(/\s+/).filter(Boolean);
      let visible = 0;
      cards.forEach(card => {
        const show = words.every(w => norm(card.dataset.modelNumber).includes(w));
        card.hidden = !show;
        if (show) visible++;
      });
      chips.forEach(chip => {
        chip.hidden = !words.every(w => norm(chip.dataset.modelChip).includes(w));
      });
      count.textContent = visible ? `Показано: ${visible}` : 'Ничего не найдено';
    });
    chips.forEach(chip => chip.addEventListener('click', e => {
      e.preventDefault();
      const id = decodeURIComponent(chip.getAttribute('href').split('/').pop());
      const card = document.getElementById(id);
      if (!card) return;
      cards.forEach(item => { item.open = item === card; });
      history.replaceState(null, '', chip.getAttribute('href'));
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  $('#results').hidden = true;
  doc.hidden = false;

  document.querySelectorAll('.nav a').forEach(a => a.removeAttribute('aria-current'));
  const cur = document.querySelector(`.nav a.part[href="#/${p.slug}"]`);
  if (cur) cur.setAttribute('aria-current', 'true');

  if (anchor) {
    const t = document.getElementById(anchor);
    const sub = document.querySelector(`.nav ol a[href="#/${p.slug}/${anchor}"]`);
    if (sub) sub.setAttribute('aria-current', 'true');
    if (t) {
      const cityRow = t.closest('.delivery-cities-row');
      if (cityRow) {
        cityRow.hidden = false;
        const toggle = cityRow.previousElementSibling?.querySelector('.delivery-region-toggle');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'true');
          toggle.querySelector('.delivery-region-plus').textContent = '\u2212';
        }
      }
      const disclosure = t.matches('details') ? t : t.closest('details');
      if (disclosure) disclosure.open = true;
      if (p.slug === 'models' && pendingModelOpen === anchor && t.matches('details')) {
        t.open = true;
        pendingModelOpen = '';
      }
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
  window.scrollTo({ top: 0 });
}

/* ---------- поиск ---------- */
let INDEX = [];
let pendingModelOpen = '';

function buildSearchIndex() {
  INDEX = [];
  state.parts.forEach(p => {
    const d = document.createElement('div');
    d.innerHTML = p.html;
    prepareDeliveryContent(d, p);
    const modelCards = [...d.querySelectorAll('.model-card')];
    if (modelCards.length) {
      modelCards.forEach(card => {
        const name = card.querySelector('.model-art')?.textContent || 'Модель';
        INDEX.push({ part: p, h2: name, id: card.id, text: card.textContent.trim() });
      });
      return;
    }
    prepareSearchAnchors(d);
    let h2 = '', h2id = '';
    [...d.children].forEach(node => {
      if (node.tagName === 'H2') { h2 = node.textContent; h2id = node.id; return; }
      if (node.tagName === 'TABLE') {
        node.querySelectorAll('tbody tr.delivery-region-row').forEach(tr => {
          const cells = [...tr.children].map(td => td.textContent.trim());
          const cityRow = tr.nextElementSibling;
          const region = cityRow?.classList.contains('delivery-cities-row')
            ? cityRow.dataset.deliveryRegion
            : cells[0];
          const prices = cells.slice(1).join(' · ');
          INDEX.push({ part: p, h2, id: tr.id || h2id, text: `${region} · ${prices}` });
          if (!cityRow?.classList.contains('delivery-cities-row')) return;
          cityRow.querySelectorAll('[data-delivery-city]').forEach(city => {
            INDEX.push({
              part: p,
              h2: `${h2} · ${cityRow.dataset.deliveryRegion}`,
              id: city.id,
              text: `${city.dataset.deliveryCity} · ${cityRow.dataset.deliveryRegion} · ${prices}`
            });
          });
        });
        return;
      }
      const txt = node.textContent.trim();
      if (txt.length > 12) INDEX.push({ part: p, h2, id: node.id || h2id, text: txt });
    });
  });
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escHtml = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

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
    a.href = h.url ? h.url : '#/' + h.part.slug + '/' + h.id;
    let t = h.text;
    if (t.length > 240) {
      const at = t.search(new RegExp(esc(query), 'i'));
      t = (at > 90 ? '…' : '') + t.slice(Math.max(0, at - 90), Math.max(0, at - 90) + 240) + '…';
    }
    a.innerHTML = `<div class="hit-where">${escHtml(h.part.title)}${h.h2 ? ' · ' + escHtml(h.h2) : ''}</div>
      <p class="hit-text">${t.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
        .replace(new RegExp(esc(query), 'gi'), m => `<mark>${m}</mark>`)}</p>`;
    if (!h.url && h.id) {
      a.addEventListener('click', e => {
        e.preventDefault();
        if (h.part.slug === 'models') pendingModelOpen = h.id;
        $('#q').value = '';
        if ($('#q2')) $('#q2').value = '';
        const target = a.getAttribute('href');
        if (location.hash === target) route();
        else location.hash = target;
      });
    }
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
  $('#nowSlotShort').textContent = early ? 'догон → сегодня 21:00' : 'догон → завтра 08:00';
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

const side = $('#side'), scrim = $('#scrim'), mobileResults = $('#mobileResults');
function openSide() { side.classList.add('open'); scrim.hidden = false; $('#burger').setAttribute('aria-expanded', 'true'); }
function closeSide() { side.classList.remove('open'); scrim.hidden = true; $('#burger').setAttribute('aria-expanded', 'false'); }

function syncMobileSearch(val) {
  const active = val.trim().length >= 2 && window.matchMedia('(max-width: 900px)').matches;
  side.classList.toggle('searching', active);
  mobileResults.hidden = !active;
  mobileResults.innerHTML = active ? $('#results').innerHTML : '';
}

$('#burger').addEventListener('click', () => side.classList.contains('open') ? closeSide() : openSide());
scrim.addEventListener('click', closeSide);
$('#findBtn').addEventListener('click', () => { openSide(); setTimeout(() => $('#q').focus(), 220); });

let timer;
function onSearchInput(val, from) {
  clearTimeout(timer);
  const other = from === 'q' ? '#q2' : '#q';
  const o = $(other); if (o) o.value = val;
  timer = setTimeout(() => {
    search(val);
    syncMobileSearch(val);
  }, 130);
}
$('#q').addEventListener('input', e => onSearchInput(e.target.value, 'q'));
const q2 = $('#q2');
if (q2) q2.addEventListener('input', e => onSearchInput(e.target.value, 'q2'));

mobileResults.addEventListener('click', e => {
  const link = e.target.closest('a.hit');
  if (!link) return;
  const target = link.getAttribute('href') || '';
  if (!target.startsWith('#/')) return;
  e.preventDefault();
  if (target.startsWith('#/models/')) pendingModelOpen = decodeURIComponent(target.split('/').pop());
  $('#q').value = '';
  if ($('#q2')) $('#q2').value = '';
  search('');
  syncMobileSearch('');
  closeSide();
  if (location.hash === target) route();
  else location.hash = target;
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#q').focus(); }
  if (e.key === 'Escape') { $('#q').value = ''; if ($('#q2')) $('#q2').value = ''; search(''); syncMobileSearch(''); $('#q').blur(); closeSide(); }
});

boot();


/* ---- Скачать все файлы артикула одним ZIP-архивом ---- */
// aprellshop.ru не отдаёт CORS, поэтому его файлы тянем через прокси Netlify.
function proxied(url) {
  const m = String(url).match(/^https?:\/\/aprellshop\.ru\/(.*)$/i);
  return m ? '/dl-proxy/' + m[1] : url;
}

// Полноразмерное фото вместо сжатого превью cache_image.
// '.../cache_image/.../goods/0182-1/595025_500x775_8af.jpg' -> '.../goods/0182-1/595025.jpg'
function fullRes(url) {
  let u = String(url);
  const gi = u.indexOf('/goods/');
  if (gi < 0) return u;
  const origin = u.slice(0, u.indexOf('/', u.indexOf('://') + 3));
  let path = u.slice(gi); // начиная с /goods/
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1);
  let file = path.slice(slash + 1);
  const stripped = file.replace(/_\d+x\d+[^/]*$/i, '');
  if (stripped !== file) {
    const ext = (file.match(/\.[a-z0-9]+$/i) || [''])[0];
    file = stripped + ext;
  }
  return origin + dir + file;
}

async function zipDownload(btn) {
  let cfg;
  try { cfg = JSON.parse(btn.dataset.zip); } catch { return; }
  if (typeof JSZip === 'undefined') { alert('Не удалось загрузить архиватор. Обновите страницу.'); return; }
  const label = btn.textContent;
  btn.disabled = true;
  const zip = new JSZip();
  let done = 0, ok = 0;
  const seen = {};
  for (const url of cfg.files) {
    done++;
    btn.textContent = 'Скачиваю ' + done + '/' + cfg.files.length + '…';
    try {
      const src = fullRes(url);
      const res = await fetch(proxied(src));
      if (!res.ok) continue;
      const blob = await res.blob();
      let name = (src.split('/').pop() || 'file').split('?')[0];
      if (seen[name]) name = (++seen[name]) + '-' + name; else seen[name] = 1;
      zip.file(name, blob);
      ok++;
    } catch (e) { /* пропускаем недоступный файл */ }
  }
  if (!ok) {
    btn.textContent = 'Не удалось — попробуйте позже';
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2500);
    return;
  }
  btn.textContent = 'Собираю архив…';
  const out = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(out);
  a.download = String(cfg.name).replace(/[^\w\dа-яё .()-]+/gi, '_') + '.zip';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  btn.textContent = label; btn.disabled = false;
}


/* ---- Замечание менеджера -> Telegram (через Netlify-функцию) ---- */
function openFeedback(section) {
  const prevName = localStorage.getItem('fb_name') || '';
  const back = document.createElement('div');
  back.className = 'fb-back';
  back.innerHTML = `
    <div class="fb-box" role="dialog" aria-modal="true">
      <h3>Замечание к разделу</h3>
      <p class="fb-sec">${section}</p>
      <input class="fb-name" type="text" placeholder="Ваше имя" value="${prevName.replace(/"/g,'&quot;')}" maxlength="80">
      <textarea class="fb-text" rows="5" placeholder="Что поправить или добавить?" maxlength="2000"></textarea>
      <div class="fb-row">
        <button type="button" class="fb-cancel">Отмена</button>
        <button type="button" class="fb-send">Отправить</button>
      </div>
      <p class="fb-msg" hidden></p>
    </div>`;
  document.body.appendChild(back);

  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.querySelector('.fb-cancel').addEventListener('click', close);

  const nameEl = back.querySelector('.fb-name');
  const textEl = back.querySelector('.fb-text');
  const msgEl = back.querySelector('.fb-msg');
  const sendBtn = back.querySelector('.fb-send');
  setTimeout(() => (prevName ? textEl : nameEl).focus(), 50);

  sendBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    const text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }
    localStorage.setItem('fb_name', name);
    sendBtn.disabled = true; sendBtn.textContent = 'Отправляю...';
    msgEl.hidden = true;
    try {
      const res = await fetch('/.netlify/functions/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, section, text })
      });
      if (!res.ok) throw new Error(await res.text());
      msgEl.textContent = 'Спасибо! Замечание отправлено.';
      msgEl.className = 'fb-msg ok'; msgEl.hidden = false;
      setTimeout(close, 1400);
    } catch (e) {
      msgEl.textContent = 'Не удалось отправить. Попробуйте позже.';
      msgEl.className = 'fb-msg err'; msgEl.hidden = false;
      sendBtn.disabled = false; sendBtn.textContent = 'Отправить';
    }
  });
}
