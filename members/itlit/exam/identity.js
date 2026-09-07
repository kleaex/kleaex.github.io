(function (root) {
  'use strict';
  const scheme = 'klea-identity-v1';
  function normalize(name, email) {
    return {
      name: name.normalize('NFKC').trim().replace(/\s+/gu, ' '),
      email: email.normalize('NFKC').trim().toLowerCase()
    };
  }
  async function hash(name, email) {
    const value = normalize(name, email);
    if (!value.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw new Error('氏名とメールアドレスを確認してください。');
    const payload = JSON.stringify([scheme, value.name, value.email]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function authorize(name, email, config) {
    if (!config) throw new Error('受験者の照合設定が読み込まれていません。access-data.jsを確認してください。');
    if (config.scheme !== scheme) throw new Error(`受験者の照合設定：schemeは「${scheme}」を指定してください。`);
    if (!Array.isArray(config.hashes)) throw new Error('受験者の照合設定：hashesはハッシュ文字列の配列で指定してください。');
    const invalid = config.hashes.findIndex(h => typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h));
    if (invalid !== -1) throw new Error(`受験者の照合設定：hashesの${invalid + 1}件目が不正です。登録用ツールで生成した64文字の小文字16進数を指定し、hash1などの例示文字列は削除してください。`);
    if (!config.hashes.length) throw new Error('受験者の登録を準備中です。登録完了後に受験できます。');
    const id = await hash(name, email);
    if (!config.hashes.includes(id)) throw new Error('登録情報と一致しません。氏名とメールアドレスを確認してください。');
    return { id, name: normalize(name, email).name };
  }
  root.ExamIdentity = { scheme, normalize, hash, authorize };
})(typeof window === 'undefined' ? globalThis : window);
