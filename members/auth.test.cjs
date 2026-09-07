const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const hash = createHash('sha256').update('test-password').digest('hex');
const code = readFileSync(path.join(__dirname, 'auth.js'), 'utf8');

function setup({ stored = null, storageBlocked = false, configuredHash = hash } = {}) {
  class Element {
    constructor() { this.events = {}; this.attrs = {}; this.hidden = false; this.value = ''; this.children = []; }
    addEventListener(type, listener) { this.events[type] = listener; }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
    append(node) { this.children.push(node); }
    focus() { this.focused = true; }
    select() { this.selected = true; }
    querySelector(selector) { return this.parts[selector]; }
  }
  const root = new Element(); root.setAttribute('data-members-locked', '');
  const body = new Element(), nav = new Element(), main = new Element();
  let gate, timer;
  const events = {}, windowEvents = {};
  const document = {
    documentElement: root, currentScript: { src: 'https://example.test/members/auth.js' }, body,
    addEventListener(type, listener) { events[type] = listener; },
    dispatchEvent(event) { events[event.type]?.(); },
    querySelector(selector) { return selector === '.nav' ? nav : main; },
    createElement(tag) {
      const element = new Element();
      if (tag === 'section') {
        gate = element;
        gate.parts = Object.fromEntries(['form', 'input', 'button', '[role="status"]'].map(key => [key, new Element()]));
      }
      return element;
    }
  };
  const storage = {
    getItem() { if (storageBlocked) throw Error(); return stored; },
    setItem(key, value) { if (storageBlocked) throw Error(); stored = value; },
    removeItem() { if (storageBlocked) throw Error(); stored = null; }
  };
  const context = { document, window: { MEMBERS_AUTH: { passwordHash: configuredHash, sessionHours: 8 }, addEventListener(type, fn) { windowEvents[type] = fn; } }, sessionStorage: storage, URL, Event, TextEncoder, crypto: webcrypto, setTimeout(fn) { timer = fn; return 1; }, clearTimeout() {} };
  vm.runInNewContext(code, context);
  events.DOMContentLoaded();
  return { root, gate, nav, events, windowEvents, storage, timer: () => timer(), stored: () => stored, async submit(password) {
    gate.parts.input.value = password;
    await gate.parts.form.events.submit({ preventDefault() {} });
  } };
}

test('wrong password remains locked; correct password persists without storing plaintext; logout clears it', async () => {
  const app = setup();
  assert('data-members-locked' in app.root.attrs);
  await app.submit('wrong');
  assert('data-members-locked' in app.root.attrs);
  assert.match(app.gate.parts['[role="status"]'].textContent, /違います/);
  await app.submit('test-password');
  assert(!('data-members-locked' in app.root.attrs));
  assert(app.gate.hidden);
  assert(!app.stored().includes('test-password'));
  assert.equal(app.gate.parts.input.value, '');
  app.nav.children[0].events.click();
  assert('data-members-locked' in app.root.attrs);
  assert.equal(app.stored(), null);
});

test('valid session opens deep pages; expired or old-password sessions remain locked', () => {
  const valid = setup({ stored: JSON.stringify({ hash, expiresAt: Date.now() + 60000 }) });
  assert(!('data-members-locked' in valid.root.attrs));
  for (const value of [{ hash, expiresAt: 1 }, { hash: 'old', expiresAt: Date.now() + 60000 }]) {
    assert('data-members-locked' in setup({ stored: JSON.stringify(value) }).root.attrs);
  }
});

test('back-forward cache cannot restore a logged-out session; timeout locks the current page', async () => {
  const app = setup(); await app.submit('test-password');
  app.storage.removeItem(); app.windowEvents.pageshow();
  assert('data-members-locked' in app.root.attrs);
  await app.submit('test-password'); app.timer();
  assert('data-members-locked' in app.root.attrs);
});

test('unavailable storage still allows this page; missing config fails closed', async () => {
  const app = setup({ storageBlocked: true }); await app.submit('test-password');
  assert(!('data-members-locked' in app.root.attrs));
  const missing = setup({ configuredHash: '' }); await missing.submit('test-password');
  assert('data-members-locked' in missing.root.attrs);
  assert.match(missing.gate.parts['[role="status"]'].textContent, /設定が完了/);
});

test('all 11 member pages carry static noindex, gate and valid local assets; source exclusion is configured', () => {
  const pages = ['index.html', ...readdirSync(path.join(__dirname, 'itlit')).filter(file => file.endsWith('.html')).map(file => `itlit/${file}`)];
  assert.equal(pages.length, 11);
  for (const file of pages) {
    const html = readFileSync(path.join(__dirname, file), 'utf8');
    assert.match(html, /<html[^>]+data-members-locked/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    assert.match(html, /src="(?:\.\.\/)?auth.js"/);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = match[1].split('#')[0];
      if (!url || /^[a-z]+:/i.test(url)) continue;
      assert(existsSync(path.resolve(__dirname, path.dirname(file), url)), `${file}: ${url}`);
    }
  }
  const config = readFileSync(path.join(__dirname, '../_config.yml'), 'utf8');
  assert.match(config, /- members\/itlit\/content/);
  assert.match(config, /- members\/auth.test.cjs/);
});
