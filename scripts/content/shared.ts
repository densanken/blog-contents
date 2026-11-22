import { statSync, readFileSync } from "node:fs";

import { parse } from "yaml";

export type Report = (path: string, message: string) => void;

export const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

export const optional = (
  data: Record<string, unknown>,
  key: string,
  expected: string,
  valid: (value: unknown) => boolean,
  report: (message: string) => void
) => {
  if (data[key] !== undefined && !valid(data[key]))
    report(`${key} が不正です。${expected}を指定してください。`);
};

export const checkKeys = (
  path: string,
  data: Record<string, unknown>,
  allowed: string[],
  report: Report
) => {
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key))
      report(path, `未対応の項目です: ${key}。項目名を確認するか削除してください。`);
  }
};

export const read = (path: string, report: Report) => {
  if (statSync(path).size > 2 * 1024 * 1024) {
    report(path, "ファイルが大きすぎます（上限 2 MiB）。小さくするか分割してください。");
    return null;
  }

  return readFileSync(path, "utf8");
};

export const yaml = (
  path: string,
  source: string,
  report: Report
): Record<string, unknown> | null => {
  let value: unknown;
  try {
    value = parse(source, { uniqueKeys: true });
  } catch (e) {
    report(
      path,
      `YAML が不正です。構文を直してください: ${e instanceof Error ? e.message : String(e)}`
    );
    return null;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    report(path, "YAML が不正です。トップレベルをキーと値のマッピングにしてください。");
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};
