(function (root) {
  'use strict';
  function validate(exams) {
    if (!Array.isArray(exams) || !exams.length) throw new Error('試験データがありません。');
    const ids = new Set();
    for (const e of exams) {
      if (!e || !e.id || ids.has(e.id) || !e.version || !e.title) throw new Error('試験ID・版・名称を確認してください。');
      ids.add(e.id);
      if (!Number.isFinite(e.durationMinutes) || e.durationMinutes <= 0) throw new Error('制限時間を確認してください。');
      if (!Array.isArray(e.questions) || !e.questions.length) throw new Error('問題がありません。');
      for (const q of e.questions) {
        const isHash = h => typeof h === 'string' && /^[a-f0-9]{64}$/.test(h);
        if (!q || typeof q.salt !== 'string' || !/^[a-f0-9]{32}$/.test(q.salt) || !isHash(q.answerHash) || !Number.isInteger(q.points) || q.points < 0 || !Array.isArray(q.forbiddenHashes) || q.forbiddenHashes.some(h => !isHash(h)) || 'answer' in q || 'forbidden' in q) throw new Error('正答・配点・禁忌肢の設定を確認してください。create-question-hashes.cjsで生成したデータを使用します。');
      }
      const total = e.questions.reduce((s, q) => s + q.points, 0);
      if (!Number.isInteger(e.passScore) || e.passScore < 0) throw new Error('合格点は0以上の整数で指定してください。');
      if (e.passScore > total) throw new Error(`「${e.title}」の合格点${e.passScore}点が配点合計${total}点を超えています。passScoreまたは各問のpointsを確認してください。`);
      if (e.forbiddenLimit !== null && (!Number.isInteger(e.forbiddenLimit) || e.forbiddenLimit < 1)) throw new Error('forbiddenLimitは1以上の整数、またはnullで指定してください。');
    }
  }
  async function grade(exam, answers) {
    let score = 0, total = 0, forbiddenCount = 0;
    for (const [i, q] of exam.questions.entries()) {
      total += q.points;
      const selected = answers[i] || [];
      if (!Array.isArray(selected) || selected.some(n => !Number.isInteger(n) || n < 1 || n > 9) || new Set(selected).size !== selected.length) continue;
      if (selected.length && await root.ExamAnswerHash.digest(q.salt, 'answer', selected) === q.answerHash) score += q.points;
      if (q.forbiddenHashes.length) {
        const hashes = await Promise.all(selected.map(n => root.ExamAnswerHash.digest(q.salt, 'forbidden', [n])));
        if (hashes.some(h => q.forbiddenHashes.includes(h))) forbiddenCount++;
      }
    }
    return { score, total, passed: score >= exam.passScore && (exam.forbiddenLimit === null || forbiddenCount < exam.forbiddenLimit) };
  }
  function catalog(exams) {
    if (!Array.isArray(exams) || !exams.length) throw new Error('試験データがありません。exam-data.jsの構文とwindow.EXAMSを確認してください。');
    return exams.map(exam => {
      try {
        validate([exam]);
        if (exams.filter(other => other?.id === exam.id).length > 1) throw new Error(`試験ID「${exam.id}」が重複しています。別のidを指定してください。`);
        return { exam, error: '' };
      } catch (error) { return { exam, error: error.message }; }
    });
  }
  root.ExamGrading = { validate, grade, catalog };
})(typeof window === 'undefined' ? globalThis : window);
