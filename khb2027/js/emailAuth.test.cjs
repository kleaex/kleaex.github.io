const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const source = read('formFields.js') + '\n' + read('authorRules.js') + '\n' + read('emailAuth.js');
const html = fs.readFileSync(path.join(__dirname, '../submit.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));

function setup(saved = null, { integrated = false } = {}) {
  const state = { now: 1800000000000, teamVerified: false, storage: new Map(), posts: [], timers: new Map(), listeners: {}, changes: 0 };
  let sequence = 0;
  const elements = {};
  class Element {
    constructor(tag = 'input') { this.tag = tag; this.children = []; this.handlers = {}; this._value = ''; this.disabled = false; }
    get value() { return this._value; }
    set value(value) { this._value = this.tag === 'select' && !this.children.some(child => child.value === value) ? '' : value; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; this._value = ''; }
    replaceWith(node) { elements[this.id] = node; }
    setCustomValidity(message) { this.validationMessage = message; }
    reportValidity() { return this.validity.valid; }
    focus() { state.focused = this.id; }
    get validity() { return { valid: !this.validationMessage && (!this.required || Boolean(this.value)) }; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    dispatch(type) { for (const handler of this.handlers[type] || []) handler({ preventDefault() { state.prevented = true; } }); }
  }
  class Form extends Element {
    submit() { if (state.throwPost) throw new Error('transport error'); state.posts.push(Object.fromEntries(this.children.map(child => [child.name, child.value]))); }
    reportValidity() { return fields.every(id => elements[id].validity.valid); }
  }
  for (const id of ['teamName', 'email', 'email-auth', 'send-email-code', 'verify-email-code', 'email-code', 'email-code-fields', 'email-auth-status', 'authorToken', 'submission-fields']) {
    const element = new Element(); element.id = id; elements[id] = element;
  }
  elements.teamName.value = 'チームＡ'; elements.email.value = 'Team@example.com';
  const fields = [];
  for (let round = 1; round <= 4; round += 1) for (const slot of round === 4 ? [1, 2, 3, 4, 5] : [1, 3, 5]) {
    const id = `k${round}_${slot}_author`; fields.push(id); elements[id] = new Element(); elements[id].id = id;
  }
  const form = new Form();
  for (const id of ['team-status', 'check-team', 'submitting', 'agree', 'specialNote']) { elements[id] ||= new Element(); elements[id].id = id; }
  elements.agree.type = 'checkbox'; elements.agree.checked = true;
  for (let round = 1; round <= 4; round += 1) for (const slot of round === 4 ? [1, 2, 3, 4, 5] : [1, 3, 5]) {
    const id = `k${round}_${slot}`; elements[id] = new Element(); elements[id].value = `句${round}-${slot}`;
  }
  const identity = JSON.stringify([elements.teamName.value, elements.email.value]);
  if (saved) state.storage.set('khb2027:email-auth', JSON.stringify({ identity, token: 'saved-token', expiresAt: state.now + 7200000, ...saved }));
  class Clock extends Date { static now() { return state.now; } }
  const context = vm.createContext({ Date: Clock, GAS_MESSAGE_SOURCE: 'khb2027', GAS_WEB_APP_URL: 'https://script.google.com/macros/s/test/exec',
    document: { getElementById: id => htmlIds.has(id) ? elements[id] : null, createElement: tag => tag === 'form' ? new Form() : new Element(tag), body: new Element(),
      querySelector: () => form, addEventListener: (type, handler) => { if (type === 'DOMContentLoaded') state.ready = handler; } },
    window: { location: { origin: 'http://127.0.0.1:8766', href: 'submit.html' }, addEventListener: (type, handler) => { (state.listeners[type] ||= []).push(handler); } },
    HTMLFormElement: Form, crypto: { randomUUID: () => `request-${++sequence}` },
    sessionStorage: { getItem: key => state.storage.get(key) ?? null, setItem: (key, value) => state.storage.set(key, value), removeItem: key => state.storage.delete(key) },
    setTimeout: (handler, delay) => { const id = ++sequence; state.timers.set(id, { handler, due: state.now + delay }); return id; }, clearTimeout: id => state.timers.delete(id),
  });
  vm.runInContext(source, context);
  const teamCheck = { isVerified: () => state.teamVerified };
  let controller;
  if (integrated) {
    const original = context.setupEmailAuth;
    context.setupEmailAuth = (...args) => { controller = original(...args); return controller; };
    vm.runInContext(read('teamCheck.js') + '\n' + read('submit.js'), context); state.ready();
  } else controller = context.setupEmailAuth(form, teamCheck, { onStateChange: () => { state.changes += 1; } });
  function teamVerified() {
    if (integrated) { elements['check-team'].dispatch('click'); reply(state.posts.at(-1), { memberCount: 3 }); }
    else { state.teamVerified = true; controller.refreshTeam(); }
  }
  function reply(post, extra = {}, origin = 'https://script.google.com') {
    for (const handler of state.listeners.message) handler({ origin, data: { source: 'khb2027', action: post.action, requestId: post.requestId, ok: true, ...extra } });
  }
  function advance(ms) { state.now += ms; for (const [id, timer] of [...state.timers]) if (timer.due <= state.now) { state.timers.delete(id); timer.handler(); } }
  function startCode() { teamVerified(); elements['send-email-code'].dispatch('click'); const post = state.posts.at(-1);
    reply(post, { challengeId: 'challenge', retryAfter: 60, message: 'メール送信済み' }); return post; }
  const authors = [{ value: '甲', label: '甲（高2）' }, { value: '乙', label: '乙（高2）' }, { value: '丙', label: '丙（高1）' }];
  function login() { startCode(); elements['email-code'].value = '123456'; elements['verify-email-code'].dispatch('click'); const post = state.posts.at(-1);
    reply(post, { authorToken: 'valid-token', expiresAt: state.now + 7200000, authors, message: '確認完了' }); return post; }
  return { state, elements, fields, form, controller, teamVerified, reply, advance, startCode, login, authors, context };
}

test('投句HTMLに初期化処理が参照する要素と説明先がすべて存在する', () => {
  for (const file of ['teamCheck.js', 'emailAuth.js', 'submit.js']) {
    for (const [, id] of read(file).matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
      assert.ok(htmlIds.has(id), `${file}が参照する #${id} がsubmit.htmlにない`);
    }
  }
  for (const [, description] of html.matchAll(/aria-describedby="([^"]+)"/g)) {
    for (const id of description.split(/\s+/)) assert.ok(htmlIds.has(id), `説明先 #${id} がsubmit.htmlにない`);
  }
});

test('本人確認前は作者を選べず、チーム照合だけで自動メール送信や本人確認済み扱いをしない', () => {
  const s = setup(); assert.equal(s.elements['email-auth'].hidden, true);
  assert.equal(s.elements['email-code-fields'].hidden, true);
  assert.equal(s.elements['submission-fields'].hidden, true);
  assert.equal(s.elements['submission-fields'].disabled, true);
  s.teamVerified(); assert.equal(s.state.posts.length, 0); assert.equal(s.controller.isVerified(), false);
  assert.equal(s.elements['email-auth'].hidden, false);
  assert.equal(s.elements['email-code-fields'].hidden, true);
  assert.equal(s.elements['send-email-code'].textContent, '確認コードを送る');
  assert.equal(s.elements['email-auth-status'].textContent, '');
  assert.equal(s.elements['submission-fields'].disabled, true);
  for (const field of s.fields) assert.equal(s.elements[field].disabled, true);
  s.form.dispatch('submit'); assert.equal(s.state.prevented, true);
  s.startCode(); assert.equal(s.state.posts[0].action, 'send-email-code');
  assert.equal(s.elements['email-code-fields'].hidden, false);
  assert.equal(s.elements['send-email-code'].textContent, '再送する');
  assert.equal(s.state.focused, 'email-code');
  assert.equal(s.state.posts[0].code, ''); assert.equal(s.state.posts[0].authorToken, '');
  assert.equal(s.elements['send-email-code'].disabled, true); s.advance(60000); assert.equal(s.elements['send-email-code'].disabled, false);
});

test('6桁コード確認後だけ作者選択を有効にし、チームに紐づくトークンをタブ内へ保存する', () => {
  const s = setup(); s.startCode();
  s.elements['email-code'].value = '123'; s.elements['verify-email-code'].dispatch('click'); assert.equal(s.state.posts.length, 1);
  s.elements['email-code'].value = '123456'; s.elements['verify-email-code'].dispatch('click');
  const post = s.state.posts[1]; assert.equal(post.code, '123456'); assert.equal(post.challengeId, 'challenge');
  s.reply(post, { authorToken: 'valid-token', expiresAt: s.state.now + 7200000, authors: s.authors });
  assert.equal(s.controller.isVerified(), true); assert.equal(s.elements.authorToken.value, 'valid-token');
  assert.equal(s.elements['submission-fields'].hidden, false);
  assert.equal(s.elements['submission-fields'].disabled, false);
  assert.equal(s.elements['email-code-fields'].hidden, true);
  s.advance(60000); assert.equal(s.elements['send-email-code'].disabled, true, '確認済みの間は不要な再送で確認状態を解除しない');
  assert.equal(s.elements['email-code'].value, '');
  for (const field of s.fields) { assert.equal(s.elements[field].disabled, false); assert.equal(s.elements[field].children.length, 4); }
  assert.equal(JSON.parse(s.state.storage.get('khb2027:email-auth')).token, 'valid-token');
});

test('チーム情報の変更で名簿・トークン・進行中の確認を解除し、前チームの遅延応答を採用しない', () => {
  const s = setup(); s.login(); s.elements.k1_1_author.value = '甲';
  s.elements.teamName.value = 'チームＢ'; s.state.teamVerified = false; s.controller.refreshTeam();
  assert.equal(s.controller.isVerified(), false); assert.equal(s.elements.authorToken.value, ''); assert.equal(s.state.storage.has('khb2027:email-auth'), false);
  assert.equal(s.elements['submission-fields'].hidden, true);
  assert.equal(s.elements['submission-fields'].disabled, true);
  assert.equal(s.elements['email-code-fields'].hidden, true);
  assert.equal(s.elements['send-email-code'].textContent, '確認コードを送る');
  for (const field of s.fields) { assert.equal(s.elements[field].value, ''); assert.equal(s.elements[field].children.length, 1); }
  s.reply(s.state.posts[1], { authorToken: 'old-token', expiresAt: s.state.now + 7200000, authors: s.authors });
  assert.equal(s.controller.isVerified(), false); s.teamVerified(); assert.equal(s.state.posts.length, 2);
});

test('旧リクエスト・別処理・偽のオリジン・タイムアウト後の応答を無視する', () => {
  const s = setup(); s.teamVerified(); s.elements['send-email-code'].dispatch('click'); const post = s.state.posts[0];
  for (const [extra, origin] of [[{ requestId: 'old' }, 'https://script.google.com'], [{ action: 'verify-email-code' }, 'https://script.google.com'], [{}, 'https://evilgoogleusercontent.com']]) {
    s.reply(post, { challengeId: 'challenge', ...extra }, origin); assert.equal(s.elements['verify-email-code'].disabled, true);
  }
  s.advance(45000); assert.equal(s.elements['send-email-code'].disabled, false);
  s.reply(post, { challengeId: 'challenge' }); assert.equal(s.elements['verify-email-code'].disabled, true);
});

test('修正に戻った場合は保存トークンをサーバーで再検証し、作者の選択を復元する', () => {
  const s = setup({}); s.teamVerified();
  assert.equal(s.state.posts[0].action, 'get-author-options'); assert.equal(s.state.posts[0].authorToken, 'saved-token');
  assert.equal(s.controller.isVerified(), false);
  assert.equal(s.elements['submission-fields'].disabled, true, '保存済みトークンだけでは入力を開放しない');
  s.reply(s.state.posts[0], { authors: s.authors }); assert.equal(s.controller.isVerified(), true);
  assert.equal(s.elements['submission-fields'].disabled, false);
  s.elements.k1_1_author.value = '乙'; s.state.teamVerified = false; s.controller.refreshTeam();
  s.teamVerified(); assert.equal(s.state.posts[1].action, 'get-author-options');
  s.reply(s.state.posts[1], { authors: s.authors }); assert.equal(s.elements.k1_1_author.value, '乙');
});

test('保存トークンの再検証で応答が途絶えても投句欄は閉じたまま、確認コードを再送できる', () => {
  for (const throwPost of [false, true]) {
    const s = setup({}); s.state.throwPost = throwPost; s.teamVerified();
    if (!throwPost) s.advance(45000);
    assert.equal(s.controller.isVerified(), false);
    assert.equal(s.elements['submission-fields'].disabled, true);
    assert.equal(s.elements['send-email-code'].disabled, false);
    assert.equal(s.state.storage.has('khb2027:email-auth'), false);
    s.state.throwPost = false; s.login(); assert.equal(s.elements['submission-fields'].disabled, false);
  }
});

test('名簿変更による失効と画面の2時間期限で作者選択を解除し、再確認できる', () => {
  const invalid = setup({}); invalid.teamVerified(); invalid.reply(invalid.state.posts[0], { ok: false, requiresEmailVerification: true, message: '再確認が必要' });
  assert.equal(invalid.state.storage.has('khb2027:email-auth'), false); assert.equal(invalid.controller.isVerified(), false);
  assert.equal(invalid.elements['send-email-code'].disabled, false);
  const expired = setup(); expired.login(); expired.advance(7200000);
  assert.equal(expired.controller.isVerified(), false); assert.equal(expired.elements.authorToken.value, '');
  assert.equal(expired.elements.k1_1_author.disabled, true); assert.equal(expired.elements['send-email-code'].disabled, false);
  assert.equal(expired.elements['submission-fields'].hidden, true);
  assert.equal(expired.elements['submission-fields'].disabled, true);
});

test('認証期限切れで投句欄を閉じても句・特記事項・同意・作者の下書きは再認証後に残る', () => {
  const s = setup(); s.login();
  s.elements.k1_1.value = '書きかけの句'; s.elements.specialNote.value = '表記について';
  s.elements.k1_1_author.value = '乙'; s.advance(7200000);
  assert.equal(s.elements['submission-fields'].disabled, true);
  s.login();
  assert.equal(s.elements['submission-fields'].hidden, false);
  assert.equal(s.elements.k1_1.value, '書きかけの句');
  assert.equal(s.elements.specialNote.value, '表記について');
  assert.equal(s.elements.agree.checked, true); assert.equal(s.elements.k1_1_author.value, '乙');
});

test('作者の表示文字列をHTMLとして解釈せず、5回誤入力の応答では再送を促す', () => {
  const s = setup(); s.startCode(); s.elements['email-code'].value = '123456'; s.elements['verify-email-code'].dispatch('click');
  s.reply(s.state.posts[1], { ok: false, needsNewCode: true, message: 'コードを再送してください。' });
  assert.equal(s.elements['verify-email-code'].disabled, true);
  s.advance(60000); s.elements['send-email-code'].dispatch('click');
  s.reply(s.state.posts[2], { challengeId: 'new-challenge' }); s.elements['email-code'].value = '123456'; s.elements['verify-email-code'].dispatch('click');
  s.reply(s.state.posts[3], { authorToken: 'token', expiresAt: s.state.now + 7200000, authors: [{ value: '甲', label: '<script>甲</script>' }, ...s.authors.slice(1)] });
  assert.equal(s.elements.k1_1_author.children[1].textContent, '<script>甲</script>');
});

test('送信開始例外で操作を復元し、不正な作者一覧では選択を有効にしない', () => {
  const failed = setup(); failed.teamVerified(); failed.state.throwPost = true; failed.elements['send-email-code'].dispatch('click');
  assert.equal(failed.elements['send-email-code'].disabled, false);
  const invalid = setup(); invalid.startCode(); invalid.elements['email-code'].value = '123456'; invalid.elements['verify-email-code'].dispatch('click');
  invalid.reply(invalid.state.posts[1], { authorToken: 'token', expiresAt: invalid.state.now + 7200000, authors: [] });
  assert.equal(invalid.controller.isVerified(), false); assert.equal(invalid.elements.k1_1_author.disabled, true);
});

test('投句画面全体でチーム照合だけでは進めず、メール本人確認・作者ルールの確認後にトークン付きで確認画面へ進む', () => {
  const s = setup(null, { integrated: true });
  s.advance(400); assert.equal(s.state.posts.length, 0);
  assert.equal(s.elements['email-auth'].hidden, true);
  assert.equal(s.elements.submitting.disabled, true); s.teamVerified(); assert.equal(s.elements.submitting.disabled, true);
  s.elements['send-email-code'].dispatch('click'); s.reply(s.state.posts.at(-1), { challengeId: 'challenge', retryAfter: 60 });
  assert.equal(s.elements.submitting.disabled, true);
  s.elements['email-code'].value = '123456'; s.elements['verify-email-code'].dispatch('click');
  s.reply(s.state.posts.at(-1), { authorToken: 'valid-token', expiresAt: s.state.now + 7200000, authors: s.authors });
  assert.equal(s.elements.submitting.disabled, false);
  for (let round = 1; round <= 4; round += 1) {
    const slots = round === 4 ? [1, 2, 3, 4, 5] : [1, 3, 5];
    slots.forEach((slot, index) => { s.elements[`k${round}_${slot}_author`].value = s.authors[round === 4 ? [0, 0, 0, 1, 2][index] : index].value; });
  }
  s.elements.k1_3_author.value = '甲'; s.elements.k1_3_author.dispatch('change'); s.form.dispatch('submit');
  assert.notEqual(s.elements.k1_3_author.validationMessage, '', '作者ルール違反は該当欄の標準警告に設定する');
  assert.equal(s.context.window.location.href, 'submit.html');
  s.elements.k1_3_author.value = '乙'; s.elements.k1_3_author.dispatch('change'); s.form.dispatch('submit');
  assert.equal(s.elements.k1_3_author.validationMessage, '', '作者の修正で標準警告を解除する');
  assert.equal(s.context.window.location.href, 'confirm.html');
  assert.equal(s.state.storage.get('khb2027:submission:authorToken'), 'valid-token');
  assert.equal(s.state.storage.get('khb2027:submission:k4_4_author'), '乙');
  s.elements.teamName.value = 'チームＢ'; s.elements.teamName.dispatch('input');
  assert.equal(s.elements.submitting.disabled, true); assert.equal(s.elements.k1_1_author.disabled, true);
  assert.equal(s.elements['email-auth'].hidden, true);
  assert.equal(s.elements['check-team'].hidden, false);
  const count = s.state.posts.length; s.advance(400); assert.equal(s.state.posts.length, count, 'チーム変更後も自動再照合しない');
});

test('コード送信クリックで入力欄と再送ボタンを表示し、送信失敗後も再送できる', () => {
  const s = setup(); s.teamVerified();
  s.elements['send-email-code'].dispatch('click');
  assert.equal(s.elements['email-code-fields'].hidden, false);
  assert.equal(s.elements['send-email-code'].textContent, '再送する');
  assert.equal(s.elements['email-code'].disabled, true);
  assert.equal(s.elements['verify-email-code'].disabled, true);
  assert.equal(s.elements['send-email-code'].disabled, true);
  s.elements['send-email-code'].dispatch('click'); assert.equal(s.state.posts.length, 1);
  s.reply(s.state.posts[0], { ok: false, message: '送信失敗', retryAfter: 60 });
  assert.equal(s.elements['send-email-code'].disabled, true);
  s.advance(60000); assert.equal(s.elements['send-email-code'].disabled, false);
  s.elements['send-email-code'].dispatch('click');
  s.reply(s.state.posts[1], { challengeId: 'new-code', retryAfter: 60 });
  assert.equal(s.elements['email-code-fields'].hidden, false);
  assert.equal(s.elements['email-code'].disabled, false);
  assert.equal(s.elements['verify-email-code'].disabled, false);
});
