const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, 'khb2027_webapp.gs'), 'utf8');
const published = {
  dai1: ['', '「春」', '（はる）'], dai2: ['', '「夏」', '（なつ）'],
  dai3: ['', '「秋」', '（あき）'], dai4: ['', '「冬」', '（ふゆ）'],
};

function setup({ status = 200, json = JSON.stringify(published), networkError = false, existing = null, properties = {} } = {}) {
  const events = [], mails = [], saved = [], archived = [], logs = [];
  const context = vm.createContext({
    console: { error() {} },
    SpreadsheetApp: { flush: () => events.push('flush') },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? (key === 'KHB_HMAC_SECRET' ? 'test-only-secret' : null) }) },
    UrlFetchApp: { fetch(url, options) {
      assert.equal(url, 'https://kleaex.github.io/khb2027/js/kendai.json');
      assert.equal(options.muteHttpExceptions, true);
      events.push('fetch');
      if (networkError) throw new Error('network unavailable');
      return { getResponseCode: () => status, getContentText: encoding => {
        assert.equal(encoding, 'UTF-8'); return json;
      } };
    } },
    LockService: { getScriptLock: () => ({
      waitLock: () => events.push('lock'), releaseLock: () => events.push('release'),
    }) },
    Utilities: { formatDate: () => '2027/01/01 00:00:00',
      computeHmacSha256Signature: (value, secret) => [...crypto.createHmac('sha256', secret).update(value).digest()] },
    GmailApp: { sendEmail: (to, subject, body, options) => { events.push('mail'); mails.push({ to, subject, body, ...options }); } },
  });
  vm.runInContext(source, context);
  context.getReceptionError = kind => {
    assert.equal(kind, 'SUBMISSION');
    return '';
  };
  context.makeIdentityHash = () => 'identity';
  context.findActiveEntry = () => ({ values: { memberCount: '5', members: JSON.stringify([1, 2, 3, 4, 5]
    .map((slot) => ({ name: `作者${slot}`, grade: '高2', school: '' }))) } });
  context.findCurrentSubmission = () => existing;
  context.getSheet = () => ({});
  context.appendObject = (sheet, headers, row) => { events.push('append'); saved.push(row); };
  context.writeObject = (sheet, headers, index, row) => { events.push('write'); saved.push(row); };
  context.archiveSubmission = row => { events.push('archive'); archived.push(row); };
  context.logEvent = (...args) => logs.push(args);
  context.respond = (action, ok, message, extra, requestedOrigin) => ({ action, ok, message, ...extra, requestedOrigin });
  const data = { teamName: 'チームＡ', email: 'Team@example.com', agree: 'true', specialNote: '備考' };
  for (let round = 1; round <= 4; round += 1) {
    for (const slot of round === 4 ? [1, 2, 3, 4, 5] : [1, 3, 5]) {
      data[`k${round}_${slot}`] = `句${round}-${slot}`;
      data[`k${round}_${slot}_author`] = `作者${slot}`;
    }
  }
  const payload = `${Date.now() + 7200000}.${'a'.repeat(32)}.${context.authRosterDigest(context.findActiveEntry().values)}`;
  data.authorToken = `${payload}.${context.authDigest(`email-auth-token:v1|identity|${JSON.stringify([data.teamName, data.email])}|${payload}`)}`;
  return { context, data, events, mails, saved, archived, logs };
}

test('新規投句は公開JSONを1回取得し、サイトと同じ兼題・読みをメールに使う', () => {
  const { context, data, events, mails, saved } = setup();
  // クライアントが別の兼題を送っても使用しない。
  data.leagueTopics = '偽の兼題';
  const result = context.submitSubmission(data);
  assert.equal(result.ok, true);
  assert.deepEqual(events, ['fetch', 'lock', 'append', 'flush', 'release', 'mail']);
  assert.equal(saved[0].revision, 1);
  const body = mails[0].body;
  for (const [index, key] of ['dai1', 'dai2', 'dai3', 'dai4'].entries()) {
    const prefix = index < 3 ? `リーグ戦　兼題${['①', '②', '③'][index]}` : '決勝戦　兼題';
    assert.ok(body.includes(prefix + published[key][1] + '　' + published[key][2]));
  }
  const positions = ['先鋒', '次鋒', '中堅', '副将', '大将'];
  for (let round = 1; round <= 4; round += 1) {
    for (const slot of round === 4 ? [1, 2, 3, 4, 5] : [1, 3, 5]) {
      assert.ok(body.includes(`${positions[slot - 1]}：句${round}-${slot}　　作者${6 - slot}`));
    }
  }
  assert.ok(!body.includes('偽の兼題'));
  assert.equal(mails[0].to, data.email);
});

test('エントリー受付メールは長い紹介文を分割せず、入力した改行と空行だけをHTMLへ反映する', () => {
  const { context, mails } = setup();
  const introduction = '紹介文'.repeat(90);
  context.sendEntryMail({
    email: 'test@example.com', teamName: 'チームＡ', schoolName: 'テスト高校',
    plannedTeamCount: '1', responsibleName: '責任者', members: '甲\r\n乙\n丙',
    introduction, specialNote: '一行目\n\n三行目', updatedAt: new Date(),
  });
  assert.ok(mails[0].body.includes('紹介文：' + introduction + '\n'));
  assert.ok(mails[0].htmlBody.includes('紹介文：' + introduction + '<br>'));
  assert.ok(mails[0].htmlBody.includes('甲<br>乙<br>丙'));
  assert.ok(mails[0].htmlBody.includes('一行目<br><br>三行目'));
  assert.equal(mails[0].bcc, 'klea.ex+khb@gmail.com');
  assert.equal(mails[0].replyTo, 'klea.ex+khb@gmail.com');
  assert.equal(mails[0].from, 'klea.ex+autoreply@gmail.com');
});

