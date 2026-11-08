if (sessionStorage.getItem('khb2027:entry-receipt-mail-failed') === 'true') {
  document.getElementById('entry-receipt-message').textContent = 'エントリーは受け付けましたが、確認メールを送信できませんでした。お手数ですが、再送信はせず、実行委員会までご連絡ください。';
}
