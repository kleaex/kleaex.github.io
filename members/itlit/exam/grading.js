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
        if (!Array.isArray(q.answer) || !q.answer.length || new Set(q.answer).size !== q.answer.length || q.answer.some(n => !Number.isInteger(n) || n < 1 || n > 9) || !Number.isInteger(q.points) || q.points < 0 || !Array.isArray(q.forbidden) || q.forbidden.some(n => !Number.isInteger(n) || n < 1 || n > 9 || q.answer.includes(n))) throw new Error('正答・配点・禁忌肢を確認してください。');
      }
      const total = e.questions.reduce((s, q) => s + q.points, 0);
      if (!Number.isInteger(e.passScore) || e.passScore < 0) throw new Error('合格点は0以上の整数で指定してください。');
      if (e.passScore > total) throw new Error(`「${e.title}」の合格点${e.passScore}点が配点合計${total}点を超えています。passScoreまたは各問のpointsを確認してください。`);
      if (e.forbiddenLimit !== null && (!Number.isInteger(e.forbiddenLimit) || e.forbiddenLimit < 1)) throw new Error('forbiddenLimitは1以上の整数、またはnullで指定してください。');
    }
  }
  function grade(exam, answers) {
    let score = 0, total = 0, forbiddenCount = 0;
    exam.questions.forEach((q, i) => {
      total += q.points;
      const selected = answers[i] || [];
      if (selected.length === q.answer.length && new Set(selected).size === selected.length && q.answer.every(n => selected.includes(n))) score += q.points;
      if (q.forbidden.some(n => selected.includes(n))) forbiddenCount++;
    });
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
