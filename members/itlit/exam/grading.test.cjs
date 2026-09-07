const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
require('./answer-hash.js');
require('./grading.js');
const { encodeQuestions } = require('./create-question-hashes.cjs');
const { grade, validate, catalog } = ExamGrading;
const plain = [{ answer: [1, 3], points: 20, forbidden: [8, 9] }, { answer: [2], points: 10, forbidden: [8] }];
const exam = { id: 'test', version: '1', title: 'Test', durationMinutes: 1, passScore: 20, forbiddenLimit: 1, questions: encodeQuestions(plain) };
test('設定エラーでも一覧を保持', () => {
  const entries = catalog([{ ...exam, id: 'bad', passScore: 80 }, exam]);
  assert.match(entries[0].error, /合格点80点が配点合計30点/);
  assert.equal(entries[1].error, '');
  assert.ok(catalog([exam, exam]).every(e => e.error));
});
test('合格境界・順序不問・未回答', async () => {
  assert.deepEqual(await grade(exam, [[3, 1], []]), { score: 20, total: 30, passed: true });
  assert.equal((await grade(exam, [[], [2]])).passed, false);
  assert.equal((await grade(exam, [[], []])).score, 0);
});
test('不足・余分・重複は不正解', async () => {
  for (const answer of [[1], [1, 3, 4], [1, 1]]) assert.equal((await grade(exam, [answer, []])).score, 0);
});
test('合格点でも禁忌肢で不合格・無効化', async () => {
  assert.deepEqual(await grade(exam, [[1, 3], [2, 8]]), { score: 20, total: 30, passed: false });
  assert.equal((await grade({ ...exam, forbiddenLimit: null }, [[1, 3], [8]])).passed, true);
});
test('禁忌肢は設問単位', async () => {
  const e = { ...exam, passScore: 0, forbiddenLimit: 2 };
  assert.equal((await grade(e, [[8, 9], []])).passed, true);
  assert.equal((await grade(e, [[9], [8]])).passed, false);
});
test('生成時の不正入力と公開データの平文を拒否', () => {
  validate([exam]);
  for (const answer of [[10], [], [1, 1], [8]]) assert.throws(() => encodeQuestions([{ answer, points: 30, forbidden: [8] }]));
  assert.throws(() => validate([{ ...exam, questions: plain }]));
  assert.throws(() => validate([{ ...exam, questions: [{ ...exam.questions[0], answer: [1, 3] }] }]));
});
test('設問ごとにsaltを生成し、ブラウザとNodeのハッシュが一致', async () => {
  const [a, b] = encodeQuestions([plain[0], plain[0]]);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.answerHash, b.answerHash);
  assert.equal(await ExamAnswerHash.digest(a.salt, 'answer', [3, 1]), a.answerHash);
  assert.equal(createHash('sha256').update(JSON.stringify(['klea-answer-v1', a.salt, 'answer', [1, 3]])).digest('hex'), a.answerHash);
  assert.equal('answer' in a, false);
  assert.equal('forbidden' in a, false);
});
