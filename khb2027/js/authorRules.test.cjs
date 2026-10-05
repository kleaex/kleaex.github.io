const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const client = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'authorRules.js'), 'utf8').replace(/export /g, ''), client);
const server = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas/khb2027_webapp.gs'), 'utf8'), server);

function sample(count, final) {
  const names = ['A', 'B', 'C', 'D', 'E'].slice(0, count);
  const values = {};
  for (let round = 1; round <= 3; round += 1) [1, 3, 5].forEach((slot, index) => { values[`k${round}_${slot}_author`] = names[index]; });
  final.split('').forEach((name, index) => { values[`k4_${index + 1}_author`] = name; });
  const entry = { memberCount: String(count), members: JSON.stringify(names.map(name => ({ name, grade: '高2', school: '' }))) };
  return { values, entry };
}

for (const [count, authors, valid] of [
  [3, 'AAABC', true], [3, 'BCAAA', true], [3, 'AAAAB', false],
  [4, 'AABCD', true], [4, 'DCABA', true], [4, 'ABCAA', false],
  [5, 'ABCDE', true], [5, 'EBDAC', true], [5, 'AABCD', false],
]) {
  test(`${count}人チームの決勝${authors}は${valid ? '受理' : '拒否'}する`, () => {
    const { values, entry } = sample(count, authors);
    assert.equal(client.authorIssues(values, count).length === 0, valid);
    assert.equal(server.validateAuthors(values, entry) === '', valid);
  });
}

for (const round of [1, 2, 3]) {
  test(`リーグ戦兼題${round}のAABは拒否し、異なる兼題間の同じ作者は許容する`, () => {
    const { values, entry } = sample(3, 'AAABC');
    assert.equal(server.validateAuthors(values, entry), '');
    values[`k${round}_3_author`] = values[`k${round}_1_author`];
    assert.match(server.validateAuthors(values, entry), new RegExp(`兼題${round}`));
    assert.match(client.authorIssues(values, 3)[0].message, new RegExp(`兼題${round}`));
  });
}

test('人数だけを満たしても未登録の作者は拒否し、表記が異なる氏名も照合しない', () => {
  const { values, entry } = sample(3, 'AAABC');
  values.k4_5_author = 'X';
  assert.match(server.validateAuthors(values, entry), /登録メンバーの氏名と一致しません/);
  values.k4_5_author = 'Ｃ';
  assert.match(server.validateAuthors(values, entry), /一致しません/);
});

test('空白だけの作者名は画面で拒否し、空欄や人数未取得時に誤った決勝人数を決めない', () => {
  const { values } = sample(3, 'AAABC');
  values.k4_1_author = ' \t　';
  assert.ok(client.authorIssues(values, 3).some(issue => /空白だけ/.test(issue.message)));
  values.k4_1_author = '';
  assert.equal(client.authorIssues(values, 3).length, 0);
  assert.equal(client.authorIssues(sample(5, 'AABCD').values, null).length, 0);
});

test('氏名の全角・半角スペースやタブの有無にかかわらず、登録者の句と全員参加を照合する', () => {
  const { values, entry } = sample(3, 'AAABC');
  const names = { A: '文芸　太郎', B: '文芸 花子', C: '文芸三郎' };
  entry.members = JSON.stringify(Object.values(names).map(name => ({ name, grade: '高2', school: '' })));
  for (const field of Object.keys(values)) {
    values[field] = ` \t${names[values[field]].replace(/\s/gu, '').replace('文芸', '文　芸 ')}　`;
  }
  const before = JSON.stringify(values);
  assert.equal(client.authorIssues(values, 3).length, 0);
  assert.equal(server.validateAuthors(values, entry), '');
  assert.equal(JSON.stringify(values), before, '照合によって入力表記を書き換えない');
  values.k4_5_author = ' 文　芸　四郎 ';
  assert.match(server.validateAuthors(values, entry), /登録メンバーの氏名と一致しません/);
});

test('空白の位置だけ変えた同じ作者はリーグ戦で重複し、決勝でも不足するメンバーを補えない', () => {
  const { values, entry } = sample(3, 'AAABC');
  values.k1_3_author = '　A ';
  assert.match(server.validateAuthors(values, entry), /兼題1/);
  assert.ok(client.authorIssues(values, 3).some(issue => /兼題1/.test(issue.message)));
  values.k1_3_author = 'B';
  values.k4_5_author = ' A　';
  assert.match(server.validateAuthors(values, entry), /全員/);
  assert.ok(client.authorIssues(values, 3).some(issue => /全員/.test(issue.message)));
});

test('氏名・学年・所属校が一致するメンバーは要連絡とし、空白だけの氏名は拒否する', () => {
  const { values, entry } = sample(3, 'AAABC');
  const members = JSON.stringify(['文芸　太郎', '文芸 太郎', '文芸　花子'].map(name => ({ name, grade: '高2', school: '' })));
  assert.match(server.validateAuthors(values, { ...entry, members }), /実行委員会へ連絡/);
  assert.match(server.validateEntryMembers({ ...entry, members }), /実行委員会へ連絡/);
  const blank = JSON.stringify(['A', 'B', ' \t　'].map(name => ({ name, grade: '高2', school: '' })));
  assert.match(server.validateAuthors(values, { ...entry, members: blank }), /登録メンバーの氏名を照合できません/);
  assert.match(server.validateEntryMembers({ ...entry, members: blank }), /空白だけ/);
});

test('同姓同名を学年・所属校で別人として区別し、作者重複と全員参加を検証する', () => {
  for (const members of [
    [{ name: '同じ　氏名', grade: '高2', school: '' }, { name: '同じ氏名', grade: '高1', school: '' }, { name: '別の氏名', grade: '高2', school: '' }],
    [{ name: '同じ　氏名', grade: '高2', school: 'A高校' }, { name: '同じ氏名', grade: '高2', school: 'B高校' }, { name: '別の氏名', grade: '高2', school: 'A高校' }],
  ]) {
    const labels = client.memberAuthorLabels(members);
    assert.deepEqual(Array.from(server.memberAuthorLabels(members)), Array.from(labels));
    const { values, entry } = sample(3, 'AAABC');
    entry.members = JSON.stringify(members);
    const indexes = { A: 0, B: 1, C: 2 };
    for (const field of Object.keys(values)) values[field] = labels[indexes[values[field]]];
    assert.equal(server.validateAuthors(values, entry), '');
    assert.equal(client.authorIssues(values, 3).length, 0);
    values.k4_4_author = labels[0];
    assert.match(server.validateAuthors(values, entry), /全員/);
    assert.ok(client.authorIssues(values, 3).some(issue => /全員/.test(issue.message)));
    values.k1_3_author = labels[0];
    assert.match(server.validateAuthors(values, entry), /兼題1/);
  }
});

test('旧形式や人数の合わない名簿から登録氏名を推測しない', () => {
  const { values, entry } = sample(3, 'AAABC');
  for (const members of ['A（高2）、B（高2）、C（高2）', 'null', '{bad', '[]']) {
    assert.match(server.validateAuthors(values, { ...entry, members }), /登録メンバーの氏名を照合できません/);
  }
});
