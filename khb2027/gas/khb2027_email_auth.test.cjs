const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, 'khb2027_webapp.gs'), 'utf8');

function setup() {
  const state = { now: Date.parse('2026-11-10T10:00:00+09:00'), active: true, closed: false, quota: 100,
    mails: [], saved: [], logs: [], events: [], locked: false, properties: { KHB_HMAC_SECRET: 'a-secure-test-only-secret', KHB_AUTH_DAILY_LIMIT: '50' } };
  state.entry = { entryId: 'entry-1', email: 'Team@example.com', schoolName: 'A高校', memberCount: '3',
    members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }))) };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const properties = { getProperty: key => state.properties[key] ?? null,
    setProperty: (key, value) => { state.properties[key] = value; }, deleteProperty: key => {
      if (state.cleanupFailure) throw new Error('cleanup failed');
      assert.equal(state.locked, true); state.events.push('delete'); delete state.properties[key];
    },
    getProperties: () => { state.onCleanup?.(); return { ...state.properties }; } };
  const context = vm.createContext({ Date: Clock, console: { error: error => state.logs.push(String(error)) },
    PropertiesService: { getScriptProperties: () => properties },
    SpreadsheetApp: { flush: () => { assert.equal(state.locked, true); state.events.push('flush'); } },
    Utilities: { getUuid: () => crypto.randomUUID(),
      formatDate: date => new Date(date.valueOf() + 9 * 3600000).toISOString().slice(0, 10),
      computeHmacSha256Signature: (value, secret) => [...crypto.createHmac('sha256', secret).update(value).digest()] },
    MailApp: { getRemainingDailyQuota: () => state.quota },
    GmailApp: { sendEmail: (to, subject, body, options) => {
      assert.equal(state.locked, false, 'メール通信中にはロックを保持しない'); state.events.push('mail'); state.onMail?.();
      if (state.mailFailure) throw new Error('mail unavailable'); state.mails.push({ to, subject, body, ...options });
    } },
    LockService: { getScriptLock: () => ({
      waitLock: () => { assert.equal(state.locked, false); state.locked = true; state.events.push('lock'); state.onLock?.(); },
      tryLock: timeout => { assert.equal(timeout, 0); if (state.cleanupBusy) return false;
        assert.equal(state.locked, false); state.locked = true; state.events.push('cleanup-lock'); return true; },
      releaseLock: () => { state.locked = false; state.events.push('release'); },
    }) },
    UrlFetchApp: { fetch: () => { state.events.push('fetch'); state.beforeFetch?.(); return { getResponseCode: () => 200,
      getContentText: () => JSON.stringify(Object.fromEntries([1, 2, 3, 4].map(n => [`dai${n}`, ['', '「春」', '（はる）']]))) }; } },
  });
  vm.runInContext(source, context);
  context.getReceptionError = () => state.closed ? '投句受付は終了しました。' : '';
  const data = { teamName: 'チームＡ', email: state.entry.email, requestId: 'test-request', responseOrigin: 'http://127.0.0.1:8766' };
  const identityHash = context.makeIdentityHash(data.teamName, data.email);
  context.findActiveEntry = hash => state.active && hash === identityHash ? { values: state.entry } : null;
  context.findCurrentSubmission = () => state.existing || null;
  context.getSheet = () => ({}); context.appendObject = (sheet, headers, row) => state.saved.push(row);
  context.logEvent = (...args) => state.logs.push(args);
  context.respond = (action, ok, message, extra, requestedOrigin) => ({ action, ok, message, ...extra, requestedOrigin });
  const request = (action, extra = {}) => context.doPost({ parameter: { ...data, action, ...extra } });
  function send() { const result = request('send-email-code'); return { ...result, code: state.mails.at(-1)?.body.match(/コードは (\d{6}) /)?.[1] }; }
  function login() { const sent = send(); assert.equal(sent.ok, true); const result = request('verify-email-code', { challengeId: sent.challengeId, code: sent.code }); assert.equal(result.ok, true); return result; }
  function submission(token) {
    const values = { ...data, authorToken: token, agree: 'true', specialNote: '' };
    const labels = Array.from(context.memberAuthorLabels(JSON.parse(state.entry.members)));
    for (let round = 1; round <= 4; round += 1) {
      const slots = round === 4 ? [1, 2, 3, 4, 5] : [1, 3, 5];
      slots.forEach((slot, index) => { values[`k${round}_${slot}`] = `句${round}-${slot}`;
        values[`k${round}_${slot}_author`] = labels[round === 4 ? [0, 0, 0, 1, 2][index] : index]; });
    }
    return values;
  }
  return { state, context, data, identityHash, request, send, login, submission };
}

