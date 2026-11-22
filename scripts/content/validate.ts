import { existsSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { checkImage, imageExtensions } from "./image.ts";
import { checkMeta } from "./meta.ts";
import { checkPost } from "./post.ts";
import { checkProfile } from "./profile.ts";

import type { Report } from "./shared.ts";

const extensions = new Set([".md", ".yaml", ".yml", ...imageExtensions]);

const validName = (name: string, file: boolean) =>
  (file ? /^[a-z\d-]+(?:\.[a-z\d-]+)?$/i : /^[a-z\d-]+$/i).test(name);

const checkers = new Map([
  ["profile", checkProfile],
  ["meta", checkMeta],
]);
const yamlStem = (name: string) => /^(.+)\.ya?ml$/.exec(name)?.[1];

// 名前を検証したディレクトリの中身を返す
// 大文字と小文字だけが違う名前は、ブログでは重複として扱われ、どちらかが公開されないため拒否する
// サブモジュールは、checkout すると空のディレクトリになるため、空のディレクトリとして拒否する
const entries = (dir: string, report: Report) => {
  const items = readdirSync(dir, { withFileTypes: true });
  if (items.length === 0)
    report(dir, "空のディレクトリやサブモジュールは使えません。削除してください。");

  const names = new Set<string>();
  for (const entry of items) {
    const path = join(dir, entry.name);
    if (!entry.isDirectory() && entry.name.endsWith(".md") && entry.name.slice(0, -3).includes("."))
      // ブログは記事のパスに . を含むものを、静的ファイルの URL として扱う
      report(path, "記事のファイル名に . は使えません。ハイフンなどに置き換えてください。");
    else if (!validName(entry.name, !entry.isDirectory()))
      report(path, "名前には半角英数字とハイフンだけを使ってください。");

    const name = entry.name.toLowerCase();
    if (names.has(name))
      report(path, "大文字と小文字だけが違う名前は使えません。どちらかの名前を変えてください。");
    names.add(name);
  }

  return items;
};

const subdirectoryMessage =
  "著者ディレクトリ直下に置けるサブディレクトリは assets だけです。記事は著者ディレクトリ直下に移してください。";

// assets は、画像だけを置ける著者ディレクトリ直下のディレクトリ
const walk = async (dir: string, author: string, report: Report, inAssets = false) => {
  const items = entries(dir, report);
  if (dir === author) {
    for (const name of checkers.keys()) {
      if (items.filter((entry) => entry.isFile() && yamlStem(entry.name) === name).length !== 1)
        report(dir, `${name}.yaml または ${name}.yml を 1 つ用意してください。`);
    }
  }

  for (const entry of items) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink())
      report(path, "シンボリックリンクは使えません。実体のファイルに置き換えてください。");
    else if (entry.isDirectory()) {
      // 記事は著者ディレクトリ直下だけに置けるため、assets 以外のサブディレクトリは使えない
      if (inAssets || (dir === author && entry.name === "assets"))
        await walk(path, author, report, true);
      else report(path, subdirectoryMessage);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!extensions.has(ext))
        report(
          path,
          "許可されていない拡張子です。.md、.yaml、.yml と画像（PNG、JPEG、GIF、WebP、AVIF）のみ利用可能です。"
        );
      else if (imageExtensions.has(ext)) {
        if (inAssets) {
          await checkImage(path, ext, report);
        } else {
          report(path, "画像は assets/ の下に置いてください。");
        }
      } else if (inAssets) report(path, "assets/ の下には画像だけを置いてください。");
      else if (ext === ".md" && !entry.name.endsWith(".md"))
        report(path, "記事の拡張子は小文字の .md を使ってください。");
      else if (ext === ".md") checkPost(path, entry.name, report);
      else {
        const check = dir === author ? checkers.get(yamlStem(entry.name) ?? "") : undefined;
        if (check === undefined)
          report(
            path,
            "YAML は著者ディレクトリ直下の profile.yaml と meta.yaml だけ置くことができます。"
          );
        else check(path, report);
      }
    }
  }
};

export const checkContents = async (root: string) => {
  const errors: string[] = [];
  const report: Report = (path, message) => {
    errors.push(`${relative(root, path)}: ${message}`);
  };

  // 著者がまだいない間は authors/ がなくてもよい
  if (!existsSync(root)) return errors;

  for (const entry of entries(root, report)) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name === "README.md") continue;
    if (entry.isSymbolicLink())
      report(path, "シンボリックリンクは使えません。実体のファイルに置き換えてください。");
    else if (entry.isDirectory()) {
      // ブログの著者ページのページ送り /@<著者ID>/page/<番号> と衝突する
      if (entry.name.toLowerCase() === "page")
        report(path, "page は著者 ID に使えません。別の ID にしてください。");
      await walk(path, path, report);
    } else
      report(
        path,
        "authors の直下には著者ディレクトリと README.md だけ置くことができます。著者ディレクトリの中へ移してください。"
      );
  }

  return errors;
};
