/**
 * 関西俳句バトル2027用 Web App
 *
 * 以下の「手入力する設定」を埋め、Web App としてデプロイする。
 * 既存のスクリプトプロパティがある場合は、そちらの値を優先する。
 */

// ===== 手入力する設定（このブロックにまとめて設定） =====
const KHB_CONFIG = Object.freeze({
  // 保存先スプレッドシートURLの /d/ と /edit の間にあるID。
  KHB_SPREADSHEET_ID: '',
  // 受付開始・締切を日本時間（+09:00）で入力。例は本番の日程ではない。
  // 記入例: '2026-10-31T23:59:59+09:00'
  KHB_ENTRY_DEADLINE_JST: '2026-10-31T23:59:59+09:00',
  KHB_SUBMISSION_DEADLINE_JST: '2026-11-30T23:59:59+09:00',
  KHB_ENTRY_START_JST: '2026-10-11T14:00:00+09:00',       // エントリー受付開始
  KHB_SUBMISSION_START_JST: '2026-11-01T14:00:00+09:00',  // 投句受付開始
  // 運営への控え（BCC）の送信先。
  KHB_ADMIN_EMAIL: 'klea.ex+khb@gmail.com',
  // 差出人。GAS実行アカウントのGmailに送信元エイリアスとして登録する。
  KHB_FROM_EMAIL: 'klea.ex+autoreply@gmail.com',
  // 返信先・本文の問い合わせ先。
  KHB_REPLY_TO: 'klea.ex+khb@gmail.com',
  // サイトのオリジンのみ（末尾の / や /khb2027 は付けない）。
  KHB_SITE_ORIGIN: 'https://kleaex.github.io',
  // ローカル確認で応答を返してよいオリジン。複数はカンマ区切り。不要なら空文字にする。
  KHB_PREVIEW_ORIGINS: 'http://127.0.0.1:8766,http://localhost:8766',
  // 試験用GASでのみ、Script Propertiesの同名項目へkendai.jsonの内容を設定する。
  // 設定中は公開JSONより優先する。本番受付時には空に戻す。
  KHB_TEST_TOPICS_JSON: '',
  // 確認コードメールの1日上限（チームごとは10通）。受付メール用の残枠も確保する。
  KHB_AUTH_DAILY_LIMIT: 50,
  // 兼題はサイトの khb2027/js/kendai.json だけを編集する（GASへの転記は不要）。
});
// 【GAS管理画面で手入力】プロジェクトの設定 → スクリプトプロパティ:
// 名前: KHB_HMAC_SECRET / 値: 32文字以上のランダムな秘密値
// 秘密値はこのファイルや公開サイトに記入しない。運用開始後は不用意に変更しない。
// プロジェクトの設定＞スクリプト プロパティ＞スクリプト プロパティを追加。プロパティ＝KHB_HMAC_SECRET、値＝生成内容。引用符なし
// 【デプロイ後に手入力】khb2027/js/gasConfig.js の GAS_WEB_APP_URL に /exec URLを設定。
// デプロイ＞ウェブアプリ＞全員（ログイン不要）＞url（末尾exec）をコピー
// ===== 手入力する設定はここまで =====

const KHB_SOURCE = 'khb2027';
const ENTRY_HEADERS = [
  'entryId', 'receivedAt', 'updatedAt', 'status', 'schoolName', 'schoolName2', 'schoolName3',
  'schoolName4', 'schoolName5', 'plannedTeamCount', 'isJointTeam', 'teamName', 'responsibleName', 'responsibleRole',
  'responsibleRoleOther', 'email', 'memberCount', 'members', 'introduction',
  'specialNote', 'termsConsentAt', 'contactConfirmationAt', 'identityHash', 'note', 'inputConfirmationAt',
];
const SUBMISSION_HEADERS = [
  'updatedAt', 'revision', 'identityHash', 'teamName', 'email',
  'k1_1', 'k1_5_author', 'k1_3', 'k1_3_author', 'k1_5', 'k1_1_author',
  'k2_1', 'k2_5_author', 'k2_3', 'k2_3_author', 'k2_5', 'k2_1_author',
  'k3_1', 'k3_5_author', 'k3_3', 'k3_3_author', 'k3_5', 'k3_1_author',
  'k4_1', 'k4_5_author', 'k4_2', 'k4_4_author', 'k4_3', 'k4_3_author',
  'k4_4', 'k4_2_author', 'k4_5', 'k4_1_author', 'specialNote', 'agreeAt',
];
const HISTORY_HEADERS = ['archivedAt', 'reason'].concat(SUBMISSION_HEADERS);
const LOG_HEADERS = ['at', 'action', 'result', 'identityHash', 'detail'];
// doPostごとに作り直す。行データや認証状態は保持しない。
let khbRequest = null;

function measureRequestStep(name, operation) {
  const request = khbRequest;
  const startedAt = Date.now();
  try { return operation(); }
  finally {
    if (request) request.timings[name] = (request.timings[name] || 0) + Date.now() - startedAt;
  }
}

function waitForRequestLock(lock) {
  measureRequestStep('lockWaitMs', () => lock.waitLock(30000));
  if (khbRequest) khbRequest.locks.set(lock, Date.now());
}

function releaseRequestLock(lock) {
  try { lock.releaseLock(); }
  finally {
    if (khbRequest && khbRequest.locks.has(lock)) {
      khbRequest.timings.lockHeldMs = (khbRequest.timings.lockHeldMs || 0) + Date.now() - khbRequest.locks.get(lock);
      khbRequest.locks.delete(lock);
    }
  }
}

function requestProperty(name) {
  if (!khbRequest) return PropertiesService.getScriptProperties().getProperty(name);
  if (!Object.prototype.hasOwnProperty.call(khbRequest.settings, name)) {
    khbRequest.settings[name] = PropertiesService.getScriptProperties().getProperty(name);
  }
  return khbRequest.settings[name];
}

