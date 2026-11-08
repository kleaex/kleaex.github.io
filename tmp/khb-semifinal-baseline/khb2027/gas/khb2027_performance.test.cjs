const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, 'khb2027_webapp.gs'), 'utf8');

function setup() {
  const state = { now: Date.parse('2026-11-10T10:00:00+09:00'), reads: {}, opens: [], ranges: 0, names: 0, logs: [],
    properties: { KHB_SPREADSHEET_ID: 'sheet-1', KHB_HMAC_SECRET: 'secret-for-test' },
    rows: [['identityHash', 'status', 'teamName'], ['same', '無効', 'old'], ['same', '有効', 'current']] };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const sheet = {
    getLastRow: () => state.rows.length, getLastColumn: () => state.rows[0].length,
    getDataRange: () => ({ getValues: () => { state.ranges++; return state.rows.map(row => [...row]); } }),
  };
  const context = vm.createContext({ Date: Clock,
    console: { info: message => state.logs.push(JSON.parse(message)), error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => {
      state.reads[name] = (state.reads[name] || 0) + 1; return state.properties[name] ?? null;
    } }) },
    SpreadsheetApp: { openById: id => { state.opens.push(id); return {
      getSheetByName: () => { state.names++; return sheet; },
    }; } },
  });
  vm.runInContext(source, context);
  context.respond = (action, ok, message, extra) => ({ action, ok, message, ...extra });
  const request = () => context.doPost({ parameter: { action: 'check-team',
    requestId: '12345678-1234-1234-1234-123456789abc' } });
  return { context, state, request };
}

test('1リクエスト内で設定とシートを再利用し、検索は見出し込み1回で読み、行データを保持しない', () => {
  const s = setup();
  s.context.checkTeam = () => {
    assert.equal(s.context.requiredProperty('KHB_HMAC_SECRET'), 'secret-for-test');
    assert.equal(s.context.requiredProperty('KHB_HMAC_SECRET'), 'secret-for-test');
    const sheet = s.context.getSheet('エントリー', []);
    assert.equal(s.context.getSheet('エントリー', []), sheet);
    const first = s.context.findRowByValue(sheet, 'identityHash', 'same', 'status', '有効');
    assert.equal(first.rowNumber, 3); assert.equal(first.values.teamName, 'current');
    // ロック前後に名簿を再取得する場面を再現する。
    s.state.rows[2][1] = '無効';
    assert.equal(s.context.findRowByValue(sheet, 'identityHash', 'same', 'status', '有効'), null);
    s.context.getSheet('投句', []);
    return s.context.respond('check-team', true, 'checked');
  };
  assert.equal(s.request().ok, true);
  assert.deepEqual(s.state.opens, ['sheet-1']); assert.equal(s.state.names, 2);
  assert.equal(s.state.reads.KHB_HMAC_SECRET, 1); assert.equal(s.state.reads.KHB_SPREADSHEET_ID, 1);
  assert.equal(s.state.ranges, 2, '2回の検索はそれぞれ1回の読み取りで最新値を取得する');
});

test('リクエスト境界で設定・シートを破棄し、例外後も新しい設定を読み直す', () => {
  const s = setup(); const seen = [];
  s.context.logEvent = () => {};
  s.context.checkTeam = () => {
    seen.push(s.context.requiredProperty('KHB_HMAC_SECRET'));
    s.context.getSheet('エントリー', []);
    if (seen.length === 1) throw new Error('test error');
    return s.context.respond('check-team', true, 'checked');
  };
  assert.equal(s.request().ok, false);
  s.state.properties.KHB_HMAC_SECRET = 'changed-secret'; s.state.properties.KHB_SPREADSHEET_ID = 'sheet-2';
  assert.equal(s.request().ok, true);
  assert.deepEqual(seen, ['secret-for-test', 'changed-secret']);
  assert.deepEqual(s.state.opens, ['sheet-1', 'sheet-2']); assert.equal(s.state.names, 2);
});

test('締切設定の再利用中も現在時刻を取り直し、待機中の締切超過を拒否する', () => {
  const s = setup();
  s.state.properties.KHB_SUBMISSION_START_JST = '2026-11-01T14:00:00+09:00';
  s.state.properties.KHB_SUBMISSION_DEADLINE_JST = '2026-11-10T10:00:01+09:00';
  s.context.checkTeam = () => {
    assert.equal(s.context.getReceptionError('SUBMISSION'), '');
    s.state.now += 2000;
    return s.context.respond('check-team', false, s.context.getReceptionError('SUBMISSION'));
  };
  assert.match(s.request().message, /受付は終了/);
  assert.equal(s.state.reads.KHB_SUBMISSION_START_JST, 1); assert.equal(s.state.reads.KHB_SUBMISSION_DEADLINE_JST, 1);
  assert.equal(s.state.logs[0].totalMs, 2000);
  assert.equal(JSON.stringify(s.state.logs).includes('secret-for-test'), false);
});

test('計測ログは不正な処理名・IDを出力せず、受付結果と分離する', () => {
  const s = setup();
  s.context.doPost({ parameter: { action: 'private@example.com', requestId: 'private-token' } });
  assert.equal(s.state.logs[0].action, 'unknown'); assert.equal(s.state.logs[0].requestId, '');
  assert.equal(JSON.stringify(s.state.logs).includes('private'), false);
});
