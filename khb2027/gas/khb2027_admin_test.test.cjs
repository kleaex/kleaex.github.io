const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function setup(email = 'admin@example.com') {
  const state = { rows: [], locked: false };
  const context = vm.createContext({
    console: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'KHB_ADMIN_TEST_EMAIL' ? email : 'test-secret' }) },
    Utilities: { getUuid: () => 'test-id', computeHmacSha256Signature: () => [1, 2, 3] },
    LockService: { getScriptLock: () => ({ waitLock() { state.locked = true; }, releaseLock() { state.locked = false; } }) },
    SpreadsheetApp: { flush() { assert.equal(state.locked, true); } },
  });
  for (const file of ['khb2027_webapp.gs', 'khb2027_admin_test.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  }
  context.getSheet = () => ({});
  context.findRowByValue = () => state.rows[0] ? { rowNumber: 2, values: state.rows[0] } : null;
  context.appendObject = (sheet, headers, row) => { assert.equal(state.locked, true); state.rows.push(row); };
  context.writeObject = (sheet, headers, index, row) => { assert.equal(state.locked, true); state.rows[0] = row; };
  context.logEvent = () => {};
  context.getReceptionError = () => { throw new Error('受付期間を変更・利用しない'); };
  return { context, state };
}

test('管理者登録は受付期間に依存せず、重複せず、通常の作者照合に使える', () => {
  const { context: c, state: s } = setup();
  c.adminRegisterTestTeam(); c.adminRegisterTestTeam();
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].status, '有効');
  assert.equal(c.registeredNames(s.rows[0]).length, 3);
  assert.equal(c.authorOptions(s.rows[0]).length, 3);
  assert.equal(s.rows[0].termsConsentAt, '');
  c.adminDisableTestTeam();
  assert.equal(s.rows[0].status, '無効');
  c.adminRegisterTestTeam();
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].status, '有効');
  assert.equal(s.locked, false);
});

test('未設定・不正なメール、対象不在、試験用の印のない登録は変更しない', () => {
  for (const email of ['', 'invalid', ' admin@example.com']) {
    const { context: c, state: s } = setup(email);
    assert.throws(() => c.adminRegisterTestTeam());
    assert.equal(s.rows.length, 0);
  }
  const { context: c, state: s } = setup();
  assert.throws(() => c.adminDisableTestTeam(), /見つかりません/);
  c.adminRegisterTestTeam(); s.rows[0].note = '';
  for (const fn of ['adminRegisterTestTeam', 'adminDisableTestTeam']) {
    assert.throws(() => c[fn](), /印がない/);
    assert.equal(s.rows[0].status, '有効');
    assert.equal(s.locked, false);
  }
});
