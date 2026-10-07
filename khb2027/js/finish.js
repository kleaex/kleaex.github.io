if (sessionStorage.getItem('khb2027:receipt-mail-failed') === 'true') {
  document.getElementById('receipt-message').textContent = '投句の保存は完了していますが、確認メールを送信できませんでした。お手数ですが、再送信はせず、実行委員会までご連絡ください。';
  document.getElementById('receipt-notice').hidden = false;
}
