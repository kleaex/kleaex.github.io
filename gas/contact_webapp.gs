const CONTACT_CONFIG = Object.freeze({
  spreadsheetId: '1jp2aZtwknMtajXhV-RsGeMmlH_d6JiIBIZYa2tsDcu8',
  sheetName: 'お問い合わせ',
  adminEmail: 'klea.ex@gmail.com',
  replyFrom: 'klea.ex+autoreply@gmail.com',
  siteOrigin: 'https://kleaex.github.io',
  allowedTypes: [
    '交流会参加・お問い合わせ（個人）',
    'グループ加盟・お問い合わせ（団体）',
    '技術協力・依頼・相談',
    'その他',
  ],
});

function doPost(e) {
  try {
    const data = e && e.parameter ? e.parameter : {};
    const email = clean(data.email);
    const type = clean(data.type);
    const name = clean(data.name);
    const organization = clean(data.organization);
    const content = clean(data.content);

    if (clean(data.website)) return response(true, '送信を受け付けました。');
    if (!email || !type || !name || !content) return response(false, '必須項目を入力してください。');
    if (!isEmail(email)) return response(false, 'メールアドレスの形式を確認してください。');
    if (!CONTACT_CONFIG.allowedTypes.includes(type)) return response(false, 'お問い合わせ種別が不正です。');
    if (name.length > 100 || organization.length > 200 || content.length > 5000) {
      return response(false, '入力できる文字数を超えています。');
    }

    saveResponse({ email, type, name, organization, content });
    sendAutoReply({ email, type, name, organization, content });
    return response(true, '送信を受け付けました。ありがとうございます。');
  } catch (error) {
    console.error(error);
    return response(false, '送信できませんでした。時間をおいて再度お試しください。');
  }
}

function saveResponse({ email, type, name, organization, content }) {
  const spreadsheet = SpreadsheetApp.openById(CONTACT_CONFIG.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(CONTACT_CONFIG.sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${CONTACT_CONFIG.sheetName}`);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['タイムスタンプ', 'メールアドレス', '種別', 'お名前', '団体名', 'お問い合わせ内容']);
  }

  sheet.appendRow([new Date(), email, type, name, organization, content]);
}

function sendAutoReply({ email, type, name, organization, content }) {
  const organizationPrefix = organization ? `${organization}　` : '';
  const subject = `【自動返信】${organizationPrefix}${name}様　関西文芸交流会 お問い合わせフォーム　送信完了のお知らせ`;
  const body = [
    `${organizationPrefix}${name}様`,
    '',
    '関西文芸交流会 お問い合わせフォームをご送信いただき、ありがとうございます。',
    '担当者より返信いたしますので、しばらくお待ちください。',
    'なお、時期やお問い合わせ内容により、最大1週間程度お時間をいただく場合がありますのでご了承ください。',
    '',
    '---フォーム回答内容---',
    `お名前：${name}`,
    ...(organization ? [`団体名：${organization}`] : []),
    `お問い合わせ種別：${type}`,
    'お問い合わせ内容：',
    content,
    '',
    '------',
    '関西文芸交流会',
    'Kansai Literary Exchange Association',
    'klea.ex@gmail.com',
  ].join('\n');
  const options = {
    bcc: CONTACT_CONFIG.adminEmail,
    replyTo: CONTACT_CONFIG.adminEmail,
    name: '関西文芸交流会',
  };

  if (GmailApp.getAliases().includes(CONTACT_CONFIG.replyFrom)) {
    options.from = CONTACT_CONFIG.replyFrom;
  }

  GmailApp.sendEmail(email, subject, body, options);
}

function response(ok, message) {
  const payload = JSON.stringify({ source: 'klea-contact', ok, message }).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput(`<script>window.top.postMessage(${payload}, '${CONTACT_CONFIG.siteOrigin}');</script>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function clean(value) {
  return String(value || '').trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
