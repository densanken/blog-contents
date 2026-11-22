// workflow_run で動く workflow（comment.yml、preview.yml）が、CI の実行の対象の PR を求める

type Repo = { readonly owner: string; readonly repo: string };

export type Run = {
  readonly id: number;
  readonly run_attempt: number;
  readonly head_sha: string;
  readonly head_branch: string;
  readonly head_repository?: { readonly id: number } | null;
  readonly pull_requests?: readonly { readonly number: number }[] | null;
};

export type Pull = {
  readonly number: number;
  readonly state: string;
  readonly head: {
    readonly sha: string;
    readonly ref: string;
    readonly repo?: { readonly id: number } | null;
  };
};

export type Comment = {
  readonly id: number;
  readonly body?: string | null;
  readonly user?: { readonly login: string } | null;
};

export type Job = {
  readonly name: string;
  readonly conclusion?: string | null;
  readonly html_url?: string | null;
};

export type Artifact = {
  readonly id: number;
  readonly name: string;
  readonly expired: boolean;
  readonly size_in_bytes: number;
};

export type Method = (...args: never[]) => unknown;

export type Params = Readonly<Record<string, unknown>>;

// 実行の対象の PR を求めるのに必要な API
export type Github = {
  readonly paginate: <T>(method: Method, params: Params) => Promise<readonly T[]>;
  readonly rest: {
    readonly pulls: {
      readonly list: Method;
      get(params: Params): Promise<{ readonly data: Pull }>;
    };
    readonly actions: {
      listWorkflowRuns(
        params: Params
      ): Promise<{ readonly data: { readonly workflow_runs: readonly Run[] } }>;
    };
  };
};

// PR のコメントを読み書きするのに必要な API
export type CommentsApi = {
  readonly rest: {
    readonly issues: {
      readonly listComments: Method;
      createComment(params: Params): Promise<unknown>;
      updateComment(params: Params): Promise<unknown>;
    };
  };
};

export type Context = {
  readonly repo: Repo;
  readonly payload: { readonly workflow_run: Run };
};

export type Args = { readonly github: Github; readonly context: Context };

// どちらかのリポジトリが不明（fork の削除など）なら、一致とみなさない
const sameRepository = (a?: { readonly id: number } | null, b?: { readonly id: number } | null) =>
  a?.id !== undefined && a.id === b?.id;

// 実行の head と一致する、開いている PR を 1 件だけ返す
export const pullRequest = async ({ github, context }: Args) => {
  const run = context.payload.workflow_run;
  const pulls = await github.paginate<Pull>(github.rest.pulls.list, {
    ...context.repo,
    state: "open",
  });
  const requested = run.pull_requests ?? [];
  const matches = pulls.filter(
    (pr) =>
      pr.head.sha === run.head_sha &&
      pr.head.ref === run.head_branch &&
      sameRepository(pr.head.repo, run.head_repository) &&
      (requested.length === 0 || requested.some((item) => item.number === pr.number))
  );
  return matches.length === 1 ? matches[0] : undefined;
};

// PR が開いたままで、この実行が PR の現在の HEAD に対する CI の最新の実行か
export const isCurrent = async ({ github, context }: Args, number: number) => {
  const run = context.payload.workflow_run;
  const { data: pull } = await github.rest.pulls.get({ ...context.repo, pull_number: number });
  if (pull.state !== "open" || pull.head.sha !== run.head_sha) return false;

  const { data } = await github.rest.actions.listWorkflowRuns({
    ...context.repo,
    workflow_id: "ci.yml",
    event: "pull_request",
    head_sha: run.head_sha,
    per_page: 100,
  });
  const latest = data.workflow_runs.find(
    (item) =>
      item.head_branch === run.head_branch &&
      sameRepository(item.head_repository, run.head_repository)
  );

  return latest?.id === run.id && latest.run_attempt === run.run_attempt;
};