test('両受付メールは同じ問い合わせ案内と最新受付日時を使い、エントリーの全回答を明示する', () => {
  const { context, data, mails } = setup();
  const receivedAt = new Date('2026-10-12T00:00:00+09:00');
  const updatedAt = new Date('2026-10-13T00:00:00+09:00');
  context.Utilities.formatDate = (date, zone, pattern) => {
    assert.equal(date.valueOf(), updatedAt.valueOf());
    assert.equal(zone, 'Asia/Tokyo');
    assert.equal(pattern, 'yyyy/MM/dd HH:mm:ss');
    return '2026/10/13 00:00:00';
  };
  context.sendEntryMail({
    email: data.email, teamName: data.teamName, schoolName: 'A高校', schoolName2: 'B高校',
    isJointTeam: true, plannedTeamCount: '2', responsibleName: '責任者　花子',
    responsibleRole: 'その他', responsibleRoleOther: '外部指導者', memberCount: '3',
    members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map((name, index) => ({ name, grade: '高2', school: index ? 'B高校' : 'A高校' }))),
    introduction: '紹介文', specialNote: '連絡事項', receivedAt, updatedAt,
    termsConsentAt: updatedAt, inputConfirmationAt: updatedAt, contactConfirmationAt: updatedAt,
  });
  context.sendSubmissionMail({ ...data, updatedAt, agreeAt: updatedAt }, false, { league: ['春', '夏', '秋'], final: '冬' });
  const entryBody = mails[0].body;
  for (const line of ['学校名：A高校、B高校', '合同チームである：はい', '出場予定チーム数：2チーム',
    '責任者の種類：その他', '責任者の種類（具体的に記入ください）：外部指導者', 'チーム人数：3人',
    '甲　太郎（A高校・高2）', '乙　花子（B高校・高2）', '紹介文：紹介文', 'コメント・特記事項：連絡事項']) {
    assert.ok(entryBody.includes(line), line);
  }
  assert.ok(entryBody.includes('同意し、エントリーします'));
  assert.ok(entryBody.includes('連絡確認（'));
  assert.ok(!entryBody.includes('入力確認（'));
  for (const [index, kind] of ['エントリー', '投句'].entries()) {
    const mail = mails[index];
    for (const line of context.mailInquiryLines(kind, 'klea.ex+khb@gmail.com')) assert.ok(mail.body.includes(line));
    assert.ok(mail.body.includes('フォーム送信日時：2026/10/13 00:00:00（日本時間）'));
    assert.equal(mail.from, 'klea.ex+autoreply@gmail.com');
    assert.equal(mail.bcc, 'klea.ex+khb@gmail.com');
    assert.equal(mail.replyTo, 'klea.ex+khb@gmail.com');
  }
});

test('エントリーは入力確認を要求せず、旧列に確認済み日時を記録しない', () => {
  const { context, saved, mails } = setup();
  context.getReceptionError = () => '';
  context.findRowByValue = () => null;
  context.Utilities.getUuid = () => 'entry-id';
  const data = {
    schoolName: 'テスト高校', plannedTeamCount: '1', teamName: 'テスト高校Ａ',
    responsibleName: '責任　者', responsibleRole: '顧問', email: 'test@example.com',
    memberCount: '3', members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }))),
    introduction: 'あ'.repeat(250), termsConsent: 'true', contactConfirmation: 'true',
  };
  assert.equal(context.handleEntry(data).ok, true);
  assert.equal(saved[0].inputConfirmationAt, '');
  assert.ok(!mails[0].body.includes('入力確認（'));
  for (const key of ['termsConsent', 'contactConfirmation']) {
    assert.match(context.validateEntry({ ...data, [key]: 'false' }), /確認事項への同意/);
  }
});

for (const mailFailure of [false, true]) {
  test(`エントリーは保存を確定し、メール${mailFailure ? '失敗でも受付成功と未送信' : '成功と受付成功'}を返す`, () => {
    const state = setup();
    const { context } = state;
    context.getReceptionError = () => '';
    context.findRowByValue = () => null;
    context.Utilities.getUuid = () => 'entry-id';
    const send = context.GmailApp.sendEmail;
    context.GmailApp.sendEmail = (...args) => {
      assert.equal(state.events.at(-1), 'flush', '保存確定後にメールを送る');
      if (mailFailure) { state.events.push('mail'); throw new Error('mail unavailable'); }
      send(...args);
    };
    const data = {
      action: 'entry', schoolName: 'テスト高校', plannedTeamCount: '1', teamName: 'テスト高校Ａ',
      responsibleName: '責任　者', responsibleRole: '顧問', email: 'test@example.com',
      memberCount: '3', members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }))),
      introduction: 'あ'.repeat(250), termsConsent: 'true', contactConfirmation: 'true',
    };
    const result = context.doPost({ parameter: data });
    assert.equal(result.ok, true);
    assert.equal(result.mailSent, !mailFailure);
    assert.deepEqual(state.events, ['append', 'flush', 'mail']);
    assert.equal(state.saved.length, 1);
    assert.equal(state.logs[0][1], 'accepted');
    if (mailFailure) {
      assert.match(result.message, /受け付けました.*メールを送信できません.*再送信はせず/);
      assert.equal(state.logs[1][1], 'mail-failed');
      assert.equal(state.logs[1][3], 'entry-id');
    }
    context.findRowByValue = () => ({ values: state.saved[0] });
    assert.equal(context.doPost({ parameter: data }).ok, false);
    assert.deepEqual(state.events, ['append', 'flush', 'mail'], '重複送信で保存・メールを繰り返さない');
    context.findRowByValue = () => null;
    context.SpreadsheetApp.flush = () => { throw new Error('save unavailable'); };
    assert.equal(context.doPost({ parameter: data }).ok, false);
    assert.equal(state.events.filter(event => event === 'mail').length, 1, '保存の失敗後にはメールを送らない');
  });
}

