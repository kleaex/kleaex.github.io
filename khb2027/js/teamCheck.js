import { GAS_MESSAGE_SOURCE, GAS_WEB_APP_URL } from './gasConfig.js';

export function setupTeamCheck(form, { onStateChange = () => {} } = {}) {
  const teamName = document.getElementById('teamName');
  const email = document.getElementById('email');
  const status = document.getElementById('team-status');
  const retry = document.getElementById('retry-team-check');
  const next = document.getElementById('submitting');
  const fields = [teamName, email];
  let debounceTimer;
  let responseTimer;
  let pending = null;
  let verified = null;
  let composing = false;

  // 照合用フォームは投句フォームと分け、俳句や宣誓は送らない。
  const frame = document.createElement('iframe');
  frame.name = 'khb2027-team-check';
  frame.title = 'チーム情報の照合';
  frame.hidden = true;
  const checkForm = document.createElement('form');
  checkForm.method = 'POST';
  checkForm.target = frame.name;
  checkForm.hidden = true;
  const inputs = {};
  for (const name of ['action', 'requestId', 'teamName', 'email', 'responseOrigin']) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    checkForm.appendChild(input);
    inputs[name] = input;
  }
  inputs.action.value = 'check-team';
  inputs.responseOrigin.value = window.location.origin;
  document.body.appendChild(frame);
  document.body.appendChild(checkForm);

  const currentValues = () => ({ teamName: teamName.value, email: email.value });
  const matches = (values) => values && values.teamName === teamName.value && values.email === email.value;

  function show(message, canRetry = false) {
    status.textContent = message;
    retry.hidden = !canRetry;
    next.disabled = !matches(verified);
    status.setAttribute('aria-busy', String(Boolean(pending)));
    onStateChange();
  }

  function invalidate() {
    clearTimeout(debounceTimer);
    clearTimeout(responseTimer);
    pending = null;
    verified = null;
    next.disabled = true;
  }

  function validate() {
    fields.forEach((field) => field.setCustomValidity(''));
    for (const field of fields) {
      const limit = field === teamName ? 200 : 254;
      if (field.value !== field.value.trim()) {
        field.setCustomValidity('入力の前後に空白を入れないでください。');
      } else if (Array.from(field.value).length > limit) {
        field.setCustomValidity(`${limit}字以内で入力してください。`);
      }
    }
    if (!teamName.value || !email.value) return 'チーム名とメールアドレスを入力すると、事前エントリーを自動で確認します。';
    const invalid = fields.find((field) => !field.validity.valid);
    if (invalid) return invalid.validationMessage;
    return '';
  }

  function check() {
    clearTimeout(debounceTimer);
    const error = validate();
    if (error) { show(error); return; }
    if (!GAS_WEB_APP_URL) { show('照合先を設定中です。', true); return; }
    pending = { ...currentValues(), requestId: crypto.randomUUID() };
    checkForm.setAttribute('action', GAS_WEB_APP_URL);
    for (const name of ['teamName', 'email', 'requestId']) inputs[name].value = pending[name];
    show('事前エントリーを確認しています…');
    responseTimer = setTimeout(() => {
      pending = null;
      show('確認結果を受信できませんでした。もう一度確認してください。', true);
    }, 30000);
    try {
      checkForm.submit();
    } catch {
      clearTimeout(responseTimer);
      pending = null;
      show('事前エントリーを確認できませんでした。もう一度確認してください。', true);
    }
  }

  function schedule() {
    if (!composing && (matches(verified) || matches(pending))) return;
    invalidate();
    const error = validate();
    if (error || composing) { show(error || 'チーム情報を入力しています…'); return; }
    show('入力が終わると、事前エントリーを確認します。');
    debounceTimer = setTimeout(check, 400);
  }

  fields.forEach((field) => {
    field.addEventListener('input', schedule);
    field.addEventListener('change', schedule);
    field.addEventListener('compositionstart', () => { composing = true; schedule(); });
    field.addEventListener('compositionend', () => { composing = false; schedule(); });
  });
  retry.addEventListener('click', () => { invalidate(); check(); });

  window.addEventListener('message', (event) => {
    const fromGas = event.origin === 'https://script.google.com' || /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin);
    const message = event.data;
    if (!fromGas || !message || message.source !== GAS_MESSAGE_SOURCE || message.action !== 'check-team') return;
    if (!pending || message.requestId !== pending.requestId || !matches(pending)) return;
    clearTimeout(responseTimer);
    const checkedValues = pending;
    pending = null;
    if (message.ok === true) {
      verified = { ...checkedValues, memberCount: Number(message.memberCount) };
      show(message.message || '事前エントリーを確認しました。');
    } else {
      verified = null;
      show(message.message || '事前エントリーを確認できませんでした。', true);
    }
  });

  // 確認画面から戻った場合も、復元された情報を再照合する。
  window.addEventListener('pageshow', () => { invalidate(); schedule(); });
  form.addEventListener('submit', (event) => {
    if (!matches(verified)) event.preventDefault();
  });
  schedule();
  return {
    isVerified: () => Boolean(matches(verified)),
    getMemberCount: () => matches(verified) && [3, 4, 5].includes(verified.memberCount) ? verified.memberCount : null,
  };
}
