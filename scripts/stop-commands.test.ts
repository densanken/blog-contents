import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("コマンドの出力を Actions コマンドの無効化で囲み、終了コードをそのまま返す", () => {
  for (const code of [0, 1, 2]) {
    const result = spawnSync(
      "bash",
      ["scripts/stop-commands.sh", "sh", "-c", `echo "::error::x"; exit ${code}`],
      {
        encoding: "utf8",
      }
    );

    assert.equal(result.status, code);
    assert.match(result.stdout, /^::stop-commands::(\S+)\n::error::x\n\n::\1::\n$/);
  }
});