test('投句受付メールのHTMLでは入力されたタグや文字参照を文字として表示する', () => {
  const { context, data, mails } = setup();
  data.k1_1 = '<img src="x" onerror="alert(1)"> &amp; \'句\'';
  data.specialNote = '長い備考'.repeat(100);
  assert.equal(context.submitSubmission(data).ok, true);
  assert.ok(mails[0].body.includes(data.k1_1));
  assert.ok(mails[0].htmlBody.includes('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt; &amp;amp; &#39;句&#39;'));
  assert.ok(!mails[0].htmlBody.includes('<img'));
  assert.ok(mails[0].htmlBody.includes(data.specialNote + '<br>'));
});

test('上書きも公開JSONを使い、履歴退避後に最新内容を保存する', () => {
  const oldRow = { revision: 2, k1_1: '旧句' };
  const json = JSON.stringify({ ...published, dai1: ['', '「花」', '（はな）'] });
  const { context, data, events, mails, saved, archived } = setup({ existing: { rowNumber: 2, values: oldRow }, json });
  data.overwrite = 'true';
  assert.equal(context.submitSubmission(data).overwritten, true);
  assert.deepEqual(events, ['fetch', 'lock', 'archive', 'write', 'flush', 'release', 'mail']);
  assert.equal(saved[0].revision, 3);
  assert.equal(archived[0], oldRow);
  assert.ok(mails[0].body.includes('兼題①「花」　（はな）'));
  assert.ok(mails[0].subject.includes('上書きして'));
});

const badInputs = [
  ['ネットワーク障害', { networkError: true }],
  ['HTTPエラー', { status: 404 }],
  ['JSON構文不正', { json: '<html>error</html>' }],
  ['null', { json: 'null' }],
  ['兼題欠落', { json: JSON.stringify({ ...published, dai4: undefined }) }],
  ['読みの型不正', { json: JSON.stringify({ ...published, dai2: ['', '「夏」', null] }) }],
  ['未設定の兼題', { json: JSON.stringify({ ...published, dai3: ['', '「」', '（）'] }) }],
  ['空白だけの兼題', { json: JSON.stringify({ ...published, dai1: ['', '「　」', '（）'] }) }],
];
for (const [name, options] of badInputs) {
  for (const overwrite of [false, true]) {
    test(`${name}では${overwrite ? '上書き・履歴退避' : '新規保存'}とメール送信を行わない`, () => {
      const oldRow = { revision: 1, k1_1: '旧句' };
      const state = setup({ ...options, existing: overwrite ? { rowNumber: 2, values: oldRow } : null });
      state.data.overwrite = String(overwrite);
      const result = state.context.submitSubmission(state.data);
      assert.equal(result.ok, false);
      assert.match(result.message, /保存していません.*再度お試し/);
      assert.deepEqual(state.events, ['fetch']);
      assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
      assert.equal(state.logs[0][1], 'topics-unavailable');
      assert.deepEqual(oldRow, { revision: 1, k1_1: '旧句' });
    });
  }
}

test('取得中に締切を過ぎた場合は保存しない', () => {
  const state = setup(); let checks = 0;
  state.context.getReceptionError = kind => {
    assert.equal(kind, 'SUBMISSION');
    return ++checks === 1 ? '' : '投句受付は終了しました。';
  };
  const result = state.context.submitSubmission(state.data);
  assert.equal(result.ok, false);
  assert.match(result.message, /受付は終了/);
  assert.deepEqual(state.events, ['fetch', 'lock', 'release']);
  assert.equal(state.saved.length + state.mails.length, 0);
});

test('取得後の再照合でエントリーが無効になった場合は保存しない', () => {
  const state = setup(); let checks = 0;
  const originalEntry = state.context.findActiveEntry();
  state.context.findActiveEntry = () => ++checks === 1 ? originalEntry : null;
  const result = state.context.submitSubmission(state.data);
  assert.equal(result.ok, false);
  assert.deepEqual(state.events, ['fetch', 'lock', 'release']);
  assert.equal(state.saved.length + state.mails.length, 0);
});

test('未承認の上書きは履歴もメールも変更しない', () => {
  const state = setup({ existing: { rowNumber: 2, values: { revision: 1 } } });
  const result = state.context.submitSubmission(state.data);
  assert.equal(result.requiresOverwrite, true);
  assert.deepEqual(state.events, ['fetch', 'lock', 'release']);
  assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
});

test('期限後・未登録チームは兼題取得を行わない', () => {
  const expired = setup();
  expired.context.getReceptionError = () => '投句受付は終了しました。';
  assert.equal(expired.context.submitSubmission(expired.data).ok, false);
  assert.deepEqual(expired.events, []);
  const unregistered = setup(); unregistered.context.findActiveEntry = () => null;
  assert.equal(unregistered.context.submitSubmission(unregistered.data).ok, false);
  assert.deepEqual(unregistered.events, []);
});

