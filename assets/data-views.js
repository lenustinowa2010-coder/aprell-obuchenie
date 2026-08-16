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
  /* полноразмерное фото вместо сжатого превью cache_image */
  const fullRes = u => {
    let x = String(u);
    const gi = x.indexOf('/goods/');
    if (gi < 0) return x;
    const origin = x.slice(0, x.indexOf('/', x.indexOf('://') + 3));
    let path = x.slice(gi);
    const slash = path.lastIndexOf('/');
    const dir = path.slice(0, slash + 1);
    let file = path.slice(slash + 1);
    const stripped = file.replace(/_\d+x\d+[^/]*$/i, '');
    if (stripped !== file) {
      const ext = (file.match(/\.[a-z0-9]+$/i) || [''])[0];
      file = stripped + ext;
    }
    return origin + dir + file;
  };

  const asset = u => /^https?:/i.test(u) ? u : 'katalog/' + String(u).replace(/^\.?\//, '');

  /* встроенный плеер для видеообзоров (VK Clips / YouTube Shorts) */
  function videoEmbed(url) {
    if (!url) return '';
    const u = String(url);
    let src = '';
    const vk = u.match(/clip(-?\d+)_(\d+)/i);
    if (vk) {
      src = 'https://vk.com/video_ext.php?oid=' + vk[1] + '&id=' + vk[2] + '&hd=2';
    } else {
      const yt = u.match(/(?:shorts\/|youtu\.be\/|[?&]v=)([\w-]{6,})/i);
      if (yt) src = 'https://www.youtube.com/embed/' + yt[1];
    }
    if (!src) return `<p><a href="${esc(u)}" target="_blank" rel="noopener">Видеообзор</a></p>`;
    return `<div class="video-embed"><iframe src="${esc(src)}" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen frameborder="0"></iframe></div>` +
      `<p class="meta"><a href="${esc(u)}" target="_blank" rel="noopener">Открыть видео в новой вкладке</a></p>`;
  }

  /* имя файла для скачивания */
  const fileName = u => String(u).split(/[\\/]/).pop().split('?')[0] || 'photo.jpg';

  const modelKey = value => {
    const m = String(value || '').match(/\d{3,5}/);
    return m ? m[0].replace(/^0+(?=\d)/, '') : '';
  };

  const liveUrl = (file, download = false) =>
    '/.netlify/functions/yadisk-media?path=' + encodeURIComponent(file.path) +
    (download ? '&download=1' : '');

  const livePosterUrl = file => liveUrl(file) + '&poster=1';

  function colorTitle(name) {
    const raw = String(name || '').trim().toLowerCase().replace(/ё/g, 'е');
    const titles = {
      'бежевый': 'Бежевая', 'бежевая': 'Бежевая',
      'бежевый замша': 'Бежевая · замша', 'бежевый питон': 'Бежевая · питон',
      'бордо': 'Бордовая', 'бордовый': 'Бордовая', 'бордовый (коричневый)': 'Бордовая · коричневая',
      'черный': 'Чёрная', 'черная': 'Чёрная', 'черный кожа': 'Чёрная · кожа',
      'белый': 'Белая', 'молочный': 'Молочная',
      'коричневый': 'Коричневая', 'коричневый замша': 'Коричневая · замша',
      'темно коричневый': 'Тёмно-коричневая', 'темно-коричневый': 'Тёмно-коричневая',
      'темно коричневая': 'Тёмно-коричневая', 'темно коричневый замша': 'Тёмно-коричневая · замша',
      'красный': 'Красная', 'зеленый': 'Зелёная', 'оливковый': 'Оливковая',
      'синий': 'Синяя', 'голубой': 'Голубая', 'серый': 'Серая',
      'розовый': 'Розовая', 'желтый': 'Жёлтая', 'бежевая кожа': 'Бежевая · кожа'
    };
    return titles[raw] || raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function colorKey(name) {
    const value = String(name || '').toLowerCase().replace(/ё/g, 'е');
    if (!value || /без указания цвета/.test(value)) return '';
    if (/темн.*корич/.test(value)) return 'темно-коричневый';
    const colors = [
      ['корич', 'коричневый'], ['черн', 'черный'], ['беж', 'бежевый'],
      ['борд', 'бордовый'], ['молоч', 'молочный'], ['бел', 'белый'],
      ['тауп', 'тауп'], ['голуб', 'голубой'], ['син', 'синий'],
      ['олив', 'оливковый'], ['зелен', 'зеленый'], ['красн', 'красный'],
      ['сер', 'серый'], ['розов', 'розовый'], ['желт', 'желтый']
    ];
    const found = colors.find(([part]) => value.includes(part));
    return found ? found[1] : value.replace(/[^a-zа-я0-9]+/g, ' ').trim();
  }

  function mediaGroups(live, site, extras, art, extraColor) {
    const liveColors = live && Array.isArray(live.colors) ? live.colors : [];
    const siteColors = Array.isArray(site) ? site.filter(v => Array.isArray(v.i) && v.i.length) : [];
    const groups = liveColors.map(color => ({
      name: color.name,
      key: colorKey(color.name),
      images: color.files.filter(file => file.type === 'image'),
      videos: color.files.filter(file => file.type === 'video'),
      extras: [],
      site: []
    }));

    siteColors.forEach(variant => {
      const key = colorKey(variant.c);
      let group = groups.find(item => item.key && item.key === key);
      if (!group && groups.length === 1 && !groups[0].key && siteColors.length === 1) {
        group = groups[0];
        group.name = variant.c;
        group.key = key;
      }
      if (!group) {
        group = { name: variant.c || 'Цвет не указан', key, images: [], videos: [], extras: [], site: [] };
        groups.push(group);
      }
      group.site.push(...variant.i);
    });

    if (Array.isArray(extras) && extras.length) {
      const key = colorKey(extraColor);
      let group = groups.find(item => key && item.key === key);
      if (!group && groups.length === 1) group = groups[0];
      if (!group) {
        group = { name: extraColor || 'Дополнительные фото', key, images: [], videos: [], extras: [], site: [] };
        groups.push(group);
      }
      group.extras.push(...extras);
    }

    if (!groups.length) return '';
    const rendered = groups.map(color => {
      const imageMedia = color.images.map(file => {
        const view = esc(liveUrl(file));
        const download = esc(liveUrl(file, true));
        return `<div class="shot live-shot">
          <a class="shot-view" href="${view}" target="_blank" rel="noopener">
            <img data-src="${view}" alt="${esc(color.name)}" loading="lazy">
          </a>
          <a class="dl" href="${download}" target="_blank" rel="noopener"
            title="Скачать фото" aria-label="Скачать фото">↓</a>
        </div>`;
      }).join('');
      const videoMedia = color.videos.map(file => {
        const view = esc(liveUrl(file));
        const poster = esc(livePosterUrl(file));
        const download = esc(liveUrl(file, true));
        return `<div class="live-video">
          <button type="button" class="live-video-play" data-video-src="${view}"
            data-video-poster="${poster}" aria-label="Загрузить видео">
            <img data-src="${poster}" alt="Видео: ${esc(color.name)}" loading="lazy">
            <span aria-hidden="true">▶</span>
          </button>
          <a class="dl-vid" href="${download}" target="_blank" rel="noopener">↓ Скачать видео</a>
        </div>`;
      }).join('');
      const extraMedia = color.extras.map(u => {
        const url = esc(asset(u));
        const big = esc(fullRes(asset(u)));
        const name = esc(fileName(fullRes(u)));
        return `<div class="shot">
          <a class="shot-view" href="${big}" target="_blank" rel="noopener">
            <img data-src="${url}" alt="${esc(`${art} · ${color.name || ''}`)}" loading="lazy">
          </a>
          <a class="dl" href="${big}" download="${name}" title="Скачать" aria-label="Скачать">↓</a>
        </div>`;
      }).join('');
      const siteMedia = color.site.map(u => {
        const url = esc(asset(u));
        const big = esc(fullRes(asset(u)));
        const name = esc(fileName(fullRes(u)));
        return `<div class="shot">
          <a class="shot-view" href="${big}" target="_blank" rel="noopener">
            <img data-src="${url}" alt="${esc(`${art} · ${color.name || ''}`)}" loading="lazy">
          </a>
          <a class="dl" href="${big}" download="${name}" title="Скачать" aria-label="Скачать">↓</a>
        </div>`;
      }).join('');
      const photoCount = color.images.length + color.extras.length + color.site.length;
      const media = videoMedia + imageMedia + extraMedia + siteMedia;
      return `<details class="media-color">
        <summary><span class="media-color-title">${esc(colorTitle(color.name))}<i></i></span>
          <span class="media-count">${photoCount} фото · ${color.videos.length} видео</span></summary>
        <div class="live-media-row" data-live-media></div>
        <template class="live-media-template">${media}</template>
      </details>`;
    }).join('');
    return `<section class="live-media"><h3>Фото и видео по цветам</h3>${rendered}</section>`;
  }

  /* «переписать», «не нравится» — это редакторские пометки, не для менеджера */
  const isNote = s => s && s.trim().length > 25;

  const clean = s => String(s || '').replace(/\s*---\s*/g, ' — ').replace(/\s+/g, ' ').trim();

  function zipBtn(list, name) {
    const files = (list || []).filter(Boolean).map(u => asset(u));
    if (files.length < 2) return '';
    const data = esc(JSON.stringify({ name: String(name), files })).replace(/"/g, '&quot;');
    return `<p><button type="button" class="zipall" data-zip="${data}">↓ Скачать всё архивом (${files.length})</button></p>`;
  }

  function shots(list, alt, lazy = false) {
    if (!Array.isArray(list) || !list.length) return '';
    const imgs = list.map(u => {
      const url = esc(asset(u));
      const big = esc(fullRes(asset(u)));
      const name = esc(fileName(fullRes(u)));
      const source = lazy ? `data-src="${url}"` : `src="${url}"`;
      return `<div class="shot">
         <a class="shot-view" href="${big}" target="_blank" rel="noopener">
           <img ${source} alt="${esc(alt)}" loading="lazy">
         </a>
         <a class="dl" href="${big}" download="${name}" title="Скачать" aria-label="Скачать">↓</a>
       </div>`;
    }).join('');
    if (lazy) return `<div class="shots" data-extra-media></div>
      <template class="extra-media-template">${imgs}</template>`;
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
      const price = v.oos
        ? '<span class="stock-out">Нет в наличии</span>'
        : v.oldPrice
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
  function modelPrice(m) {
    const variants = m.site || [];
    const prices = variants.filter(v => !v.oos).map(v => Number(v.price)).filter(n => n > 0);
    if (!prices.length) return variants.length ? '' : (m.price ? money(m.price) : '');
    const min = Math.min(...prices), max = Math.max(...prices);
    return min === max ? money(min) : `от ${money(min)}`;
  }

  function buildModels(models, liveMedia) {
    const liveByModel = {};
    ((liveMedia && liveMedia.models) || []).forEach(item => {
      liveByModel[modelKey(item.model)] = item;
    });
    const chips = models.map(m =>
      `<a class="chip" data-model-chip="${esc([m.art, m.full].filter(Boolean).join(' '))}"
        href="#/models/${encodeURIComponent(slugId(m))}">${esc(m.art)}</a>`).join('');

    const cards = models.map(m => {
      const live = liveByModel[modelKey(m.full || m.art)] || liveByModel[modelKey(m.art)];
      const liveImages = live ? [].concat(...live.colors.map(c => c.files.filter(f => f.type === 'image'))) : [];
      const siteShots = [].concat(...(m.site || []).map(v => v.i || []));
      const extraShots = m.extra || [];
      const allShots = siteShots.concat(extraShots);
      const pieces = [];
      const id = slugId(m);
      const availableShots = []
        .concat(...(m.site || []).filter(v => !v.oos).map(v => v.i || []));
      const previewShot = liveImages[0] ? liveUrl(liveImages[0]) : (availableShots[0] || allShots[0]);
      const preview = previewShot
        ? `<img src="${esc(liveImages[0] ? previewShot : asset(previewShot))}" alt="Модель ${esc(m.art)}" loading="lazy">`
        : '<span class="model-no-photo">Фото пока нет</span>';
      const cardPrice = modelPrice(m);
      const allOut = (m.site || []).length && !(m.site || []).some(v => !v.oos);

      pieces.push(`<h2>${esc(m.art)}${m.full && m.full !== m.art ? ' · ' + esc(m.full) : ''}</h2>`);

      const head = [m.material && clean(m.material), modelPrice(m)]
        .filter(Boolean).join(' · ');
      if (head) pieces.push(`<p class="meta">${esc(head)}</p>`);

      if (isNote(m.status)) pieces.push(`<p class="flag">${esc(m.status)}</p>`);
      if (!(m.site || []).length)
        pieces.push('<p class="flag">На сайте вариантов нет — наличие и цену уточнить перед предложением</p>');
      else if (!(m.site || []).some(v => !v.oos))
        pieces.push('<p class="flag">Все варианты сейчас отсутствуют на сайте — наличие и цену уточнить перед предложением</p>');

      pieces.push(mediaGroups(live, m.site, extraShots, m.art, m.extraColor));
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
        pieces.push(`<h3>Видеообзор</h3>`);
        pieces.push(videoEmbed(m.video));
      }
      if (m.vidLocal) {
        const vurl = esc(asset(m.vidLocal));
        pieces.push(`<p><video src="${vurl}" controls preload="none" class="vid"></video><br><a class="dl dl-vid" href="${vurl}" download="${esc(fileName(m.vidLocal))}">↓ Скачать видео</a></p>`);
      }
      pieces.push(variants(m.site));
      return `<details class="model-card" id="${id}"
        data-model-number="${esc([m.art, m.full].filter(Boolean).join(' '))}">
        <summary class="model-summary">
          <span class="model-preview">${preview}</span>
          <span class="model-summary-text">
            <strong class="model-art">${esc(m.art)}</strong>
            ${m.full && m.full !== m.art ? `<span class="model-full">${esc(m.full)}</span>` : ''}
            ${m.material ? `<span class="model-material">${esc(clean(m.material))}</span>` : ''}
            ${cardPrice ? `<span class="model-price">${cardPrice}</span>` : ''}
            ${allOut ? '<span class="model-stock">Нет в наличии</span>' : '<span class="model-open-label">Открыть карточку</span>'}
          </span>
        </summary>
        <div class="model-detail">${pieces.filter(Boolean).join('\n')}</div>
      </details>`;
    }).join('\n');

    return `<p class="lead">Цены и фото приходят из базы каталога. Готовый текст —
      тот же, что в шаблонах амо: прочитать, подставить имя и цвет, отправить.</p>
      <div class="model-finder">
        <label for="model-q">Найти модель по номеру</label>
        <input id="model-q" type="search" inputmode="search" autocomplete="off"
          placeholder="Например: 5114 или W5125">
        <p class="model-count" id="model-count">Показано: ${models.length}</p>
      </div>
      <div class="chips model-chips" aria-label="Все модели">${chips}</div>
      <div class="model-grid">${cards}</div>`;
  }

  const slugId = m => 'm-' + String(m.art).toLowerCase().replace(/[^\wа-яё\d]+/gi, '-').replace(/^-|-$/g, '');

  /* -------------------------------------------------------- аксессуары ---- */
  function buildAcc(acc, liveMedia) {
    const liveByModel = {};
    ((liveMedia && liveMedia.models) || []).forEach(item => {
      liveByModel[modelKey(item.model)] = item;
    });
    const body = acc.map(a => {
      const pieces = [`<h2 id="a-${esc(String(a.art).toLowerCase().replace(/[^\wа-яё\d]+/gi, '-'))}">${esc(a.art)}</h2>`];
      const head = [a.material && clean(a.material), a.price && money(a.price)].filter(Boolean).join(' · ');
      if (head) pieces.push(`<p class="meta">${esc(head)}</p>`);
      pieces.push(mediaGroups(
        liveByModel[modelKey(a.full || a.art)] || liveByModel[modelKey(a.art)],
        [], [], a.art, ''
      ));
      const accShots = []
        .concat(a.i || [], a.shots || [], a.photos || [],
          ...(a.site || []).map(v => v.i || []));
      if (accShots.length) pieces.push(shots(accShots, a.art));
      pieces.push(zipBtn([].concat(accShots, (a.vid||a.vidLocal) ? [a.vid||a.vidLocal] : []), a.art));
      const accVid = a.vid || a.vidLocal;
      if (accVid) {
        const vurl = esc(asset(accVid));
        pieces.push(`<p><video src="${vurl}" controls preload="none" class="vid"></video><br><a class="dl dl-vid" href="${vurl}" download="${esc(fileName(accVid))}">↓ Скачать видео</a></p>`);
      }
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
        html: buildModels(d.models, d.liveMedia)
      });
    if (Array.isArray(d.acc) && d.acc.length)
      out.push({
        slug: 'accessories', title: 'Аксессуары', order: 7, noSub: true,
        subtitle: plural(d.acc.length, ['позиция', 'позиции', 'позиций']) + ': подвесы, перчатки, шапки',
        html: buildAcc(d.acc, d.liveMedia)
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
