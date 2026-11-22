import { isCurrent, pullRequest } from "./workflow-run.ts";

import type { Args, Comment, CommentsApi, Github } from "./workflow-run.ts";

const marker = "<!-- preview -->";

// プレビューをデプロイする PR の番号を出力する（PR の最新の CI の実行でなければ、出力しない）
export const target = async ({
  github,
  context,
  core,
}: Args & { readonly core: { readonly setOutput: (name: string, value: string) => void } }) => {
  const pr = await pullRequest({ github, context });
  if (pr !== undefined && (await isCurrent({ github, context }, pr.number)))
    core.setOutput("number", String(pr.number));
};

// プレビューの URL（url がなければ、デプロイしなかったこと）を PR にコメントする
// 以前のコメントは書き換える
export const report = async (
  { github, context }: { readonly github: Github & CommentsApi; readonly context: Args["context"] },
  number: number,
  url?: string | null
) => {
  if (!(await isCurrent({ github, context }, number))) return;

  const sha = context.payload.workflow_run.head_sha.slice(0, 7);
  const body =
    url === undefined || url === null || url === ""
      ? `${marker}\n> [!WARNING]\n> 出力のファイル数が上限を超えたため、プレビュー（${sha}）をデプロイしませんでした。`
      : `${marker}\nプレビュー（${sha}）：${url}\n\n予約投稿も表示されています。`;

  const comments = await github.paginate<Comment>(github.rest.issues.listComments, {
    ...context.repo,
    issue_number: number,
  });
  const previous = comments.find(
    (comment) =>
      comment.user?.login === "github-actions[bot]" && comment.body?.includes(marker) === true
  );
  if (previous === undefined)
    await github.rest.issues.createComment({ ...context.repo, issue_number: number, body });
  else await github.rest.issues.updateComment({ ...context.repo, comment_id: previous.id, body });
};
