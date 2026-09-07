const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { encodeQuestions } = require('./create-question-hashes.cjs');
const testQuestions = encodeQuestions([{ answer: [1], points: 10, forbidden: [] }]);

// 画面描画とは独立に、照合・開始・再開の保存時刻と画面遷移を検証する。
function harness(saved = null) {
  class Element {
    constructor() { this.value = ''; this.children = []; this.events = {}; this.hidden = false; this.classList = { toggle() {} }; }
    append(...items) { this.children.push(...items); if (items[0]?.value && !this.value) this.value = items[0].value; }
    replaceChildren() { this.children = []; }
    addEventListener(type, handler) { this.events[type] = handler; }
    setAttribute() {}
    focus() {}
    querySelector() { return this.button ||= new Element(); }
    querySelectorAll() { return []; }
    fire(type) { return this.events[type]({ preventDefault() {} }); }
  }
  const nodes = new Map();
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], new Element());
  nodes.get('time').parentElement = new Element();
  const exam = { id: 'test', version: '1', title: 'Test', durationMinutes: 1, questions: testQuestions, passScore: 10, forbiddenLimit: 1 };
  let now = 100000, stored = saved, writes = 0;
  const context = {
    crypto: webcrypto, TextEncoder, console: { log() {} },
    document: { getElementById: id => nodes.get(id), createElement: () => new Element(), body: new Element(), addEventListener() {} },
    location: { pathname: '/members/itlit/exam/', reload() {} },
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; writes++; }, removeItem: () => { stored = null; } },
    Date: class extends Date { static now() { return now; } },
    setInterval() {}, confirm: () => true,
    EXAMS: [exam], EXAM_ACCESS: {}, addEventListener() {},
    ExamIdentity: { authorize: async () => ({ id: 'a'.repeat(64), name: '受験者' }) }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'answer-hash.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'grading.js'), 'utf8'), context);
  let grading;
  const grade = context.ExamGrading.grade;
  context.ExamGrading.grade = (...args) => { grading = grade(...args); return grading; };
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), context);
  return { nodes, exam, settle: async () => { await grading; }, setTime: value => { now = value; }, get writes() { return writes; }, get stored() { return stored && JSON.parse(stored); } };
}

test('照合では開始せず、開始ボタンを押した時刻から計時する', async () => {
  const h = harness();
  await h.nodes.get('start-form').fire('submit');
  assert.equal(h.nodes.get('ready').hidden, false);
  assert.equal(h.nodes.get('taking').hidden, true);
  assert.equal(h.writes, 0);
  h.setTime(130000);
  h.nodes.get('begin').fire('click');
  assert.equal(h.stored.startedAt, 130000);
  assert.equal(h.stored.endsAt, 190000);
  assert.equal(h.nodes.get('taking').hidden, false);
});

test('確認画面から戻ると記録を作らず、開始できなくなる', async () => {
  const h = harness();
  await h.nodes.get('start-form').fire('submit');
  h.nodes.get('ready-back').fire('click');
  h.nodes.get('begin').fire('click');
  assert.equal(h.nodes.get('start').hidden, false);
  assert.equal(h.writes, 0);
});

test('再照合後も期限は延長せず、期限後の再開では自動提出する', async () => {
  const first = harness();
  await first.nodes.get('start-form').fire('submit');
  first.nodes.get('begin').fire('click');
  const h = harness(JSON.stringify(first.stored));
  await h.nodes.get('start-form').fire('submit');
  assert.equal(h.nodes.get('begin').textContent, '試験を再開');
  assert.equal(h.writes, 0);
  h.setTime(170000);
  h.nodes.get('begin').fire('click');
  assert.equal(h.stored.endsAt, 160000);
  assert.equal(h.stored.submittedAt, 160000);
  assert.equal(h.stored.reason, 'timeout');
  assert.equal(h.nodes.get('result').hidden, false);
});
test('提出済みの回答をハッシュ採点して合格証明書を表示する', async () => {
  const first = harness();
  await first.nodes.get('start-form').fire('submit');
  first.nodes.get('begin').fire('click');
  const saved = { ...first.stored, answers: [[1]], submittedAt: 110000, reason: 'manual' };
  const h = harness(JSON.stringify(saved));
  await h.nodes.get('start-form').fire('submit');
  h.nodes.get('begin').fire('click');
  await h.settle();
  assert.equal(h.nodes.get('score').textContent, '10 / 10点');
  assert.equal(h.nodes.get('verdict').textContent, '合格');
  h.nodes.get('show-certificate').fire('click');
  assert.equal(h.nodes.get('certificate').hidden, false);
});
