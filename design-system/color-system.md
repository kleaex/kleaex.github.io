# KLEA Color System v0.1

検討案。濃い青緑 `#1D3A3D` をBrand Primaryとする合意を起点にした、Web向けsRGB・ライトテーマの色システムです。追加色と用途の割り当ては正式採用前の提案です。

## 1. 基本方針

「文芸の温かさと、技術を扱う明快さ」を表現します。深い青緑で落ち着きと一貫性を、淡い青緑で開放感を、生成りで紙の温かさを添える案です。

- Primaryはブランドの軸であり、使用面積の順位ではありません。
- 読む領域は白または生成り、ブランドを印象づける領域は淡い青緑を基本にします。
- 色系統はClassified Colorとして定義し、成功・警告などの意味はUI用途で割り当てます。
- 色だけで意味を伝えず、文字・下線・アイコン・形を併用します。

[色見本](color-palette.svg) / [CSSトークン定義](color-tokens.css)

## 2. Brand Color

| トークン | HEX | 位置づけ・用途 |
|---|---|---|
| brand-primary | `#1D3A3D` | 深い青緑。ブランド見出し、主要ボタン、濃色の帯 |
| brand-secondary | `#C2E7E9` | 淡い青緑。ヒーロー、案内エリア、広い背景 |
| brand-subtle | `#F0F8F8` | ごく淡い青緑。補足エリアの背景（新規案） |

生成り `#F8F6EE` は背景用の補助色です。ロゴ自体の配色変更は含みません。

## 3. Primitive Color：色の素材

数値が大きいほど暗い色です。必要な段階を選んでおり、知覚的な等間隔は保証しません。「既存」はcommon.cssに同じ不透明HEX値がある色です。

| 系統 | 段階とHEX | 既存の段階 |
|---|---|---|
| Teal | 50: `#F0F8F8` / 100: `#E0F1F2` / 200: `#C2E7E9` / 300: `#9ACDD0` / 400: `#70B0B5` / 500: `#478E94` / 600: `#30777D` / 700: `#256467` / 800: `#244E52` / 900: `#1D3A3D` / 950: `#142B2D` | 200、900 |
| Neutral | 0: `#FFFFFF` / 100: `#EDF2F2` / 200: `#D8E4EA` / 500: `#6D898B` / 700: `#38565A` / 950: `#172324` | 0、200、700、950 |
| Paper | 50: `#F8F6EE` / 100: `#EFE9DC` | 50、100 |
| Green | 50: `#EDF6EF` / 700: `#246347` | なし |
| Amber | 50: `#FFF6DC` / 700: `#785500` | なし |
| Red | 50: `#FCEFF0` / 700: `#A3333D` | なし |
| Blue | 50: `#EDF4F8` / 700: `#315F78` | 700 |

Tealの中間色は装飾や図版にも使用します。補助パレットも状態表示だけに限定せず、案内・図版・カテゴリ表現に利用できます。

## 4. Semantic Color：Brand / Classified / UI

Science Tokyoの例に倣い、Primitiveから選んだ色をBrand ColorとClassified Colorに整理します。KLEAでは、その先にUI用途への割り当てを置きます。

`Primitive → Brand Color / Classified Color → UI用途`

### Classified Color

各系統の代表色とバリエーションです。Primary / Secondaryは系統内の選択肢を示し、成功・警告などの意味は持たせません。系統ごとに段階数や明度の順序は異なります。補助色は濃色・淡色の2段階から始める案です。

| 系統 | Primary | Secondary | Tertiary | Quaternary | その他 |
|---|---|---|---|---|---|
| Teal | teal-700 | teal-900 | teal-200 | teal-50 | quinary: teal-100、senary: teal-950 |
| Paper | paper-50 | paper-100 | — | — | — |
| Neutral | neutral-950 | neutral-700 | neutral-500 | neutral-200 | subtle: neutral-100、white: neutral-0 |
| Green | green-700 | green-50 | — | — | — |
| Amber | amber-700 | amber-50 | — | — | — |
| Red | red-700 | red-50 | — | — | — |
| Blue | blue-700 | blue-50 | — | — | — |

