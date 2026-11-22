import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parse } from "yaml";

import { report, target } from "./preview.ts";

const setup = () => {
  const run = {
    id: 10,
    run_attempt: 1,
    head_sha: "abcdef0123",
    head_branch: "branch",
    head_repository: { id: 2 },
  };
  const pr = {
    number: 5,
    state: "open",
    head: { sha: "abcdef0123", ref: "branch", repo: { id: 2 } },
  };
  const created: string[] = [];
  const updated: string[] = [];
  const state = { runs: [run], comments: [] as any[] };
  const rest = {
    pulls: { list: () => [pr], get: async () => ({ data: pr }) },
    actions: { listWorkflowRuns: async () => ({ data: { workflow_runs: state.runs } }) },
    issues: {
      listComments: () => state.comments,
      createComment: async ({ body }: { body: string }) => {
        created.push(body);
      },
      updateComment: async ({ body }: { body: string }) => {
        updated.push(body);
      },
    },
  };
  const github = { rest, paginate: async (method: () => unknown) => method() } as never;
  const context = { repo: { owner: "owner", repo: "repo" }, payload: { workflow_run: run } };
  return { run, pr, state, created, updated, args: { github, context, core: {} } };
};

test("PR の最新の CI の実行でだけ、PR の番号を出力する", async () => {
  const { run, state, args } = setup();
  const outputs: Record<string, string> = {};
  const core = { setOutput: (name: string, value: string) => (outputs[name] = value) };

  state.runs = [{ ...run, id: 11 }];
  await target({ ...args, core });
  assert.deepEqual(outputs, {});

  state.runs = [run];
  await target({ ...args, core });
  assert.deepEqual(outputs, { number: "5" });
});

test("プレビューの URL をコメントし、以前のコメントは書き換える", async () => {
  const { state, created, updated, args } = setup();

  await report(args, 5, "https://pr-5-w.s.workers.dev");
  assert.equal(created.length, 1);
  assert.ok(created[0].includes("プレビュー（abcdef0）：https://pr-5-w.s.workers.dev"));

  state.comments = [{ id: 1, user: { login: "github-actions[bot]" }, body: created[0] }];
  await report(args, 5);
  assert.equal(created.length, 1);
  assert.equal(updated.length, 1);
  assert.ok(updated[0].includes("デプロイしませんでした"));
});

test("PR の HEAD が進んでいたら、コメントしない", async () => {
  const { pr, created, args } = setup();
  pr.head.sha = "newer";

  await report(args, 5, "https://pr-5-w.s.workers.dev");
  assert.deepEqual(created, []);
});

test("プレビュー用 workflow が CI の workflow 名を監視し、CI に参照するジョブがある", () => {
  const ci = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  const listener = parse(readFileSync(".github/workflows/preview.yml", "utf8"));

  assert.ok(
    listener.on.workflow_run.workflows.some(
      (name: string) => name.toLowerCase() === ci.name.toLowerCase()
    )
  );
  for (const job of ["blog", "preview-build"]) assert.ok(ci.jobs[job], job);
});
