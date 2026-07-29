/* Собирает content/index.json из markdown-файлов. Запускается Netlify при каждом деплое. */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'content');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

const items = files.map(file => {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const meta = {};
  if (m) m[1].split(/\r?\n/).forEach(l => {
    const k = l.match(/^(\w+):\s*(.*)$/);
    if (k) meta[k[1]] = k[2].replace(/^["']|["']$/g, '');
  });
  return { file, title: meta.title || file, order: Number(meta.order || 99) };
}).sort((a, b) => a.order - b.order);

fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(items, null, 2) + '\n');
console.log('index.json: разделов ' + items.length);
