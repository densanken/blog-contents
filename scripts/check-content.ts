import { join } from "node:path";

import { checkContents } from "./content/validate.ts";

const errors = await checkContents(join(process.cwd(), "authors"));

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("コンテンツの検証に成功しました。");
}
