import { GAS_MESSAGE_SOURCE, GAS_WEB_APP_URL } from './gasConfig.js';
import { AUTHOR_GROUPS } from './authorRules.js';
import { storageKey } from './formFields.js';

export const EMAIL_AUTH_STORAGE_KEY = 'khb2027:email-auth';

export function setupEmailAuth(form, teamCheck, { onStateChange = () => {} } = {}) {
  const team = document.getElementById('teamName');
  const email = document.getElementById('email');
  const box = document.getElementById('email-auth');
  const send = document.getElementById('send-email-code');
  const verify = document.getElementById('verify-email-code');
  const code = document.getElementById('email-code');
  const status = document.getElementById('email-auth-status');
  const tokenField = document.getElementById('authorToken');
  const submissionFields = document.getElementById('submission-fields');
  const accessStatus = document.getElementById('submission-access-status');
  const selects = [];
  const drafts = new Map();
  for (const group of AUTHOR_GROUPS) for (const id of group.fields) {
    const old = document.getElementById(id);
    drafts.set(id, old.value);
    const select = document.createElement('select');
    select.id = id; select.name = id; select.className = old.className;
    select.required = true; select.disabled = true;
    const position = { 1: '大将', 2: '副将', 3: '中堅', 4: '次鋒', 5: '先鋒' }[id.split('_')[1]];
    select.setAttribute('aria-label', `${group.round === 4 ? '決勝' : `兼題${group.round}`}の${position}句の作者`);
    old.replaceWith(select); selects.push(select);
  }
  let identity = '';
  let verified = null;
  let pending = null;
  let challengeId = '';
  let retryAt = 0;
  let retryTimer;
  let responseTimer;
  let expiryTimer;
  let restoreAttempted = false;
  const frame = document.createElement('iframe');
  frame.name = 'khb2027-email-auth'; frame.title = 'メール本人確認'; frame.hidden = true;
  const requestForm = document.createElement('form');
  requestForm.method = 'POST'; requestForm.target = frame.name; requestForm.hidden = true;
  const inputs = {};
  for (const name of ['action', 'teamName', 'email', 'requestId', 'responseOrigin', 'code', 'challengeId', 'authorToken']) {
    const input = document.createElement('input'); input.type = 'hidden'; input.name = name;
    requestForm.appendChild(input); inputs[name] = input;
  }
  inputs.responseOrigin.value = window.location.origin;
  document.body.appendChild(frame); document.body.appendChild(requestForm);

  const currentIdentity = () => JSON.stringify([team.value, email.value]);
  const isVerified = () => teamCheck.isVerified() && verified && verified.identity === currentIdentity() && Date.now() < verified.expiresAt;
  function placeholder(select) {
    select.replaceChildren();
    const option = document.createElement('option'); option.value = ''; option.textContent = '本人確認後に作者を選択';
    select.appendChild(option); select.disabled = true; select.setCustomValidity('');
  }
  function clearRoster() {
    for (const select of selects) { if (select.value) drafts.set(select.id, select.value); placeholder(select); }
    tokenField.value = '';
  }
  function show(message) {
    if (message !== undefined) status.textContent = message;
    // 保存済みトークンも、作者一覧をサーバーで再確認するまでは入力を許可しない。
    const canInput = Boolean(isVerified() && tokenField.value);
    submissionFields.disabled = !canInput;
    submissionFields.hidden = !canInput;
    accessStatus.hidden = canInput;
    box.hidden = !teamCheck.isVerified();
    send.disabled = !teamCheck.isVerified() || Boolean(pending) || Boolean(isVerified()) || Date.now() < retryAt;
    verify.disabled = !teamCheck.isVerified() || Boolean(pending) || !challengeId || Boolean(isVerified());
    code.disabled = Boolean(isVerified()) || Boolean(pending) || !teamCheck.isVerified();
    status.setAttribute('aria-busy', String(Boolean(pending)));
    onStateChange();
  }
  function forget() {
    verified = null; tokenField.value = ''; clearTimeout(expiryTimer);
    sessionStorage.removeItem(EMAIL_AUTH_STORAGE_KEY);
    sessionStorage.removeItem(storageKey('authorToken'));
    clearRoster();
  }
  function post(action, authorToken = '') {
    if (!teamCheck.isVerified() || pending || !GAS_WEB_APP_URL) return;
    pending = { identity: currentIdentity(), action, requestId: crypto.randomUUID() };
    requestForm.setAttribute('action', GAS_WEB_APP_URL);
    inputs.action.value = action;
    for (const name of ['teamName', 'email', 'requestId']) inputs[name].value = name === 'teamName' ? team.value : name === 'email' ? email.value : pending.requestId;
    inputs.code.value = action === 'verify-email-code' ? code.value : '';
    inputs.challengeId.value = action === 'verify-email-code' ? challengeId : '';
    inputs.authorToken.value = authorToken;
    show(action === 'send-email-code' ? '確認メールを送っています…' : 'メール本人確認を確認しています…');
    function failedPost(message) {
      clearTimeout(responseTimer); pending = null;
      inputs.code.value = ''; inputs.authorToken.value = '';
      if (action === 'get-author-options') forget();
      show(message);
    }
    responseTimer = setTimeout(() => failedPost('確認結果を受信できませんでした。もう一度お試しください。'), 45000);
    try { HTMLFormElement.prototype.submit.call(requestForm); }
    catch { failedPost('確認処理を開始できませんでした。もう一度お試しください。'); }
  }
  function refreshTeam() {
    const nextIdentity = currentIdentity();
    if (identity !== nextIdentity) {
      if (identity) { forget(); drafts.clear(); challengeId = ''; code.value = ''; retryAt = 0; }
      identity = nextIdentity; restoreAttempted = false; pending = null;
      clearTimeout(responseTimer); clearTimeout(retryTimer); clearRoster();
    }
    if (!teamCheck.isVerified()) {
      pending = null; verified = null; restoreAttempted = false;
      clearTimeout(responseTimer); clearTimeout(expiryTimer); clearRoster();
      show('チーム情報の確認後、登録メールで本人確認をしてください。'); return;
    }
    if (isVerified()) { show(); return; }
    if (!restoreAttempted) {
      restoreAttempted = true;
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(EMAIL_AUTH_STORAGE_KEY) || 'null'); } catch { saved = null; }
      if (saved && saved.identity === identity && saved.expiresAt > Date.now() && typeof saved.token === 'string') {
        verified = saved; post('get-author-options', saved.token); return;
      }
      forget();
    }
    show('「確認コードを送る」を押し、登録メールに届く6桁のコードを入力してください。');
  }
  send.addEventListener('click', () => {
    if (send.disabled) return;
    forget(); challengeId = ''; code.value = ''; post('send-email-code');
  });
  verify.addEventListener('click', () => {
    if (verify.disabled) return;
    if (!/^\d{6}$/.test(code.value)) { show('メールに届いた6桁の確認コードを入力してください。'); return; }
    post('verify-email-code');
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://script.google.com' && !/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin)) return;
    const message = event.data;
    if (!pending || !teamCheck.isVerified() || pending.identity !== currentIdentity() || !message
      || message.source !== GAS_MESSAGE_SOURCE || message.action !== pending.action || message.requestId !== pending.requestId || typeof message.ok !== 'boolean') return;
    const action = pending.action;
    pending = null; clearTimeout(responseTimer);
    inputs.code.value = ''; inputs.authorToken.value = '';
    if (message.retryAfter) {
      retryAt = Date.now() + Number(message.retryAfter) * 1000; clearTimeout(retryTimer);
      retryTimer = setTimeout(() => show(), Math.max(0, retryAt - Date.now()));
    }
    if (!message.ok) {
      if (action === 'get-author-options' || message.requiresEmailVerification) forget();
      if (message.needsNewCode) challengeId = '';
      show(message.message || 'メール本人確認に失敗しました。'); return;
    }
    if (action === 'send-email-code') { challengeId = message.challengeId; show(message.message); return; }
    if (!Array.isArray(message.authors) || message.authors.length < 3 || message.authors.length > 5
      || message.authors.some((author) => typeof author.value !== 'string' || !author.value || typeof author.label !== 'string')) {
      forget(); show('作者一覧を確認できませんでした。実行委員会へ連絡してください。'); return;
    }
    if (action === 'verify-email-code') verified = { identity, token: message.authorToken, expiresAt: Number(message.expiresAt) };
    if (!verified || typeof verified.token !== 'string' || !verified.token || !Number.isFinite(verified.expiresAt) || verified.expiresAt <= Date.now()) {
      forget(); show('本人確認の期限が切れました。コードを再送してください。'); return;
    }
    tokenField.value = verified.token; sessionStorage.setItem(EMAIL_AUTH_STORAGE_KEY, JSON.stringify(verified));
    challengeId = ''; code.value = '';
    for (const select of selects) {
      placeholder(select); select.children[0].textContent = '作者を選択してください';
      for (const author of message.authors) {
        const option = document.createElement('option'); option.value = author.value; option.textContent = author.label; select.appendChild(option);
      }
      select.disabled = false; select.value = drafts.get(select.id) || '';
    }
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => { forget(); show('本人確認の期限が切れました。コードを再送してください。'); }, verified.expiresAt - Date.now());
    show(message.message);
  });
  // 再表示時もサーバーへトークンを再提示して、名簿変更・失効を確認する。
  window.addEventListener('pageshow', () => { verified = null; restoreAttempted = false; clearRoster(); refreshTeam(); });
  form.addEventListener('submit', (event) => { if (!isVerified() || !tokenField.value) event.preventDefault(); });
  selects.forEach(placeholder); refreshTeam();
  return { refreshTeam, isVerified: () => Boolean(isVerified() && tokenField.value) };
}
