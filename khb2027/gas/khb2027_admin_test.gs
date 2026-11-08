/** GASエディタからのみ実行する本番実機試験用の補助処理。doPostには接続しない。 */
const KHB_ADMIN_TEST_TEAM = '【管理者試験】投句確認';
const KHB_ADMIN_TEST_MARKER = '管理者実機試験用・本番集計対象外';

// スクリプトプロパティ KHB_ADMIN_TEST_EMAIL に、受信できるメールアドレスを設定する。
function adminRegisterTestTeam() {
  return changeAdminTestTeam_(true);
}

// 登録を無効化する。試験投句・履歴は残すため、集計から別途除外する。
function adminDisableTestTeam() {
  return changeAdminTestTeam_(false);
}

function changeAdminTestTeam_(register) {
  const email = String(requiredProperty('KHB_ADMIN_TEST_EMAIL'));
  const error = validateTeam({ teamName: KHB_ADMIN_TEST_TEAM, email });
  if (error) throw new Error(error);
  const identityHash = makeIdentityHash(KHB_ADMIN_TEST_TEAM, email);
  const lock = LockService.getScriptLock();
  waitForRequestLock(lock);
  try {
    const sheet = getSheet('エントリー', ENTRY_HEADERS);
    const existing = findRowByValue(sheet, 'identityHash', identityHash);
    if (existing && existing.values.note !== KHB_ADMIN_TEST_MARKER) {
      throw new Error('管理者試験用の印がない登録です。変更せず終了しました。');
    }
    if (!register && !existing) throw new Error('試験チームが見つかりません。登録時と同じメール設定を確認してください。');
    const now = new Date();
    const row = existing ? { ...existing.values } : {
      entryId: Utilities.getUuid(), receivedAt: now,
      schoolName: '管理者試験校', plannedTeamCount: '1', isJointTeam: false,
      teamName: KHB_ADMIN_TEST_TEAM, responsibleName: '管理者試験担当',
      responsibleRole: 'その他', responsibleRoleOther: '管理者実機試験',
      email, memberCount: '3',
      members: JSON.stringify(['試験一郎', '試験二郎', '試験三郎'].map(name => ({ name, grade: '高2', school: '' }))),
      introduction: '管理者による本番実機試験です。', specialNote: KHB_ADMIN_TEST_MARKER,
      identityHash, note: KHB_ADMIN_TEST_MARKER,
      termsConsentAt: '', contactConfirmationAt: '', inputConfirmationAt: '',
    };
    row.status = register ? '有効' : '無効';
    row.updatedAt = now;
    if (existing) writeObject(sheet, ENTRY_HEADERS, existing.rowNumber, row);
    else appendObject(sheet, ENTRY_HEADERS, row);
    SpreadsheetApp.flush();
    logEvent('admin-test-team', register ? 'enabled' : 'disabled', identityHash, row.entryId);
    const message = register
      ? `試験チームを有効にしました。チーム名：${KHB_ADMIN_TEST_TEAM}。設定したメールで通常の本人確認を行ってください。`
      : '試験チームを無効にしました。試験投句・履歴は削除していません。本番集計から除外してください。';
    console.log(message);
    return message;
  } finally {
    releaseRequestLock(lock);
  }
}