function doPost(e) {
  const previousRequest = khbRequest;
  khbRequest = { settings: Object.create(null), sheets: Object.create(null), spreadsheet: null,
    timings: {}, locks: new Map() };
  const startedAt = Date.now();
  const data = (e && e.parameter) || {};
  const action = String(data.action || '');
  const reply = replyTo(data);
  try {
    if (isHoneypotFilled(data)) return reply(action, true, '受け付けました。');
    if (action === 'entry') return handleEntry(data);
    if (action === 'check-team') return checkTeam(data);
    if (action === 'send-email-code') return sendEmailCode(data);
    if (action === 'verify-email-code') return verifyEmailCode(data);
    if (action === 'get-author-options') return getAuthorOptions(data);
    if (action === 'check-submission') return checkSubmission(data);
    if (action === 'submit-submission') return submitSubmission(data);
    return reply(action, false, '不正な送信です。', { requestId: String(data.requestId || '') });
  } catch (error) {
    console.error(error);
    logEvent(action || 'unknown', 'error', '', error.message || String(error));
    return reply(action, false, '送信を完了できませんでした。時間をおいて再度お試しください。', { requestId: String(data.requestId || '') });
  } finally {
    const timings = khbRequest.timings;
    khbRequest = previousRequest;
    // 計測には処理名・UUID・所要時間だけを記録する。
    const knownAction = ['entry', 'check-team', 'send-email-code', 'verify-email-code', 'get-author-options',
      'check-submission', 'submit-submission'].includes(action) ? action : 'unknown';
    if (typeof console.info === 'function') console.info(JSON.stringify({ source: 'khb2027-timing', action: knownAction,
      requestId: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(data.requestId || '')) ? data.requestId : '',
      totalMs: Date.now() - startedAt, ...timings }));
  }
}

function handleEntry(data) {
  const reply = replyTo(data);
  const receptionError = getReceptionError('ENTRY');
  if (receptionError) return reply('entry', false, receptionError);
  const error = validateEntry(data);
  if (error) return reply('entry', false, error);

  const identityHash = makeIdentityHash(data.teamName, data.email);
  const entrySheet = getSheet('エントリー', ENTRY_HEADERS);
  if (findRowByValue(entrySheet, 'identityHash', identityHash, 'status', '有効')) {
    logEvent('entry', 'duplicate', identityHash, 'already active');
    return reply('entry', false, '同じチーム名とメールアドレスのエントリーが既にあります。変更が必要な場合は実行委員会までご連絡ください。');
  }

  const now = new Date();
  const row = {
    entryId: Utilities.getUuid(), receivedAt: now, updatedAt: now, status: '有効',
    schoolName: data.schoolName, schoolName2: data.schoolName2 || '', schoolName3: data.schoolName3 || '',
    schoolName4: data.schoolName4 || '', schoolName5: data.schoolName5 || '',
    plannedTeamCount: data.plannedTeamCount, isJointTeam: checked(data.isJointTeam),
    teamName: data.teamName, responsibleName: data.responsibleName,
    responsibleRole: data.responsibleRole,
    responsibleRoleOther: data.responsibleRole === 'その他' ? data.responsibleRoleOther : '',
    email: data.email, memberCount: data.memberCount, members: data.members,
    introduction: data.introduction, specialNote: data.specialNote || '',
    termsConsentAt: now, contactConfirmationAt: now, identityHash: identityHash, note: '', inputConfirmationAt: '',
  };
  // シートの読み込み中に締切を過ぎていないか、保存直前にも確認する。
  const finalReceptionError = getReceptionError('ENTRY');
  if (finalReceptionError) return reply('entry', false, finalReceptionError);
  appendObject(entrySheet, ENTRY_HEADERS, row);
  measureRequestStep('saveMs', () => SpreadsheetApp.flush());
  logEvent('entry', 'accepted', identityHash, row.entryId);
  let mailSent = true;
  try { measureRequestStep('mailMs', () => sendEntryMail(row)); }
  catch {
    mailSent = false;
    logEvent('entry', 'mail-failed', identityHash, row.entryId);
  }
  const message = mailSent ? 'エントリーを受け付けました。入力いただいたメールアドレスをご確認ください。'
    : 'エントリーは受け付けましたが、確認メールを送信できませんでした。お手数ですが、再送信はせず、実行委員会までご連絡ください。';
  return reply('entry', true, message, { mailSent });
}

// 俳句・宣誓の入力前に、チーム名とメールアドレスだけで照合する。
function checkTeam(data) {
  const reply = replyTo(data);
  const extra = { requestId: String(data.requestId || '') };
  const receptionError = getReceptionError('SUBMISSION');
  if (receptionError) return reply('check-team', false, receptionError, extra);
  const error = validateTeam(data);
  if (error) return reply('check-team', false, error, extra);
  const identityHash = makeIdentityHash(data.teamName, data.email);
  const entry = findActiveEntry(identityHash);
  if (!entry) {
    return reply('check-team', false, 'エントリーと一致しません。チーム名とメールアドレスを確認してください。', extra);
  }
  extra.memberCount = Number(entry.values.memberCount);
  return reply('check-team', true, 'エントリーを確認しました。', extra);
}

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_AUTH_TTL_MS = 2 * 60 * 60 * 1000;
const EMAIL_AUTH_ERROR = 'メール本人確認が必要です。「修正に戻る」から確認コードを入力してください。';

