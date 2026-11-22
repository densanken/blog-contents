import { checkKeys, read, yaml } from "./shared.ts";

import type { Report } from "./shared.ts";

// ログインはブログの plugins/content-filter.ts と同じ形式
const editor = (value: unknown) =>
  typeof value === "string" &&
  (/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value) || /^team:[a-z\d][a-z\d_-]*$/i.test(value));

export const checkMeta = (path: string, report: Report) => {
  const source = read(path, report);
  const data = source === null ? null : yaml(path, source, report);
  if (!data) return;

  checkKeys(path, data, ["editors"], report);
  if (!Array.isArray(data.editors) || data.editors.length === 0 || !data.editors.every(editor))
    report(
      path,
      "editors は GitHub ユーザー名または team:チーム slug の 1 つ以上の配列が必要です。"
    );
};
