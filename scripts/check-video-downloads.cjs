const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p)));
const small = read('katalog/video-small/manifest.json');
const reviews = read('katalog/video-reviews/manifest.json');
const catalog = read('katalog/data.json');
const live = read('katalog/yadisk-media.json');
for (const [key, entry] of Object.entries({...small, ...reviews})) {
  assert(entry.size > 0 && entry.size <= 9500000, `Invalid size: ${key}`);
  if (entry.url.startsWith('/katalog/')) {
    assert.equal(fs.statSync(path.join(root, entry.url)).size, entry.size, `File size: ${key}`);
  }
  if (entry.original) assert(fs.existsSync(path.join(root, entry.original)), `Original: ${key}`);
}
for (const model of live.models) for (const color of model.colors) for (const file of color.files) {
  if (file.type === 'video') assert(small[file.url || file.path], `Missing compressed version: ${file.name}`);
}
for (const model of catalog.models) if (model.video) assert(reviews[model.video], `Missing review: ${model.video}`);
const context = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/data-views.js'), 'utf8'), context);
const parts = context.window.buildDataParts({...catalog, liveMedia: live, smallVideos: {...small, ...reviews}});
for (const part of parts.filter(p => ['models','accessories'].includes(p.slug))) {
  assert(!part.html.includes('Сжатая версия недоступна'), `Incomplete download buttons: ${part.slug}`);
  const videos = (part.html.match(/class="live-video-play"|<video /g) || []).length;
  const normal = (part.html.match(/>Скачать<\/a>/g) || []).length;
  const compressed = (part.html.match(/>Скачать до 10 МБ<\/a>/g) || []).length;
  assert.equal(normal, videos, `${part.slug}: original button count`);
  assert.equal(compressed, videos, `${part.slug}: compressed button count`);
  console.log(`${part.slug}: ${videos} videos, ${normal} original and ${compressed} compressed download buttons`);
}
console.log(`Verified ${Object.keys(small).length} catalog downloads and ${Object.keys(reviews).length} video reviews.`);