function authDigest(value) {
  return Utilities.computeHmacSha256Signature(value, requiredProperty('KHB_HMAC_SECRET'))
    .map((byte) => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function authRosterDigest(entry) {
  return authDigest('email-auth-roster:v1|' + JSON.stringify([entry.entryId, entry.memberCount, entry.members,
    entry.schoolName, entry.schoolName2, entry.schoolName3, entry.schoolName4, entry.schoolName5, entry.teamName, entry.email]));
}

function equalDigest(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function getEmailAuthError(data, identityHash, entry) {
  const token = String(data.authorToken || '');
  if (!/^\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)) return EMAIL_AUTH_ERROR;
  const [expiresAt, nonce, roster, signature] = token.split('.');
  const payload = `${expiresAt}.${nonce}.${roster}`;
  if (Date.now() >= Number(expiresAt) || !equalDigest(roster, authRosterDigest(entry))
    || !equalDigest(signature, authDigest(`email-auth-token:v1|${identityHash}|${JSON.stringify([data.teamName, data.email])}|${payload}`))) return EMAIL_AUTH_ERROR;
  return '';
}

function emailAuthContext(data) {
  const error = getReceptionError('SUBMISSION') || validateTeam(data);
  if (error) return { error };
  const identityHash = makeIdentityHash(data.teamName, data.email);
  const entry = findActiveEntry(identityHash);
  if (!entry) return { error: 'エントリーと一致しません。チーム名とメールアドレスを確認してください。' };
  return { identityHash, entry: entry.values };
}

function authorOptions(entry) {
  if (!registeredNames(entry)) throw new Error('登録メンバー情報を確認してください。実行委員会までご連絡ください。');
  const members = parseMembers(entry.members);
  const labels = memberAuthorLabels(members);
  if (indistinguishableMembers(members).length || new Set(labels.map(authorNameKey)).size !== members.length) {
    throw new Error('同姓同名のメンバーを区別できません。実行委員会までご連絡ください。');
  }
  return members.map((member, index) => ({ value: labels[index],
    label: `${member.name}（${[member.school, member.grade].filter(Boolean).join('・')}）` }));
}

function sendEmailCode(data) {
  const reply = replyTo(data);
  const context = emailAuthContext(data);
  if (context.error) return reply('send-email-code', false, context.error);
  const { identityHash } = context;
  const properties = PropertiesService.getScriptProperties();
  const key = 'KHB_EMAIL_CODE_' + identityHash;
  let entry, code, state;
  const lock = LockService.getScriptLock();
  waitForRequestLock(lock);
  try {
    const deadlineError = getReceptionError('SUBMISSION');
    if (deadlineError) return reply('send-email-code', false, deadlineError);
    const activeEntry = findActiveEntry(identityHash);
    if (!activeEntry) return reply('send-email-code', false, '有効なエントリーを確認できませんでした。');
    entry = activeEntry.values;
    const now = Date.now();
    const day = Utilities.formatDate(new Date(now), 'Asia/Tokyo', 'yyyy-MM-dd');
    const previous = JSON.parse(properties.getProperty(key) || '{}');
    const wait = Math.ceil((Number(previous.sentAt || 0) + 60000 - now) / 1000);
    if (wait > 0) return reply('send-email-code', false, `再送は${wait}秒後にお試しください。`, { retryAfter: wait });
    const count = previous.day === day ? Number(previous.count || 0) : 0;
    const globalRate = JSON.parse(properties.getProperty('KHB_EMAIL_AUTH_RATE') || '{}');
    const total = globalRate.day === day ? Number(globalRate.count || 0) : 0;
    // ロック外で発送中のメールも予約済みとして数え、残り20通を同時利用で使い切らない。
    const pendingMail = Object.fromEntries(Object.entries(globalRate.pendingMail || {})
      .filter(([, expiresAt]) => Number.isFinite(expiresAt) && expiresAt > now));
    const limit = Number(requiredProperty('KHB_AUTH_DAILY_LIMIT'));
    if (!Number.isInteger(limit) || limit < 1) throw new Error('確認メールの上限設定を確認してください。');
    if (count >= 10) return reply('send-email-code', false, 'このチームの本日の確認メール送信上限に達しました。実行委員会までご連絡ください。');
    if (total >= limit || MailApp.getRemainingDailyQuota() - Object.keys(pendingMail).length <= 20) {
      return reply('send-email-code', false, '本日の確認メール送信枠が不足しています。お手数ですが、実行委員会までご連絡ください。');
    }
    // サーバーの秘密値とランダムなnonceから生成し、平文コードは保存しない。
    const nonce = Utilities.getUuid().replace(/-/g, '');
    code = String(parseInt(authDigest('email-code-random:v1|' + nonce + Utilities.getUuid()).slice(0, 12), 16) % 1000000).padStart(6, '0');
    const expiresAt = now + EMAIL_CODE_TTL_MS;
    state = { day, count: count + 1, sentAt: now, expiresAt, attempts: 0, nonce,
      codeHash: authDigest(`email-code:v1|${identityHash}|${nonce}|${code}`) };
    properties.setProperty(key, JSON.stringify(state));
    pendingMail[nonce] = expiresAt;
    properties.setProperty('KHB_EMAIL_AUTH_RATE', JSON.stringify({ day, count: total + 1, pendingMail }));
  } finally { releaseRequestLock(lock); }
  try {
    // コードの控えをBCC・ログへ送らない。送信先は登録済みエントリーのメールだけ。
    measureRequestStep('mailMs', () => sendKHBMail(entry.email, '【関西俳句バトル2027】メール本人確認コード（自動送信）',
      `投句フォームの確認コードは ${code} です。\n10分以内に入力してください。\nこのコードは他の人に共有しないでください。\n心当たりがない場合は、このメールを無視してください。`));
  } catch {
    // 送信中に発行された別のコードを失効させない。
    waitForRequestLock(lock);
    try {
      const current = JSON.parse(properties.getProperty(key) || '{}');
      if (current.nonce === state.nonce) {
        current.codeHash = ''; properties.setProperty(key, JSON.stringify(current));
      }
      settleEmailReservation(properties, state.nonce);
    } finally { releaseRequestLock(lock); }
    return reply('send-email-code', false, '確認メールを送信できませんでした。時間をおいて再送してください。', { retryAfter: 60 });
  }
  measureRequestStep('cleanupMs', () => cleanupEmailCodes(state.nonce));
  return reply('send-email-code', true, '登録メールへ確認コードを送りました。10分以内に入力してください。再送は60秒後にできます。',
    { challengeId: state.nonce, expiresAt: state.expiresAt, retryAfter: 60 });
}

// 定期トリガーを作らず、メール送信後に最大10件を清掃する。
const EMAIL_CODE_CLEANUP_LIMIT = 10;
function settleEmailReservation(properties, nonce) {
  const rate = JSON.parse(properties.getProperty('KHB_EMAIL_AUTH_RATE') || '{}');
  if (rate.pendingMail && Object.prototype.hasOwnProperty.call(rate.pendingMail, nonce)) {
    delete rate.pendingMail[nonce];
    properties.setProperty('KHB_EMAIL_AUTH_RATE', JSON.stringify(rate));
  }
}

function cleanupEmailCodes(sentNonce) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    acquired = lock.tryLock(0);
    if (!acquired) return;
    if (khbRequest) khbRequest.locks.set(lock, Date.now());
    const properties = PropertiesService.getScriptProperties();
    settleEmailReservation(properties, sentNonce);
    const now = Date.now();
    const day = Utilities.formatDate(new Date(now), 'Asia/Tokyo', 'yyyy-MM-dd');
    const all = properties.getProperties();
    let deleted = 0;
    for (const key of Object.keys(all)) {
      if (!key.startsWith('KHB_EMAIL_CODE_')) continue;
      let stored;
      try { stored = JSON.parse(all[key]); } catch { continue; }
      if (stored && typeof stored.day === 'string' && stored.day < day && Number.isFinite(stored.expiresAt)
        && stored.expiresAt <= now) {
        properties.deleteProperty(key);
        if (++deleted >= EMAIL_CODE_CLEANUP_LIMIT) break;
      }
    }
  } catch {
    // 清掃の失敗を確認メールの送信失敗として返さない。
    console.error('KHB email-code cleanup failed');
  } finally { if (acquired) releaseRequestLock(lock); }
}

