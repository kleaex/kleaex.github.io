import { SUBMISSION_FIELDS, storageKey } from './formFields.js';
import { setupTeamCheck } from './teamCheck.js';
import { AUTHOR_GROUPS, authorIssues } from './authorRules.js';
import { setupEmailAuth } from './emailAuth.js';

function initializeSubmissionForm(form) {
  SUBMISSION_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.name = id;
    const saved = sessionStorage.getItem(storageKey(id));
    if (saved !== null) {
      if (el.type === 'checkbox') {
        el.checked = saved === 'true';
      } else {
        el.value = saved;
      }
    }
  });

  let teamCheck;
  let emailAuth;
  const authorFields = AUTHOR_GROUPS.flatMap((group) => group.fields);
  function updateAuthors() {
    const values = {};
    authorFields.forEach((id) => {
      const field = document.getElementById(id);
      field.setCustomValidity('');
      values[id] = field.value;
    });
    const issues = authorIssues(values, teamCheck?.getMemberCount());
    issues.forEach((issue) => issue.fields.forEach((id) => document.getElementById(id).setCustomValidity(issue.message)));
  }
  function updateNext() {
    document.getElementById('submitting').disabled = !teamCheck?.isVerified() || !emailAuth?.isVerified();
  }
  teamCheck = setupTeamCheck(form, { onStateChange: () => { emailAuth?.refreshTeam(); updateAuthors(); updateNext(); } });
  emailAuth = setupEmailAuth(form, teamCheck, { onStateChange: () => { updateAuthors(); updateNext(); } });
  authorFields.forEach((id) => document.getElementById(id).addEventListener('change', updateAuthors));
  updateAuthors();
  updateNext();

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!teamCheck.isVerified() || !emailAuth.isVerified()) return;
    updateAuthors();
    if (!form.reportValidity()) return;
    SUBMISSION_FIELDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const value = el.type === 'checkbox' ? String(el.checked) : el.value;
      sessionStorage.setItem(storageKey(id), value);
    });
    window.location.href = 'confirm.html';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.submitform');
  const start = document.getElementById('submission-start');
  if (!form || !start) return;
  // 表示はブラウザーの時計で切り替え、最終的な受付可否はGAS側で判定する。
  const startsAt = Date.parse(start.dateTime);
  if (!Number.isFinite(startsAt)) return;

  function showWhenOpen() {
    const remaining = startsAt - Date.now();
    if (remaining > 0) {
      setTimeout(showWhenOpen, Math.min(remaining, 60000));
      return;
    }
    initializeSubmissionForm(form);
    document.getElementById('submission-notice').hidden = true;
    document.getElementById('submission-steps').hidden = false;
    form.hidden = false;
  }
  showWhenOpen();
});
