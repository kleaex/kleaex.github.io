if (sessionStorage.getItem('khb2027:entry-receipt-mail-failed') === 'true') {
  document.getElementById('entry-receipt-message').textContent = 'エントリーの保存は完了していますが、受付メールを送信できませんでした。';
  document.getElementById('entry-receipt-notice').textContent = '再送信せず、チーム名を添えて実行委員会へご連絡ください。';
  document.getElementById('entry-receipt-notice').hidden = false;
}