function verifyEmailCode(data) {
  const reply = replyTo(data);
  const context = emailAuthContext(data);
  if (context.error) return reply('verify-email-code', false, context.error);
  const { identityHash } = context;
  const lock = LockService.getScriptLock();
  waitForRequestLock(lock);
  try {
    const deadlineError = getReceptionError('SUBMISSION');
    if (deadlineError) return reply('verify-email-code', false, deadlineError);
    const activeEntry = findActiveEntry(identityHash);
    if (!activeEntry) return reply('verify-email-code', false, '有効なエントリーを確認できませんでした。');
    const entry = activeEntry.values;
    const properties = PropertiesService.getScriptProperties();
    const key = 'KHB_EMAIL_CODE_' + identityHash;
    const state = JSON.parse(properties.getProperty(key) || '{}');
    if (!state.codeHash || Date.now() >= state.expiresAt || state.attempts >= 5 || data.challengeId !== state.nonce) {
      return reply('verify-email-code', false, '確認コードが無効か期限切れです。コードを再送してください。', { needsNewCode: true });
    }
    state.attempts += 1;
    properties.setProperty(key, JSON.stringify(state));
    if (!/^\d{6}$/.test(String(data.code || '')) || !equalDigest(state.codeHash,
      authDigest(`email-code:v1|${identityHash}|${state.nonce}|${data.code}`))) {
      return reply('verify-email-code', false, state.attempts >= 5 ? '誤入力が5回に達しました。コードを再送してください。' : '確認コードが一致しません。', { needsNewCode: state.attempts >= 5 });
    }
    state.codeHash = ''; properties.setProperty(key, JSON.stringify(state));
    const expiresAt = Date.now() + EMAIL_AUTH_TTL_MS;
    const nonce = Utilities.getUuid().replace(/-/g, '');
    const payload = `${expiresAt}.${nonce}.${authRosterDigest(entry)}`;
    const token = `${payload}.${authDigest(`email-auth-token:v1|${identityHash}|${JSON.stringify([data.teamName, data.email])}|${payload}`)}`;
    let authors;
    try { authors = authorOptions(entry); } catch (error) { return reply('verify-email-code', false, error.message); }
    return reply('verify-email-code', true, 'メール本人確認が完了しました。', { authorToken: token, expiresAt, authors });
  } finally { releaseRequestLock(lock); }
}

function getAuthorOptions(data) {
  const reply = replyTo(data);
  const context = emailAuthContext(data);
  if (context.error) return reply('get-author-options', false, context.error);
  const error = getEmailAuthError(data, context.identityHash, context.entry);
  if (error) return reply('get-author-options', false, error, { requiresEmailVerification: true });
  try { return reply('get-author-options', true, 'メール本人確認済みです。', { authors: authorOptions(context.entry) }); }
  catch (error) { return reply('get-author-options', false, error.message); }
}

function checkSubmission(data) {
  const reply = replyTo(data);
  const receptionError = getReceptionError('SUBMISSION');
  if (receptionError) return reply('check-submission', false, receptionError);
  const error = validateSubmission(data);
  if (error) return reply('check-submission', false, error);
  const identityHash = makeIdentityHash(data.teamName, data.email);
  const entry = findActiveEntry(identityHash);
  if (!entry) {
    logEvent('check-submission', 'entry-not-found', identityHash, '');
    return reply('check-submission', false, 'エントリーと一致しません。チーム名とメールアドレスを確認してください。');
  }
  const authError = getEmailAuthError(data, identityHash, entry.values);
  if (authError) return reply('check-submission', false, authError, { requiresEmailVerification: true });
  const existing = findCurrentSubmission(identityHash);
  if (isSameSubmission(data, existing)) {
    return reply('check-submission', true, '同じ内容ですでに投句されています。', { alreadySubmitted: true, hasExistingSubmission: true });
  }
  const authorError = validateAuthors(data, entry.values);
  if (authorError) return reply('check-submission', false, authorError);
  const hasExistingSubmission = Boolean(existing);
  return reply('check-submission', true, '', { hasExistingSubmission: hasExistingSubmission });
}

