const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'teamCheck.js'), 'utf8')
  .replace(/^import .*;\r?\n/, '').replace('export function', 'function');

function setup(saved = {}) {
  const timers = new Map(), posts = [], listeners = {};
  let sequence = 0;
  class Element {
    constructor() { this.value = ''; this.handlers = {}; this.children = []; this.hidden = false; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    dispatch(type) { for (const handler of this.handlers[type] || []) handler({ preventDefault() {} }); }
    appendChild(child) { this.children.push(child); }
    setAttribute(name, value) { this[name] = value; }
    setCustomValidity(message) { this.customError = message; }
    reportValidity() { this.reported = true; return this.validity.valid; }
    get validity() { return { valid: !this.validationMessage }; }
    get validationMessage() {
      if (this.customError) return this.customError;
      if (!this.value) return '必須項目です。';
      if (this.id === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value)) return 'メールアドレスの形式を確認してください。';
      return '';
    }
    submit() { posts.push(Object.fromEntries(this.children.map(input => [input.name, input.value]))); }
  }
  const elements = {};
  for (const id of ['teamName', 'email', 'team-status', 'check-team', 'submitting']) {
    elements[id] = new Element(); elements[id].id = id; elements[id].value = saved[id] || '';
  }
  const context = vm.createContext({
    GAS_WEB_APP_URL: 'https://script.google.com/macros/s/test/exec', GAS_MESSAGE_SOURCE: 'khb2027',
    document: { getElementById: id => elements[id], createElement: () => new Element(), body: new Element() },
    window: { location: { origin: 'http://127.0.0.1:8766' }, addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); } },
    crypto: { randomUUID: () => `request-${++sequence}` },
    setTimeout: (handler, delay) => { const id = ++sequence; timers.set(id, { handler, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source, context);
  const form = new Element();
  const controller = context.setupTeamCheck(form);
  const check = () => elements['check-team'].dispatch('click');
  function tick(delay) {
    for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.handler(); }
  }
  function input(id, value) { elements[id].value = value; elements[id].dispatch('input'); }
  function reply(post, extra = {}, origin = 'https://script.google.com') {
    for (const handler of listeners.message) handler({ origin, data: {
      source: 'khb2027', action: 'check-team', ok: true, requestId: post.requestId, ...extra,
    } });
  }
  return { elements, posts, tick, input, reply, controller, listeners, check, form };
}

test('入力だけでは照合せず、「次へ」で入力条件を検証し、俳句を送信せずチームを照合する', () => {
  const s = setup();
  assert.equal(s.elements['team-status'].textContent, '', '未入力では案内領域を表示しない');
  s.check(); assert.equal(s.elements.teamName.reported, true);
  s.input('teamName', 'チームＡ'); s.tick(400); s.check();
  assert.equal(s.posts.length, 0);
  s.input('email', 'Team@example'); s.tick(400); s.check();
  assert.equal(s.elements.email.reported, true);
  assert.equal(s.posts.length, 0);
  s.input('email', 'Team@example.com');
  assert.equal(s.posts.length, 0);
  s.tick(400);
  assert.equal(s.posts.length, 0, '入力が揃っても自動照合しない');
  s.check();
  assert.equal(s.posts.length, 1);
  assert.equal(s.elements['check-team'].disabled, true);
  s.check(); assert.equal(s.posts.length, 1, '二重クリックでは再送しない');
  assert.deepEqual(Object.keys(s.posts[0]).sort(), ['action', 'email', 'requestId', 'responseOrigin', 'teamName']);
  assert.equal(s.posts[0].responseOrigin, 'http://127.0.0.1:8766');
  assert.equal(s.posts[0].email, 'Team@example.com');
  assert.equal(s.elements.submitting.disabled, true);
  s.reply(s.posts[0]);
  assert.equal(s.controller.isVerified(), true);
  assert.equal(s.elements.submitting.disabled, false);
  assert.equal(s.elements['check-team'].hidden, true);
  s.elements.email.dispatch('change'); s.tick(400);
  assert.equal(s.posts.length, 1, 'フォーカスを外すだけでは再送しない');
});

test('入力変更で成功を解除し、古い応答・別処理・別オリジンを採用しない', () => {
  const s = setup({ teamName: 'チームＡ', email: 'Team@example.com' });
  s.tick(400); assert.equal(s.posts.length, 0); s.check(); const first = s.posts[0]; s.reply(first);
  s.input('teamName', 'チームＢ');
  assert.equal(s.controller.isVerified(), false);
  assert.equal(s.elements.submitting.disabled, true);
  assert.equal(s.elements['check-team'].hidden, false);
  s.tick(400); assert.equal(s.posts.length, 1); s.check(); const second = s.posts[1];
  s.reply(first); s.reply(second, { action: 'submit-submission' });
  s.reply(second, {}, 'https://example.com');
  s.reply(second, {}, 'https://evilgoogleusercontent.com');
  s.reply(second, { ok: 'true' });
  assert.equal(s.controller.isVerified(), false);
  s.reply(second, {}, 'https://n-test.googleusercontent.com');
  assert.equal(s.controller.isVerified(), true);
});

test('不一致を表示し、タイムアウトと再試行後には遅延応答を無視する', () => {
  const s = setup({ teamName: 'チームＡ', email: 'Team@example.com' });
  s.check();
  s.reply(s.posts[0], { ok: false, message: 'エントリーと一致しません。' });
  assert.match(s.elements['team-status'].textContent, /一致しません/);
  assert.equal(s.elements['check-team'].hidden, false);
  assert.equal(s.elements['check-team'].disabled, false);
  s.check(); const expired = s.posts[1];
  s.tick(30000); s.reply(expired);
  assert.equal(s.controller.isVerified(), false);
  assert.match(s.elements['team-status'].textContent, /受信できません/);
  s.check();
  s.reply(expired); assert.equal(s.controller.isVerified(), false);
  s.reply(s.posts[2]); assert.equal(s.controller.isVerified(), true);
});

test('IME変換中は「次へ」でも照合せず、確定後もクリックするまで照合しない', () => {
  const s = setup({ teamName: 'チームＡ', email: 'Team@example.com' });
  s.elements.teamName.dispatch('compositionstart');
  s.input('teamName', 'チームＢ'); s.tick(400); s.check();
  assert.equal(s.posts.length, 0);
  s.elements.teamName.dispatch('compositionend'); s.tick(400);
  assert.equal(s.posts.length, 0);
  s.check();
  assert.equal(s.posts.length, 1);
  assert.equal(s.posts[0].teamName, 'チームＢ');
});

test('前後空白・文字数超過は値を直さず拒否し、空欄に戻すと成功を解除する', () => {
  const s = setup({ teamName: ' チームＡ', email: 'Team@example.com' });
  s.check(); assert.equal(s.posts.length, 0);
  assert.equal(s.elements.teamName.value, ' チームＡ');
  s.input('teamName', 'あ'.repeat(201)); s.check(); assert.equal(s.posts.length, 0);
  s.input('teamName', 'チームＡ'); s.check(); s.reply(s.posts[0]);
  s.input('email', '');
  assert.equal(s.controller.isVerified(), false);
  assert.equal(s.elements.submitting.disabled, true);
});

test('登録人数は検証済みのチームにだけ結び付け、チーム情報を書き換えたら解除する', () => {
  const s = setup({ teamName: 'チームＡ', email: 'Team@example.com' });
  assert.equal(s.controller.getMemberCount(), null);
  s.check(); s.reply(s.posts[0], { memberCount: 3 });
  assert.equal(s.controller.getMemberCount(), 3);
  s.input('teamName', 'チームＢ');
  assert.equal(s.controller.getMemberCount(), null);
  s.check(); s.reply(s.posts[1], { memberCount: 5 });
  assert.equal(s.controller.getMemberCount(), 5);
});

test('復元された入力とページ再表示後の入力は「次へ」を押してから再確認する', () => {
  const s = setup({ teamName: 'チームＡ', email: 'Team@example.com' });
  s.tick(400); assert.equal(s.posts.length, 0); s.check(); s.reply(s.posts[0]);
  for (const handler of s.listeners.pageshow) handler();
  assert.equal(s.controller.isVerified(), false);
  s.tick(400); assert.equal(s.posts.length, 1);
  s.check(); assert.equal(s.posts.length, 2);
});

test('チーム情報欄でのEnterによる送信も照合だけを実行する', () => {
  const s = setup({ teamName: 'チームＡ', email: 'Team@example.com' });
  s.form.dispatch('submit');
  assert.equal(s.posts.length, 1);
  assert.equal(s.posts[0].action, 'check-team');
  assert.equal(s.controller.isVerified(), false);
  s.form.dispatch('submit'); assert.equal(s.posts.length, 1);
});
