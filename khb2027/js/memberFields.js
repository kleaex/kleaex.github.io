import { authorNameKey, indistinguishableMembers } from './authorRules.js';

export function setupMemberFields(form, jointTeam) {
  const count = document.getElementById('memberCount');
  const container = document.getElementById('member-fields');
  const payload = document.getElementById('members');
  const nameWarning = document.getElementById('member-name-warning');
  const schoolError = document.getElementById('school-name-error');
  const drafts = [];
  let rows = [];

  function field(group, id, labelText, kind = 'input') {
    const wrap = document.createElement('p');
    wrap.className = 'member-field';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.htmlFor = id;
    label.textContent = labelText;
    const input = document.createElement(kind);
    input.id = id;
    input.className = 'haiku';
    input.required = true;
    if (kind === 'input') { input.type = 'text'; input.placeholder = labelText; }
    wrap.appendChild(label);
    wrap.appendChild(input);
    group.appendChild(wrap);
    return { input, wrap };
  }

  function syncSchools() {
    const schoolInputs = [...form.querySelectorAll('#schoolName, .school-name')];
    const values = schoolInputs.filter((input) => !input.disabled).map((input) => input.value.trim()).filter(Boolean);
    let hasDuplicates = false;
    for (const input of schoolInputs) {
      const duplicate = jointTeam.checked && !input.disabled && input.value.trim()
        && values.filter((value) => value === input.value.trim()).length > 1;
      input.setCustomValidity(duplicate ? '合同チームに同じ学校名を複数登録することはできません。' : '');
      if (duplicate) hasDuplicates = true;
    }
    schoolError.hidden = !hasDuplicates;
    schoolError.textContent = hasDuplicates ? '合同チームに同じ学校名を複数登録することはできません。学校名を確認してください。' : '';
    const schools = [...new Set(schoolInputs.filter((input) => !input.disabled).map((input) => input.value).filter(Boolean))];
    for (const row of rows) {
      const previous = row.school.input.value;
      row.school.wrap.hidden = !jointTeam.checked;
      row.school.input.disabled = !jointTeam.checked;
      row.school.input.required = jointTeam.checked;
      row.school.input.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '所属校を選択してください';
      row.school.input.appendChild(placeholder);
      for (const school of schools) {
        const option = document.createElement('option');
        option.value = school;
        option.textContent = school;
        row.school.input.appendChild(option);
      }
      row.school.input.value = jointTeam.checked && schools.includes(previous) ? previous : '';
    }
  }

  function validateNames() {
    const names = rows.map((row) => authorNameKey(row.name.input.value));
    const members = rows.map((row) => ({ name: row.name.input.value, grade: row.grade.input.value, school: jointTeam.checked ? row.school.input.value : '' }));
    const unresolved = indistinguishableMembers(members).filter((index) => !jointTeam.checked || members[index].school);
    const contactMessage = '氏名・学年・所属校がすべて同じメンバーがいます。別人として区別する必要があるため、実行委員会へ連絡してください。';
    for (const [index, row] of rows.entries()) {
      const name = authorNameKey(row.name.input.value);
      row.name.input.setCustomValidity(row.name.input.value && !name ? '氏名を入力してください。空白だけの入力はできません。'
        : unresolved.includes(index) ? contactMessage : '');
    }
    const groups = [...new Set(names.filter(Boolean))].map((name) => names.flatMap((value, index) => value === name ? [index + 1] : []))
      .filter((indexes) => indexes.length > 1);
    nameWarning.hidden = !groups.length;
    nameWarning.textContent = unresolved.length ? contactMessage : groups.length ? `${groups.map((indexes) => indexes.map((index) => `メンバー${index}`).join('・')).join('、')}の氏名が同じです。学年・所属校が異なる同姓同名の場合は登録できます。入力の重複でないか確認してください。` : '';
  }

  function render() {
    rows.forEach((row, index) => { drafts[index] = { name: row.name.input.value, grade: row.grade.input.value, school: row.school.input.value }; });
    rows = [];
    container.replaceChildren();
    const size = Number(count.value);
    if (![3, 4, 5].includes(size)) { payload.value = ''; validateNames(); return; }
    for (let index = 0; index < size; index += 1) {
      const section = document.createElement('fieldset');
      section.className = 'member-section';
      const legend = document.createElement('legend');
      legend.textContent = `メンバー ${index + 1}`;
      section.appendChild(legend);
      const group = document.createElement('div');
      group.className = 'member-inputs';
      section.appendChild(group);
      const row = {
        name: field(group, `member-${index + 1}-name`, '氏名（姓　名）'),
        grade: field(group, `member-${index + 1}-grade`, '学年（例：高2）'),
        school: field(group, `member-${index + 1}-school`, '所属校', 'select'),
      };
      row.name.input.maxLength = 100;
      row.grade.input.maxLength = 20;
      row.name.input.value = drafts[index]?.name || '';
      row.grade.input.value = drafts[index]?.grade || '';
      rows.push(row);
      container.appendChild(section);
    }
    syncSchools();
    rows.forEach((row, index) => { row.school.input.value = jointTeam.checked ? drafts[index]?.school || '' : ''; });
    validateNames();
  }

  count.addEventListener('change', render);
  container.addEventListener('input', validateNames);
  container.addEventListener('change', validateNames);
  form.addEventListener('input', (event) => { if (event.target.id.startsWith('schoolName')) { syncSchools(); validateNames(); } });
  render();
  return {
    syncSchools() { syncSchools(); validateNames(); },
    reset() { rows = []; drafts.length = 0; render(); },
    serialize() {
      syncSchools();
      validateNames();
      payload.value = JSON.stringify(rows.map((row) => ({ name: row.name.input.value, grade: row.grade.input.value,
        school: jointTeam.checked ? row.school.input.value : '' })));
    },
  };
}