test('チーム照合とコード送信だけでは名簿を返さず、登録メールだけへコードを送り、平文・BCC・ログに残さない', () => {
  const s = setup();
  const checked = s.request('check-team'); assert.equal(checked.authors, undefined); assert.equal(checked.members, undefined);
  const sent = s.send(); assert.equal(sent.ok, true); assert.match(sent.code, /^\d{6}$/);
  assert.equal(sent.authors, undefined); assert.equal(sent.authorToken, undefined);
  assert.equal(s.state.mails[0].to, s.state.entry.email); assert.equal(s.state.mails[0].bcc, undefined);
  assert.equal(s.state.mails[0].from, 'klea.ex+autoreply@gmail.com');
  assert.equal(s.state.mails[0].replyTo, 'klea.ex+khb@gmail.com');
  const stored = JSON.parse(s.state.properties['KHB_EMAIL_CODE_' + s.identityHash]);
  assert.equal(stored.code, undefined); assert.match(stored.codeHash, /^[a-f0-9]{64}$/); assert.notEqual(stored.codeHash, sent.code);
  assert.equal(s.state.logs.length, 0);
  assert.equal(s.request('get-author-options').requiresEmailVerification, true);
  assert.equal(s.state.saved.length, 0);
});

test('コード確認後だけ作者一覧を返し、コードは一度限り、期限付きトークンで一覧を再取得できる', () => {
  const s = setup(); const sent = s.send();
  const verified = s.request('verify-email-code', { challengeId: sent.challengeId, code: sent.code });
  assert.equal(verified.ok, true); assert.equal(verified.authors.length, 3); assert.ok(verified.authors[0].label.includes('高2'));
  assert.equal(verified.expiresAt, s.state.now + 7200000); assert.equal(verified.requestId, s.data.requestId);
  assert.equal(s.request('verify-email-code', { challengeId: sent.challengeId, code: sent.code }).ok, false);
  const options = s.request('get-author-options', { authorToken: verified.authorToken });
  assert.equal(options.ok, true); assert.equal(options.authors.length, 3);
  assert.equal(s.request('check-submission', s.submission(verified.authorToken)).ok, true);
  assert.equal(s.request('submit-submission', s.submission(verified.authorToken)).ok, true);
  assert.equal(s.state.saved.length, 1);
});

test('期限10分の境界・異なるチャレンジ・再送前の古いコード・5回の誤入力を拒否する', () => {
  const expired = setup(); const code = expired.send(); expired.state.now = code.expiresAt;
  assert.equal(expired.request('verify-email-code', { code: code.code, challengeId: code.challengeId }).needsNewCode, true);
  const s = setup(); const first = s.send(); s.state.now += 60000; const second = s.send();
  assert.notEqual(first.challengeId, second.challengeId);
  assert.equal(s.request('verify-email-code', { challengeId: first.challengeId, code: first.code }).ok, false);
  const wrong = second.code === '000000' ? '000001' : '000000';
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const reply = s.request('verify-email-code', { challengeId: second.challengeId, code: wrong });
    assert.equal(reply.ok, false); assert.equal(reply.needsNewCode, attempt === 5);
  }
  assert.equal(s.request('verify-email-code', { challengeId: second.challengeId, code: second.code }).ok, false);
  assert.equal(s.state.saved.length, 0);
});

