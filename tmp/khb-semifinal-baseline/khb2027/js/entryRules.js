export const ENTRY_GRADES = ['中1', '中2', '中3', '高1', '高2', '高3'];

export function entryNameIssue(value) {
  if (typeof value !== 'string' || !value.trim()) return '氏名を入力してください。空白だけの入力はできません。';
  return /^\S+(?:[ \u3000]+\S+)+$/u.test(value.trim()) ? '' : '姓と名の間に全角スペースを入れてください。';
}

export function introductionLength(value) {
  // フォーム送信でLFがCRLFになっても、改行は1字として数える。
  return Array.from(String(value || '').replace(/\r\n?/g, '\n')).length;
}