test('投句事前確認は兼題取得に依存しない', () => {
  const state = setup({ networkError: true });
  assert.equal(state.context.checkSubmission(state.data).ok, true);
  assert.deepEqual(state.events, []);
});

function receptionContext(properties = {}, now = Date.now()) {
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || null }) },
    Date: class extends Date { static now() { return now; } },
  });
  vm.runInContext(source, context);
  return context;
}

for (const kind of ['ENTRY', 'SUBMISSION']) {
  test(`${kind}: 受付開始・締切の前後と境界をGAS時刻で判定する`, () => {
    const properties = {
      [`KHB_${kind}_START_JST`]: '2026-11-01T00:00:00+09:00',
      [`KHB_${kind}_DEADLINE_JST`]: '2026-11-30T23:59:59+09:00',
    };
    const start = Date.parse(properties[`KHB_${kind}_START_JST`]);
    const end = Date.parse(properties[`KHB_${kind}_DEADLINE_JST`]);
    assert.match(receptionContext(properties, start - 1).getReceptionError(kind), /まだ開始/);
    assert.equal(receptionContext(properties, start).getReceptionError(kind), '');
    assert.equal(receptionContext(properties, end).getReceptionError(kind), '');
    assert.match(receptionContext(properties, end + 1).getReceptionError(kind), /受付は終了/);
  });
}

test('存在しない日付・不正な形式・開始と締切の逆転を拒否する', () => {
  for (const value of ['invalid', '2026-11-31T23:59:59+09:00', '2026-11-01T00:00:00Z']) {
    const context = receptionContext({ KHB_SUBMISSION_DEADLINE_JST: value });
    assert.throws(() => context.getReceptionError('SUBMISSION'));
  }
  const context = receptionContext({
    KHB_ENTRY_START_JST: '2026-11-02T00:00:00+09:00',
    KHB_ENTRY_DEADLINE_JST: '2026-11-01T00:00:00+09:00',
  });
  assert.throws(() => context.getReceptionError('ENTRY'), /受付開始より後/);
});

test('GAS冒頭の開始・締切設定は実在する日時で、正しい順序になっている', () => {
  const context = receptionContext();
  for (const kind of ['ENTRY', 'SUBMISSION']) {
    const start = context.receptionDate(`KHB_${kind}_START_JST`);
    const end = context.receptionDate(`KHB_${kind}_DEADLINE_JST`);
    assert.ok(start < end);
  }
});

for (const [handler, kind, action] of [
  ['handleEntry', 'ENTRY', 'entry'],
  ['checkTeam', 'SUBMISSION', 'check-team'],
  ['checkSubmission', 'SUBMISSION', 'check-submission'],
  ['submitSubmission', 'SUBMISSION', 'submit-submission'],
]) {
  test(`${action}: 開始前・締切後は正しい処理名で応答し、保存やメール送信を行わない`, () => {
    for (const suffix of ['受付はまだ開始していません。', '受付は終了しました。']) {
      const state = setup();
      const message = (kind === 'ENTRY' ? 'エントリー' : '投句') + suffix;
      state.context.getReceptionError = receivedKind => {
        assert.equal(receivedKind, kind);
        return message;
      };
      state.context.makeIdentityHash = () => assert.fail('受付期間外に照合してはいけない');
      const result = state.context[handler]({});
      assert.equal(result.action, action);
      assert.equal(result.ok, false);
      assert.equal(result.message, message);
      assert.deepEqual(state.events, []);
      assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
    }
  });
}

test('チーム情報だけを照合し、入力値を正規化せず、照合結果にリクエストIDを返す', () => {
  const state = setup();
  state.context.makeIdentityHash = (teamName, email) => {
    assert.equal(teamName, 'チームＡ');
    assert.equal(email, 'Team@example.com');
    return 'identity';
  };
  const result = state.context.doPost({ parameter: {
    action: 'check-team', teamName: 'チームＡ', email: 'Team@example.com', requestId: 'request-1',
  } });
  assert.equal(result.action, 'check-team');
  assert.equal(result.ok, true);
  assert.equal(result.requestId, 'request-1');
  assert.deepEqual(state.events, []);
  assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
});

test('チーム照合は不一致・形式不正・前後空白・文字数超過を拒否する', () => {
  const state = setup();
  const data = { teamName: 'チームＡ', email: 'Team@example.com', requestId: 'request-2' };
  state.context.findActiveEntry = () => null;
  const mismatch = state.context.checkTeam(data);
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.message, /一致しません/);
  assert.equal(mismatch.requestId, data.requestId);
  state.context.makeIdentityHash = () => assert.fail('形式不正の情報を照合してはいけない');
  for (const bad of [
    { ...data, teamName: '' }, { ...data, email: 'Team@example' },
    { ...data, teamName: ' チームＡ' }, { ...data, teamName: 'あ'.repeat(201) },
    { ...data, email: 'a'.repeat(250) + '@example.com' },
  ]) {
    const result = state.context.checkTeam(bad);
    assert.equal(result.ok, false);
    assert.equal(result.requestId, data.requestId);
  }
  assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
});

test('チーム照合の例外でもリクエストIDを返し、フォームで再試行できる', () => {
  const state = setup();
  state.context.findActiveEntry = () => { throw new Error('sheet unavailable'); };
  const result = state.context.doPost({ parameter: {
    action: 'check-team', teamName: 'チームＡ', email: 'Team@example.com', requestId: 'request-3',
  } });
  assert.equal(result.ok, false);
  assert.equal(result.requestId, 'request-3');
  assert.match(result.message, /再度お試し/);
});

