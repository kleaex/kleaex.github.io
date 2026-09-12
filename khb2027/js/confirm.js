import { FORM_IDS, FORM_URL } from './formIds.js';
window.submitted = false;

document.addEventListener('DOMContentLoaded', () => {
  const SANITIZE_OPTIONS = { ALLOWED_TAGS: ['ruby', 'rt', 'b'] };
  const ids = ['k4_5', 'k4_4', 'k4_3', 'k4_2', 'k4_1', 'k3_5', 'k3_3', 'k3_1', 'k2_5', 'k2_3', 'k2_1', 'k1_5', 'k1_3', 'k1_1', 'teamName'];
  ids.forEach(id => {
    const key = FORM_IDS[id];
    const html = sessionStorage.getItem(key) || '';
    const element = document.getElementById(id);
    if (element) {
      element.innerHTML = DOMPurify.sanitize(html, SANITIZE_OPTIONS);
    }
  });

  const form = document.getElementById('finalForm');
  const submitBtn = document.getElementById('finalSubmit');
  if (!form) {
    return;
  }
  form.action = FORM_URL;

  Object.values(FORM_IDS).forEach(key => {
    const value = sessionStorage.getItem(key);
    if (value === null) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = DOMPurify.sanitize(value, SANITIZE_OPTIONS);
    form.appendChild(input);
  });

  form.addEventListener('submit', event => {
    if (window.submitted) {
      event.preventDefault();
      return;
    }
    window.submitted = true;
    if (submitBtn) {
      submitBtn.disabled = true;
    }
    sessionStorage.clear();
  });

  document.getElementById('backButton').addEventListener('click', () => {
    window.location.href = 'submit.html';
  });
});
