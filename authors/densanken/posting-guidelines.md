---
title: 投稿ガイドライン
description: このブログへの投稿方法とガイドラインです。
date: "2026-11-15"
---

## このブログについて

CCS（千葉大学電子計算機研究会）のメンバーと OB/OG 向けのブログです。\
関係者以外の方の投稿はご遠慮ください。

書くジャンルは自由です！\
技術的な内容から日常の雑記まで何でも歓迎ですが、公序良俗に反する内容の投稿は禁止です。

なお、ルールに反する投稿は管理者側で削除させていただきますので、あらかじめご了承ください。

## 投稿方法

記事は GitHub の [densanken/blog-contents](https://github.com/densanken/blog-contents) に PR（プルリクエスト）を送ることで投稿することができます。

1. リポジトリをフォークし、`authors/<著者ID>/` 配下に記事の Markdown ファイルを追加してください。\
   初めて投稿する場合は、`profile.yml` と `meta.yml` もあわせて作成してください。
2. PR を作成してください。作成後、内容の検査と編集権限の確認が自動で行われます。\
   問題が指摘された場合は、PR に付くコメントの指示に従って修正してください。
3. PR 本文の「すべてのチェックが成功したら自動マージする」にチェックを入れてください。\
   検査に合格すると自動でマージされ、記事が公開されます（未来の日付を指定した場合は、その日以降に公開されます）。

> [!CAUTION]
> 編集は自分の著者 ID のディレクトリ（`authors/<著者ID>/`）内のみで行ってください。\
> 他の人の記事や、`authors/` 以外のファイルは変更しないでください（他の変更が含まれる PR はマージできません）。

ファイルの配置や書き方の詳細については、リポジトリの [README](https://github.com/densanken/blog-contents#readme) を参照してください。

### ファイルの構成

```text
authors/
 └ 著者ID/
   ├ profile.yml
   ├ meta.yml
   ├ hello.md
   └ assets/
     └ image.png
```

> [!IMPORTANT]
> 著者 ID・ディレクトリ名・ファイル名には、**半角英数字とハイフン（`-`）のみが利用可能**です。\
> それ以外の文字は利用できないのでご注意ください。

<details>
<summary>profile.yml の書き方</summary>

ブログに表示するプロフィールを設定します。`name` 以外の項目は省略できます。

```yaml
name: 表示名
github: example
x: example
website: https://example.com
icon: assets/icon.png
bio: 自己紹介
admissionYear: 2025
pinned:
  - example-article
```

- `icon` には `https://` から始まる URL か、`assets/` 内に置いた画像のパスを指定してください。
- `admissionYear` には入学年度を記載してください。
- `website` には `https://` から始まる URL のみを指定してください（GitHub の組織メンバーのみ設定可能です）。
- `pinned` には、記事のファイル名（slug）を最大3つまで指定することができます。指定した順に自分の記事一覧ページでピン留めされます。

</details>

<details>
<summary>meta.yml の書き方</summary>

この著者 ID のディレクトリを編集できる人の GitHub ユーザー名を指定してください（この内容はブログに表示されません）。

```yaml
editors:
  - github
```

GitHub のチームで共同管理する場合は、`team:` に続けてチームの slug を指定してください。

```yaml
editors:
  - github
  - team:team-a
```

</details>

<details>
<summary>記事の書き方</summary>

記事の先頭に `title` と `date` を指定してください。`description` は省略できます。\
`date` には記事の公開日を `yyyy-MM-dd` 形式で指定してください。

`date` に未来の日付を入れると、記事はその日以降に公開されます。

```markdown
---
title: はじめての記事
date: 2026-01-01
description: 記事の概要
---

本文を書いてください。
```

</details>

### 制限事項

- 記事内で使用する添付ファイルは画像のみが利用可能です。
- 画像は `assets/` 配下に置き、記事からは `./assets/image.png` のような相対パスで参照してください。
- 画像形式は PNG、JPEG、GIF、WebP、AVIF のいずれかを使用してください（SVG は使用不可）。
- 画像のサイズは 1 枚あたり 10 MB 以下、5,000 万画素以下に収めてください。
- 拡張子は実際の画像形式と一致させてください（例：PNG 画像に `.jpg` を付けない）。
- ファイル名に空白やアンダースコア（`_`）を含めないでください。スクリーンショットなどは名前を変更してから配置してください。

## Markdown について

使える Markdown の記法については、[Markdown 構文サンプル](/@densanken/markdown-syntax-sample) を参考にしてみてください。

[記事一覧へ戻る](/)