test('全APIの正常応答・受付期間外・例外にも呼び出し元のオリジンを渡す', () => {
  for (const action of ['entry', 'check-team', 'check-submission', 'submit-submission']) {
    const state = setup();
    const responseOrigin = 'http://127.0.0.1:8766';
    state.context.getReceptionError = () => '受付期間外です。';
    const closed = state.context.doPost({ parameter: { action, responseOrigin } });
    assert.equal(closed.requestedOrigin, responseOrigin);
    state.context.getReceptionError = () => { throw new Error('configuration error'); };
    const failed = state.context.doPost({ parameter: { action, responseOrigin } });
    assert.equal(failed.requestedOrigin, responseOrigin);
  }
  const state = setup();
  state.data.responseOrigin = 'http://127.0.0.1:8766';
  assert.equal(state.context.checkTeam(state.data).requestedOrigin, state.data.responseOrigin);
  assert.equal(state.context.checkSubmission(state.data).requestedOrigin, state.data.responseOrigin);
  assert.equal(state.context.submitSubmission(state.data).requestedOrigin, state.data.responseOrigin);
});

test('本番・許可したローカルにのみ応答し、未指定・許可外は本番へ返す', () => {
  const messages = [];
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput: html => ({ html, setXFrameOptionsMode() { return this; } }),
    },
    window: { top: { postMessage: (payload, origin) => messages.push({ payload, origin }) } },
  });
  vm.runInContext(source, context);
  for (const [requested, expected] of [
    ['https://kleaex.github.io', 'https://kleaex.github.io'],
    ['http://127.0.0.1:8766', 'http://127.0.0.1:8766'],
    ['http://localhost:8766', 'http://localhost:8766'],
    [undefined, 'https://kleaex.github.io'],
    ['https://example.com', 'https://kleaex.github.io'],
    ['http://127.0.0.1:8767', 'https://kleaex.github.io'],
    ['http://127.0.0.1:8766/khb2027', 'https://kleaex.github.io'],
    ['*', 'https://kleaex.github.io'],
  ]) {
    const result = context.respond('check-team', false, '</script>検証結果', { requestId: 'request' }, requested);
    vm.runInContext(result.html.slice('<script>'.length, -'</script>'.length), context);
    const received = messages.at(-1);
    assert.equal(received.origin, expected);
    assert.equal(received.payload.message, '</script>検証結果');
    assert.equal(received.payload.requestId, 'request');
    assert.equal(received.payload.source, 'khb2027');
  }
});

test('プレビューの応答先はScript Propertiesで追加・無効化でき、兼題の取得元は本番のまま', () => {
  const properties = { KHB_PREVIEW_ORIGINS: 'http://localhost:9000' };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) },
  });
  vm.runInContext(source, context);
  assert.equal(context.getResponseOrigin('http://localhost:9000'), 'http://localhost:9000');
  assert.equal(context.getResponseOrigin('http://127.0.0.1:8766'), 'https://kleaex.github.io');
  assert.equal(context.requiredProperty('KHB_SITE_ORIGIN'), 'https://kleaex.github.io');
  properties.KHB_PREVIEW_ORIGINS = '';
  assert.equal(context.getResponseOrigin('http://localhost:9000'), 'https://kleaex.github.io');
});

test('同一の句・作者・特記事項は再保存・履歴追加・メール再送せず、兼題取得も不要', () => {
  for (const overwrite of ['false', 'true']) {
    const state = setup({ networkError: true });
    state.data.overwrite = overwrite;
    const row = { ...state.data, updatedAt: new Date(0), agreeAt: new Date(0), revision: 7, identityHash: 'identity' };
    state.context.findCurrentSubmission = () => ({ rowNumber: 2, values: row });
    const checked = state.context.checkSubmission(state.data);
    assert.equal(checked.alreadySubmitted, true);
    assert.equal(checked.hasExistingSubmission, true);
    const submitted = state.context.submitSubmission(state.data);
    assert.equal(submitted.ok, true);
    assert.equal(submitted.alreadySubmitted, true);
    assert.deepEqual(state.events, ['lock', 'release']);
    assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
    assert.equal(row.revision, 7);
  }
});

test('句・作者・特記事項の1文字差や空白差は同一内容としない', () => {
  const state = setup();
  const row = { values: { ...state.data } };
  for (const field of ['k1_1', 'k1_5_author', 'specialNote']) {
    assert.equal(state.context.isSameSubmission({ ...state.data, [field]: state.data[field] + ' ' }, row), false);
  }
  state.context.findCurrentSubmission = () => ({ values: { ...state.data, specialNote: '別の備考' } });
  const result = state.context.checkSubmission(state.data);
  assert.equal(result.hasExistingSubmission, true);
  assert.equal(result.alreadySubmitted, undefined);
});

test('兼題取得中に同じ内容が先に保存されても、ロック後に検出して重複保存しない', () => {
  const state = setup(); let reads = 0;
  state.context.findCurrentSubmission = () => ++reads === 1 ? null : { values: { ...state.data } };
  const result = state.context.submitSubmission(state.data);
  assert.equal(result.alreadySubmitted, true);
  assert.deepEqual(state.events, ['fetch', 'lock', 'release']);
  assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
});

test('同一内容の事前読み取り後に別の投句へ変わった場合は通常の上書き確認を行う', () => {
  const state = setup(); let reads = 0;
  state.context.findCurrentSubmission = () => ({ values: ++reads === 1 ? { ...state.data } : { ...state.data, specialNote: '更新済み' } });
  const result = state.context.submitSubmission(state.data);
  assert.equal(result.requiresOverwrite, true);
  assert.deepEqual(state.events, ['lock', 'release', 'fetch', 'lock', 'release']);
  assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
});

