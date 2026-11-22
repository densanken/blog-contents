import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { isCurrent, pullRequest } from "./workflow-run.ts";

import type {
  Args,
  Artifact,
  Comment,
  CommentsApi,
  Github,
  Job,
  Method,
  Params,
} from "./workflow-run.ts";

type ActionsApi = {
  readonly rest: {
    readonly actions: {
      readonly listJobsForWorkflowRun: Method;
      readonly listWorkflowRunArtifacts: Method;
      downloadArtifact(params: Params): Promise<{ readonly data: ArrayBuffer | Uint8Array }>;
    };
    readonly issues: { deleteComment(params: Params): Promise<unknown> };
  };
};

type CommentArgs = {
  readonly github: Github & CommentsApi & ActionsApi;
  readonly context: Args["context"];
  readonly core: { readonly warning: (message: string) => void };
};

const marker = "<!-- content-check-results -->";

// 成果物は非信頼のテキストとして扱い、HTML とメンションを無害化する
const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("@", "&#64;");

// 失敗したジョブの診断（成果物の result.txt）を取り出す。取り出せなければ空文字列を返す
const diagnose = async ({ github, context, core }: CommentArgs, artifact: Artifact) => {
  try {
    const zip = await github.rest.actions.downloadArtifact({
      ...context.repo,
      artifact_id: artifact.id,
      archive_format: "zip",
    });
    const file = `${process.env.RUNNER_TEMP}/diagnostic.zip`;
    writeFileSync(file, new Uint8Array(zip.data));
    // 出力が maxBuffer を超えても、そこまでの stdout は残る
    const { stdout } = spawnSync("unzip", ["-p", file, "result.txt"], {
      timeout: 5000,
      maxBuffer: 20_000,
    });
    return stdout.toString("utf8").slice(0, 5000);
  } catch {
    core.warning("診断を取得できませんでした。ログを確認してください。");
    return "";
  }
};

// 失敗したジョブの表の行と、診断の節を作る（診断があるのは fmt と content だけで、blog はログで確認する）
const summarize = async (args: CommentArgs, failed: readonly Job[], runId: number) => {
  const artifacts = await args.github.paginate<Artifact>(
    args.github.rest.actions.listWorkflowRunArtifacts,
    { ...args.context.repo, run_id: runId }
  );
  const rows: string[] = [];
  const sections: string[] = [];

  for (const job of failed) {
    // ブログのビルドの不備は、ログの警告（::warning）で確認する（パスがブログ側の contents/ からなので、差分の注釈にはならない）
    if (job.name === "blog") {
      rows.push(`| ブログのビルド | 失敗 | [ログを開く](${job.html_url}) |`);
      continue;
    }

    const artifact = artifacts.find(
      (item) =>
        item.name === `diagnostics-${job.name}` && !item.expired && item.size_in_bytes <= 100_000
    );
    const diagnostic = artifact ? escape(await diagnose(args, artifact)) : "";
    const label = job.name === "fmt" ? "フォーマット" : "コンテンツ";
    rows.push(`| ${label} | 失敗 | [ログを開く](${job.html_url}) |`);
    sections.push(
      `<details>\n<summary>${label}の診断</summary>\n\n${diagnostic === "" ? "診断を取得できませんでした。ログを確認してください。" : `<pre>${diagnostic}</pre>`}\n\n</details>`
    );
  }

  const details =
    sections.length > 0
      ? `\n\n診断は先頭 5,000 文字まで表示します。全体はログで確認してください。\n\n${sections.join("\n\n")}`
      : "";
  return `${marker}\n> [!WARNING]\n> 検証に失敗しました。修正してから再度 push してください。\n\n| チェック | 結果 | 詳細 |\n| --- | --- | --- |\n${rows.join("\n")}${details}`;
};

const report = async (args: CommentArgs) => {
  const { github, context } = args;
  const { owner, repo } = context.repo;
  const run = context.payload.workflow_run;

  const pr = await pullRequest(args);
  if (pr === undefined) return;

  const jobs = await github.paginate<Job>(github.rest.actions.listJobsForWorkflowRun, {
    owner,
    repo,
    run_id: run.id,
  });
  const checks = ["fmt", "content", "blog"].map((name) => jobs.find((job) => job.name === name));
  const failed = checks.filter(
    (job): job is Job => job !== undefined && job.conclusion === "failure"
  );

  const comments = await github.paginate<Comment>(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pr.number,
  });
  const previous = comments.find(
    (item) => item.user?.login === "github-actions[bot]" && item.body?.includes(marker) === true
  );

  if (failed.length > 0) {
    const body = await summarize(args, failed, run.id);
    if (!(await isCurrent(args, pr.number))) return;

    if (previous === undefined)
      await github.rest.issues.createComment({ owner, repo, issue_number: pr.number, body });
    else await github.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body });
  } else if (
    previous !== undefined &&
    checks.every((job) => job?.conclusion === "success") &&
    (await isCurrent(args, pr.number))
  ) {
    await github.rest.issues.deleteComment({ owner, repo, comment_id: previous.id });
  }
};

export default report;