CSS名は `--klea-classified-green-primary` などです。Green Primaryは図版の強調にも使え、成功表示はその用途の一つです。カテゴリ色と状態色が同じ画面で紛らわしくならないようにします。

### UI用途への割り当て

CSS名には `--klea-` を付けます。用途からBrand / Classifiedを参照します。下表は最終的に解決されるPrimitive値です。例えば `text-primary → classified-neutral-primary → neutral-950` となります。

| 用途トークン | 最終参照先 | 使用箇所 |
|---|---|---|
| text-primary | neutral-950 | 本文 |
| text-secondary | neutral-700 | 補足文、入力例 |
| text-brand | teal-900 | ブランド見出し |
| text-inverse | neutral-0 | 濃色面の文字 |
| link-default / link-visited | teal-700 | 常時下線のある本文リンク |
| link-hover | teal-900 | リンクのホバー |
| background-page / surface-default | neutral-0 | 標準背景、カード、入力欄 |
| background-brand | teal-200 | ブランド背景 |
| surface-paper | paper-50 | 文芸記事や紹介の面 |
| surface-subtle | teal-50 | 補足の面 |
| border-subtle | neutral-200 | 装飾的な区切り |
| border-control | neutral-500 | 白・生成り上の操作部品の境界 |
| action-primary | teal-900 | 主要ボタン |
| action-primary-hover | teal-950 | 主要ボタンのホバー |
| action-primary-active | neutral-950 | 主要ボタンの押下 |
| action-on-primary | neutral-0 | 主要ボタンの文字 |
| action-secondary | neutral-0 | 補助ボタンの背景 |
| action-secondary-hover | teal-100 | 補助ボタンのホバー |
| action-on-secondary | teal-900 | 補助ボタンの文字・枠 |
| selection-background | teal-200 | 選択中の背景 |
| selection-text | teal-900 | 選択中の文字・枠 |
| disabled-background | neutral-100 | 無効な操作の背景 |
| disabled-text | neutral-700 | 無効な操作の文字 |
| focus-ring | teal-900 | フォーカス外周 |
| focus-gap | neutral-0 | フォーカス内周 |

| 状態の用途 | 文字・アイコン | 背景 |
|---|---|---|
| status-success | classified-green-primary | classified-green-secondary |
| status-warning | classified-amber-primary | classified-amber-secondary |
| status-error | classified-red-primary | classified-red-secondary |
| status-info | classified-blue-primary | classified-blue-secondary |

状態のCSS名は `status-success-text` / `status-success-background` などです。濃色の全面には白文字を使います。成功表示には「完了」などの文字とアイコンを併用します。

## 5. 組み合わせとコントラスト

