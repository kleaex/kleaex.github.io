(() => {
  'use strict';
  console.log('%c ストップ！', 'color: #d93025; font-size: 48px; font-weight: bold;');
  console.log('もしあなたがチートを試みたなら、あなたの道徳は120%誤っています。');
  console.log('公正な受験のため、ガバガバなセキュリティであっても、問題の解析や解答・結果の改竄はしないでください。知らないコードをこのコンソールに貼り付けないでください。');
    console.log('%c ストップ！', 'color: #d93025; font-size: 48px; font-weight: bold;');
  console.log('もしあなたがチートを試みたなら、あなたの道徳は120%誤っています。');
  console.log('公正な受験のため、ガバガバなセキュリティであっても、問題の解析や解答・結果の改竄はしないでください。知らないコードをこのコンソールに貼り付けないでください。');
    console.log('%c ストップ！', 'color: #d93025; font-size: 48px; font-weight: bold;');
  console.log('もしあなたがチートを試みたなら、あなたの道徳は120%誤っています。');
  console.log('公正な受験のため、ガバガバなセキュリティであっても、問題の解析や解答・結果の改竄はしないでください。知らないコードをこのコンソールに貼り付けないでください。');
  const $ = id => document.getElementById(id);
  const key = `klea-training-exam-v2:${location.pathname.replace(/index\.html$/, '')}`;
  let state = null, exam = null, pending = null;
  let verified = null;
  let resultGrade = null, gradeRequest = 0;
  let catalog = [];
  const notice = text => { $('notice').textContent = text; $('notice').hidden = !text; };
  function show(id) {
    for (const name of ['start', 'ready', 'taking', 'result', 'certificate']) $(name).hidden = name !== id;
    document.body.classList.toggle('exam-active', id === 'taking');
  }
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
      $('save-status').textContent = '保存済み';
      notice('');
      return true;
    } catch {
      $('save-status').textContent = '保存できませんでした';
      notice('ブラウザに保存できません。ページを閉じると回答が失われます。ブラウザの保存設定を確認してください。');
      return false;
    }
  }
  function details() {
    const entry = catalog[Number($('exam-select').value)];
    $('start-form').querySelector('button').disabled = !!entry.error;
    if (entry.error) {
      $('exam-details').textContent = `設定を確認してください：${entry.error}`;
      return;
    }
    const e = entry.exam;
    const forbiddenRule = e.forbiddenLimit === null ? '' : ` ／ 禁忌肢を含む回答が${e.forbiddenLimit}問以上で不合格（提出時判定）`;
    const paperInfo = e.paperPages ? ` ／ 問題PDF ${e.paperPages}ページ（注意事項は1ページ）` : '';
    $('exam-details').textContent = `${e.questions.length}問 ／ 制限時間 ${e.durationMinutes}分 ／ ${e.questions.reduce((s, q) => s + q.points, 0)}点満点 ／ 合格点 ${e.passScore}点${forbiddenRule}${paperInfo}`;
  }
  function progress() {
    $('progress').textContent = `回答済み ${state.answers.filter(a => a.length).length} / ${exam.questions.length}問`;
  }
  function renderExam() {
    show('taking');
    $('exam-title').textContent = exam.title;
    $('paper').hidden = $('pdf-link').hidden = !exam.pdf;
    $('sample').hidden = !!exam.pdf;
    if (exam.pdf) {
      $('paper').src = exam.pdf;
      $('pdf-link').href = exam.pdf;
      $('pdf-link').textContent = exam.paperPages ? `別タブで開く（${exam.paperPages}ページ）` : '別タブで開く';
    } else $('sample').textContent = exam.sampleText || '問題PDFは準備中です。';
    $('answer-list').replaceChildren();
    exam.questions.forEach((_, i) => {
      const row = document.createElement('div');
      row.className = 'answer-row';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', `解答番号${i + 1}`);
      const answerNumber = document.createElement('span');
      answerNumber.className = 'answer-number';
      answerNumber.textContent = String(i + 1);
      row.append(answerNumber);
      const marks = document.createElement('div');
      marks.className = 'marks';
      for (let n = 1; n <= 9; n++) {
        const label = document.createElement('label');
        label.className = 'mark';
        const input = document.createElement('input');
        input.type = 'checkbox'; input.name = `q${i}`; input.value = n;
        input.checked = state.answers[i].includes(n);
        input.setAttribute('aria-label', `解答番号${i + 1}：選択肢${n}`);
        input.addEventListener('change', () => {
          if (tick()) return;
          state.answers[i] = Array.from(marks.querySelectorAll('input:checked'), item => Number(item.value)); save(); progress();
        });
        const number = document.createElement('span'); number.textContent = n;
        label.append(input, number); marks.append(label);
      }
      const clear = document.createElement('button');
      clear.type = 'button'; clear.className = 'clear'; clear.textContent = 'クリア';
      clear.setAttribute('aria-label', `解答番号${i + 1}の回答をクリア`);
      clear.addEventListener('click', () => {
        if (tick()) return;
        state.answers[i] = [];
        marks.querySelectorAll('input').forEach(input => { input.checked = false; });
        save(); progress();
      });
      marks.append(clear); row.append(marks); $('answer-list').append(row);
    });
    progress(); tick();
  }
  async function result() {
    const request = ++gradeRequest;
    const submittedState = state;
    resultGrade = null;
    show('result');
    $('result-title').textContent = exam.title;
    $('score').textContent = '採点中…'; $('verdict').textContent = '';
    $('show-certificate').hidden = $('retry-grade').hidden = true;
    $('result').focus();
    try {
    const grade = await ExamGrading.grade(exam, state.answers);
    if (request !== gradeRequest || state !== submittedState) return;
    resultGrade = grade;
    $('score').textContent = `${grade.score} / ${grade.total}点`;
    $('verdict').textContent = grade.passed ? '合格' : '不合格';
    $('submitted').textContent = `${state.reason === 'timeout' ? '制限時間終了により提出' : '提出完了'}：${new Date(state.submittedAt).toLocaleString('ja-JP')}`;
    $('show-certificate').hidden = !grade.passed;
    $('result').focus();
    } catch {
      if (request !== gradeRequest || state !== submittedState) return;
      $('score').textContent = '採点できませんでした';
      $('verdict').textContent = 'HTTPSまたはlocalhostで開き、再試行してください。';
      $('retry-grade').hidden = false;
    }
  }
  function submit(reason) {
    if (!state || state.submittedAt) return;
    state.reason = reason;
    state.submittedAt = reason === 'timeout' ? state.endsAt : Date.now();
    save(); result();
  }
  function tick() {
    if (!state || state.submittedAt) return true;
    const seconds = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    $('time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    $('time').parentElement.classList.toggle('urgent', seconds <= 60);
    if (!seconds) { submit('timeout'); return true; }
    return false;
  }
  try { catalog = ExamGrading.catalog(window.EXAMS); }
  catch (error) {
    notice(`受験設定に問題があります：${error.message}`);
    $('start-form').querySelector('button').disabled = true;
    return;
  }
  for (const [index, entry] of catalog.entries()) {
    const option = document.createElement('option'); option.value = String(index); option.textContent = `${entry.exam?.title || `受験${index + 1}`} ${entry.error ? '（設定エラー）' : ''}`.trim();
    $('exam-select').append(option);
  }
  details();
  $('exam-select').addEventListener('change', details);
  $('start-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('start-form').querySelector('button');
    const entry = catalog[Number($('exam-select').value)];
    if (entry.error) { details(); return; }
    button.disabled = true;
    try {
      const selectedExam = entry.exam;
      const identity = await ExamIdentity.authorize($('candidate').value, $('email').value, window.EXAM_ACCESS);
      notice('');
      const resume = pending && pending.candidateId === identity.id && pending.examId === selectedExam.id;
      verified = { identity, exam: selectedExam, resume: !!resume };
      $('email').value = '';
      $('ready-title').textContent = selectedExam.title;
      $('ready-details').textContent = `${identity.name} 様 ／ ${selectedExam.questions.length}問 ／ 制限時間 ${selectedExam.durationMinutes}分`;
      $('begin').textContent = resume ? (pending.submittedAt ? '結果を表示' : '受験を再開') : '受験開始';
      $('ready-message').textContent = resume
        ? (pending.submittedAt ? '提出済みの結果を表示します。' : '開始済みの受験です。この画面でも制限時間は進んでいます。期限を過ぎている場合は再開時に自動提出します。')
        : '準備ができたら「受験開始」を押してください。その時点から制限時間が始まります。開始後はページを閉じても時間は進みます。';
      show('ready'); $('ready').focus();
    } catch (error) { notice(error.message || '照合できませんでした。HTTPSで開いて再度お試しください。'); }
    finally { details(); }
  });
  $('ready-back').addEventListener('click', () => {
    verified = null; notice(''); show('start'); $('candidate').focus();
  });
  $('begin').addEventListener('click', () => {
    if (!verified) return;
    const { identity, resume } = verified;
    if (!resume && pending && !confirm('保存されている別の受験記録を置き換えて、新しく受験しますか？')) return;
    exam = verified.exam;
    if (resume) {
      state = pending;
    } else {
      const now = Date.now();
      state = { examId: exam.id, config: JSON.stringify(exam), candidate: identity.name, candidateId: identity.id, startedAt: now, endsAt: now + exam.durationMinutes * 60000, answers: exam.questions.map(() => []), submittedAt: null };
      if (!save()) { state = null; return; }
    }
    pending = null; verified = null;
    if (state.submittedAt) result(); else renderExam();
  });
  $('candidate').addEventListener('input', () => $('candidate').setCustomValidity(''));
  $('submit').addEventListener('click', () => {
    if (tick()) return;
    const unanswered = state.answers.filter(a => !a.length).length;
    if (confirm(`${unanswered ? `未回答が${unanswered}問あります。` : 'すべて回答済みです。'}提出後は変更できません。提出しますか？`)) {
      if (!tick()) submit('manual');
    }
  });
  $('show-certificate').addEventListener('click', () => {
    const grade = resultGrade;
    if (!grade?.passed) return;
    $('cert-id').textContent = `${state.candidate} 様`;
    $('cert-text').textContent = exam.certificateText;
    $('cert-title').textContent = exam.title;
    $('cert-score').textContent = `得点：${grade.score} / ${grade.total}点`;
    $('cert-date').textContent = `合格日：${new Date(state.submittedAt).toLocaleDateString('ja-JP')}`;
    $('cert-issuer').textContent = exam.certificateIssuer;
    show('certificate'); $('certificate').focus();
  });
  $('print').addEventListener('click', () => window.print());
  $('back').addEventListener('click', result);
  $('retry-grade').addEventListener('click', result);
  $('restart').addEventListener('click', () => {
    if (!confirm('保存されている結果を消して、新しく受験しますか？')) return;
    try { localStorage.removeItem(key); }
    catch { notice('保存データを削除できません。ブラウザの保存設定を確認してください。'); return; }
    state = null; exam = null; notice(''); show('start');
  });
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const s = JSON.parse(saved);
      const index = catalog.findIndex(entry => !entry.error && entry.exam.id === s.examId);
      const e = catalog[index]?.exam;
      if (!e || s.config !== JSON.stringify(e)) throw new Error('受験内容が更新されています。新しく受験してください。');
      if (typeof s.candidate !== 'string' || !s.candidate.trim() || !/^[a-f0-9]{64}$/.test(s.candidateId) || !Number.isFinite(s.startedAt) || !Number.isFinite(s.endsAt) || s.endsAt <= s.startedAt || !Array.isArray(s.answers) || s.answers.length !== e.questions.length || s.answers.some(a => !Array.isArray(a) || new Set(a).size !== a.length || a.some(n => !Number.isInteger(n) || n < 1 || n > 9)) || (s.submittedAt !== null && (!Number.isFinite(s.submittedAt) || !['manual', 'timeout'].includes(s.reason)))) throw new Error('保存データを読み込めません。新しく受験してください。');
      pending = s;
      $('exam-select').value = String(index); details();
      notice('保存された受験記録があります。同じ氏名・メールアドレスで照合すると再開・結果表示できます。制限時間は進み続けています。');
    }
  } catch (error) { notice(error.message || '保存データを読み込めません。'); }
  setInterval(tick, 500);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
  // 他タブの保存を反映し、同じ受験を複数タブで操作した際の上書きを減らします。
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) location.reload(); });
})();
