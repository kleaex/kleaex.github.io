fetch('js/kendai.json')
  .then(response => response.json())
  .then(data => {
    document.getElementById('kendai1').textContent = data.dai1[1] + "　" + data.dai1[2];
    document.getElementById('kendai2').textContent = data.dai2[1] + "　" + data.dai2[2];
    document.getElementById('kendai3').textContent = data.dai3[1] + "　" + data.dai3[2];
    document.getElementById('kendai4').textContent = data.dai4[1] + "　" + data.dai4[2];
  });
