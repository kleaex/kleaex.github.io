# メンバーページの簡易ゲート

`auth.js` と `auth.css` により、共通パスワード入力後に本文を表示します。暗号化やサーバー認証ではなく、HTML取得・開発者ツールによる回避は可能です。

## パスワードの設定・変更

`powershell -NoProfile -File members/set-password.ps1` を実行し、対話入力で設定します。`auth-config.js` にSHA-256ハッシュだけを書き出します。更新したファイルを配信すると旧設定のセッションは次回読み込み時に無効になります。ハッシュ化は本文の保護を意味しません。

入力状態は同じタブのsessionStorageに最大8時間保存します。ログアウトで解除し、保存が使えない環境ではページごとに入力します。HTTPSまたはlocalhostで動作確認してください。

## 新規ページ

全メンバーHTMLのheadに `noindex, nofollow` と `auth.css`、`auth-config.js`、`auth.js` を追加し、htmlに `data-members-locked` を指定します。相対パスは階層に合わせます。研修ページはbuild.ps1で自動挿入されます。

## 配信

GitHub Pages標準Jekyllビルドの `_config.yml` で、原稿contentフォルダと保守用ファイルを除外しています。`.nojekyll` や独自Actionsによるファイルの直接配信へ変更する場合は、同じ除外を配信成果物の作成処理に実装してください。公開リポジトリの原稿は、この設定にかかわらずGitHub上で閲覧可能です。

noindexを読ませるため、membersのHTMLをrobots.txtで拒否しません。公開後はメンバーHTMLにnoindexがあることと、原稿URLが404になることを確認します。noindexは検索掲載の抑止であり、収集自体を防止しません。
