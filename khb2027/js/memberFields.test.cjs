const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const authorSource = fs.readFileSync(path.join(__dirname, 'authorRules.js'), 'utf8').replace(/export /g, '');
const rulesSource = fs.readFileSync(path.join(__dirname, 'entryRules.js'), 'utf8').replace(/export /g, '');
const source = fs.readFileSync(path.join(__dirname, 'memberFields.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');

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
  const elements = Object.fromEntries(['memberCount', 'member-fields', 'members', 'schoolName', 'schoolName2', 'member-name-warning'].map(id => [id, new Element()]));
  elements.schoolName.value = 'A高校'; elements.schoolName2.value = 'B高校'; elements.schoolName2.disabled = true;
  const form = new Element();
  form.querySelectorAll = () => Object.entries(elements).filter(([id]) => /^schoolName\d*$/.test(id)).map(([, input]) => input);
  const joint = { checked: false };
  const context = vm.createContext({ document: { getElementById: id => elements[id], createElement: tag => new Element(tag) } });
  vm.runInContext(authorSource + '\n' + rulesSource + '\n' + source, context);
  const controller = context.setupMemberFields(form, joint);
  function input(id) {
    function find(element) { if (element.id === id) return element; for (const child of element.children) { const match = find(child); if (match) return match; } }
    return find(elements['member-fields']);
  }
  function count(size) { elements.memberCount.value = String(size); elements.memberCount.dispatch('change'); }
  function serialize() { controller.serialize(); return JSON.parse(elements.members.value); }
  function addSchool(number, name) { const element = new Element(); element.value = name; elements[`schoolName${number}`] = element; controller.syncSchools(); }
  return { elements, controller, form, joint, input, count, serialize, addSchool };
}

test('人数分の氏名・学年を登録し、人数変更後も残るメンバーの入力と掲載順を保持する', () => {
  const s = setup(); s.count(5);
  for (let index = 1; index <= 5; index += 1) { s.input(`member-${index}-name`).value = `氏名　${index}`; s.input(`member-${index}-grade`).value = '高2'; }
  assert.equal(s.serialize().length, 5);
  s.count(3);
  assert.deepEqual(s.serialize(), [1, 2, 3].map(index => ({ name: `氏名　${index}`, grade: '高2', school: '' })));
  s.count(5); assert.equal(s.input('member-5-name').value, '氏名　5');
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
  assert.match(s.elements['member-name-warning'].textContent, /入力の重複でないか確認/);
  s.input('member-2-name').value = '別の　氏名'; s.elements['member-fields'].dispatch('input');
  assert.equal(s.input('member-1-name').validationMessage, '');
  assert.equal(s.elements['member-name-warning'].hidden, true);
  s.input('member-3-name').value = ' 前後　空白'; s.serialize();
  assert.equal(s.input('member-3-name').validationMessage, '');
  assert.equal(s.serialize()[2].name, ' 前後　空白', '氏名を無断で正規化しない');
  s.input('member-3-name').value = ' \t　'; s.serialize();
  assert.match(s.input('member-3-name').validationMessage, /空白だけ/);
  s.input('member-3-name').value = '三人　目'; s.serialize();
  assert.equal(s.input('member-3-name').validationMessage, '');
});

test('学年は中1〜中3・高1〜高3から選び、人数の変更後も選択を保持する', () => {
  const s = setup(); s.count(3); const grade = s.input('member-1-grade');
  assert.equal(grade.tag, 'select'); assert.equal(grade.required, true); assert.equal(grade.value, '');
  assert.deepEqual(grade.children.map(option => option.value), ['', '中1', '中2', '中3', '高1', '高2', '高3']);
  for (const value of ['中1', '中2', '中3', '高1', '高2', '高3']) {
    grade.value = value; assert.equal(s.serialize()[0].grade, value);
  }
  grade.value = '中2'; s.count(5); assert.equal(s.input('member-1-grade').value, '中2');
  s.input('member-1-grade').value = '大学1年'; assert.equal(s.input('member-1-grade').value, '');
});

test('姓名間の全角・半角スペースを認め、区切りなし・前後だけの空白・タブだけの区切りを拒否する', () => {
  const s = setup(); s.count(3); const name = s.input('member-1-name');
  for (const value of ['山田太郎', ' 山田太郎　', '山田\t太郎', '山田\n太郎', '山田　']) {
    name.value = value; s.elements['member-fields'].dispatch('input');
    assert.match(name.validationMessage, /姓と名の間/);
    assert.equal(s.elements['member-name-warning'].hidden, true, '入力条件の不備は氏名欄の標準警告だけで表示する');
  }
  for (const value of ['山田　太郎', '山田 太郎', '山田  太郎', '山田　太郎 次郎']) {
    name.value = value; s.serialize(); assert.equal(name.validationMessage, '');
    assert.equal(s.serialize()[0].name, value); assert.equal(s.elements['member-name-warning'].hidden, true);
  }
});