test('トークンなし・改変・別チーム・期限切れ・名簿変更・エントリー無効化では名簿を開示せず、同一投句も応答しない', () => {
  for (const change of ['missing', 'tampered', 'team', 'expired', 'roster', 'inactive']) {
    const s = setup(); let token = s.login().authorToken;
    if (change === 'missing') token = '';
    if (change === 'tampered') token = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    if (change === 'expired') s.state.now += 7200000;
    if (change === 'roster') s.state.entry.members = s.state.entry.members.replace('高2', '高1');
    if (change === 'inactive') s.state.active = false;
    const extra = { authorToken: token, ...(change === 'team' ? { teamName: '別のチーム' } : {}) };
    const reply = s.request('get-author-options', extra); assert.equal(reply.ok, false); assert.equal(reply.authors, undefined);
    const values = { ...s.submission(token), ...extra };
    s.state.existing = { values };
    for (const action of ['check-submission', 'submit-submission']) {
      const result = s.request(action, values); assert.equal(result.ok, false); assert.equal(result.alreadySubmitted, undefined);
    }
    assert.equal(s.state.saved.length, 0);
  }
});

test('兼題取得中の本人確認期限切れ・名簿変更を保存前に再確認する', () => {
  for (const change of ['time', 'roster']) {
    const s = setup(); const token = s.login().authorToken;
    s.state.beforeFetch = () => { if (change === 'time') s.state.now += 7200000; else s.state.entry.members = s.state.entry.members.replace('高2', '高1'); };
    const reply = s.request('submit-submission', s.submission(token));
    assert.equal(reply.requiresEmailVerification, true); assert.equal(s.state.saved.length, 0);
    assert.equal(s.state.mails.length, 1, '確認コード以外のメールは送らない');
  }
});

test('同一投句の省略経路でもロック中の本人確認失効を拒否し、署名を入力されたチーム・メールの原値に結び付ける', () => {
  const s = setup(); const token = s.login().authorToken;
  assert.notEqual(s.context.getEmailAuthError({ ...s.data, email: 'team@example.com', authorToken: token }, s.identityHash, s.state.entry), '');
  s.state.existing = { values: s.submission(token) };
  s.state.onLock = () => { s.state.now += 7200000; };
  const result = s.request('submit-submission', s.submission(token));
  assert.equal(result.requiresEmailVerification, true); assert.equal(result.alreadySubmitted, undefined);
  assert.equal(s.state.saved.length, 0); assert.equal(s.state.events.includes('fetch'), false);
});

test('同姓同名は学年・所属校付きの選択肢を返し、全部一致する場合は要連絡になる', () => {
  const s = setup(); s.state.entry.members = JSON.stringify([
    { name: '同じ　氏名', grade: '高2', school: 'A高校' }, { name: '同じ氏名', grade: '高2', school: 'B高校' }, { name: '別の氏名', grade: '高1', school: 'A高校' },
  ]);
  const verified = s.login(); assert.notEqual(verified.authors[0].value, verified.authors[1].value);
  assert.match(verified.authors[0].label, /A高校・高2/); assert.match(verified.authors[1].label, /B高校・高2/);
  const invalid = setup(); invalid.state.entry.members = JSON.stringify([
    { name: '同じ　氏名', grade: '高2', school: '' }, { name: '同じ氏名', grade: '高2', school: '' }, { name: '別の氏名', grade: '高1', school: '' },
  ]);
  const sent = invalid.send(); const result = invalid.request('verify-email-code', { challengeId: sent.challengeId, code: sent.code });
  assert.equal(result.ok, false); assert.match(result.message, /実行委員会.*連絡/); assert.equal(result.authors, undefined);
});

