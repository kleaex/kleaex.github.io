// このファイルを編集して試験を差し替えます。詳細は README.md を参照。
window.EXAMS = [
  {
    id: 'tech-1',
    version: 'sample-3', // 内容・採点条件を変更するときは更新してください。
    title: '技術（筆記）',
    durationMinutes: 60,
    pdf: '', // 例: 'assets/exams/it-literacy.pdf'
    passScore: 80,
    forbiddenLimit: 1, // 禁忌肢を選んだ設問がこの数以上なら不合格。nullで無効。
    certificateIssuer: '関西文芸交流会 技術開発部',
    certificateText: '上記の方は、以下の種別に合格したことを証します。',
    questions: [
      { answer: [2], points: 30, forbidden: [9] },
      { answer: [3, 4], points: 30, forbidden: [] },
      { answer: [1], points: 40, forbidden: [8, 9] }
    ],
    // PDF提供前だけ表示する仮問題。PDF設定後は使用しません。
    sampleText: '操作確認用の仮問題です。\n\n問1：「2」をマークしてください。\n問2：「3」と「4」を両方マークしてください。\n問3：「1」をマークしてください。\n\nこのサンプルでは、問1の9、問3の8・9が禁忌肢です。20点以上かつ禁忌肢の選択がない場合に合格します。'
  },
  {
    id: 'tech-2',
    version: 'sample-4', // 内容・採点条件を変更するときは更新してください。
    title: '技術（筆記・実務）',
    durationMinutes: 60,
    pdf: '', // 例: 'assets/exams/it-literacy.pdf'
    passScore: 80,
    forbiddenLimit: 1, // 禁忌肢を選んだ設問がこの数以上なら不合格。nullで無効。
    certificateIssuer: '関西文芸交流会 技術開発部',
    certificateText: '上記の方は、以下の種別に合格したことを証します。',
    questions: [
      { answer: [2], points: 30, forbidden: [9] },
      { answer: [3, 4], points: 30, forbidden: [] },
      { answer: [1], points: 40, forbidden: [8, 9] }
    ],
    // PDF提供前だけ表示する仮問題。PDF設定後は使用しません。
    sampleText: '操作確認用の仮問題です。\n\n問1：「2」をマークしてください。\n問2：「3」と「4」を両方マークしてください。\n問3：「1」をマークしてください。\n\nこのサンプルでは、問1の9、問3の8・9が禁忌肢です。20点以上かつ禁忌肢の選択がない場合に合格します。'
  }
];