通常文字は4.5:1以上を基準とします。大きな文字には3:1の基準がありますが、この案では見出しも通常文字と同じ推奨ペアを使います。[W3C：Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

不透明なsRGB単色同士の計算値です。小数第2位に丸めて表示しています。透明度・写真・グラデーションを使う実画面は別途確認します。

| 前景 | 背景 | 比率 |
|---|---|---|
| Primary `#1D3A3D` | 白 `#FFFFFF` | 12.17:1 |
| Primary `#1D3A3D` | Secondary `#C2E7E9` | 9.22:1 |
| 本文 `#172324` | 生成り `#F8F6EE` | 14.90:1 |
| 補足文 `#38565A` | 生成り `#F8F6EE` | 7.33:1 |
| リンク `#256467` | 白 `#FFFFFF` | 6.78:1 |
| リンク `#256467` | Secondary `#C2E7E9` | 5.13:1 |
| 操作枠 `#6D898B` | 白 `#FFFFFF` | 3.75:1 |
| 操作枠 `#6D898B` | 生成り `#F8F6EE` | 3.46:1 |
| Green `#246347` | `#EDF6EF` | 6.45:1 |
| Amber `#785500` | `#FFF6DC` | 6.28:1 |
| Red `#A3333D` | `#FCEFF0` | 6.05:1 |
| Blue `#315F78` | `#EDF4F8` | 6.22:1 |

操作枠の2組以外は通常文字に使用できます。白文字とPrimary背景の比率も12.17:1です。操作枠は通常文字には使いません。操作部品の識別に必要な境界などは隣接色との3:1以上を確認します。[W3C：Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

- 淡い青緑の背景には深い青緑の文字を使い、白文字は使いません。
- border-controlは白・生成りとの組み合わせに限定します。ブランド背景上の入力欄は白い面を設け、必要ならPrimaryの枠を使います。
- 本文リンクには常時下線を付けます。エラーには説明と対象入力欄との関連付けを設けます。
- 選択中は枠やチェック印を併用し、無効な操作はHTMLのdisabledなどで操作も無効にします。
- フォーカスは白い内周2pxと濃い青緑の外周3pxを基本案とし、欠けや埋没を実画面で確認します。
- 写真上の文字は単色の面に載せます。透明な重ね色の場合は最も読みにくい箇所も検証します。

色だけで意味を伝えない方針は [W3C：Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) に基づきます。この確認はサイト全体のWCAG適合を示すものではありません。

## 6. 配色の使用例

| 場面 | 背景 | 文字・操作 |
|---|---|---|
| ヒーロー | brand-secondary | text-brand、主要ボタンはPrimary＋白文字 |
| 文芸誌・活動紹介 | surface-paper | text-primary、ブランド見出し、下線リンク |
| フォーム | 白い背景と入力欄 | 本文・補足文、border-control、主要ボタン |
| 重要なお知らせ | status-warning-background | status-warning-text、「注意」のラベルとアイコン |
| 完了メッセージ | status-success-background | status-success-text、「完了」のラベルとチェック印 |
| 濃色フッター | brand-primary | 白文字、白い下線リンク |

白・生成りの読む面を中心にし、淡い青緑でセクションの個性を出します。濃い青緑は見出し・操作・帯に集約します。使用面積の固定比率は設けません。

## 7. 既存CSSからの移行案

| 現行変数 | 新しい用途名（接頭辞 --klea-） | 変更 |
|---|---|---|
| --bg | background-brand | 色を維持。適用範囲はページごとに判断 |
| --panel | surface-paper | 色を維持 |
| --text | text-primary | 色を維持 |
| --muted | text-secondary | 色を維持 |
| --accent | brand-primary | 色を維持。ボタンはaction-primaryを参照 |
| --paper-strong | surface-default | 色を維持 |
| --line-soft | border-subtle | 装飾用に限定 |
| --button-accent | action-primary | 青から深い青緑へ変更する案 |
| --button-accent-hover | action-primary-hover | 深い青緑のホバーへ変更する案 |
| --air-accent | link-defaultなど | 用途を確認して割り当て |

--panel-soft、--paper、--ink、--ink-muted、透明色、影は利用箇所を確認してから移行します。既存CSSやロゴは変更しておらず、この案のCSSもサイトに読み込んでいません。

## 8. 採用前の確認

1. 青緑の段階をヒーロー・カード・フォームの実物で比較する。
2. 通常・ホバー・押下・フォーカス・無効・エラーの各状態を確認する。
3. 主要ボタンを青から深い青緑に統一する案を確認する。
4. 決定後に用途別トークンから既存サイトへ導入する。

ダークテーマは用途の割り当てを別途設計し、印刷色は用紙・印刷条件を踏まえて校正します。

## 参考

- [Science Tokyo：色／Color](https://design-system.isct.ac.jp/ja/website/style-guide/design-tokens/color) — PrimitiveとBrand / Classified Colorを分ける構成を参考にしています。
- [既存のcommon.css](../common.css) — 現行配色の出典。追加色は今回の提案です。
