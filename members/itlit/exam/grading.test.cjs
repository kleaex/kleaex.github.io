const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./grading.js');
const { grade, validate } = globalThis.ExamGrading;
test('設定エラーがあっても一覧を保持し、正常な試験を利用できる', () => {
  const good = { id: 'good', version: '1', title: '正常', durationMinutes: 60, passScore: 20, forbiddenLimit: 1, questions: [{ answer: [2], points: 30, forbidden: [] }] };
  const bad = { ...good, id: 'bad', title: '技術', passScore: 80 };
  const entries = ExamGrading.catalog([bad, good]);
  assert.equal(entries.length, 2);
  assert.match(entries[0].error, /合格点80点が配点合計30点/);
  assert.equal(entries[1].error, '');
  assert.ok(ExamGrading.catalog([good, { ...good }]).every(entry => entry.error));
});
const exam = { id: 'test', version: '1', title: 'Test', durationMinutes: 1, passScore: 20, forbiddenLimit: 1, questions: [{ answer: [1, 3], points: 20, forbidden: [8, 9] }, { answer: [2], points: 10, forbidden: [8] }] };
test('合格点・順序不問・未回答', () => {
  assert.deepEqual(grade(exam, [[3, 1], []]), { score: 20, total: 30, passed: true });
  assert.equal(grade(exam, [[], [2]]).passed, false);
  assert.equal(grade(exam, [[], []]).score, 0);
});
test('不足・余分・重複は不正解', () => {
  for (const answer of [[1], [1, 3, 4], [1, 1]]) assert.equal(grade(exam, [answer, []]).score, 0);
});
test('禁忌肢で不合格・無効化', () => {
  assert.deepEqual(grade(exam, [[1, 3], [2, 8]]), { score: 20, total: 30, passed: false });
  assert.equal(grade({ ...exam, forbiddenLimit: null }, [[1, 3], [8]]).passed, true);
});
test('禁忌肢は設問単位', () => {
  const e = { ...exam, passScore: 0, forbiddenLimit: 2 };
  assert.equal(grade(e, [[8, 9], []]).passed, true);
  assert.equal(grade(e, [[9], [8]]).passed, false);
});
test('不正な設定を拒否', () => {
  assert.doesNotThrow(() => validate([exam]));
  assert.throws(() => validate([{ ...exam, passScore: 31 }]));
  for (const answer of [[10], [], [1, 1], [8]]) assert.throws(() => validate([{ ...exam, questions: [{ answer, points: 30, forbidden: [8] }] }]));
});
