// Node.js 18以降。入力値をファイルに保存せず、登録用ハッシュだけ出力します。
const readline = require('node:readline/promises');
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
require('./identity.js');
const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
(async () => {
  try {
    const name = await prompt.question('氏名: ');
    const email = await prompt.question('メールアドレス: ');
    console.log(await ExamIdentity.hash(name, email));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { prompt.close(); }
})();
