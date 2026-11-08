export const AUTHOR_GROUPS = [1, 2, 3, 4].map((round) => ({
  round, fields: (round === 4 ? [1, 2, 3, 4, 5] : [1, 3, 5]).map((slot) => `k${round}_${slot}_author`),
}));

// 比較時だけ空白を除き、画面・保存データの表記は変更しない。
export function authorNameKey(name) {
  return String(name ?? '').replace(/\s/gu, '');
}

export function memberAuthorLabels(members) {
  const names = members.map((member) => authorNameKey(member.name));
  return members.map((member, index) => names.filter((name) => name === names[index]).length > 1
    ? `${member.name}（${[member.school, member.grade].filter(Boolean).join('・')}）` : member.name);
}

export function indistinguishableMembers(members) {
  const keys = members.map((member) => JSON.stringify([authorNameKey(member.name), String(member.grade || '').trim(), member.school || '']));
  return members.flatMap((member, index) => authorNameKey(member.name) && String(member.grade || '').trim()
    && keys.filter((key) => key === keys[index]).length > 1 ? [index] : []);
}

export function authorIssues(values, memberCount) {
  const issues = [];
  for (const group of AUTHOR_GROUPS) {
    const authors = group.fields.map((field) => authorNameKey(values[field]));
    for (const field of group.fields) {
      const name = values[field] || '';
      if (name && !authorNameKey(name)) issues.push({ fields: [field], message: '作者名を入力してください。空白だけの入力はできません。' });
    }
    if (group.round < 4) {
      const filled = authors.filter(Boolean);
      if (new Set(filled).size !== filled.length) issues.push({ fields: group.fields,
        message: `リーグ戦の兼題${group.round}は、3句の作者をそれぞれ別のメンバーにしてください。` });
    } else if ([3, 4, 5].includes(memberCount) && authors.every(Boolean) && new Set(authors).size !== memberCount) {
      issues.push({ fields: group.fields, message: `決勝の5句には、登録メンバー${memberCount}人全員の句を含めてください。投句順の制限はありません。` });
    }
  }
  return issues;
}
