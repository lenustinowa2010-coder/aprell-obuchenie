const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
const loader = source.slice(source.indexOf('/* ---------- загрузка'), source.indexOf('/* ---------- навигация'));
const router = source.slice(source.indexOf('async function route()'), source.indexOf('/* ---------- события'));
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/index.json')));
function harness(fetch) {
  const nodes = new Map();
  const node = () => ({ value: '', hidden: false, children: [],
    appendChild(x) { this.children.push(x); }, replaceChildren(...x) { this.children = x; },
    addEventListener() {}, setAttribute() {} });
  const get = key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
  const rendered = [], deferred = [];
  const state = { parts: [], byslug: {}, links: [], cdekCities: {}, current: null };
  const context = vm.createContext({ state, fetch, AbortController,
    console: { error() {} }, CONTENT_VERSION: 'test',
    $: get, el: node, document: { querySelector: () => null },
    location: { hash: '', reload() {} },
    marked: { setOptions() {}, parse: text => text },
    setTimeout: (f, delay) => { if (!delay) deferred.push(f); return delay; }, clearTimeout() {}, setInterval() {},
    tickNow() {}, buildNav() {}, buildSearchIndex() {}, closeSide() {}, search() {}, syncMobileSearch() {},
    splitFront: raw => ({ meta: {}, body: raw }),
    render: (slug, anchor) => { state.current = slug; rendered.push({ slug, anchor }); },
    window: { buildDataParts: () => ['models', 'accessories', 'materials', 'faq'].map(slug => ({slug, html:'catalog'})) }
  });
  vm.runInContext(loader + router, context);
  return { context, state, rendered, deferred, nodes, run: code => vm.runInContext(code, context) };
}
const response = value => ({ ok:true, status:200, json:async()=>structuredClone(value), text:async()=>value });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('first section renders with one request, before any catalog request', async () => {
  const calls=[];
  const h=harness(async url => { calls.push(url); assert.equal(url,'content/index.json'); return response(bundle); });
  await h.run('boot()');
  assert.equal(h.rendered[0].slug,'01-amocrm');
  assert.deepEqual(calls,['content/index.json']);
  assert.equal(h.deferred.length,1);
});

test('catalog requests run concurrently and are shared; late catalog cannot replace newer section', async () => {
  const waiting=new Map(), calls=[];
  const h=harness(async url => {
    calls.push(url);
    if(url==='content/index.json') return response(bundle);
    return await new Promise(resolve => waiting.set(url,resolve));
  });
  await h.run('boot()');
  h.context.location.hash='#/models';
  const oldRoute=h.run('route()');
  const sameLoad=h.run('loadCatalogParts()');
  await flush();
  assert.equal(waiting.size,3);
  h.context.location.hash='#/05-promo';
  await h.run('route()');
  for(const [url,resolve] of waiting) resolve(response(url.endsWith('data.json') ? {models:[]} : {items:[],models:[]}));
  await Promise.all([oldRoute,sameLoad]);
  assert.equal(h.rendered.at(-1).slug,'05-promo');
  assert.equal(calls.filter(x=>x==='katalog/data.json').length,1);
});

test('a failed catalog does not block reading rules; navigation retries failed requests', async () => {
  let failed=true, attempts=0;
  const h=harness(async url => {
    if(url==='content/index.json') return response(bundle);
    if(url==='katalog/data.json') { attempts++; if(failed) return {ok:false,status:503}; }
    return response({models:[],items:[]});
  });
  await h.run('boot()');
  h.context.location.hash='#/models';
  await h.run('route()');
  assert.equal(h.nodes.get('#doc').children[0].children[0].textContent,'Повторить');
  h.context.location.hash='#/02-script';
  await h.run('route()');
  assert.equal(h.rendered.at(-1).slug,'02-script');
  failed=false;
  h.context.location.hash='#/models';
  await h.run('route()');
  assert.equal(h.rendered.at(-1).slug,'models');
  assert.equal(attempts,2);
});

test('delivery deep link waits for cities and preserves its anchor', async () => {
  let finish;
  const h=harness(async url => {
    if(url==='content/index.json') return response(bundle);
    assert.equal(url,'content/cdek-cities.json');
    return await new Promise(resolve=>{finish=resolve;});
  });
  h.context.location.hash='#/03-delivery/'+encodeURIComponent('москва');
  const loading=h.run('boot()');
  await flush();
  assert.equal(h.rendered.length,0);
  finish(response({'Москва':['Москва']}));
  await loading;
  assert.equal(h.rendered[0].slug,'03-delivery');
  assert.equal(h.rendered[0].anchor,'москва');
});

test('early search cannot start background loading before the manifest exists', async () => {
  const h=harness(()=>{throw Error('unexpected fetch');});
  await h.run('prepareBackground()');
  assert.equal(h.run('backgroundReady'),undefined);
});

test('bundled text matches all source documents, without stale generated content', () => {
  for(const item of bundle) {
    const raw=fs.readFileSync(path.join(__dirname,'../content',item.file),'utf8');
    const body=raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trimStart();
    assert.equal(item.body,body,item.file);
  }
});