test('作者ルール違反は確認時と最終送信時に拒否し、保存・履歴・メールを変更しない', () => {
  const state = setup();
  state.data.k2_3_author = state.data.k2_1_author;
  for (const handler of ['checkSubmission', 'submitSubmission']) {
    const result = state.context[handler](state.data);
    assert.equal(result.ok, false);
    assert.match(result.message, /兼題2/);
  }
  assert.deepEqual(state.events, []);
  assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
});

test('どの兼題でも空白を除いて未登録の作者を検出し、確認・最終送信とも保存しない', () => {
  for (const field of ['k1_1_author', 'k2_3_author', 'k3_5_author', 'k4_1_author']) {
    const state = setup();
    state.data[field] = ' 未　登録 作者　';
    for (const handler of ['checkSubmission', 'submitSubmission']) {
      const result = state.context[handler](state.data);
      assert.equal(result.ok, false);
      assert.match(result.message, /登録メンバーの氏名と一致しません/);
    }
    assert.deepEqual(state.events, []);
    assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
  }
});

test('作者の空白差を許容して確認・保存し、シートとメールには入力した表記をそのまま使う', () => {
  const state = setup();
  for (const field of Object.keys(state.data).filter(field => field.endsWith('_author'))) {
    state.data[field] = ` ${state.data[field].replace('作者', '作　者 ')}\t　`;
  }
  assert.equal(state.context.checkSubmission(state.data).ok, true);
  assert.equal(state.context.submitSubmission(state.data).ok, true);
  for (const field of Object.keys(state.data).filter(field => field.endsWith('_author'))) {
    assert.equal(state.saved[0][field], state.data[field]);
    assert.ok(state.mails[0].body.includes(state.data[field]));
  }
});

test('保存前に登録名簿が変わった場合も、最新の名簿で作者を再確認する', () => {
  const state = setup(); let reads = 0;
  const first = state.context.findActiveEntry();
  state.context.findActiveEntry = () => ++reads === 1 ? first : { values: { ...first.values,
    members: JSON.stringify([1, 2, 3, 4, 6].map(slot => ({ name: `作者${slot}`, grade: '高2', school: '' }))) } };
  const result = state.context.submitSubmission(state.data);
  assert.equal(result.ok, false);
  assert.equal(result.requiresEmailVerification, true, '名簿変更により本人確認トークンも失効する');
  assert.deepEqual(state.events, ['fetch', 'lock', 'release']);
  assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
});

test('チーム情報照合は登録人数だけを返し、登録メンバーの氏名はブラウザーへ渡さない', () => {
  const state = setup();
  const result = state.context.checkTeam(state.data);
  assert.equal(result.memberCount, 5);
  assert.equal(result.members, undefined);
});

test('メンバー登録は人数・学年・合同チームの所属校を検証し、メールでは読みやすく表示する', () => {
  const { context } = setup();
  const members = ['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }));
  const data = { memberCount: '3', members: JSON.stringify(members), schoolName: 'A高校' };
  assert.equal(context.validateEntryMembers(data), '');
  assert.match(context.validateEntryMembers({ ...data, memberCount: '4' }), /チーム人数分/);
  assert.match(context.validateEntryMembers({ ...data, members: JSON.stringify([members[0], members[0], members[2]]) }), /実行委員会.*連絡/);
  assert.equal(context.validateEntryMembers({ ...data, members: JSON.stringify([members[0], { ...members[0], grade: '高1' }, members[2]]) }), '');
  assert.match(context.validateEntryMembers({ ...data, members: JSON.stringify(members.map(m => ({ ...m, grade: '' }))) }), /学年/);
  const joint = { ...data, isJointTeam: 'true', schoolName2: 'B高校', members: JSON.stringify(members.map((m, index) => ({ ...m, school: index === 0 ? 'A高校' : 'B高校' }))) };
  assert.equal(context.validateEntryMembers(joint), '');
  assert.match(context.validateEntryMembers({ ...joint, schoolName2: 'C高校' }), /所属校/);
  assert.match(context.validateEntryMembers({ ...joint, isJointTeam: 'false' }), /単独チーム/);
  const body = context.formatMembers(joint.members);
  assert.equal(body, '甲　太郎（A高校・高2）\n乙　花子（B高校・高2）\n丙　三郎（B高校・高2）');
});

test('GAS管理者が設定した試験用兼題で保存・メール送信でき、フォームの値では切り替えない', () => {
  const state = setup({ networkError: true, properties: { KHB_TEST_TOPICS_JSON: JSON.stringify(published) } });
  state.data.action = 'submit-submission';
  state.data.requestId = 'final-request';
  state.data.responseOrigin = 'http://127.0.0.1:8766';
  state.data.KHB_TEST_TOPICS_JSON = '不正な兼題';
  const result = state.context.doPost({ parameter: state.data });
  assert.equal(result.ok, true);
  assert.equal(result.requestId, 'final-request');
  assert.equal(result.requestedOrigin, state.data.responseOrigin);
  assert.deepEqual(state.events, ['lock', 'append', 'flush', 'release', 'mail']);
  assert.ok(state.mails[0].body.includes('兼題①「春」'));
  assert.equal(state.saved.length, 1);
});

test('不正な試験用兼題は保存せず、クライアントが兼題を渡しても未設定の公開兼題は補えない', () => {
  const badFixture = setup({ properties: { KHB_TEST_TOPICS_JSON: '{invalid' } });
  assert.equal(badFixture.context.submitSubmission(badFixture.data).ok, false);
  assert.equal(badFixture.saved.length + badFixture.mails.length, 0);
  assert.deepEqual(badFixture.events, []);
  const unset = setup({ json: JSON.stringify({ ...published, dai1: ['', '「」', '（）'] }) });
  unset.data.responseOrigin = 'http://127.0.0.1:8766';
  unset.data.KHB_TEST_TOPICS_JSON = JSON.stringify(published);
  assert.equal(unset.context.submitSubmission(unset.data).ok, false);
  assert.equal(unset.saved.length + unset.mails.length, 0);
  assert.deepEqual(unset.events, ['fetch']);
});

test('紹介文の改行はLF・CRLF・CRとも1字で数え、250〜280字の境界判定を一致させる', () => {
  const { context } = setup();
  const front = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/entryRules.js'), 'utf8').replace(/export /g, ''), front);
  const data = { schoolName: 'A高校', plannedTeamCount: '1', teamName: 'A高校チーム', responsibleName: '佐藤　花子',
    responsibleRole: '顧問', email: 'test@example.com', memberCount: '3',
    members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }))),
    termsConsent: 'true', inputConfirmation: 'true', contactConfirmation: 'true' };
  for (const length of [249, 250, 280, 281]) for (const newline of ['\n', '\r\n', '\r']) {
    const introduction = 'あ'.repeat(length - 7) + '𠮷😀 ' + newline + newline + 'い' + newline;
    const payload = { ...data, introduction }; const before = JSON.stringify(payload);
    assert.equal(front.introductionLength(introduction), length);
    assert.equal(context.introductionLength(introduction), length);
    assert.equal(context.validateEntry(payload) === '', length >= 250 && length <= 280, `${length}字・${JSON.stringify(newline)}`);
    assert.equal(JSON.stringify(payload), before, '改行は文字数判定時だけ揃え、保存する入力値を書き換えない');
  }
});

