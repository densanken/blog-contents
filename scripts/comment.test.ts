import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import comment from "./comment.ts";

const ok = (name: string) => ({ name, conclusion: "success" });

test("対象の現在の PR に診断をエスケープしてコメントする", async () => {
  const dir = mkdtempSync(join(tmpdir(), "comment-test-"));
  const oldTemp = process.env.RUNNER_TEMP;
  process.env.RUNNER_TEMP = dir;

  try {
    writeFileSync(join(dir, "result.txt"), "<script>@everyone</script>" + "&".repeat(25000));
    execFileSync("zip", ["-q", "result.zip", "result.txt"], { cwd: dir });

    const run = {
      id: 10,
      run_attempt: 1,
      head_sha: "abc",
      head_branch: "branch",
      head_repository: { id: 2 },
      pull_requests: [{ number: 5 }],
    };

    const pr = {
      number: 5,
      state: "open",
      head: { sha: "abc", ref: "branch", repo: { id: 2 } },
      base: { repo: { id: 1 } },
    };

    const bodies: string[] = [];
    const workflowIds: string[] = [];

    const rest = {
      pulls: { list: () => [pr], get: async () => ({ data: pr }) },
      actions: {
        listJobsForWorkflowRun: () => [
          { name: "content", conclusion: "failure", html_url: "https://example.com/log" },
          { name: "blog", conclusion: "failure", html_url: "https://example.com/blog" },
        ],
        listWorkflowRunArtifacts: () => [{ name: "diagnostics-content", size_in_bytes: 100 }],
        listWorkflowRuns: async (params: { workflow_id: string }) => {
          workflowIds.push(params.workflow_id);
          return { data: { workflow_runs: [run] } };
        },
        downloadArtifact: async () => ({ data: readFileSync(join(dir, "result.zip")) }),
      },
      issues: {
        listComments: () => [],
        createComment: async ({ body }: { body: string }) => {
          bodies.push(body);
        },
      },
    };

    const github = { rest, paginate: async (method: () => unknown) => method() } as never;
    const context = {
      repo: { owner: "owner", repo: "repo" },
      payload: { workflow_run: run, repository: { id: 1 } },
    };
    await comment({ github, context, core: { warning: () => {} } });

    assert.equal(bodies.length, 1);
    assert.deepEqual(workflowIds, ["ci.yml"]);
    assert.ok(bodies[0].length < 30000);
    assert.ok(bodies[0].includes("> [!WARNING]"));
    assert.ok(bodies[0].includes("| コンテンツ | 失敗 | [ログを開く](https://example.com/log) |"));
    assert.ok(
      bodies[0].includes("| ブログのビルド | 失敗 | [ログを開く](https://example.com/blog) |")
    );
    assert.ok(bodies[0].includes("<details>\n<summary>コンテンツの診断</summary>"));
    assert.ok(!bodies[0].includes("ブログのビルドの診断"));
    assert.match(bodies[0], /&lt;script&gt;&#64;everyone&lt;\/script&gt;/);

    rest.actions.listWorkflowRuns = async () => ({
      data: { workflow_runs: [{ ...run, run_attempt: 2 }] },
    });
    await comment({ github, context, core: { warning: () => {} } });
    assert.equal(bodies.length, 1);

    pr.head.ref = "different";
    await comment({ github, context, core: { warning: () => {} } });
    assert.equal(bodies.length, 1);
  } finally {
    if (oldTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = oldTemp;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fmt、content と blog がすべて成功した最新の実行でだけ、古いコメントを削除する", async () => {
  const run = {
    id: 10,
    run_attempt: 1,
    head_sha: "abc",
    head_branch: "branch",
    head_repository: { id: 2 },
  };
  const pr = {
    number: 5,
    state: "open",
    head: { sha: "abc", ref: "branch", repo: { id: 2 } },
    base: { repo: { id: 1 } },
  };
  const deleted: number[] = [];
  let jobs: { name: string; conclusion: string }[] = [];
  const rest = {
    pulls: { list: () => [pr], get: async () => ({ data: pr }) },
    actions: {
      listJobsForWorkflowRun: () => jobs,
      listWorkflowRuns: async () => ({ data: { workflow_runs: [run] } }),
    },
    issues: {
      listComments: () => [
        { id: 7, user: { login: "github-actions[bot]" }, body: "<!-- content-check-results -->" },
      ],
      deleteComment: async ({ comment_id }: { comment_id: number }) => {
        deleted.push(comment_id);
      },
    },
  };
  const github = { rest, paginate: async (method: () => unknown) => method() } as never;
  const context = {
    repo: { owner: "owner", repo: "repo" },
    payload: { workflow_run: run, repository: { id: 1 } },
  };

  for (jobs of [[ok("fmt"), { name: "content", conclusion: "cancelled" }], [ok("fmt")]])
    await comment({ github, context, core: { warning: () => {} } });
  assert.deepEqual(deleted, []);

  for (jobs of [
    [ok("fmt"), ok("content"), { name: "blog", conclusion: "cancelled" }],
    [ok("fmt"), ok("content"), { name: "blog", conclusion: "skipped" }],
  ])
    await comment({ github, context, core: { warning: () => {} } });
  assert.deepEqual(deleted, []);

  jobs = [ok("fmt"), ok("content"), ok("blog"), { name: "test", conclusion: "failure" }];
  await comment({ github, context, core: { warning: () => {} } });
  assert.deepEqual(deleted, [7]);
});

test("コメント用 workflow が CI の workflow 名を監視する", () => {
  const ci = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  const listener = parse(readFileSync(".github/workflows/comment.yml", "utf8"));

  assert.ok(
    listener.on.workflow_run.workflows.some(
      (name: string) => name.toLowerCase() === ci.name.toLowerCase()
    )
  );
});

test("blog だけが失敗したときは、診断の案内を載せない", async () => {
  const run = {
    id: 10,
    run_attempt: 1,
    head_sha: "abc",
    head_branch: "b",
    head_repository: { id: 2 },
  };
  const pr = { number: 5, state: "open", head: { sha: "abc", ref: "b", repo: { id: 2 } } };
  const bodies: string[] = [];
  const rest = {
    pulls: { list: () => [pr], get: async () => ({ data: pr }) },
    actions: {
      listJobsForWorkflowRun: () => [
        { name: "fmt", conclusion: "success" },
        { name: "content", conclusion: "success" },
        { name: "blog", conclusion: "failure", html_url: "https://example.com/blog" },
      ],
      listWorkflowRunArtifacts: () => [],
      listWorkflowRuns: async () => ({ data: { workflow_runs: [run] } }),
    },
    issues: {
      listComments: () => [],
      createComment: async ({ body }: { body: string }) => {
        bodies.push(body);
      },
    },
  };
  const github = { rest, paginate: async (method: () => unknown) => method() } as never;
  const context = { repo: { owner: "owner", repo: "repo" }, payload: { workflow_run: run } };
  await comment({ github, context, core: { warning: () => {} } });

  assert.equal(bodies.length, 1);
  assert.ok(
    bodies[0].includes("| ブログのビルド | 失敗 | [ログを開く](https://example.com/blog) |")
  );
  assert.ok(!bodies[0].includes("診断"));
});