function submitSubmission(data) {
  const reply = replyTo(data);
  const receptionError = getReceptionError('SUBMISSION');
  if (receptionError) return reply('submit-submission', false, receptionError);
  const error = validateSubmission(data);
  if (error) return reply('submit-submission', false, error);

  const identityHash = makeIdentityHash(data.teamName, data.email);
  const entry = findActiveEntry(identityHash);
  if (!entry) {
    return reply('submit-submission', false, 'エントリーと一致しません。チーム名とメールアドレスを確認してください。');
  }
  // 同一内容なら兼題の取得も不要。保存時と同じロックの中で現行内容を再確認する。
  const authError = getEmailAuthError(data, identityHash, entry.values);
  if (authError) return reply('submit-submission', false, authError, { requiresEmailVerification: true });
  if (isSameSubmission(data, findCurrentSubmission(identityHash))) {
    const duplicateLock = LockService.getScriptLock();
    waitForRequestLock(duplicateLock);
    try {
      const receptionError = getReceptionError('SUBMISSION');
      if (receptionError) return reply('submit-submission', false, receptionError);
      const duplicateEntry = findActiveEntry(identityHash);
      if (!duplicateEntry) {
        return reply('submit-submission', false, 'エントリーと一致しません。チーム名とメールアドレスを確認してください。');
      }
      const authError = getEmailAuthError(data, identityHash, duplicateEntry.values);
      if (authError) return reply('submit-submission', false, authError, { requiresEmailVerification: true });
      if (isSameSubmission(data, findCurrentSubmission(identityHash))) {
        return reply('submit-submission', true, '同じ内容ですでに投句されています。', { alreadySubmitted: true });
      }
    } finally {
      releaseRequestLock(duplicateLock);
    }
  }
  // 通信はロック取得前に行う。保存と受付メールには、この1回で取得した同じ兼題を使う。
  const authorError = validateAuthors(data, entry.values);
  if (authorError) return reply('submit-submission', false, authorError);
  let topics;
  try {
    topics = measureRequestStep('topicsMs', () => fetchPublishedTopics());
  } catch (error) {
    console.error(error);
    logEvent('submit-submission', 'topics-unavailable', identityHash, error.message || String(error));
    return reply('submit-submission', false, '兼題情報を確認できないため、投句は保存していません。時間をおいて再度お試しください。');
  }

  let submission, overwritten;
  const lock = LockService.getScriptLock();
  waitForRequestLock(lock);
  try {
    // ロック取得後に期限と照合を再確認し、事前確認との競合を防ぐ。
    const receptionError = getReceptionError('SUBMISSION');
    if (receptionError) return reply('submit-submission', false, receptionError);
    const latestEntry = findActiveEntry(identityHash);
    if (!latestEntry) {
      return reply('submit-submission', false, 'エントリーと一致しません。チーム名とメールアドレスを確認してください。');
    }

    const existing = findCurrentSubmission(identityHash);
    const latestAuthError = getEmailAuthError(data, identityHash, latestEntry.values);
    if (latestAuthError) return reply('submit-submission', false, latestAuthError, { requiresEmailVerification: true });
    if (isSameSubmission(data, existing)) {
      return reply('submit-submission', true, '同じ内容ですでに投句されています。', { alreadySubmitted: true });
    }
    const latestAuthorError = validateAuthors(data, latestEntry.values);
    if (latestAuthorError) return reply('submit-submission', false, latestAuthorError);
    if (existing && !checked(data.overwrite)) {
      return reply('submit-submission', false, '既存の投句があります。上書きするか確認してください。', { requiresOverwrite: true });
    }

    const now = new Date();
    submission = makeSubmissionRow(data, identityHash, now, existing ? Number(existing.values.revision || 0) + 1 : 1);
    overwritten = Boolean(existing);
    const sheet = getSheet('投句', SUBMISSION_HEADERS);
    if (existing) {
      archiveSubmission(existing.values, now, '上書き');
      writeObject(sheet, SUBMISSION_HEADERS, existing.rowNumber, submission);
    } else {
      appendObject(sheet, SUBMISSION_HEADERS, submission);
    }
    // 排他区間内で書き込みを確定し、メール通信は解放後に行う。
    measureRequestStep('saveMs', () => SpreadsheetApp.flush());
  } finally {
    releaseRequestLock(lock);
  }
  logEvent('submit-submission', overwritten ? 'overwritten' : 'accepted', identityHash, `revision ${submission.revision}`);
  let mailSent = true;
  try { measureRequestStep('mailMs', () => sendSubmissionMail(submission, overwritten, topics)); }
  catch {
    mailSent = false;
    logEvent('submit-submission', 'mail-failed', identityHash, `revision ${submission.revision}`);
  }
  const message = mailSent ? (overwritten ? '投句を上書きして受け付けました。' : '投句を受け付けました。')
    : '投句は受け付けましたが、確認メールを送信できませんでした。お手数ですが、再送信はせず、実行委員会までご連絡ください。';
  return reply('submit-submission', true, message, { overwritten, mailSent });
}

const ENTRY_GRADES = ['中1', '中2', '中3', '高1', '高2', '高3'];

function entryNameIssue(value) {
  if (typeof value !== 'string' || !value.trim()) return '氏名を入力してください。空白だけの入力はできません。';
  return /^\S+(?:[ \u3000]+\S+)+$/u.test(value.trim()) ? '' : '姓と名の間に全角スペースを入れてください。';
}

function introductionLength(value) {
  // 計数時だけ改行形式を揃え、保存する入力値は変えない。
  return Array.from(String(value || '').replace(/\r\n?/g, '\n')).length;
}

function validateEntry(data) {
  const required = ['schoolName', 'plannedTeamCount', 'teamName', 'responsibleName', 'responsibleRole', 'email', 'memberCount', 'members', 'introduction'];
  for (const key of required) if (!hasText(data[key])) return '必須項目を入力してください。';
  if (!checked(data.termsConsent) || !checked(data.contactConfirmation)) return '確認事項への同意が必要です。';
  if (!['1', '2', '3'].includes(data.plannedTeamCount)) return '出場予定チーム数を選択してください。';
  if (!['顧問', 'コーチ', '選手', 'その他'].includes(data.responsibleRole)) return '責任者の役割を選択してください。';
  if (data.responsibleRole === 'その他' && !hasText(data.responsibleRoleOther)) return '責任者の役割を具体的に入力してください。';
  if (checked(data.isJointTeam) && !hasText(data.schoolName2)) return '合同チームは2校目の学校名を入力してください。';
  if (!checked(data.isJointTeam) && ['schoolName2', 'schoolName3', 'schoolName4', 'schoolName5'].some((key) => hasText(data[key]))) return '単独チームに追加の学校名は登録できません。';
  if (!['3', '4', '5'].includes(data.memberCount)) return 'チーム人数は3人から5人で選択してください。';
  if (!isEmail(data.email)) return 'メールアドレスの形式を確認してください。';
  const length = introductionLength(data.introduction);
  if (length < 250 || length > 280) return '紹介文は250〜280字で入力してください。';
  if (!allWithin(data, { schoolName: 200, schoolName2: 200, schoolName3: 200, schoolName4: 200, schoolName5: 200, teamName: 200, responsibleName: 100, responsibleRoleOther: 100, members: 4000, specialNote: 2000, email: 254 })) return '入力できる文字数を超えています。';
  if (hasPadding(data, ['schoolName', 'schoolName2', 'schoolName3', 'schoolName4', 'schoolName5', 'teamName', 'responsibleName', 'email'])) return '入力の前後に空白を入れないでください。';
  const responsibleNameError = entryNameIssue(data.responsibleName);
  if (responsibleNameError) return `責任者氏名：${responsibleNameError}`;
  const schools = ['schoolName', 'schoolName2', 'schoolName3', 'schoolName4', 'schoolName5'].map((key) => data[key]).filter(Boolean);
  if (checked(data.isJointTeam) && new Set(schools).size !== schools.length) return '合同チームに同じ学校名を複数登録することはできません。';
  const membersError = validateEntryMembers(data);
  if (membersError) return membersError;
  return '';
}

function parseMembers(value) {
  try {
    const members = JSON.parse(value);
    return Array.isArray(members) ? members : null;
  } catch { return null; }
}

function authorNameKey(name) {
  // 氏名の照合・人数確認にだけ使い、入力値はそのまま保存する。
  return String(name ?? '').replace(/\s/gu, '');
}

function registeredNames(entry) {
  const members = parseMembers(entry.members);
  const count = Number(entry.memberCount);
  if (![3, 4, 5].includes(count) || !members || members.length !== count) return null;
  if (members.some((member) => !member || !hasText(member.name) || !authorNameKey(member.name))) return null;
  const names = members.map((member) => authorNameKey(member.name));
  return names;
}

function memberAuthorLabels(members) {
  const names = members.map((member) => authorNameKey(member.name));
  return members.map((member, index) => names.filter((name) => name === names[index]).length > 1
    ? `${member.name}（${[member.school, member.grade].filter(Boolean).join('・')}）` : member.name);
}