test('学年リストの選択肢は画面とGASで一致し、リスト外の値は保存前に拒否する', () => {
  const state = setup(); const { context } = state;
  context.getReceptionError = () => '';
  context.makeIdentityHash = () => assert.fail('不正な学年では照合・保存へ進めない');
  const data = {
    schoolName: 'A高校', plannedTeamCount: '1', teamName: 'A高校チーム', responsibleName: '佐藤　花子',
    responsibleRole: '顧問', email: 'test@example.com', memberCount: '3',
    introduction: 'あ'.repeat(250), termsConsent: 'true', inputConfirmation: 'true', contactConfirmation: 'true',
  };
  const members = ['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }));
  const front = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/entryRules.js'), 'utf8').replace(/export /g, ''), front);
  assert.equal(vm.runInContext('JSON.stringify(ENTRY_GRADES)', front), vm.runInContext('JSON.stringify(ENTRY_GRADES)', context));
  for (const grade of ['中1', '中2', '中3', '高1', '高2', '高3']) {
    assert.equal(context.validateEntry({ ...data, members: JSON.stringify(members.map(member => ({ ...member, grade }))) }), '');
  }
  for (const grade of ['', ' 高2', '高2 ', '高４', '高4', '大学1年', 2, null, ['高2']]) {
    const result = context.handleEntry({ ...data, members: JSON.stringify(members.map(member => ({ ...member, grade }))) });
    assert.equal(result.ok, false); assert.match(result.message, /学年/);
  }
  assert.equal(state.saved.length + state.mails.length, 0); assert.deepEqual(state.events, []);
});

test('姓名間スペースは責任者・メンバーとも保存前に検証し、全角・半角の原表記を保持する', () => {
  const state = setup(); const { context } = state;
  context.getReceptionError = () => '';
  context.makeIdentityHash = () => assert.fail('不正な氏名では照合・保存へ進めない');
  const members = ['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }));
  const data = { schoolName: 'A高校', plannedTeamCount: '1', teamName: 'A高校チーム', responsibleName: '佐藤　花子',
    responsibleRole: '顧問', email: 'test@example.com', memberCount: '3', members: JSON.stringify(members),
    introduction: 'あ'.repeat(250), termsConsent: 'true', inputConfirmation: 'true', contactConfirmation: 'true' };
  for (const name of ['山田太郎', ' 山田太郎　', '山田\t太郎', '山田\n太郎', '山田　']) {
    for (const payload of [{ ...data, responsibleName: name }, { ...data, members: JSON.stringify([{ ...members[0], name }, ...members.slice(1)]) }]) {
      const result = context.handleEntry(payload); assert.equal(result.ok, false); assert.match(result.message, /姓と名の間|前後に空白/);
    }
  }
  for (const name of ['山田　太郎', '山田 太郎', '山田  太郎', '山田　太郎 次郎']) {
    const payload = { ...data, responsibleName: name, members: JSON.stringify([{ ...members[0], name }, ...members.slice(1)]) };
    const before = JSON.stringify(payload); assert.equal(context.validateEntry(payload), ''); assert.equal(JSON.stringify(payload), before);
    assert.ok(context.formatMembers(payload.members).includes(name));
  }
  assert.equal(state.saved.length + state.mails.length, 0); assert.deepEqual(state.events, []);
});

test('合同チームは2〜5校のすべてから選手が必要で、画面を回避しても選手0人の学校を保存前に拒否する', () => {
  const state = setup(); const { context } = state;
  context.getReceptionError = () => '';
  context.makeIdentityHash = () => assert.fail('全校から選手がいなければ照合・保存へ進めない');
  for (const [schoolCount, assignments, valid] of [
    [2, 'AAB', true], [2, 'BBB', false], [2, 'AAA', false], [2, 'BBAAB', true],
    [3, 'ABC', true], [3, 'ABA', false], [4, 'ABC', false],
    [5, 'ABCDE', true], [5, 'ABCDA', false], [5, 'ABCD', false],
  ]) {
    const schools = 'ABCDE'.slice(0, schoolCount).split('').map(letter => `${letter}高校`);
    const data = { ...Object.fromEntries(schools.map((school, index) => [index ? `schoolName${index + 1}` : 'schoolName', school])),
      isJointTeam: 'true', plannedTeamCount: '1', teamName: '合同チーム', responsibleName: '責任　者', responsibleRole: '顧問', email: 'test@example.com',
      memberCount: String(assignments.length), members: JSON.stringify(assignments.split('').map((letter, index) => ({ name: `選手　${index + 1}`, grade: '高2', school: `${letter}高校` }))),
      introduction: 'あ'.repeat(250), termsConsent: 'true', inputConfirmation: 'true', contactConfirmation: 'true' };
    assert.equal(context.validateEntry(data) === '', valid, `${schoolCount}校・${assignments}`);
    if (!valid) {
      const result = context.handleEntry(data); assert.equal(result.ok, false); assert.match(result.message, /すべての学校から1人以上/);
      for (const school of schools.filter(school => !assignments.includes(school[0]))) assert.ok(result.message.includes(`「${school}」`));
    }
  }
  assert.equal(state.saved.length + state.mails.length, 0); assert.deepEqual(state.events, []);
});

test('合同チームの学校名重複は、ブラウザーの確認を回避してもGASが拒否する', () => {
  const { context } = setup();
  const data = {
    schoolName: 'A高校', schoolName2: 'B高校', isJointTeam: 'true', plannedTeamCount: '1', teamName: '合同チーム',
    responsibleName: '責任　者', responsibleRole: '顧問', email: 'test@example.com',
    memberCount: '3', members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map((name, index) => ({ name, grade: '高2', school: index === 1 ? 'B高校' : 'A高校' }))),
    introduction: 'あ'.repeat(250), termsConsent: 'true', inputConfirmation: 'true', contactConfirmation: 'true',
  };
  assert.equal(context.validateEntry(data), '');
  assert.match(context.validateEntry({ ...data, schoolName2: 'A高校' }), /同じ学校名/);
  assert.match(context.validateEntry({ ...data, schoolName5: 'B高校' }), /同じ学校名/);
});

test('単独チームでは未送信の任意学校名欄を許容し、入力された前後空白は拒否する', () => {
  const { context } = setup();
  const data = {
    schoolName: 'テスト高等学校', plannedTeamCount: '1', teamName: 'テスト高等学校Ａ',
    responsibleName: 'テスト　責任者', responsibleRole: '顧問', email: 'test@example.com',
    memberCount: '3', members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }))), introduction: 'あ'.repeat(250),
    termsConsent: 'true', inputConfirmation: 'true', contactConfirmation: 'true',
  };
  assert.equal(context.validateEntry(data), '');
  assert.match(context.validateEntry({ ...data, teamName: ' ' + data.teamName }), /前後に空白/);
  assert.match(context.validateEntry({ ...data, email: data.email + ' ' }), /メールアドレス/);
});

