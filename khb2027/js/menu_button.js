const btn = document.querySelector('.btn-menu');
const nav = document.querySelector('.main-nav');

btn.addEventListener('click', () => {
  nav.classList.toggle('open-menu');
  if (btn.textContent === 'Menu') {
    btn.textContent = 'Close';
  } else {
    btn.textContent = 'Menu';
  }
});
nav.addEventListener('click', () => {
  nav.classList.remove('open-menu');
  if (btn.textContent === 'Menu') {
    btn.textContent = 'Close';
  } else {
    btn.textContent = 'Menu';
  }
});