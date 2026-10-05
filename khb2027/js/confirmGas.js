import { GAS_MESSAGE_SOURCE, GAS_WEB_APP_URL } from './gasConfig.js';
import { SUBMISSION_FIELDS, storageKey } from './formFields.js';

document.addEventListener('DOMContentLoaded', () => {
  const displayIds = SUBMISSION_FIELDS.filter((id) => !['agree', 'authorToken'].includes(id));
  displayIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.textContent = sessionStorage.getItem(storageKey(id)) || (id === 'specialNote' ? 'なし' : '');
  });

  const form = document.getElementById('finalForm');
  const submitButton = document.getElementById('finalSubmit');
  const backButton = document.getElementById('backButton');
  const status = document.getElementById('submission-status');
  const dialog = document.getElementById('overwrite-dialog');
  if (!form) return;
  let state = 'idle';
  let pending = null;
  let responseTimer;
  let sendTimer;

  const action = addHidden('action', 'check-submission');
  const overwrite = addHidden('overwrite', 'false');
  const requestId = addHidden('requestId', '');
  addHidden('responseOrigin', window.location.origin);
  const values = {};
  SUBMISSION_FIELDS.forEach((field) => {
    const value = sessionStorage.getItem(storageKey(field));
    if (value !== null) { values[field] = value; addHidden(field, value); }
  });
  const hasSubmission = SUBMISSION_FIELDS.every((field) => field === 'specialNote'
    || (field === 'agree' ? values[field] === 'true' : Boolean(values[field])));

  function addHidden(name, value) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
    return input;
  }

  function show(nextState, message = '') {
    state = nextState;
    const locked = !['idle', 'unchanged'].includes(state);
    submitButton.disabled = locked || state === 'unchanged' || !hasSubmission;
    backButton.disabled = locked;
    status.hidden = !message;
    status.textContent = message;
    status.setAttribute('aria-busy', String(state === 'checking' || state === 'sending'));
  }

  function fail(message) {
    clearTimeout(responseTimer);
    clearTimeout(sendTimer);
    pending = null;
    show('idle', message);
  }

  function post(kind, allowOverwrite) {
    if (!GAS_WEB_APP_URL) {
      fail('送信先を設定中です。');
      return;
    }
    action.value = kind;
    overwrite.value = String(allowOverwrite);
    requestId.value = crypto.randomUUID();
    pending = { action: kind, requestId: requestId.value };
    form.setAttribute('action', GAS_WEB_APP_URL);
    show(kind === 'check-submission' ? 'checking' : 'sending',
      kind === 'check-submission' ? 'エントリーと投句内容を確認しています…' : '送信しています…');
    responseTimer = setTimeout(() => fail(kind === 'check-submission'
      ? '確認結果を受信できませんでした。通信環境を確認し、もう一度送信してください。'
      : '送信結果を受信できませんでした。受付済みの可能性もあるため、自動返信メールを確認してください。'), 90000);
    try {
      HTMLFormElement.prototype.submit.call(form);
    } catch {
      fail('送信処理を開始できませんでした。もう一度送信してください。');
    }
  }

  function askOverwrite() {
    show('overwrite', 'すでに投句を受け付けています。今回の内容で上書きしますか？');
    if (!dialog.open) dialog.showModal();
  }

  function cancelOverwrite() {
    if (state !== 'overwrite') return;
    dialog.close();
    show('idle', '上書きは行いませんでした。');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state !== 'idle') return;
    if (!hasSubmission) { show('idle', '投句内容が揃っていません。「修正に戻る」から入力を確認してください。'); return; }
    post('check-submission', false);
  });

  document.getElementById('cancelOverwrite').addEventListener('click', cancelOverwrite);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); cancelOverwrite(); });

  document.getElementById('confirmOverwrite').addEventListener('click', () => {
    if (state !== 'overwrite') return;
    dialog.close();
    post('submit-submission', true);
  });

  window.addEventListener('message', (event) => {
    const fromGas = event.origin === 'https://script.google.com' || /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin);
    const message = event.data;
    if (!fromGas || !message || message.source !== GAS_MESSAGE_SOURCE || !pending) return;
    if (message.action !== pending.action || typeof message.ok !== 'boolean') return;
    // 旧デプロイのIDなし応答も受け付ける。IDがある場合は遅延応答を区別する。
    if (message.requestId && message.requestId !== pending.requestId) return;
    clearTimeout(responseTimer);
    pending = null;

    if (message.ok && message.alreadySubmitted) {
      show('unchanged', message.message || '同じ内容ですでに投句されています。');
      return;
    }

    if (!message.ok) {
      if (message.requiresEmailVerification) {
        sessionStorage.removeItem('khb2027:email-auth');
        sessionStorage.removeItem(storageKey('authorToken'));
      }
      if (message.requiresOverwrite) askOverwrite();
      else fail(message.message || '送信を完了できませんでした。');
      return;
    }

    if (message.action === 'check-submission') {
      if (message.hasExistingSubmission) {
        askOverwrite();
      } else {
        show('sending', '送信しています…');
        // 照合応答のiframe内スクリプトが終了してから、保存リクエストへ進む。
        sendTimer = setTimeout(() => post('submit-submission', false), 0);
      }
      return;
    }

    if (message.action === 'submit-submission') {
      show('complete', message.message || '投句を受け付けました。');
      SUBMISSION_FIELDS.forEach((field) => sessionStorage.removeItem(storageKey(field)));
      sessionStorage.removeItem('khb2027:email-auth');
      window.location.href = 'finish.html';
    }
  });

  backButton.addEventListener('click', () => {
    if (state === 'idle' || state === 'unchanged') window.location.href = 'submit.html';
  });
  show('idle', hasSubmission ? '' : '投句内容が揃っていません。「修正に戻る」から入力を確認してください。');
});

