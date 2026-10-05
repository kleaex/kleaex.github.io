// 縦書きの両端揃え。短い句は字間を広げ、長い句は縦方向に縮める。
(() => {
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;

  function textHeight(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    // letter-spacing includes space after the last glyph; it is not an inter-glyph gap.
    const spacing = parseFloat(element.style.letterSpacing) || 0;
    return Math.max(0, range.getBoundingClientRect().height - spacing);
  }

  function getAvailableHeight(element) {
    const slot = element.closest('.poem-slot');
    if (slot) return slot.clientHeight;
    const legacyColumn = element.closest('.left2, .right2');
    if (legacyColumn) return legacyColumn.clientHeight - (legacyColumn.querySelector('h3')?.offsetHeight || 0) - 40;
    return element.parentElement.clientHeight;
  }

  window.applyVerticalLayout = (elementId, containerHeight) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    const availableHeight = containerHeight ?? getAvailableHeight(element);
    element.classList.add('auto-vertical');
    element.style.letterSpacing = '0px';
    element.style.transform = 'none';
    const text = element.textContent;
    const charCount = segmenter ? Array.from(segmenter.segment(text)).length : Array.from(text).length;
    const naturalHeight = textHeight(element);
    if (!charCount || naturalHeight <= 0 || availableHeight <= 0) return;

    if (naturalHeight > availableHeight) {
      element.style.transform = `scaleY(${availableHeight / naturalHeight})`;
    } else if (charCount > 1) {
      let spacing = (availableHeight - naturalHeight) / (charCount - 1);
      element.style.letterSpacing = `${spacing}px`;
      // Mixed Latin/Japanese text can have different shaping; use rendered dimensions.
      const adjustedHeight = textHeight(element);
      if (Math.abs(adjustedHeight - availableHeight) > .5) {
        spacing = Math.max(0, spacing + (availableHeight - adjustedHeight) / (charCount - 1));
        element.style.letterSpacing = `${spacing}px`;
      }
    }
  };

  window.applyHaikuLayout = () => {
    document.querySelectorAll('.poem-text, .kunakami').forEach((element) => {
      window.applyVerticalLayout(element.id);
    });
    document.querySelectorAll('.poem-review').forEach((review) => {
      const note = review.closest('.review-round')?.querySelector('.review-note');
      if (note) note.hidden = review.scrollWidth <= review.clientWidth + 1;
    });
  };

  let frame;
  function scheduleLayout() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      window.applyHaikuLayout();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const elements = document.querySelectorAll('.poem-text, .kunakami');
    const textObserver = new MutationObserver(scheduleLayout);
    elements.forEach((element) => textObserver.observe(element, { childList: true, characterData: true, subtree: true }));
    if (typeof ResizeObserver === 'function') {
      const sizeObserver = new ResizeObserver(scheduleLayout);
      document.querySelectorAll('.poem-slot, .poem-review').forEach((element) => sizeObserver.observe(element));
    }
    document.fonts?.ready.then(scheduleLayout);
    document.fonts?.addEventListener('loadingdone', scheduleLayout);
    scheduleLayout();
  });
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);
})();
