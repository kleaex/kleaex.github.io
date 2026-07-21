// GASをウェブアプリとしてデプロイした後、/exec URLへ置き換えてください。
const GAS_WEB_APP_URL = '';
const type = new URLSearchParams(window.location.search).get('type');
const inquiryType = document.querySelector('#inquiry-type');
const organizationField = document.querySelector('#organization-field');
const organizationInput = document.querySelector('#organization');
const contactForm = document.querySelector('#contact-form');
const submitButton = contactForm.querySelector('button[type="submit"]');
const formStatus = document.querySelector('#form-status');

if (GAS_WEB_APP_URL) {
  contactForm.action = 'https://script.google.com/macros/s/AKfycbw348zID7L9QOwNH7VhddUG1CXpBTnLTjjqE9sLuo7aOxoCipS4RsDugkJ-7hUXeJLFFw/exec';
}

if (['individual', 'group', 'technical', 'other'].includes(type)) {
  inquiryType.querySelector(`[data-type="${type}"]`).selected = true;
}

function updateOrganizationField() {
  const selectedType = inquiryType.selectedOptions[0].dataset.type;
  const showOrganization = ['group', 'technical'].includes(selectedType);
  organizationField.hidden = !showOrganization;

  if (!showOrganization) organizationInput.value = '';
}

inquiryType.addEventListener('change', updateOrganizationField);
updateOrganizationField();

contactForm.addEventListener('submit', (event) => {
  if (!GAS_WEB_APP_URL) {
    event.preventDefault();
    formStatus.textContent = '送信先を設定中です。';
    return;
  }

  submitButton.disabled = true;
  formStatus.textContent = '送信しています…';
});

window.addEventListener('message', (event) => {
  const isGasOrigin = event.origin === 'https://script.google.com'
    || event.origin.endsWith('.googleusercontent.com');
  const message = event.data;

  if (!isGasOrigin || !message || message.source !== 'klea-contact') return;

  submitButton.disabled = false;
  formStatus.textContent = message.message;

  if (message.ok) {
    contactForm.reset();
    updateOrganizationField();
  }
});