function indistinguishableMembers(members) {
  const keys = members.map((member) => JSON.stringify([authorNameKey(member.name), String(member.grade || '').trim(), member.school || '']));
  return members.flatMap((member, index) => authorNameKey(member.name) && String(member.grade || '').trim()
    && keys.filter((key) => key === keys[index]).length > 1 ? [index] : []);
}

function validateEntryMembers(data) {
  const names = registeredNames(data);
  if (!names) return 'チーム人数分のメンバー氏名を入力してください。空白だけの入力はできません。';
  const members = parseMembers(data.members);
  const schools = ['schoolName', 'schoolName2', 'schoolName3', 'schoolName4', 'schoolName5'].map((key) => data[key]).filter(Boolean);
  for (const member of members) {
    const nameError = entryNameIssue(member.name);
    if (nameError) return `メンバー氏名：${nameError}`;
    if (!ENTRY_GRADES.includes(member.grade)) return '各メンバーの学年は中1〜中3・高1〜高3のリストから選択してください。';
    if (!allWithin(member, { name: 100, grade: 20, school: 200 })) return 'メンバー情報の文字数を確認してください。';
    if (checked(data.isJointTeam)) {
      if (!schools.includes(member.school)) return '合同チームの各メンバーについて、登録する学校から所属校を選択してください。';
    } else if (hasText(member.school)) return '単独チームのメンバーに個別の学校名は登録できません。';
  }
  if (checked(data.isJointTeam)) {
    const missing = schools.filter((school) => !members.some((member) => member.school === school));
    if (missing.length) return `${missing.map((school) => `「${school}」`).join('・')}の選手が登録されていません。合同チームは、登録したすべての学校から1人以上の選手を登録してください。`;
  }
  if (indistinguishableMembers(members).length) return '氏名・学年・所属校がすべて同じメンバーがいます。別人として区別する必要があるため、実行委員会までご連絡ください。';
  return '';
}

function validateAuthors(data, entry) {
  for (let round = 1; round <= 3; round += 1) {
    const authors = [1, 3, 5].map((slot) => authorNameKey(data[`k${round}_${slot}_author`]));
    if (new Set(authors).size !== 3) return `リーグ戦の兼題${round}は、3句の作者をそれぞれ別のメンバーにしてください。`;
  }
  if (!registeredNames(entry)) return '登録メンバーの氏名を照合できません。実行委員会にメンバー登録情報の確認を依頼してください。';
  if (indistinguishableMembers(parseMembers(entry.members)).length) return '氏名・学年・所属校がすべて同じメンバーがいます。実行委員会までご連絡ください。';
  const names = memberAuthorLabels(parseMembers(entry.members)).map(authorNameKey);
  for (let round = 1; round <= 4; round += 1) {
    const slots = round === 4 ? [1, 2, 3, 4, 5] : [1, 3, 5];
    if (slots.some((slot) => !names.includes(authorNameKey(data[`k${round}_${slot}_author`])))) {
      return `${round === 4 ? '決勝' : `リーグ戦の兼題${round}`}の作者名が、登録メンバーの氏名と一致しません。同姓同名のメンバーは学年・所属校で区別してください。`;
    }
  }
  const finalAuthors = new Set([1, 2, 3, 4, 5].map((slot) => authorNameKey(data[`k4_${slot}_author`])));
  if (names.some((name) => !finalAuthors.has(name))) return '決勝の5句には、登録メンバー全員の句を含めてください。投句順の制限はありません。';
  return '';
}

function validateTeam(data) {
  if (!hasText(data.teamName) || !hasText(data.email)) return 'チーム名とメールアドレスを入力してください。';
  if (!isEmail(data.email)) return 'メールアドレスの形式を確認してください。';
  if (hasPadding(data, ['teamName', 'email'])) return 'チーム名・メールアドレスの前後に空白を入れないでください。';
  if (!allWithin(data, { teamName: 200, email: 254 })) return '入力できる文字数を超えています。';
  return '';
}

function validateSubmission(data) {
  const required = SUBMISSION_HEADERS.filter((key) => !['updatedAt', 'revision', 'identityHash', 'specialNote', 'agreeAt'].includes(key));
  for (const key of required) if (!hasText(data[key])) return '必須項目を入力してください。';
  if (!checked(data.agree)) return '宣誓への同意が必要です。';
  const teamError = validateTeam(data);
  if (teamError) return teamError;
  if (!allWithin(data, { teamName: 200, email: 254, k1_1: 200, k1_3: 200, k1_5: 200, k2_1: 200, k2_3: 200, k2_5: 200, k3_1: 200, k3_3: 200, k3_5: 200, k4_1: 200, k4_2: 200, k4_3: 200, k4_4: 200, k4_5: 200, specialNote: 2000 })) return '入力できる文字数を超えています。';
  return '';
}

