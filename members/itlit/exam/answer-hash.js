(function (root) {
  'use strict';
  function payload(salt, kind, values) {
    return JSON.stringify(['klea-answer-v1', salt, kind, [...values].sort((a, b) => a - b)]);
  }
  async function digest(salt, kind, values) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload(salt, kind, values)));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  root.ExamAnswerHash = { payload, digest };
})(typeof window === 'undefined' ? globalThis : window);
