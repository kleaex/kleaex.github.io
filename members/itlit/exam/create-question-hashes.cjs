// 非公開のJSONを標準入力から読み、公開用questions配列だけを標準出力へ出します。
const { randomBytes, createHash } = require('node:crypto');
require('./answer-hash.js');
function encodeQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length) throw new Error('問題配列が必要です。');
  return questions.map((q, index) => {
    const valid = values => Array.isArray(values) && new Set(values).size === values.length && values.every(n => Number.isInteger(n) && n >= 1 && n <= 9);
    if (!q || !valid(q.answer) || !q.answer.length || !valid(q.forbidden) || q.forbidden.some(n => q.answer.includes(n)) || !Number.isInteger(q.points) || q.points < 0) throw new Error(`問${index + 1}の正答・配点・禁忌肢を確認してください。`);
    const salt = randomBytes(16).toString('hex');
    const hash = (kind, values) => createHash('sha256').update(ExamAnswerHash.payload(salt, kind, values), 'utf8').digest('hex');
    return { salt, answerHash: hash('answer', q.answer), points: q.points, forbiddenHashes: q.forbidden.map(n => hash('forbidden', [n])) };
  });
}
module.exports = { encodeQuestions };
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try { console.log(JSON.stringify(encodeQuestions(JSON.parse(input.replace(/^\uFEFF/, ''))), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  });
}
