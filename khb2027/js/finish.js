if (sessionStorage.getItem('khb2027:receipt-mail-failed') === 'true') {
  document.getElementById('receipt-message').textContent = '投句の保存は完了していますが、受付メールを送信できませんでした。';
  document.getElementById('receipt-notice').textContent = '再送信せず、チーム名を添えて実行委員会へご連絡ください。';
}
