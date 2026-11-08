fetch('js/kendai.json')
  .then(response => response.json())
  .then(data => {
    document.getElementById('kendai1').textContent = "リーグ戦①　兼題" + data.dai1[1] + "　" + data.dai1[2];
    document.getElementById('kendai2').textContent = "リーグ戦②　兼題" + data.dai2[1] + "　" + data.dai2[2];
    document.getElementById('kendai3').textContent = "リーグ戦③　兼題" + data.dai3[1] + "　" + data.dai3[2];
    document.getElementById('kendai4').textContent = "決勝戦　兼題" + data.dai4[1] + "　" + data.dai4[2];
  });
