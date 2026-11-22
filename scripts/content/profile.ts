import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { checkKeys, optional, read, text, yaml } from "./shared.ts";

import type { Report } from "./shared.ts";

const github = (value: unknown) =>
  typeof value === "string" && /^[a-z\d][a-z\d-]{0,38}$/i.test(value);

// ブログの pinnedPostsLimit（src/shared/utils/posts.ts）と同じ値
const pinnedLimit = 3;

// ブログは項目を小文字にして、記事のスラッグ（記事のファイル名から .md を除いたもの）と比較する
const validPinned = (value: unknown, path: string) => {
  if (!Array.isArray(value) || value.length > pinnedLimit) return false;
  if (!value.every((item) => typeof item === "string")) return false;

  const slugs = value.map((item) => item.toLowerCase());
  const posts = new Set(
    readdirSync(dirname(path), { encoding: "utf8" })
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.slice(0, -".md".length).toLowerCase())
  );
  return new Set(slugs).size === slugs.length && slugs.every((slug) => posts.has(slug));
};

const url = (value: unknown, max: number) => {
  if (!text(value, max) || !value.startsWith("https://")) return false;

  try {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password;
  } catch {
    return false;
  }
};

const validIconPath = (value: unknown, path: string) =>
  typeof value === "string" &&
  /^assets\/(?=.{1,200}$)(?:[a-z\d-]+\/)*[a-z\d-]+\.[a-z\d]+$/i.test(value) &&
  existsSync(join(dirname(path), value));

export const checkProfile = (path: string, report: Report) => {
  const source = read(path, report);
  const data = source === null ? null : yaml(path, source, report);
  if (!data) return;

  checkKeys(
    path,
    data,
    ["name", "github", "website", "icon", "twitter", "x", "bio", "admissionYear", "pinned"],
    report
  );

  const fail = (message: string) => {
    report(path, message);
  };
  if (!text(data.name, 100)) fail("name は 1〜100 文字の文字列が必要です。");
  optional(data, "github", "GitHub ユーザー名", github, fail);
  for (const key of ["x", "twitter"])
    optional(
      data,
      key,
      "英数字とアンダースコアの 15 文字以内",
      (value) => typeof value === "string" && /^\w{1,15}$/.test(value),
      fail
    );
  optional(data, "website", "認証情報を含まない https:// の URL", (value) => url(value, 200), fail);
  optional(data, "bio", "1〜500 文字の文字列", (value) => text(value, 500), fail);
  optional(
    data,
    "admissionYear",
    "4 文字以内の半角数字（2024 など）",
    (value) =>
      (typeof value === "number" || typeof value === "string") && /^\d{1,4}$/.test(String(value)),
    fail
  );
  optional(
    data,
    "icon",
    "https:// の URL、または存在する画像ファイルへの assets/ から始まる相対パス",
    (value) => url(value, 500) || validIconPath(value, path),
    fail
  );
  optional(
    data,
    "pinned",
    `同じ著者の記事のスラッグ（記事のファイル名から .md を除いたもの）の、重複のない ${String(pinnedLimit)} 件までの配列`,
    (value) => validPinned(value, path),
    fail
  );
};
