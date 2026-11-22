import { checkKeys, optional, read, text, yaml } from "./shared.ts";

import type { Report } from "./shared.ts";

const date = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

export const checkPost = (path: string, fileName: string, report: Report) => {
  // ブログの著者ページのページ送り /@<著者ID>/page/<番号> と衝突する
  if (/^page\.md$/i.test(fileName))
    report(path, "記事のファイル名に page は使えません。ファイル名を変えてください。");

  const source = read(path, report);
  if (source === null) return;
  if (source.length > 500_000) {
    report(path, "記事が大きすぎます（上限 500,000 文字）。短くするか分割してください。");
    return;
  }

  // ブログと同じく、最初の \n--- までを frontmatter とする
  const end = source.startsWith("---") ? source.indexOf("\n---") : -1;
  if (end < 4) {
    report(path, "ファイルの先頭に --- で囲んだ frontmatter が必要です。");
    return;
  }

  const data = yaml(path, source.slice(4, end).replace(/\r$/, ""), report);
  if (!data) return;

  checkKeys(path, data, ["title", "date", "description"], report);

  const fail = (message: string) => {
    report(path, message);
  };
  if (!text(data.title, 300)) fail("title は 1〜300 文字の文字列が必要です。");
  if (!date(data.date)) fail("date は実在する YYYY-MM-DD の日付が必要です。");
  optional(data, "description", "1〜1000 文字の文字列", (value) => text(value, 1000), fail);
};