function makeIdentityHash(teamName, email) {
  const secret = requiredProperty('KHB_HMAC_SECRET');
  const value = `v1|${teamName}|${email}`;
  const bytes = Utilities.computeHmacSha256Signature(value, secret);
  return bytes.map((byte) => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function isSameSubmission(data, existing) {
  if (!existing) return false;
  // 句・作者・特記事項など入力内容だけを比較し、受付日時や改訂番号は比較しない。
  return SUBMISSION_HEADERS.filter((key) => !['updatedAt', 'revision', 'identityHash', 'agreeAt'].includes(key))
    .every((key) => String(data[key] ?? '') === String(existing.values[key] ?? ''));
}

function makeSubmissionRow(data, identityHash, now, revision) {
  const result = { updatedAt: now, revision: revision, identityHash: identityHash, agreeAt: now };
  SUBMISSION_HEADERS.forEach((key) => {
    if (!(key in result)) result[key] = data[key] || '';
  });
  return result;
}

function findActiveEntry(identityHash) {
  return findRowByValue(getSheet('エントリー', ENTRY_HEADERS), 'identityHash', identityHash, 'status', '有効');
}

function findCurrentSubmission(identityHash) {
  return findRowByValue(getSheet('投句', SUBMISSION_HEADERS), 'identityHash', identityHash);
}

function archiveSubmission(values, now, reason) {
  const history = getSheet('投句履歴', HISTORY_HEADERS);
  const row = { archivedAt: now, reason: reason };
  SUBMISSION_HEADERS.forEach((key) => { row[key] = values[key] || ''; });
  appendObject(history, HISTORY_HEADERS, row);
}

function getSheet(name, headers) {
  if (khbRequest && khbRequest.sheets[name]) return khbRequest.sheets[name];
  return measureRequestStep('sheetsMs', () => {
    const spreadsheet = khbRequest && khbRequest.spreadsheet
      || SpreadsheetApp.openById(requiredProperty('KHB_SPREADSHEET_ID'));
    if (khbRequest) khbRequest.spreadsheet = spreadsheet;
    const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    // 旧版のエントリーシートには、既存列を動かさず入力確認日時を末尾へ追加する。
    if (name === 'エントリー' && sheet.getLastColumn() === headers.length - 1) {
      const currentHeaders = sheet.getRange(1, 1, 1, headers.length - 1).getValues()[0];
      if (!currentHeaders.every((header, index) => header === headers[index])) {
        throw new Error('エントリーシートの列構成を確認してください。');
      }
      sheet.getRange(1, headers.length).setValue('inputConfirmationAt');
    }
    if (khbRequest) khbRequest.sheets[name] = sheet;
    return sheet;
  });
}

function findRowByValue(sheet, key, value, conditionKey, conditionValue) {
  // 見出しと行データは1回で読む。呼び出すたびに最新の値を取得する。
  const values = measureRequestStep('sheetsMs', () => sheet.getDataRange().getValues());
  if (values.length < 2) return null;
  const headers = values[0];
  const keyIndex = headers.indexOf(key);
  const conditionIndex = conditionKey ? headers.indexOf(conditionKey) : -1;
  if (keyIndex < 0 || (conditionKey && conditionIndex < 0)) throw new Error(`列が見つかりません: ${key}`);
  const rows = values.slice(1);
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i][keyIndex] !== value) continue;
    if (conditionKey && rows[i][conditionIndex] !== conditionValue) continue;
    const object = {};
    headers.forEach((header, index) => { object[header] = rows[i][index]; });
    return { rowNumber: i + 2, values: object };
  }
  return null;
}

function appendObject(sheet, headers, object) {
  measureRequestStep('saveMs', () => sheet.appendRow(headers.map((header) => object[header] === undefined ? '' : object[header])));
}

function writeObject(sheet, headers, rowNumber, object) {
  measureRequestStep('saveMs', () => sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map((header) => object[header] === undefined ? '' : object[header])]));
}

function getReceptionError(kind) {
  const start = receptionDate(`KHB_${kind}_START_JST`);
  const deadline = receptionDate(`KHB_${kind}_DEADLINE_JST`);
  if (start >= deadline) {
    throw new Error('受付開始より後の締切を設定してください。');
  }

  const label = kind === 'ENTRY' ? 'エントリー' : '投句';
  const now = Date.now();

  if (now < start) return `${label}受付はまだ開始していません。`;
  if (now > deadline) return `${label}受付は終了しました。`;
  return '';
}

function receptionDate(name) {
  const value = requiredProperty(name);
  const date = Date.parse(value);

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(value) ||
    !Number.isFinite(date) ||
    new Date(date + 9 * 3600000).toISOString().slice(0, 19)
      !== value.slice(0, 19)
  ) {
    throw new Error(`${name}: 有効な日本時間の日時を設定してください。`);
  }
  return date;
}

function requiredProperty(name) {
  const value = requestProperty(name) || KHB_CONFIG[name];
  if (!value) throw new Error(`Missing Script Property: ${name}`);
  return value;
}

function checked(value) { return value === 'true'; }
function hasText(value) { return typeof value === 'string' && value.length > 0; }
function hasPadding(data, keys) {
  return keys.some((key) => {
    const value = String(data[key] || '');
    return value !== value.trim();
  });
}
function codePointLength(value) { return Array.from(String(value || '')).length; }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function allWithin(data, limits) { return Object.keys(limits).every((key) => codePointLength(data[key]) <= limits[key]); }
function isHoneypotFilled(data) { return hasText(data.website); }

function logEvent(action, result, identityHash, detail) {
  try {
    appendObject(getSheet('運用ログ', LOG_HEADERS), LOG_HEADERS, {
      at: new Date(), action: action, result: result, identityHash: identityHash, detail: detail,
    });
  } catch (error) {
    console.error(error);
  }
}

function sendEntryMail(entry) {
  const subject = '【関西俳句バトル2027】エントリーを受け付けました（自動返信）';
  sendMail(entry.email, subject, makeEntryMailBody(entry));
}

