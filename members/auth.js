(() => {
  const config = window.MEMBERS_AUTH || {};
  const key = 'klea-members-session';
  const root = document.documentElement;
  const publicUrl = new URL('../index.html', document.currentScript.src).href;
  let session;
  let gate;
  let expiryTimer;
  function valid(value) {
    return /^[a-f0-9]{64}$/.test(config.passwordHash || '') &&
      value?.hash === config.passwordHash && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now();
  }
  try { session = JSON.parse(sessionStorage.getItem(key)); } catch { /* 保存不可ならページ単位で利用 */ }
  if (valid(session)) root.removeAttribute('data-members-locked');

  function lock(focus = true) {
    session = undefined;
    clearTimeout(expiryTimer);
    try { sessionStorage.removeItem(key); } catch { /* 保存不可 */ }
    root.setAttribute('data-members-locked', '');
    if (gate) {
      gate.hidden = false;
      if (focus) gate.querySelector('input').focus();
    }
  }
  function unlock() {
    root.removeAttribute('data-members-locked');
    gate.hidden = true;
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(lock, Math.max(0, session.expiresAt - Date.now()));
    document.dispatchEvent(new Event('members:unlocked'));
  }
  document.addEventListener('DOMContentLoaded', () => {
    gate = document.createElement('section');
    gate.className = 'members-gate';
    gate.setAttribute('aria-labelledby', 'members-login-title');
    gate.innerHTML = `<p class="eyebrow">KLEA Members</p><h1 id="members-login-title">メンバーページ</h1>
      <p>共有されたパスワードを入力してください。</p>
      <form><label for="members-password">共通パスワード</label>
      <input id="members-password" type="password" autocomplete="current-password" required aria-describedby="members-auth-status" />
      <button type="submit">ログイン</button><p id="members-auth-status" role="status" aria-live="polite"></p></form>
      <a href="${publicUrl}">公開サイトへ戻る</a>`;
    document.body.append(gate);
    const form = gate.querySelector('form');
    const input = gate.querySelector('input');
    const submit = gate.querySelector('button');
    const status = gate.querySelector('[role="status"]');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      status.textContent = '';
      submit.disabled = true;
      try {
        if (!/^[a-f0-9]{64}$/.test(config.passwordHash || '')) {
          status.textContent = 'パスワードの設定が完了していません。管理者にお問い合わせください。';
          return;
        }
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.value));
        const hash = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== config.passwordHash) {
          status.textContent = 'パスワードが違います。もう一度入力してください。';
          input.select();
          return;
        }
        session = { hash, expiresAt: Date.now() + (config.sessionHours || 8) * 3600000 };
        try { sessionStorage.setItem(key, JSON.stringify(session)); } catch { /* このページは表示可能 */ }
        input.value = '';
        unlock();
        const main = document.querySelector('main');
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      } catch {
        status.textContent = 'ログイン処理を実行できませんでした。HTTPSで開いて再度お試しください。';
      } finally { submit.disabled = false; }
    });
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'members-logout';
    logout.textContent = 'ログアウト';
    logout.addEventListener('click', () => lock());
    document.querySelector('.nav')?.append(logout);
    if (valid(session)) unlock(); else lock();
  });
  // 戻る操作によるキャッシュ復元や、スリープ復帰時も期限を確認する。
  window.addEventListener('pageshow', () => {
    try { session = JSON.parse(sessionStorage.getItem(key)); } catch { /* 保存不可ならページ内状態を使う */ }
    if (!valid(session)) lock(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !valid(session)) lock(false);
  });
})();