test('60秒再送間隔・チームごと10通・全体上限・受付メール用の残枠をサーバーで制限する', () => {
  const s = setup(); assert.equal(s.send().ok, true); assert.equal(s.send().retryAfter, 60); assert.equal(s.state.mails.length, 1);
  for (let count = 1; count < 10; count += 1) { s.state.now += 60000; assert.equal(s.send().ok, true); }
  s.state.now += 60000; assert.equal(s.send().ok, false); assert.equal(s.state.mails.length, 10);
  const global = setup(); global.state.properties.KHB_AUTH_DAILY_LIMIT = '1'; global.send(); global.state.now += 60000;
  assert.equal(global.send().ok, false);
  const quota = setup(); quota.state.quota = 20; assert.equal(quota.send().ok, false); assert.equal(quota.state.mails.length, 0);
});

test('メール送信失敗・未登録・締切後・ロック中の無効化ではコードの使用や名簿開示を許可しない', () => {
  const failed = setup(); failed.state.mailFailure = true;
  assert.equal(failed.send().ok, false); assert.equal(failed.state.mails.length, 0);
  assert.equal(JSON.parse(failed.state.properties['KHB_EMAIL_CODE_' + failed.identityHash]).codeHash, '');
  for (const condition of ['unregistered', 'closed', 'revoked']) {
    const s = setup();
    if (condition === 'unregistered') s.state.active = false;
    if (condition === 'closed') s.state.closed = true;
    if (condition === 'revoked') s.state.onLock = () => { s.state.active = false; };
    assert.equal(s.send().ok, false); assert.equal(s.state.mails.length, 0);
  }
});

test('前日以前の期限切れコード状態だけを清掃し、設定や有効なコードを消去しない', () => {
  const s = setup();
  s.state.properties.KHB_EMAIL_CODE_old = JSON.stringify({ day: '2026-11-09', expiresAt: s.state.now - 1 });
  s.state.properties.KHB_EMAIL_CODE_live = JSON.stringify({ day: '2026-11-09', expiresAt: s.state.now + 600000 });
  s.send();
  assert.equal(s.state.properties.KHB_EMAIL_CODE_old, undefined); assert.ok(s.state.properties.KHB_EMAIL_CODE_live); assert.ok(s.state.properties.KHB_HMAC_SECRET);
});

test('清掃はメール送信後だけに行い、当日の回数・将来日・不正な状態を残し、最大10件に制限する', () => {
  const s = setup();
  for (let index = 0; index < 12; index++) s.state.properties[`KHB_EMAIL_CODE_old${index}`] = JSON.stringify({ day: '2026-11-09', expiresAt: s.state.now - 1 });
  s.state.properties.KHB_EMAIL_CODE_today = JSON.stringify({ day: '2026-11-10', count: 10, expiresAt: s.state.now - 1 });
  s.state.properties.KHB_EMAIL_CODE_future = JSON.stringify({ day: '2026-11-11', expiresAt: s.state.now - 1 });
  s.state.properties.KHB_EMAIL_CODE_invalid = 'invalid-json';
  assert.equal(s.send().ok, true);
  assert.equal(s.state.events.filter(event => event === 'delete').length, 10);
  assert.ok(s.state.events.indexOf('mail') < s.state.events.indexOf('delete'));
  assert.equal(Object.keys(s.state.properties).filter(key => key.startsWith('KHB_EMAIL_CODE_old')).length, 2);
  assert.equal(JSON.parse(s.state.properties.KHB_EMAIL_CODE_today).count, 10);
  assert.ok(s.state.properties.KHB_EMAIL_CODE_future); assert.ok(s.state.properties.KHB_EMAIL_CODE_invalid);
  s.state.now += 60000; s.send();
  assert.equal(Object.keys(s.state.properties).filter(key => key.startsWith('KHB_EMAIL_CODE_old')).length, 0);
});

