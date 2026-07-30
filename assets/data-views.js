/* APRELL — каталог как разделы обучения.
   Читает katalog/data.json и строит HTML для разделов:
   Модели · Аксессуары · Материалы и уход · Частые вопросы.
   Данные не дублируются: скрипты пишут data.json, сайт его показывает. */

(function () {

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const money = n => (n || n === 0)
    ? Number(n).toLocaleString('ru-RU').replace(/\u00A0/g, ' ') + ' ₽' : '';

  /* локальные пути в data.json заданы относительно папки katalog/ */
  const asset = u => /^https?:/i.test(u) ? u : 'katalog/' + String(u).replace(/^\.?\//, '');

  /* имя файла для скачивания */
  const fileName = u => String(u).split(/[\\/]/).pop().split('?')[0] || 'photo.jpg';

  /* «переписать», «не нравится» — это редакторские пометки, не для менеджера */
  const isNote = s => s && s.trim().length > 25;

  const clean = s => String(s || '').replace(/\s*---\s*/g, ' — ').replace(/\s+/g, ' ').trim();

  function shots(list, alt) {
    if (!Array.isArray(list) || !list.length) return '';
    const imgs = list.slice(0, 6).map(u => {
      const url = esc(asset(u));
      const name = esc(fileName(u));
      return `<div class="shot">
         <a class="shot-view" href="${url}" target="_blank" rel="noopener">
           <img src="${url}" alt="${esc(alt)}" loading="lazy">
         </a>
         <a class="dl" href="${url}" download="${name}" title="Скачать" aria-label="Скачать">↓</a>
       </div>`;
    }).join('');
    return `<div class="shots">${imgs}</div>`;
  }

  function specs(m) {
    const rows = [
      ['Материал', m.material], ['Подкладка', m.lining],
      ['Размеры', m.dims], ['Вес', m.weight], ['Ремень и ручки', m.strap],
      ['Категория', m.cat]
    ].filter(r => r[1] && String(r[1]).trim() && String(r[1]).trim() !== ':');
    if (!rows.length) return '';
    return `<table><tbody>${rows.map(r =>
      `<tr><td>${esc(r[0])}</td><td>${esc(clean(r[1]))}</td></tr>`).join('')}</tbody></table>`;
  }

  function variants(list) {
    if (!Array.isArray(list) || !list.length) return '';
    const rows = list.map(v => {
      const price = v.oldPrice
        ? `<strong>${money(v.price)}</strong> <span class="was">${money(v.oldPrice)}</span>`
        : (v.price ? money(v.price) : '—');
      const link = v.u ? `<a href="${esc(v.u)}" target="_blank" rel="noopener">на сайте</a>` : '';
      return `<tr><td>${esc(v.c || '—')}</td><td>${esc(v.a || '')}</td><td>${price}</td><td>${link}</td></tr>`;
    }).join('');
    return `<h3>Цвета и цены</h3>
      <table><thead><tr><th>Цвет</th><th>Артикул</th><th>Цена</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  /* ------------------------------------------------------------ модели ---- */
  function buildModels(models) {
    const chips = models.map(m =>
      `<a class="chip" href="#/models/${encodeURIComponent(slugId(m))}">${esc(m.art)}</a>`).join('');

    const body = models.map(m => {
      const allShots = []
        .concat(...(m.site || []).map(v => v.i || []));
      const pieces = [];

      pieces.push(`<h2 id="${slugId(m)}">${esc(m.art)}${m.full && m.full !== m.art ? ' · ' + esc(m.full) : ''}</h2>`);

      const head = [m.material && clean(m.material), m.price && money(m.price)]
        .filter(Boolean).join(' · ');
      if (head) pieces.push(`<p class="meta">${esc(head)}</p>`);

      if (isNote(m.status)) pieces.push(`<p class="flag">${esc(m.status)}</p>`);
      if (!(m.site || []).length)
        pieces.push('<p class="flag">На сайте вариантов нет — наличие и цену уточнить перед предложением</p>');

      pieces.push(shots(allShots, m.art));
      pieces.push(specs(m));

      if (m.features) pieces.push(`<p>${esc(clean(m.features))}</p>`);

      const talk = m.pres || m.answer;
      if (talk) {
        pieces.push(`<h3>Презентация модели</h3>`);
        if (!m.pres) pieces.push('<p class="meta">Презентации нет — текст из старого шаблона, сверить перед отправкой</p>');
        pieces.push(`<blockquote>${esc(talk).replace(/\n/g, '<br>')}</blockquote>`);
      } else {
        pieces.push('<p class="flag">Готовой презентации нет — составить перед тем, как предлагать модель</p>');
      }
      if (m.video) {
        pieces.push(`<p><a href="${esc(m.video)}" target="_blank" rel="noopener">Видеообзор</a></p>`);
      }
      if (m.vidLocal) {
        const vurl = esc(asset(m.vidLocal));
        pieces.push(`<p><video src="${vurl}" controls preload="none" class="vid"></video><br><a class="dl dl-vid" href="${vurl}" download="${esc(fileName(m.vidLocal))}">↓ Скачать видео</a></p>`);
      }
      pieces.push(variants(m.site));
      return pieces.filter(Boolean).join('\n');
    }).join('\n<hr>\n');

    return `<p class="lead">Цены и фото приходят из базы каталога. Готовый текст —
      тот же, что в шаблонах амо: прочитать, подставить имя и цвет, отправить.</p>
      <div class="chips">${chips}</div>${body}`;
  }

  const slugId = m => 'm-' + String(m.art).toLowerCase().replace(/[^\wа-яё\d]+/gi, '-').replace(/^-|-$/g, '');

  /* -------------------------------------------------------- аксессуары ---- */
  function buildAcc(acc) {
    const body = acc.map(a => {
      const pieces = [`<h2 id="a-${esc(String(a.art).toLowerCase().replace(/[^\wа-яё\d]+/gi, '-'))}">${esc(a.art)}</h2>`];
      const head = [a.material && clean(a.material), a.price && money(a.price)].filter(Boolean).join(' · ');
      if (head) pieces.push(`<p class="meta">${esc(head)}</p>`);
      const accShots = []
        .concat(a.i || [], a.shots || [], a.photos || [],
          ...(a.site || []).map(v => v.i || []));
      if (accShots.length) pieces.push(shots(accShots, a.art));
      if (a.offline) pieces.push('<p class="flag">Только в офлайн-магазинах — в директе не предлагаем</p>');
      if (a.colors) pieces.push(`<p><strong>Цвета:</strong> ${esc(clean(a.colors))}</p>`);
      if (a.features) pieces.push(`<p>${esc(clean(a.features))}</p>`);
      return pieces.join('\n');
    }).join('\n<hr>\n');
    return `<p class="lead">Подвесы, перчатки, шапки, бумажники и модели, которые
      есть только в офлайне.</p>${body}`;
  }

  /* ---------------------------------------------------------- материалы ---- */
  function buildMats(mats) {
    return mats.map(r => `
      <h2 id="mat-${slugTxt(r[0])}">${esc(r[0])}</h2>
      ${r[1] ? `<p>${esc(r[1])}</p>` : ''}
      ${r[2] && r[2] !== '—' ? `<p><strong>Честные минусы:</strong> ${esc(r[2])}</p>` : ''}
      ${r[3] ? `<h3>Уход</h3><p>${esc(r[3])}</p>` : ''}
      ${r[4] && r[4] !== '—' ? `<p><strong>Средства Collonil:</strong> ${r[4]}</p>` : ''}
    `).join('\n');
  }

  /* --------------------------------------------------------------- FAQ ---- */
  function buildFaq(faq) {
    const groups = {};
    faq.forEach(r => (groups[r[0]] = groups[r[0]] || []).push(r));
    return `<p class="lead">Отвечаем своими словами, но смысл и факты — отсюда.
      Каждый ответ заканчиваем вопросом.</p>` +
      Object.keys(groups).map(cat => `
        <h2 id="faq-${slugTxt(cat)}">${esc(cat)}</h2>
        ${groups[cat].map(r => `
          <h3>${esc(r[1])}</h3>
          <blockquote>${esc(r[2])}</blockquote>`).join('')}
      `).join('\n');
  }

  /* 1 модель / 2 модели / 5 моделей */
  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return n + ' ' + forms[2];
    if (b > 1 && b < 5) return n + ' ' + forms[1];
    if (b === 1) return n + ' ' + forms[0];
    return n + ' ' + forms[2];
  }

  const slugTxt = s => String(s || '').toLowerCase().trim()
    .replace(/[^\wа-яё\s-]/gi, '').replace(/\s+/g, '-').slice(0, 40);

  /* ------------------------------------------------------------ сборка ---- */
  window.buildDataParts = function (d) {
    const out = [];
    if (Array.isArray(d.models) && d.models.length)
      out.push({
        slug: 'models', title: 'Модели', order: 6, noSub: true,
        subtitle: plural(d.models.length, ['модель', 'модели', 'моделей']) + ': цены, фото, готовый текст',
        html: buildModels(d.models)
      });
    if (Array.isArray(d.acc) && d.acc.length)
      out.push({
        slug: 'accessories', title: 'Аксессуары', order: 7, noSub: true,
        subtitle: plural(d.acc.length, ['позиция', 'позиции', 'позиций']) + ': подвесы, перчатки, шапки',
        html: buildAcc(d.acc)
      });
    if (Array.isArray(d.mats) && d.mats.length)
      out.push({
        slug: 'materials', title: 'Материалы и уход', order: 8,
        subtitle: 'Что говорить про кожу и замшу',
        html: buildMats(d.mats)
      });
    if (Array.isArray(d.faq) && d.faq.length)
      out.push({
        slug: 'faq', title: 'Частые вопросы', order: 9,
        subtitle: plural(d.faq.length, ['готовый ответ', 'готовых ответа', 'готовых ответов']),
        html: buildFaq(d.faq)
      });
    return out;
  };

})();