test('ドットのないメールアドレスはエントリー・投句とも保存前に拒否する', () => {
  const state = setup();
  state.context.getReceptionError = () => '';
  state.context.makeIdentityHash = () => assert.fail('形式不正のメールアドレスを照合してはいけない');
  const entry = {
    schoolName: 'テスト高等学校', plannedTeamCount: '1', teamName: 'テスト高等学校Ａ',
    responsibleName: 'テスト　責任者', responsibleRole: '顧問', email: 'example@example',
    memberCount: '3', members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }))), introduction: 'あ'.repeat(250),
    termsConsent: 'true', inputConfirmation: 'true', contactConfirmation: 'true',
  };
  for (const result of [
    state.context.handleEntry(entry),
    state.context.checkSubmission({ ...state.data, email: entry.email }),
    state.context.submitSubmission({ ...state.data, email: entry.email }),
  ]) {
    assert.equal(result.ok, false);
    assert.match(result.message, /メールアドレスの形式/);
  }
  assert.equal(state.saved.length + state.archived.length + state.mails.length, 0);
  assert.deepEqual(state.events, []);
});

test('エントリー処理中に締切を過ぎた場合、保存直前の確認で受付を止める', () => {
  const state = setup(); let checks = 0;
  state.context.getReceptionError = kind => {
    assert.equal(kind, 'ENTRY');
    return ++checks === 1 ? '' : 'エントリー受付は終了しました。';
  };
  state.context.findRowByValue = () => null;
  state.context.Utilities.getUuid = () => 'entry-id';
  const result = state.context.handleEntry({
    schoolName: 'テスト高等学校', plannedTeamCount: '1', teamName: 'テスト高等学校Ａ',
    responsibleName: 'テスト　責任者', responsibleRole: '顧問', email: 'test@example.com',
    memberCount: '3', members: JSON.stringify(['甲　太郎', '乙　花子', '丙　三郎'].map(name => ({ name, grade: '高2', school: '' }))), introduction: 'あ'.repeat(250),
    termsConsent: 'true', inputConfirmation: 'true', contactConfirmation: 'true',
  });
  assert.equal(result.action, 'entry');
  assert.equal(result.ok, false);
  assert.match(result.message, /受付は終了/);
  assert.equal(checks, 2);
  assert.equal(state.saved.length + state.mails.length, 0);
});
