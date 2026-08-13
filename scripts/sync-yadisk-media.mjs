#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_URL = 'https://disk.yandex.ru/d/f0I39Hv9-mUcwQ';
const API = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(HERE, '../katalog/yadisk-media.json');
const MEDIA_RE = /\.(?:jpe?g|png|webp|heic|heif|mp4|mov|m4v)$/i;
const VIDEO_RE = /\.(?:mp4|mov|m4v)$/i;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(folderPath, attempt = 1) {
  const url = new URL(API);
  url.searchParams.set('public_key', PUBLIC_URL);
  url.searchParams.set('path', folderPath);
  url.searchParams.set('limit', '1000');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    if (attempt >= 6) throw new Error(`${folderPath}: ${error.message}`);
    await sleep(attempt * 1500);
    return request(folderPath, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

function modelNumber(name) {
  const match = String(name).match(/(?:^|\s)([A-Za-zА-Яа-я]{0,3}\d{3,5})/);
  return match ? match[1].replace(/^0+(?=\d)/, '') : '';
}

function colorName(folder, model) {
  const clean = String(folder || '')
    .replace(new RegExp(`^${model}\\s*`, 'i'), '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'Без указания цвета';
}

async function listFiles(folderPath) {
  const data = await request(folderPath);
  const items = data._embedded?.items || [];
  const files = items.filter(item => item.type === 'file' && MEDIA_RE.test(item.name));
  const dirs = items.filter(item => item.type === 'dir');
  const nested = await mapLimit(dirs, 4, item => listFiles(item.path));
  return files.concat(...nested);
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

async function main() {
  const root = await request('/');
  const folders = (root._embedded?.items || []).filter(item => item.type === 'dir');
  const groups = await mapLimit(folders, 4, async folder => {
    const model = modelNumber(folder.name);
    if (!model) return null;
    const top = await request(folder.path);
    const items = top._embedded?.items || [];
    const subdirs = items.filter(item => item.type === 'dir');
    const loose = items.filter(item => item.type === 'file' && MEDIA_RE.test(item.name));
    const colors = await mapLimit(subdirs, 3, async subdir => ({
      name: colorName(subdir.name, model),
      files: (await listFiles(subdir.path)).map(file => ({
        name: file.name,
        path: file.path,
        type: VIDEO_RE.test(file.name) ? 'video' : 'image',
        size: file.size || 0
      }))
    }));
    if (loose.length) colors.unshift({
      name: 'Без указания цвета',
      files: loose.map(file => ({
        name: file.name,
        path: file.path,
        type: VIDEO_RE.test(file.name) ? 'video' : 'image',
        size: file.size || 0
      }))
    });
    return { model, folder: folder.name, colors: colors.filter(c => c.files.length) };
  });

  const models = groups.filter(Boolean).sort((a, b) =>
    a.model.localeCompare(b.model, 'ru', { numeric: true }));
  const stats = models.reduce((acc, model) => {
    for (const color of model.colors) for (const file of color.files) {
      acc[file.type === 'video' ? 'videos' : 'images']++;
      acc.bytes += file.size;
    }
    return acc;
  }, { images: 0, videos: 0, bytes: 0 });
  const output = { publicUrl: PUBLIC_URL, syncedAt: new Date().toISOString(), stats, models };
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Saved ${models.length} models, ${stats.images} images and ${stats.videos} videos to ${OUTPUT}`);
}

await main();
