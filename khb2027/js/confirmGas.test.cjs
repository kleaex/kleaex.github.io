const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const fieldsSource = fs.readFileSync(path.join(__dirname, 'formFields.js'), 'utf8').replace(/export /g, '');
const source = fs.readFileSync(path.join(__dirname, 'confirmGas.js'), 'utf8').replace(/^import .*;\r?\n/gm, '');

function setup({ missing = '', throwOnSubmit = false } = {}) {
  const posts = [], timers = new Map(), windowHandlers = {}, storage = new Map();
  let sequence = 0;
  class Element {
    constructor() { this.handlers = {}; this.children = []; this.hidden = false; this.disabled = false; this.value = ''; }
    appendChild(child) { this.children.push(child); }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    dispatch(type) { for (const handler of this.handlers[type] || []) handler({ preventDefault() {} }); }
    setAttribute(key, value) { this[key] = value; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  class Form extends Element {
    submit() {
      if (throwOnSubmit) throw new Error('transport failure');
      posts.push({ url: this.action, data: Object.fromEntries(this.children.map(input => [input.name, input.value])) });
    }
  }
  const elements = {};
  for (const id of ['finalSubmit', 'backButton', 'submission-status', 'overwrite-dialog', 'cancelOverwrite', 'confirmOverwrite', 'teamName', 'email', 'k1_1', 'k1_5_author', 'specialNote']) elements[id] = new Element();
  elements.finalForm = new Form();
  // DOMの名前付きプロパティでsubmitが隠れていても、標準の送信メソッドを呼べることを確認する。
  elements.finalForm.submit = {};
  let ready;
  const context = vm.createContext({
    GAS_MESSAGE_SOURCE: 'khb2027', GAS_WEB_APP_URL: 'https://script.google.com/macros/s/test/exec',
    document: {
      addEventListener: (type, handler) => { if (type === 'DOMContentLoaded') ready = handler; },
      getElementById: id => elements[id] || null, createElement: () => new Element(),
    },
    window: { location: { origin: 'http://127.0.0.1:8766', href: 'confirm.html' }, addEventListener: (type, handler) => { (windowHandlers[type] ||= []).push(handler); } },
    HTMLFormElement: Form,
    crypto: { randomUUID: () => `request-${++sequence}` },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: (handler, delay) => { const id = ++sequence; timers.set(id, { handler, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(fieldsSource + '\nglobalThis.fields = SUBMISSION_FIELDS; globalThis.keyForTest = storageKey;', context);
  for (const field of context.fields) if (field !== missing) storage.set(context.keyForTest(field), field === 'agree' ? 'true' : `入力:${field}`);
  storage.set('other-session', '保持する');
  vm.runInContext(source, context); ready();
  function tick(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.handler(); } }
  function reply(post, extra = {}, origin = 'https://n-test.googleusercontent.com') {
    for (const handler of windowHandlers.message) handler({ origin, data: {
      source: 'khb2027', action: post.data.action, requestId: post.data.requestId, ok: true, ...extra,
    } });
  }
  return { context, elements, posts, storage, tick, reply, submit: () => elements.finalForm.dispatch('submit') };
}

test('1往復の保存成功から完了ページ遷移まで両ボタンをロックし、投句のデータだけ消去する', () => {
  const s = setup();
  assert.equal(s.elements.backButton.disabled, false);
  s.submit(); s.submit();
  assert.equal(s.posts.length, 1);
  assert.equal(s.posts[0].data.action, 'submit-submission');
  assert.equal(s.posts[0].data.overwrite, 'false');
  assert.equal(s.posts[0].data.agree, 'true');
  assert.equal(s.posts[0].data.responseOrigin, 'http://127.0.0.1:8766');
  assert.equal(s.elements.backButton.disabled, true);
  assert.equal(s.elements.finalSubmit.disabled, true);
  s.elements.backButton.dispatch('click');
  assert.equal(s.context.window.location.href, 'confirm.html');
  s.reply(s.posts[0]);
  assert.equal(s.posts.length, 1);
  assert.equal(s.context.window.location.href, 'finish.html');
  assert.equal(s.storage.size, 1);
  assert.equal(s.storage.get('other-session'), '保持する');
  assert.equal(s.elements.backButton.disabled, true);
});

test('保存前エラーを表示し、両ボタンと入力データを復元する', () => {
  const s = setup(); s.submit();
  s.reply(s.posts[0], { ok: false, message: '兼題情報を確認できないため、投句は保存していません。' });
  assert.equal(s.elements['submission-status'].hidden, false);
  assert.match(s.elements['submission-status'].textContent, /保存していません/);
  assert.equal(s.elements.backButton.disabled, false);
  assert.equal(s.elements.finalSubmit.disabled, false);
  assert.ok(s.storage.has('khb2027:submission:k1_1'));
  assert.equal(s.context.window.location.href, 'confirm.html');
  s.elements.backButton.dispatch('click');
  assert.equal(s.context.window.location.href, 'submit.html');
});

for (const cancelType of ['click', 'cancel']) {
  test(`上書き確認の${cancelType}で保存せず、修正と再送信を可能にする`, () => {
    const s = setup(); s.submit(); s.reply(s.posts[0], { ok: false, requiresOverwrite: true });
    assert.equal(s.elements['overwrite-dialog'].open, true);
    assert.equal(s.elements.backButton.disabled, true);
    if (cancelType === 'click') s.elements.cancelOverwrite.dispatch('click');
    else s.elements['overwrite-dialog'].dispatch('cancel');
    assert.equal(s.elements['overwrite-dialog'].open, false);
    assert.equal(s.elements.backButton.disabled, false);
    assert.equal(s.elements.finalSubmit.disabled, false);
    assert.equal(s.posts.length, 1);
  });
}

test('上書きを承認した場合だけ保存し、競合応答で再確認になってもロックを保つ', () => {
  const s = setup(); s.submit(); s.reply(s.posts[0], { ok: false, requiresOverwrite: true });
  assert.equal(s.elements['overwrite-dialog'].open, true);
  assert.equal(s.elements.backButton.disabled, true);
  s.elements.confirmOverwrite.dispatch('click'); s.elements.confirmOverwrite.dispatch('click');
  assert.equal(s.posts.length, 2);
  assert.equal(s.posts[1].data.overwrite, 'true');
  s.reply(s.posts[1]); assert.equal(s.context.window.location.href, 'finish.html');
});

test('無関係な処理・古いリクエスト・別オリジンの応答では保存も遷移もしない', () => {
  const s = setup(); s.submit();
  s.reply(s.posts[0], { action: 'check-submission' });
  s.reply(s.posts[0], { requestId: 'old-request' });
  s.reply(s.posts[0], {}, 'https://evilgoogleusercontent.com');
  assert.equal(s.posts.length, 1);
  assert.equal(s.context.window.location.href, 'confirm.html');
  assert.equal(s.elements.backButton.disabled, true);
  s.reply(s.posts[0], { ok: false, message: '失敗' });
  s.submit(); s.reply(s.posts[0]);
  assert.equal(s.posts.length, 2);
  s.reply(s.posts[1], { requestId: undefined });
  assert.equal(s.context.window.location.href, 'finish.html', '旧GASのIDなし成功応答にも対応する');
});

test('通信タイムアウト後はデータを保持してロックを解除し、遅い応答を採用しない', () => {
  const s = setup(); s.submit();
  s.tick(90000);
  assert.equal(s.elements.backButton.disabled, false);
  assert.equal(s.elements.finalSubmit.disabled, false);
  assert.match(s.elements['submission-status'].textContent, /受付済みの可能性/);
  s.reply(s.posts[0]);
  assert.equal(s.context.window.location.href, 'confirm.html');
  assert.ok(s.storage.has('khb2027:submission:k1_1'));
});

for (const stage of ['initial', 'overwrite']) {
  test(`${stage}で同一内容の応答を受けた場合は再送せず、表示と修正だけを可能にする`, () => {
    const s = setup(); s.submit();
    if (stage === 'overwrite') { s.reply(s.posts[0], { ok: false, requiresOverwrite: true }); s.elements.confirmOverwrite.dispatch('click'); }
    s.reply(s.posts.at(-1), { alreadySubmitted: true, hasExistingSubmission: true });
    s.tick(0);
    assert.equal(s.posts.length, stage === 'overwrite' ? 2 : 1);
    assert.ok(!s.elements['overwrite-dialog'].open);
    assert.match(s.elements['submission-status'].textContent, /同じ内容ですでに投句されています/);
    assert.equal(s.context.window.location.href, 'confirm.html');
    assert.equal(s.elements.finalSubmit.disabled, true);
    assert.equal(s.elements.backButton.disabled, false);
    assert.ok(s.storage.has('khb2027:submission:k1_1'));
    s.submit(); assert.equal(s.posts.length, stage === 'overwrite' ? 2 : 1);
    s.elements.backButton.dispatch('click'); assert.equal(s.context.window.location.href, 'submit.html');
  });
}

test('確認画面に俳句・対応する作者・チーム・メール・特記事項を文字列として表示する', () => {
  const s = setup();
  for (const id of ['teamName', 'email', 'k1_1', 'k1_5_author', 'specialNote']) {
    assert.equal(s.elements[id].textContent, `入力:${id}`);
  }
  const empty = setup({ missing: 'specialNote' });
  assert.equal(empty.elements.specialNote.textContent, 'なし');
});

test('送信開始時の例外と入力データの欠落では送信せず、修正に戻れる', () => {
  const failed = setup({ throwOnSubmit: true }); failed.submit();
  assert.equal(failed.elements.backButton.disabled, false);
  assert.equal(failed.elements.finalSubmit.disabled, false);
  assert.match(failed.elements['submission-status'].textContent, /開始できません/);
  const missing = setup({ missing: 'email' }); missing.submit();
  assert.equal(missing.posts.length, 0);
  assert.equal(missing.elements.finalSubmit.disabled, true);
  assert.equal(missing.elements.backButton.disabled, false);
});

test('本人確認トークンを保存へ送り、失効時は確認状態を消去して修正に戻れる', () => {
  const s = setup(); s.storage.set('khb2027:email-auth', 'cached-auth'); s.submit();
  assert.equal(s.posts[0].data.authorToken, '入力:authorToken');
  s.reply(s.posts[0], { ok: false, requiresEmailVerification: true, message: 'メール本人確認が必要です。' });
  assert.equal(s.storage.has('khb2027:email-auth'), false);
  assert.equal(s.storage.has('khb2027:submission:authorToken'), false);
  assert.equal(s.storage.has('khb2027:submission:k1_1'), true);
  assert.equal(s.elements.backButton.disabled, false);
  s.elements.backButton.dispatch('click'); assert.equal(s.context.window.location.href, 'submit.html');
});

test('保存後のメール失敗でも完了ページへ進み、再読み込み後も未送信の案内を表示する', () => {
  const s = setup(); s.submit(); s.reply(s.posts[0], { mailSent: false });
  assert.equal(s.context.window.location.href, 'finish.html');
  assert.equal(s.posts.length, 1);
  assert.equal(s.storage.has('khb2027:submission:k1_1'), false);
  assert.equal(s.storage.get('khb2027:receipt-mail-failed'), 'true');
  const finishSource = fs.readFileSync(path.join(__dirname, 'finish.js'), 'utf8');
  s.elements['receipt-message'] = {}; s.elements['receipt-notice'] = {};
  const html = fs.readFileSync(path.join(__dirname, '../finish.html'), 'utf8');
  for (const id of ['receipt-message', 'receipt-notice']) assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('src="js/finish.js"'));
  for (let reload = 0; reload < 2; reload++) {
    vm.runInContext(finishSource, s.context);
    assert.match(s.elements['receipt-message'].textContent, /保存は完了.*送信できません/);
    assert.match(s.elements['receipt-notice'].textContent, /再送信せず/);
  }
  const succeeded = setup(); succeeded.storage.set('khb2027:receipt-mail-failed', 'true');
  succeeded.submit(); succeeded.reply(succeeded.posts[0], { mailSent: true });
  assert.equal(succeeded.storage.has('khb2027:receipt-mail-failed'), false);
});