function fetchPublishedTopics() {
  // 兼題の取得元はGAS側で指定する。フォームから渡された兼題や応答先では切り替えない。
  const siteOrigin = requiredProperty('KHB_SITE_ORIGIN');
  let json = requestProperty('KHB_TEST_TOPICS_JSON')
    || KHB_CONFIG.KHB_TEST_TOPICS_JSON;
  if (!json) {
    const response = UrlFetchApp.fetch(siteOrigin + '/khb2027/js/kendai.json', { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error(`兼題JSONの取得に失敗しました: HTTP ${response.getResponseCode()}`);
    }
    json = response.getContentText('UTF-8');
  }
  const data = JSON.parse(json);
  const labels = ['dai1', 'dai2', 'dai3', 'dai4'].map((key) => {
    const parts = data && data[key];
    if (!Array.isArray(parts) || typeof parts[1] !== 'string' || typeof parts[2] !== 'string') {
      throw new Error(`兼題JSONの形式が不正です: ${key}`);
    }
    // 現行サイトと同じ「兼題」・（読み）の形式を使い、未設定の「」は受け付けない。
    const title = parts[1];
    if (!title.startsWith('「') || !title.endsWith('」') || !title.slice(1, -1).trim()) {
      throw new Error(`兼題が未設定、または形式が不正です: ${key}`);
    }
    return title + '　' + parts[2];
  });
  return { league: labels.slice(0, 3), final: labels[3] };
}

function sendSubmissionMail(submission, overwritten, topics) {
  const subject = `【関西俳句バトル2027】投句を${overwritten ? '上書きして' : ''}受け付けました（自動返信）`;
  sendMail(submission.email, subject, makeSubmissionMailBody(submission, topics));
}

function makeEntryMailBody(entry) {
  const contact = requiredProperty('KHB_REPLY_TO');
  const schools = ['schoolName', 'schoolName2', 'schoolName3', 'schoolName4', 'schoolName5']
    .map((key) => entry[key]).filter(Boolean).join('、');
  return [
    `${entry.teamName}　様`,
    '「関西俳句バトル2027」へのエントリー、ありがとうございます。',
    ...mailInquiryLines('エントリー', contact),
    '', '',
    '---フォーム回答内容---',
    `学校名：${schools}`,
    `合同チームである：${entry.isJointTeam ? 'はい' : 'いいえ'}`,
    `出場予定チーム数：${entry.plannedTeamCount}チーム`,
    `チーム名：${entry.teamName}`,
    `責任者氏名：${entry.responsibleName}`,
    `責任者の種類：${entry.responsibleRole}`,
    `責任者の種類（具体的に記入ください）：${entry.responsibleRoleOther || ''}`,
    `責任者連絡先（メールアドレス）：${entry.email}`,
    `チーム人数：${entry.memberCount}人`,
    `チームメンバー：${formatMembers(entry.members)}`,
    `紹介文：${entry.introduction}`,
    `参加確認（実施要項、詳細要項を確認し、参加費、著作権、および肖像権などの内容に同意したうえで、「関西俳句バトル2027」にエントリーします）：${entry.termsConsentAt ? '同意し、エントリーします' : '未確認'}`,
    `連絡確認（エントリー内容に関する質問や変更がある場合は、すみやかに関西文芸交流会 関西俳句バトル実行委員会（${contact}）へ連絡することを確認しました）：${entry.contactConfirmationAt ? '確認しました' : '未確認'}`,
    `コメント・特記事項：${entry.specialNote || ''}`,
    '',
    `フォーム送信日時：${formatMailDate(entry.updatedAt)}`,
    mailSignature(),
  ].join('\n');
}

function formatMembers(value) {
  const members = parseMembers(value);
  if (!members || members.some((member) => !member || !hasText(member.name))) return value;
  const labels = memberAuthorLabels(members);
  return members.map((member, index) => `${member.name}（${member.school ? member.school + '・' : ''}${member.grade || ''}）`
    + (labels[index] !== member.name ? `\n  投句時の作者表記：${labels[index]}` : '')).join('\n');
}

function makeSubmissionMailBody(submission, topics) {
  const contact = requiredProperty('KHB_REPLY_TO');
  const lines = [
    `${submission.teamName}　様`,
    '「関西俳句バトル2027」への投句を受け付けました。',
    ...mailInquiryLines('投句', contact),
    '', '',
    '---投句内容---',
    `チーム名：${submission.teamName}`,
    '',
  ];
  // 作者のフィールド名は現行フォームに合わせる（句の番号と作者の番号は逆順）。
  for (let round = 1; round <= 3; round += 1) {
    lines.push(`リーグ戦　兼題${['①', '②', '③'][round - 1]}${topics.league[round - 1]}`);
    [['先鋒', 1, 5], ['中堅', 3, 3], ['大将', 5, 1]].forEach(([position, poem, author]) => {
      lines.push(`${position}：${submission[`k${round}_${poem}`]}　　${submission[`k${round}_${author}_author`]}`);
    });
    lines.push('');
  }
  lines.push(`決勝戦　兼題${topics.final}`);
  [['先鋒', 1, 5], ['次鋒', 2, 4], ['中堅', 3, 3], ['副将', 4, 2], ['大将', 5, 1]].forEach(([position, poem, author]) => {
    lines.push(`${position}：${submission[`k4_${poem}`]}　　${submission[`k4_${author}_author`]}`);
  });
  lines.push(
    '',
    `特記事項：${submission.specialNote || ''}`,
    `宣誓・確認：${submission.agreeAt ? '投句は、すべて自作・未発表であることを宣誓します。また、投句内容に誤りがないことを確認しました。' : '未確認'}`,
    '',
    `フォーム送信日時：${formatMailDate(submission.updatedAt)}`,
    mailSignature(),
  );
  return lines.join('\n');
}

function formatMailDate(value) {
  return Utilities.formatDate(new Date(value), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss') + '（日本時間）';
}

function mailInquiryLines(kind, contact) {
  return [
    `以下の情報に誤りがないか確認してください。万一、誤りがあった場合は、年末年始期間中でも、至急、関西文芸交流会 関西俳句バトル実行委員会(${contact})までご連絡ください。`,
    'また、疑問点やご質問がある場合も、上記連絡先までお問い合わせください。',
    `その際、${kind}内容についてのお問い合わせには、メールのタイトルに「関西俳句バトル2027　${kind}についてのお問い合わせ」と明記いただくようお願いいたします。`,
  ];
}

function mailSignature() {
  return ['---', '関西文芸交流会', '関西学生文芸連合', '関西俳句バトル実行委員会', requiredProperty('KHB_REPLY_TO')].join('\n');
}

function sendMail(to, subject, body) {
  sendKHBMail(to, subject, body, {
    htmlBody: makeMailHtmlBody(body),
    bcc: requiredProperty('KHB_ADMIN_EMAIL'),
  });
}

function sendKHBMail(to, subject, body, options) {
  GmailApp.sendEmail(to, subject, body, Object.assign({}, options || {}, {
    from: requiredProperty('KHB_FROM_EMAIL'),
    replyTo: requiredProperty('KHB_REPLY_TO'),
    name: '関西文芸交流会 関西俳句バトル実行委員会',
  }));
}

function makeMailHtmlBody(body) {
  // 本文の改行だけを反映し、長い行はメール画面の幅に合わせて折り返す。
  // 入力内容をHTMLとして解釈させないよう、改行の変換より先にエスケープする。
  const escaped = String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return '<div style="font-family:sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:break-word;word-wrap:break-word;">'
    + escaped.replace(/\r\n|\r|\n/g, '<br>') + '</div>';
}

function replyTo(data) {
  return (action, ok, message, extra) => respond(action, ok, message,
    Object.assign({}, extra || {}, { requestId: String(data.requestId || '') }), data.responseOrigin);
}

function getResponseOrigin(requestedOrigin) {
  const siteOrigin = requiredProperty('KHB_SITE_ORIGIN');
  const previews = requestProperty('KHB_PREVIEW_ORIGINS')
    ?? KHB_CONFIG.KHB_PREVIEW_ORIGINS;
  const allowed = [siteOrigin].concat(String(previews || '').split(',').map((origin) => origin.trim()).filter(Boolean));
  return allowed.includes(requestedOrigin) ? requestedOrigin : siteOrigin;
}

function respond(action, ok, message, extra, requestedOrigin) {
  const payload = Object.assign({ source: KHB_SOURCE, action: action, ok: ok, message: message }, extra || {});
  const origin = JSON.stringify(getResponseOrigin(requestedOrigin)).replace(/</g, '\\u003c');
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput(`<script>window.top.postMessage(${json}, ${origin});</script>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

