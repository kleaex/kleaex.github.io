function openPopup(url) {
  const allowedDomains = [window.location.hostname, 'forms.gle'];
  let parsed;
  try {
    parsed = new URL(url, window.location.href);
  } catch (e) {
    console.warn('Invalid URL:', url);
    return;
  }

  if (!allowedDomains.includes(parsed.hostname)) {
    console.warn('Blocked untrusted URL:', url);
    return;
  }

  window.open(parsed.href, '_blank', 'width=900,height=1200,noopener');
}
