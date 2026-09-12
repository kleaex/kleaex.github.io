import { FORM_IDS, FORM_URL } from './formIds.js';

document.addEventListener('DOMContentLoaded', () => {
  const SANITIZE_OPTIONS = { ALLOWED_TAGS: ['ruby', 'rt', 'b'] };
  const form = document.querySelector('.submitform');

  Object.entries(FORM_IDS).forEach(([id, entry]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.name = entry;
    const saved = sessionStorage.getItem(entry);
    if (saved !== null) {
      const cleanSaved = DOMPurify.sanitize(saved, SANITIZE_OPTIONS);
      if (el.type === 'checkbox') {
        el.checked = cleanSaved === el.value;
      } else {
        el.value = cleanSaved;
      }
    }
  });

  if (!form) {
    return;
  }

  // フォームのaction属性を設定
  form.action = FORM_URL;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    fd.forEach((value, key) => {
      const clean = DOMPurify.sanitize(value, SANITIZE_OPTIONS);
      sessionStorage.setItem(key, clean);
    });
    window.location.href = 'confirm.html';
  });
});
