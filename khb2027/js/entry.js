import { GAS_MESSAGE_SOURCE, GAS_WEB_APP_URL } from './gasConfig.js';
import { setupMemberFields } from './memberFields.js';
import { entryNameIssue, introductionLength } from './entryRules.js';

const form = document.querySelector('#entry-form');
const submitButton = form.querySelector('button[type="submit"]');
const status = document.querySelector('#entry-status');
const jointTeam = document.querySelector('#isJointTeam');
const additionalSchools = document.querySelector('#additional-schools');
const addSchoolWrap = document.querySelector('#add-school-wrap');
const addSchoolButton = document.querySelector('#add-school');
const role = document.querySelector('#responsibleRole');
const roleOtherField = document.querySelector('#responsibleRoleOther-field');
const roleOther = document.querySelector('#responsibleRoleOther');
const introduction = document.querySelector('#introduction');
const introductionCount = document.querySelector('#introduction-count');
const responsibleName = document.querySelector('#responsibleName');
let sending = false;

const MAX_SCHOOLS = 5;
const memberFields = setupMemberFields(form, jointTeam);
const responseOrigin = document.createElement('input');
responseOrigin.type = 'hidden';
responseOrigin.name = 'responseOrigin';
responseOrigin.value = window.location.origin;
form.appendChild(responseOrigin);

function schoolInputs() {
  return [...document.querySelectorAll('.school-name')];
}

function updateSubmitButton() {
  const nameIssue = entryNameIssue(responsibleName.value);
  responsibleName.setCustomValidity(nameIssue);
  const length = introductionLength(introduction.value);
  introductionCount.textContent = `${length}/280`;
  introduction.setCustomValidity(length >= 250 && length <= 280 ? '' : '紹介文は250〜280字で入力してください。');
  submitButton.disabled = sending;
}

function addSchoolField() {
  const current = schoolInputs().length + 2;
  if (!jointTeam.checked || current > MAX_SCHOOLS) return;
  const field = document.createElement('p');
  field.className = 'school-field';
  field.innerHTML = `<label class="field-label" for="schoolName${current}">学校名 ${current}</label><input id="schoolName${current}" class="haiku school-name" name="schoolName${current}" placeholder="学校名 ${current}" maxlength="200"><button class="secondary-button remove-school" type="button">削除</button>`;
  field.querySelector('button').addEventListener('click', () => {
    const index = schoolInputs().indexOf(field.querySelector('input'));
    field.remove();
    updateSchoolControls();
    updateSubmitButton();
    const inputs = schoolInputs();
    inputs[Math.min(index, inputs.length - 1)].focus();
  });
  additionalSchools.appendChild(field);
  updateSchoolControls();
  updateSubmitButton();
  field.querySelector('input').focus();
}

function updateSchoolControls() {
  const isJoint = jointTeam.checked;
  if (!isJoint) {
    schoolInputs().slice(1).forEach((input) => input.closest('p').remove());
  }
  const inputs = schoolInputs();
  additionalSchools.hidden = !isJoint;
  addSchoolWrap.hidden = !isJoint;
  inputs.forEach((input, index) => {
    const number = index + 2;
    input.id = `schoolName${number}`;
    input.name = input.id;
    input.placeholder = `学校名 ${number}`;
    const field = input.closest('p');
    const label = field.querySelector('label');
    label.htmlFor = input.id;
    label.textContent = input.placeholder;
    const removeButton = field.querySelector('button');
    if (removeButton) removeButton.setAttribute('aria-label', `${input.placeholder}を削除`);
    input.required = isJoint;
    input.disabled = !isJoint;
    if (!isJoint) input.value = '';
  });
  addSchoolButton.hidden = !isJoint || inputs.length + 1 >= MAX_SCHOOLS;
  memberFields.syncSchools();
}

function toggleConditionalFields() {
  updateSchoolControls();

  const isOther = role.value === 'その他';
  roleOtherField.hidden = !isOther;
  roleOther.required = isOther;
  if (!isOther) roleOther.value = '';
  updateSubmitButton();
}

jointTeam.addEventListener('change', toggleConditionalFields);
addSchoolButton.addEventListener('click', addSchoolField);
role.addEventListener('change', toggleConditionalFields);
toggleConditionalFields();
form.addEventListener('input', updateSubmitButton);
form.addEventListener('change', updateSubmitButton);

form.addEventListener('submit', (event) => {
  if (sending) { event.preventDefault(); return; }
  memberFields.serialize();
  updateSubmitButton();
  if (!form.reportValidity()) { event.preventDefault(); return; }
  if (!GAS_WEB_APP_URL) {
    event.preventDefault();
    status.textContent = '送信先を設定中です。';
    return;
  }
  form.setAttribute('action', GAS_WEB_APP_URL);
  sending = true;
  submitButton.disabled = true;
  status.textContent = '送信しています…';
});

window.addEventListener('message', (event) => {
  const fromGas = event.origin === 'https://script.google.com' || event.origin.endsWith('.googleusercontent.com');
  const message = event.data;
  if (!fromGas || !sending || !message || message.source !== GAS_MESSAGE_SOURCE || message.action !== 'entry' || typeof message.ok !== 'boolean') return;

  sending = false;
  status.textContent = message.message || '送信結果を確認できませんでした。';
  if (message.ok) {
    form.reset();
    memberFields.reset();
    toggleConditionalFields();
    window.location.href = 'entry-finish.html';
  }
  updateSubmitButton();
});

