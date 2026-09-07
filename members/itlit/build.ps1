#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$chapters = @(Get-ChildItem "$root/content/第*.md" | Sort-Object { [int]([regex]::Match($_.Name, '^第(\d+)章').Groups[1].Value) })
if ($chapters.Count -ne 9) { throw '第1章から第9章の原稿が必要です。' }
$links = @{}
for ($i = 0; $i -lt 9; $i++) { $links[$chapters[$i].BaseName] = "chapter-$($i + 1).html" }
function Escape([string]$text) { [System.Net.WebUtility]::HtmlEncode($text) }
function Render([string]$text) {
  $text = [regex]::Replace($text, '\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', {
    param($m)
    $name = $m.Groups[1].Value
    if (-not $links.ContainsKey($name)) { throw "不明な章リンク: $name" }
    $label = if ($m.Groups[2].Success) { $m.Groups[2].Value } else { $name }
    "[$label]($($links[$name]))"
  })
  # 教材内のHTMLに見える文字列をそのまま表示する。
  $text = $text.Replace('<', '&lt;').Replace('>', '&gt;')
  $html = (ConvertFrom-Markdown -InputObject $text).Html
  # コード内ではMarkdownが再度エスケープするため、その1段だけ戻す。
  [regex]::Replace($html, '(?s)<code\b[^>]*>.*?</code>', {
    param($m)
    $m.Value.Replace('&amp;lt;', '&lt;').Replace('&amp;gt;', '&gt;')
  })
}
function Layout([string]$title, [string]$body) {
  $safeTitle = Escape $title
  $mainClass = if ($body.Contains('class="lesson-layout"')) { 'lesson-page' } else { 'course-page' }
  @"
<!doctype html>
<html lang="ja" data-members-locked><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>$safeTitle | 関西文芸交流会</title>
<link rel="icon" href="../../klea_logo_v1.svg" type="image/svg+xml" />
<link rel="stylesheet" href="../../styles.css" /><link rel="stylesheet" href="../styles.css" /><link rel="stylesheet" href="styles.css" />
<link rel="stylesheet" href="../auth.css" />
<script src="../auth-config.js"></script><script src="../auth.js"></script>
<script src="lesson.js" defer></script>
</head><body>
<noscript><p class="members-noscript">メンバーページの表示にはJavaScriptを有効にしてください。</p></noscript>
<a class="skip-link" href="#top">本文へ移動</a>
<header class="site-header"><div class="header-inner"><a class="brand" href="../index.html" aria-label="関西文芸交流会 メンバーホーム"><img class="brand-mark" src="../../klea_logo_v1.svg" alt="" /><span class="brand-name">MEMBERS</span></a><nav class="nav" aria-label="主要ナビゲーション"><a href="index.html">研修トップ</a><a href="../index.html">メンバートップ</a></nav></div></header>
<main id="top" class="$mainClass">$body</main>
<footer class="site-footer"><span>Developed and provided by KLEA ITDD（関西文芸交流会 技術開発部）</span><a href="index.html">研修トップへ</a></footer>
</body></html>
"@
}
$answerText = Get-Content -Raw -Encoding utf8 "$root/content/確認の解答.md"
$answers = @{}
foreach ($m in [regex]::Matches($answerText, '(?ms)^## 第(\d+)章[^\r\n]*\r?\n(.*?)(?=^## 第\d+章|\z)')) { $answers[[int]$m.Groups[1].Value] = $m.Groups[2].Value.Trim() }
$cards = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt 9; $i++) {
  $number = $i + 1
  $chapter = $chapters[$i]
  $title = Escape $chapter.BaseName
  $markdown = Get-Content -Raw -Encoding utf8 -LiteralPath $chapter.FullName
  $html = Render $markdown
  $toc = [System.Collections.Generic.List[string]]::new()
  $counter = @{ value = 0 }
  $html = [regex]::Replace($html, '<h([1-6])[^>]*>(.*?)</h\1>', {
    param($m)
    $counter.value++
    $level = [Math]::Min(6, [int]$m.Groups[1].Value + 1)
    $id = "section-$($counter.value)"
    $label = $m.Groups[2].Value
    if ($level -eq 2) { $toc.Add("<li><a href=`"#$id`">$label</a></li>") }
    $class = if ($label -match '現実の事例') { ' class="example-heading"' } else { '' }
    "<h$level id=`"$id`"$class>$label</h$level>"
  })
  # 見出し階層を保ったまま、各節を標準のdetails要素で開閉できるようにする。
  $sections = [System.Text.StringBuilder]::new()
  $levels = [System.Collections.Generic.Stack[int]]::new()
  $offset = 0
  foreach ($heading in [regex]::Matches($html, '<h([2-6])\b[^>]*>.*?</h\1>')) {
    [void]$sections.Append($html.Substring($offset, $heading.Index - $offset))
    $level = [int]$heading.Groups[1].Value
    while ($levels.Count -gt 0 -and $levels.Peek() -ge $level) {
      [void]$sections.Append('</div></details>')
      [void]$levels.Pop()
    }
    [void]$sections.Append('<details class="lesson-section" open><summary>' + $heading.Value + '</summary><div class="section-content">')
    $levels.Push($level)
    $offset = $heading.Index + $heading.Length
  }
  [void]$sections.Append($html.Substring($offset))
  while ($levels.Count -gt 0) {
    [void]$sections.Append('</div></details>')
    [void]$levels.Pop()
  }
  $html = $sections.ToString()
  if (-not $answers.ContainsKey($number)) { throw "第${number}章の解答がありません。" }
  $answerHtml = Render $answers[$number]
  $previous = if ($i -gt 0) { "<a href=`"chapter-$i.html`">← 前の章<span>$(Escape $chapters[$i - 1].BaseName)</span></a>" } else { '<a href="index.html">← 研修トップ<span>章一覧へ戻る</span></a>' }
  $next = if ($number -lt 9) { "<a href=`"chapter-$($number + 1).html`">次の章 →<span>$(Escape $chapters[$i + 1].BaseName)</span></a>" } else { '<a href="index.html">研修トップ →<span>学習内容を振り返る</span></a>' }
  $body = @"
<div class="lesson-heading"><p class="eyebrow">Information literacy / $number of 9</p><h1>$title</h1><a class="back-link" href="index.html">← 研修の章一覧</a></div>
<div class="lesson-layout"><aside class="lesson-sidebar"><details class="lesson-toc" open><summary>この章の目次</summary><nav aria-label="章内目次"><ol>$($toc -join '')<li><a href="#answers">確認の解答</a></li></ol></nav></details></aside>
<div class="lesson-reading"><div class="section-controls" role="group" aria-label="見出しの一括開閉" hidden><button type="button" data-sections="expand">見出しをすべて開く</button><button type="button" data-sections="collapse">見出しをすべて閉じる</button></div>
<article class="lesson-body" aria-label="$title 本文">$html
<section class="answer-section" id="answers" aria-labelledby="answers-title"><h2 id="answers-title">確認の解答</h2><p></p><details class="answers"><summary>解答・解説を開く</summary><div>$answerHtml</div></details></section>
<nav class="chapter-navigation" aria-label="章の移動">$previous$next</nav></article></div></div>
"@
  Layout $chapter.BaseName $body | Set-Content -Encoding utf8 "$root/chapter-$number.html"
  $topics = @([regex]::Matches($markdown, '(?m)^# (.+)') | Select-Object -First 3 | ForEach-Object { Escape $_.Groups[1].Value.Replace('`', '') }) -join ' / '
  $cards.Add("<a class=`"panel link-card chapter-card`" href=`"chapter-$number.html`"><span class=`"num`">CHAPTER $('{0:D2}' -f $number)</span><h3>$title</h3><p>$topics</p><span class=`"link-label`">この章を読む <span aria-hidden=`"true`">→</span></span></a>")
}
$intro = Get-Content -Raw -Encoding utf8 "$root/content/関西文芸交流会　情報リテラシ研修カリキュラム.md"
# 管理用タグ・旧公開予定日・章一覧を除き、導入説明を掲載する。
$intro = ($intro -split '(?m)^## \[\[')[0]
$intro = [regex]::Replace($intro, '(?m)^#情報.*\r?\n|^2026\.7\.20.*\r?\n|^Developed and provided.*\r?\n', '')
$introHtml = Render $intro.Trim()
$body = @"
<section class="hero training-hero" aria-labelledby="page-title"><div><p class="eyebrow">Information literacy / KLEA ITDD</p><h1 id="page-title">情報リテラシ研修<span class="small">関西文芸交流会 メンバー向け研修</span></h1><p class="lead">知識を、実際の判断と行動につなげる。<br />情報の扱いから技術運用まで、全9章で学びます。</p><div class="hero-actions"><a class="button" href="chapter-1.html">第1章から始める</a><a class="button ghost" href="#curriculum">章一覧を見る</a></div></div></section>
<div class="content-area"><section class="section" aria-labelledby="intro-title"><div class="section-title"><h2 id="intro-title">研修について</h2></div><div class="intro-copy">$introHtml</div><div class="study-guide"><h3>学習の進め方</h3><ol><li>本文を読み、事例を自分の活動に置き換えて考えます。</li><li>章末の「確認」に取り組み、解答・解説を開いて振り返ります。</li><li>理解が曖昧な箇所は、章内目次から戻って読み直しましょう。</li></ol></div></section><section class="section" id="curriculum" aria-labelledby="curriculum-title"><div class="section-title"><h2 id="curriculum-title">章一覧</h2><p>第1〜7章：基礎と実務 ／ 第8・9章：主に技術者向け</p></div><div class="member-grid">$($cards -join '')</div></section></div>
"@
Layout '情報リテラシ研修' $body | Set-Content -Encoding utf8 "$root/index.html"
Write-Output 'Generated course index and 9 chapters.'
