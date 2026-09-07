(() => {
  const sections = [...document.querySelectorAll('.lesson-section')];
  if (!sections.length) return;

  // 閉じた節への目次リンク・直リンク・戻る/進むでも、対象を表示する。
  function revealHash(hash) {
    if (!hash || hash === '#') return;
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    for (let node = target; node; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement) node.open = true;
    }
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  document.querySelectorAll('.lesson-toc a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      revealHash(link.hash);
    });
  });
  window.addEventListener('hashchange', () => revealHash(location.hash));
  document.addEventListener('members:unlocked', () => revealHash(location.hash));
  revealHash(location.hash);

  const controls = document.querySelector('.section-controls');
  controls.hidden = false;
  controls.addEventListener('click', event => {
    const button = event.target.closest('button[data-sections]');
    if (!button) return;
    sections.forEach(section => { section.open = button.dataset.sections === 'expand'; });
  });

  // 印刷では閉じた本文も含め、印刷後は閲覧時の開閉状態に戻す。
  let printState;
  window.addEventListener('beforeprint', () => {
    if (printState) return;
    printState = sections.map(section => section.open);
    sections.forEach(section => { section.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (!printState) return;
    sections.forEach((section, index) => { section.open = printState[index]; });
    printState = undefined;
  });
})();