test('合同チームの同じ学校名は両欄で拒否し、修正・合同解除後はエラーを消す', () => {
  const s = setup(); s.count(3);
  s.joint.checked = true; s.elements.schoolName2.disabled = false;
  s.elements.schoolName2.value = s.elements.schoolName.value; s.controller.syncSchools();
  for (const field of ['schoolName', 'schoolName2']) assert.match(s.elements[field].validationMessage, /同じ学校名/);
  s.elements.schoolName2.value = 'B高校'; s.form.dispatch('input', { id: 'schoolName2' });
  s.input('member-1-school').value = 'A高校'; s.input('member-2-school').value = 'B高校';
  s.elements['member-fields'].dispatch('change');
  for (const field of ['schoolName', 'schoolName2']) assert.equal(s.elements[field].validationMessage, '');
  s.elements.schoolName2.value = 'A高校'; s.controller.syncSchools();
  s.joint.checked = false; s.elements.schoolName2.disabled = true; s.controller.syncSchools();
  for (const field of ['schoolName', 'schoolName2']) assert.equal(s.elements[field].validationMessage, '');
});

test('同姓同名・同学年・同校は要連絡とし、学年か所属校を直すと警告だけになる', () => {
  const s = setup(); s.count(3);
  for (const index of [1, 2]) { s.input(`member-${index}-name`).value = '同じ　氏名'; s.input(`member-${index}-grade`).value = '高2'; }
  s.serialize();
  for (const index of [1, 2]) assert.match(s.input(`member-${index}-name`).validationMessage, /実行委員会へご連絡/);
  s.input('member-2-grade').value = '高1'; s.elements['member-fields'].dispatch('input');
  for (const index of [1, 2]) assert.equal(s.input(`member-${index}-name`).validationMessage, '');
  assert.equal(s.elements['member-name-warning'].hidden, false);
  s.joint.checked = true; s.elements.schoolName2.disabled = false; s.controller.syncSchools();
  s.input('member-2-grade').value = '高2';
  s.input('member-1-school').value = 'A高校'; s.input('member-2-school').value = 'B高校'; s.elements['member-fields'].dispatch('change');
  for (const index of [1, 2]) assert.equal(s.input(`member-${index}-name`).validationMessage, '');
  s.input('member-2-school').value = 'A高校'; s.elements['member-fields'].dispatch('change');
  for (const index of [1, 2]) assert.match(s.input(`member-${index}-name`).validationMessage, /実行委員会へご連絡/);
});

test('受付完了後のリセットでは入力済みメンバーの下書きを消去する', () => {
  const s = setup(); s.count(3); s.input('member-1-name').value = '前の　氏名';
  s.elements.memberCount.value = ''; s.controller.reset();
  s.count(3); assert.equal(s.input('member-1-name').value, '');
});

test('合同チームは全校から1人以上を必要とし、所属校の変更・学校の改名・合同解除で再判定する', () => {
  const s = setup(); s.count(3); s.joint.checked = true; s.elements.schoolName2.disabled = false; s.controller.syncSchools();
  for (let index = 1; index <= 3; index++) s.input(`member-${index}-school`).value = 'A高校';
  s.elements['member-fields'].dispatch('change');
  assert.match(s.elements.schoolName2.validationMessage, /「B高校」の選手が登録されていません/);
  assert.equal(s.elements.schoolName.validationMessage, '');
  s.input('member-2-school').value = 'B高校'; s.elements['member-fields'].dispatch('change');
  assert.equal(s.elements.schoolName2.validationMessage, '');
  s.elements.schoolName2.value = 'C高校'; s.form.dispatch('input', { id: 'schoolName2' });
  assert.equal(s.input('member-2-school').value, ''); assert.match(s.elements.schoolName2.validationMessage, /「C高校」/);
  s.input('member-2-school').value = 'C高校'; s.elements['member-fields'].dispatch('change');
  assert.equal(s.elements.schoolName2.validationMessage, '');
  s.input('member-2-school').value = 'A高校'; s.elements['member-fields'].dispatch('change');
  s.joint.checked = false; s.elements.schoolName2.disabled = true; s.controller.syncSchools();
  assert.equal(s.elements.schoolName2.validationMessage, '');
});

test('5校・5人は全校参加なら有効で、人数を3人へ減らすと参加者が消えた学校を検出する', () => {
  const s = setup(); s.count(5); s.joint.checked = true; s.elements.schoolName2.disabled = false;
  s.addSchool(3, 'C高校'); s.addSchool(4, 'D高校'); s.addSchool(5, 'E高校');
  for (const [index, school] of ['A高校', 'B高校', 'C高校', 'D高校', 'E高校'].entries()) s.input(`member-${index + 1}-school`).value = school;
  s.serialize();
  for (const number of [1, 2, 3, 4, 5]) assert.equal(s.elements[`schoolName${number === 1 ? '' : number}`].validationMessage, '');
  s.count(3);
  assert.match(s.elements.schoolName4.validationMessage, /「D高校」/);
  assert.match(s.elements.schoolName5.validationMessage, /「E高校」/);
  s.count(5);
  for (const number of [4, 5]) assert.equal(s.elements[`schoolName${number}`].validationMessage, '', '人数を戻すと保持した所属校で再判定');
});