test('清掃ロック取得不可・削除失敗でもコード送信成功と本人確認を保つ', () => {
  for (const condition of ['cleanupBusy', 'cleanupFailure']) {
    const s = setup(); s.state[condition] = true;
    s.state.properties.KHB_EMAIL_CODE_old = JSON.stringify({ day: '2026-11-09', expiresAt: s.state.now - 1 });
    const sent = s.send(); assert.equal(sent.ok, true); assert.ok(s.state.properties.KHB_EMAIL_CODE_old);
    assert.equal(s.request('verify-email-code', { challengeId: sent.challengeId, code: sent.code }).ok, true);
    assert.equal(s.state.locked, false);
  }
});

test('送信失敗の後処理が新しく発行されたコードを失効させず、清掃も更新済みの状態を残す', () => {
  const failed = setup(); const key = 'KHB_EMAIL_CODE_' + failed.identityHash;
  failed.state.onMail = () => { failed.state.properties[key] = JSON.stringify({ nonce: 'newer-challenge', codeHash: 'newer-hash', attempts: 2, count: 2 }); };
  failed.state.mailFailure = true; assert.equal(failed.send().ok, false);
  assert.equal(JSON.parse(failed.state.properties[key]).codeHash, 'newer-hash');
  assert.equal(JSON.parse(failed.state.properties[key]).attempts, 2);
  const cleaned = setup();
  cleaned.state.properties.KHB_EMAIL_CODE_other = JSON.stringify({ day: '2026-11-09', expiresAt: cleaned.state.now - 1 });
  cleaned.state.onCleanup = () => { cleaned.state.properties.KHB_EMAIL_CODE_other = JSON.stringify({ day: '2026-11-10', expiresAt: cleaned.state.now + 600000 }); };
  assert.equal(cleaned.send().ok, true); assert.ok(cleaned.state.properties.KHB_EMAIL_CODE_other);
});

test('受付メールの失敗でも保存済みを成功として返し、再試行で再保存・再通知しない', () => {
  for (const overwrite of [false, true]) {
    const s = setup(); const values = s.submission(s.login().authorToken);
    if (overwrite) {
      s.state.existing = { rowNumber: 2, values: { ...values, k1_1: '旧句', revision: 1 } };
      s.context.archiveSubmission = () => s.state.events.push('archive');
      s.context.writeObject = (sheet, headers, row, saved) => s.state.saved.push(saved);
    }
    s.state.mailFailure = true;
    const result = s.request('submit-submission', { ...values, overwrite: String(overwrite) });
    assert.equal(result.ok, true); assert.equal(result.mailSent, false); assert.equal(result.overwritten, overwrite);
    assert.match(result.message, /受け付けました.*メール.*再送信.*せず/);
    assert.equal(s.state.saved.length, 1); assert.equal(s.state.locked, false);
    assert.ok(s.state.logs.some(log => log[1] === 'mail-failed'));
    s.state.existing = { rowNumber: 2, values: s.state.saved[0] };
    const retried = s.request('submit-submission', { ...values, overwrite: String(overwrite) });
    assert.equal(retried.alreadySubmitted, true); assert.equal(s.state.saved.length, 1);
    assert.equal(s.state.mails.length, 1, '確認コード以外のメールは成功していない');
  }
});

test('ロック外でメールを発送中でも残り20通を予約で保護し、終了後に予約を解除する', () => {
  const s = setup(); s.state.quota = 21;
  s.context.findActiveEntry = () => ({ values: s.state.entry });
  let concurrent;
  s.state.onMail = () => { concurrent = s.request('send-email-code', { teamName: '別チーム' }); };
  assert.equal(s.send().ok, true);
  assert.equal(concurrent.ok, false); assert.match(concurrent.message, /送信枠/);
  assert.equal(s.state.mails.length, 1);
  assert.deepEqual(JSON.parse(s.state.properties.KHB_EMAIL_AUTH_RATE).pendingMail, {});
  const expired = setup(); expired.state.quota = 21;
  expired.state.properties.KHB_EMAIL_AUTH_RATE = JSON.stringify({ day: '2026-11-10', count: 1,
    pendingMail: { expired: expired.state.now - 1 } });
  assert.equal(expired.send().ok, true, '中断した発送の期限切れ予約は枠を永久に消費しない');
});
