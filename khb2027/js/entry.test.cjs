const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');

function setup() {
  const listeners = {};
  class Element {
    constructor(tag = 'input') { this.tag = tag; this.children = []; this.handlers = {}; this._value = ''; this.disabled = false; this.checked = false; this.id = ''; }
    get value() { return this._value; }
    set value(value) { this._value = this.tag === 'select' && !this.children.some(option => option.value === value) ? '' : value; }
    appendChild(child) { child.parent = this; this.children.push(child); }
    replaceChildren() { this.children.forEach(child => { child.parent = null; }); this.children = []; this._value = ''; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    closest(tag) { return this.tag === tag ? this : this.parent?.closest(tag); }
    focus() {}
    setAttribute(key, value) { this[key] = value; }
    setCustomValidity(message) { this.validationMessage = message; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    dispatch(type) {
      const event = { target: this, prevented: false, preventDefault() { this.prevented = true; } };
      for (let node = this; node; node = node.parent) for (const handler of node.handlers[type] || []) handler(event);
      return event;
    }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    querySelectorAll(selector) {
      return this.descendants().filter(node => selector.split(',').some(part => {
        const s = part.trim();
        if (s === 'button[type="submit"]') return node.tag === 'button' && node.type === 'submit';
        if (s.startsWith('#')) return node.id === s.slice(1);
        if (s.startsWith('.')) return (node.className || '').split(' ').includes(s.slice(1));
        return node.tag === s;
      }));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    set innerHTML(html) {
      this.replaceChildren();
      const label = new Element('label'); const input = new Element(); const button = new Element('button');
      input.id = /<input id="([^"]+)"/.exec(html)[1]; input.className = 'haiku school-name';
      button.type = 'button'; this.appendChild(label); this.appendChild(input); this.appendChild(button);
    }
    checkValidity() {
      return this.descendants().filter(node => ['input', 'select', 'textarea'].includes(node.tag)).every(node => {
        if (node.disabled || node.type === 'hidden') return true;
        if (node.validationMessage) return false;
        if (node.required && !(node.type === 'checkbox' ? node.checked : node.value)) return false;
        return node.type !== 'email' || !node.value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(node.value);
      });
    }
    reportValidity() { return this.checkValidity(); }
    reset() { for (const node of this.descendants().filter(node => ['input', 'select', 'textarea'].includes(node.tag))) { node.value = ''; node.checked = false; } }
  }
  const form = new Element('form'); form.id = 'entry-form';
  function add(id, tag = 'input', parent = form) { const el = new Element(tag); el.id = id; parent.appendChild(el); return el; }
  for (const id of ['schoolName', 'teamName', 'responsibleName', 'email']) add(id).required = true;
  form.querySelector('#email').type = 'email';
  for (const [id, values] of [['plannedTeamCount', ['1', '2', '3']], ['responsibleRole', ['顧問', 'コーチ', '選手', 'その他']], ['memberCount', ['3', '4', '5']]]) {
    const el = add(id, 'select'); el.required = true;
    for (const value of ['', ...values]) { const option = new Element('option'); option.value = value; el.appendChild(option); }
  }
  add('isJointTeam').type = 'checkbox';
  const schools = add('additional-schools', 'div');
  const schoolWrap = new Element('p'); schools.appendChild(schoolWrap); schoolWrap.appendChild(new Element('label'));
  add('schoolName2', 'input', schoolWrap).className = 'school-name';
  const addWrap = add('add-school-wrap', 'p'); add('add-school', 'button', addWrap).type = 'button';
  const roleWrap = add('responsibleRoleOther-field', 'p'); add('responsibleRoleOther', 'input', roleWrap);
  add('member-fields', 'div'); add('members').type = 'hidden';
  for (const id of ['member-name-warning', 'school-name-error', 'entry-status', 'responsible-name-status', 'introduction-count']) add(id, 'p');
  add('introduction', 'textarea').required = true; add('specialNote', 'textarea');
  for (const id of ['termsConsent', 'inputConfirmation', 'contactConfirmation']) { const el = add(id); el.type = 'checkbox'; el.required = true; }
  const button = add('submit', 'button'); button.type = 'submit'; button.disabled = true;
  const document = { querySelector: s => s === '#entry-form' ? form : form.querySelector(s), querySelectorAll: s => form.querySelectorAll(s),
    getElementById: id => form.querySelector(`#${id}`), createElement: tag => new Element(tag) };
  const context = vm.createContext({ document, window: { location: { origin: 'http://127.0.0.1:8766' }, addEventListener: (type, fn) => { listeners[type] = fn; } },
    GAS_MESSAGE_SOURCE: 'khb2027', GAS_WEB_APP_URL: 'https://script.google.com/macros/s/test/exec' });
  vm.runInContext(read('entryRules.js') + '\n' + read('authorRules.js') + '\n' + read('memberFields.js') + '\n' + read('entry.js'), context);
  const get = id => document.getElementById(id);
  function set(id, value, type = 'input') { const el = get(id); if (el.type === 'checkbox') el.checked = value; else el.value = value; el.dispatch(type); }
  function fill() {
    for (const [id, value] of Object.entries({ schoolName: 'A高校', teamName: 'A高校チーム', responsibleName: '責任　者', email: 'team@example.com', introduction: 'あ'.repeat(250) })) set(id, value);
    set('plannedTeamCount', '1', 'change'); set('responsibleRole', '顧問', 'change'); set('memberCount', '3', 'change');
    for (let i = 1; i <= 3; i++) { set(`member-${i}-name`, `氏名　${i}`); set(`member-${i}-grade`, '高2', 'change'); }
    for (const id of ['termsConsent', 'inputConfirmation', 'contactConfirmation']) set(id, true, 'change');
  }
  function reply(ok) { listeners.message({ origin: 'https://script.google.com', data: { source: 'khb2027', action: 'entry', ok, message: ok ? '受付済み' : '送信失敗' } }); }
  return { form, button, get, set, fill, reply };
}

test('必須入力・メール形式・紹介文の文字数・確認事項をすべて満たしたときだけ送信できる', () => {
  const s = setup(); assert.equal(s.button.disabled, true); s.fill(); assert.equal(s.button.disabled, false);
  for (const [id, invalid, valid, type] of [
    ['teamName', '', 'A高校チーム', 'input'], ['email', 'team@example', 'team@example.com', 'input'],
    ['introduction', 'あ'.repeat(249), 'あ'.repeat(250), 'input'], ['introduction', 'あ'.repeat(281), 'あ'.repeat(280), 'input'],
    ['member-3-grade', '', '高2', 'input'], ['contactConfirmation', false, true, 'change'],
  ]) {
    s.set(id, invalid, type); assert.equal(s.button.disabled, true, id);
    s.set(id, valid, type); assert.equal(s.button.disabled, false, id);
  }
});

test('責任者のその他欄と合同チームの学校・所属校も入力条件に含め、解除時に再判定する', () => {
  const s = setup(); s.fill(); s.set('responsibleRole', 'その他', 'change'); assert.equal(s.button.disabled, true);
  s.set('responsibleRoleOther', '保護者'); assert.equal(s.button.disabled, false);
  s.set('responsibleRole', '顧問', 'change'); assert.equal(s.get('responsibleRoleOther').value, '');
  s.set('isJointTeam', true, 'change'); assert.equal(s.button.disabled, true);
  s.set('schoolName2', 'B高校');
  for (let i = 1; i <= 3; i++) s.set(`member-${i}-school`, 'A高校', 'change');
  assert.equal(s.button.disabled, true); assert.match(s.get('school-name-error').textContent, /「B高校」/);
  s.set('member-2-school', 'B高校', 'change');
  assert.equal(s.button.disabled, false);
  s.set('schoolName2', 'A高校'); assert.equal(s.button.disabled, true);
  s.set('schoolName2', 'B高校'); s.set('member-2-school', 'B高校', 'change'); assert.equal(s.button.disabled, false);
  s.get('add-school').dispatch('click'); assert.equal(s.button.disabled, true, '学校追加直後の空欄も必須');
  s.get('schoolName3').closest('p').querySelector('button').dispatch('click'); assert.equal(s.button.disabled, false);
  s.set('schoolName2', '', 'input'); s.set('isJointTeam', false, 'change'); assert.equal(s.button.disabled, false);
});

test('学校を追加したらその学校の選手が必要になり、学校数が人数を超えた場合も送信できない', () => {
  const s = setup(); s.fill(); s.set('isJointTeam', true, 'change'); s.set('schoolName2', 'B高校');
  for (const [index, school] of ['A高校', 'B高校', 'A高校'].entries()) s.set(`member-${index + 1}-school`, school, 'change');
  assert.equal(s.button.disabled, false);
  s.get('add-school').dispatch('click'); s.set('schoolName3', 'C高校');
  assert.equal(s.button.disabled, true); assert.match(s.get('school-name-error').textContent, /「C高校」/);
  s.set('member-3-school', 'C高校', 'change'); assert.equal(s.button.disabled, false);
  s.get('add-school').dispatch('click'); s.set('schoolName4', 'D高校');
  assert.equal(s.button.disabled, true); assert.match(s.get('school-name-error').textContent, /「D高校」/);
  s.get('schoolName4').closest('p').querySelector('button').dispatch('click'); assert.equal(s.button.disabled, false);
});

test('紹介文の表示文字数・送信可否は改行形式と補助漢字・絵文字でずれず、長すぎる入力を切り捨てない', () => {
  const html = fs.readFileSync(path.join(__dirname, '../entry.html'), 'utf8');
  const textarea = html.match(/<textarea\b[^>]*id="introduction"[^>]*>/)[0];
  assert.doesNotMatch(textarea, /\b(?:minlength|maxlength)=/, 'UTF-16単位の制限と独自の文字数判定を重ねない');
  const s = setup(); s.fill();
  for (const length of [249, 250, 280, 281]) for (const newline of ['\n', '\r\n', '\r']) {
    const value = 'あ'.repeat(length - 6) + '𠮷😀 ' + newline + 'い' + newline;
    s.set('introduction', value);
    assert.equal(s.get('introduction-count').textContent, `${length}字 / 250〜280字`);
    assert.equal(s.button.disabled, length < 250 || length > 280);
    assert.equal(s.get('introduction').value, value, '入力内容を自動修正・切り捨てしない');
  }
  s.set('introduction', ''); assert.equal(s.get('introduction-count').textContent, '0字 / 250〜280字');
});

test('同姓同名・同学年・同校では無効にし、学年が違えば警告を残して有効にする', () => {
  const s = setup(); s.fill(); s.set('member-2-name', '氏名　1'); assert.equal(s.button.disabled, true);
  s.set('member-2-grade', '高1'); assert.equal(s.button.disabled, false);
  assert.equal(s.get('member-name-warning').hidden, false);
});

test('メンバーと責任者の姓名にスペースがなければ送信を無効にし、修正時に案内を消す', () => {
  const s = setup(); s.fill(); s.set('member-1-name', '山田太郎'); assert.equal(s.button.disabled, true);
  assert.match(s.get('member-name-warning').textContent, /姓と名の間/);
  s.set('member-1-name', '山田 太郎'); assert.equal(s.button.disabled, false);
  s.set('responsibleName', '佐藤花子'); assert.equal(s.button.disabled, true);
  assert.equal(s.get('responsible-name-status').hidden, false);
  s.set('responsibleName', '佐藤 花子'); assert.equal(s.button.disabled, false);
  assert.equal(s.get('responsible-name-status').hidden, true);
  assert.equal(s.form.dispatch('submit').prevented, false);
  assert.equal(s.get('responsibleName').value, '佐藤 花子');
  assert.equal(JSON.parse(s.get('members').value)[0].name, '山田 太郎');
});

test('送信中は入力しても無効のままで二重送信を防ぎ、失敗後は入力条件を再判定する', () => {
  const s = setup(); s.fill(); assert.equal(s.form.dispatch('submit').prevented, false);
  assert.equal(s.button.disabled, true); s.set('teamName', '変更後'); assert.equal(s.button.disabled, true);
  assert.equal(s.form.dispatch('submit').prevented, true); s.reply(false); assert.equal(s.button.disabled, false);
  s.form.dispatch('submit'); s.set('teamName', ''); s.reply(false); assert.equal(s.button.disabled, true);
});

test('受付成功後はフォームをリセットし、次の入力が揃うまで無効に戻す', () => {
  const s = setup(); s.fill(); s.form.dispatch('submit'); s.reply(true);
  assert.equal(s.button.disabled, true); assert.equal(s.get('teamName').value, '');
  assert.equal(s.get('member-fields').children.length, 0); s.fill(); assert.equal(s.button.disabled, false);
});
