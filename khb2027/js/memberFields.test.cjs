const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const authorSource = fs.readFileSync(path.join(__dirname, 'authorRules.js'), 'utf8').replace(/export /g, '');
const source = fs.readFileSync(path.join(__dirname, 'memberFields.js'), 'utf8').replace(/^import .*;\r?\n/m, '').replace('export function', 'function');

function setup() {
  class Element {
    constructor(tag = 'input') { this.tag = tag; this.children = []; this.handlers = {}; this.disabled = false; this._value = ''; }
    get value() { return this._value; }
    set value(value) { this._value = this.tag === 'select' && !this.children.some(option => option.value === value) ? '' : value; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; this._value = ''; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    dispatch(type, target = this) { for (const handler of this.handlers[type] || []) handler({ target }); }
    setCustomValidity(value) { this.validationMessage = value; }
  }
  const elements = Object.fromEntries(['memberCount', 'member-fields', 'members', 'schoolName', 'schoolName2', 'member-name-warning', 'school-name-error'].map(id => [id, new Element()]));
  elements.schoolName.value = 'A高校'; elements.schoolName2.value = 'B高校'; elements.schoolName2.disabled = true;
  const form = new Element();
  form.querySelectorAll = () => [elements.schoolName, elements.schoolName2];
  const joint = { checked: false };
  const context = vm.createContext({ document: { getElementById: id => elements[id], createElement: tag => new Element(tag) } });
  vm.runInContext(authorSource + '\n' + source, context);
  const controller = context.setupMemberFields(form, joint);
  function input(id) {
    function find(element) { if (element.id === id) return element; for (const child of element.children) { const match = find(child); if (match) return match; } }
    return find(elements['member-fields']);
  }
  function count(size) { elements.memberCount.value = String(size); elements.memberCount.dispatch('change'); }
  function serialize() { controller.serialize(); return JSON.parse(elements.members.value); }
  return { elements, controller, form, joint, input, count, serialize };
}

test('人数分の氏名・学年を登録し、人数変更後も残るメンバーの入力と掲載順を保持する', () => {
  const s = setup(); s.count(5);
  for (let index = 1; index <= 5; index += 1) { s.input(`member-${index}-name`).value = `氏名${index}`; s.input(`member-${index}-grade`).value = '高2'; }
  assert.equal(s.serialize().length, 5);
  s.count(3);
  assert.deepEqual(s.serialize(), [1, 2, 3].map(index => ({ name: `氏名${index}`, grade: '高2', school: '' })));
  s.count(5); assert.equal(s.input('member-5-name').value, '氏名5');
  s.elements.memberCount.value = ''; s.elements.memberCount.dispatch('change');
  assert.equal(s.elements['member-fields'].children.length, 0);
});

test('合同チームでだけ所属校を必須にし、学校名の変更・解除で無効な選択を送信しない', () => {
  const s = setup(); s.count(3);
  assert.equal(s.input('member-1-school').disabled, true);
  s.joint.checked = true; s.elements.schoolName2.disabled = false; s.controller.syncSchools();
  const school = s.input('member-1-school');
  assert.equal(school.required, true); assert.equal(school.disabled, false);
  school.value = 'B高校'; assert.equal(s.serialize()[0].school, 'B高校');
  s.elements.schoolName2.value = 'C高校'; s.form.dispatch('input', { id: 'schoolName2' });
  assert.equal(school.value, '');
  school.value = 'C高校';
  s.joint.checked = false; s.controller.syncSchools();
  assert.equal(s.serialize()[0].school, '');
  assert.equal(school.disabled, true);
});

test('同姓同名は警告で登録を妨げず、空白だけの氏名は拒否し、入力表記を保持する', () => {
  const s = setup(); s.count(3);
  s.input('member-1-name').value = '同じ　氏名'; s.input('member-2-name').value = ' 同じ 氏名　';
  s.serialize(); assert.equal(s.input('member-1-name').validationMessage, '');
  assert.equal(s.input('member-2-name').validationMessage, '');
  assert.equal(s.elements['member-name-warning'].hidden, false);
  assert.match(s.elements['member-name-warning'].textContent, /メンバー1・メンバー2/);
  assert.match(s.elements['member-name-warning'].textContent, /同姓同名の場合は登録できます/);
  s.input('member-2-name').value = '別の　氏名'; s.elements['member-fields'].dispatch('input');
  assert.equal(s.input('member-1-name').validationMessage, '');
  assert.equal(s.elements['member-name-warning'].hidden, true);
  s.input('member-3-name').value = ' 前後　空白'; s.serialize();
  assert.equal(s.input('member-3-name').validationMessage, '');
  assert.equal(s.serialize()[2].name, ' 前後　空白', '氏名を無断で正規化しない');
  s.input('member-3-name').value = ' \t　'; s.serialize();
  assert.match(s.input('member-3-name').validationMessage, /空白だけ/);
  s.input('member-3-name').value = '三人目'; s.serialize();
  assert.equal(s.input('member-3-name').validationMessage, '');
});

test('合同チームの同じ学校名は両欄で拒否し、修正・合同解除後はエラーを消す', () => {
  const s = setup(); s.count(3);
  s.joint.checked = true; s.elements.schoolName2.disabled = false;
  s.elements.schoolName2.value = s.elements.schoolName.value; s.controller.syncSchools();
  for (const field of ['schoolName', 'schoolName2']) assert.match(s.elements[field].validationMessage, /同じ学校名/);
  assert.equal(s.elements['school-name-error'].hidden, false);
  s.elements.schoolName2.value = 'B高校'; s.form.dispatch('input', { id: 'schoolName2' });
  for (const field of ['schoolName', 'schoolName2']) assert.equal(s.elements[field].validationMessage, '');
  assert.equal(s.elements['school-name-error'].hidden, true);
  s.elements.schoolName2.value = 'A高校'; s.controller.syncSchools();
  s.joint.checked = false; s.elements.schoolName2.disabled = true; s.controller.syncSchools();
  for (const field of ['schoolName', 'schoolName2']) assert.equal(s.elements[field].validationMessage, '');
  assert.equal(s.elements['school-name-error'].hidden, true);
});

test('同姓同名・同学年・同校は要連絡とし、学年か所属校を直すと警告だけになる', () => {
  const s = setup(); s.count(3);
  for (const index of [1, 2]) { s.input(`member-${index}-name`).value = '同じ　氏名'; s.input(`member-${index}-grade`).value = '高2'; }
  s.serialize();
  for (const index of [1, 2]) assert.match(s.input(`member-${index}-name`).validationMessage, /実行委員会へ連絡/);
  s.input('member-2-grade').value = '高1'; s.elements['member-fields'].dispatch('input');
  for (const index of [1, 2]) assert.equal(s.input(`member-${index}-name`).validationMessage, '');
  assert.equal(s.elements['member-name-warning'].hidden, false);
  s.joint.checked = true; s.elements.schoolName2.disabled = false; s.controller.syncSchools();
  s.input('member-2-grade').value = '高2';
  s.input('member-1-school').value = 'A高校'; s.input('member-2-school').value = 'B高校'; s.elements['member-fields'].dispatch('change');
  for (const index of [1, 2]) assert.equal(s.input(`member-${index}-name`).validationMessage, '');
  s.input('member-2-school').value = 'A高校'; s.elements['member-fields'].dispatch('change');
  for (const index of [1, 2]) assert.match(s.input(`member-${index}-name`).validationMessage, /実行委員会へ連絡/);
});

test('受付完了後のリセットでは入力済みメンバーの下書きを消去する', () => {
  const s = setup(); s.count(3); s.input('member-1-name').value = '前の　氏名';
  s.elements.memberCount.value = ''; s.controller.reset();
  s.count(3); assert.equal(s.input('member-1-name').value, '');
});
