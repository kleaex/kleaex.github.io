const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
require('./identity.js');
const { hash, authorize, scheme } = globalThis.ExamIdentity;
test('登録側と受験側のSHA-256が一致し、表記を正規化する', async () => {
  const expected = createHash('sha256').update(JSON.stringify([scheme, '山田 太郎', 'taro@example.com'])).digest('hex');
  assert.equal(await hash(' 山田　 太郎 ', ' ＴＡＲＯ@example.com '), expected);
  assert.notEqual(await hash('山田 花子', 'taro@example.com'), expected);
  assert.deepEqual(await authorize('山田 太郎', 'TARO@example.com', { scheme, hashes: [expected] }), { id: expected, name: '山田 太郎' });
});
test('未登録・未設定・不正な設定・不正入力を拒否', async () => {
  const config = { scheme, hashes: [await hash('山田 太郎', 'taro@example.com')] };
  await assert.rejects(authorize('山田 太郎', 'other@example.com', config), /一致しません/);
  await assert.rejects(authorize('山田 太郎', 'taro@example.com', { scheme, hashes: [] }), /準備中/);
  await assert.rejects(authorize('山田 太郎', 'taro@example.com', { scheme: 'other', hashes: [] }), /設定/);
  await assert.rejects(hash('　', 'taro@example.com'));
  await assert.rejects(hash('山田 太郎', 'invalid'));
});
test('例示文字列が混在した場合は位置を示して拒否する', async () => {
  const registered = await hash('山田 太郎', 'taro@example.com');
  await assert.rejects(authorize('山田 太郎', 'taro@example.com', { scheme, hashes: [registered, 'hash1'] }), /2件目が不正/);
  assert.equal((await authorize('山田 太郎', 'taro@example.com', { scheme, hashes: [registered] })).id, registered);
});
