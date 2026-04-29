# Section 2: Triggering Events & Payloads

This section is a comprehensive reference for every event that can trigger a GitHub Actions workflow. For each event you'll find: what triggers it, the activity types (with defaults), available filters, key payload fields exposed via `github.event.*`, and notable gotchas. A "Cross-Cutting Rules" section at the end covers fork PR token restrictions, default-branch-only behavior, `workflow_run` nesting, dispatch input limits, and the `GITHUB_REF` / `GITHUB_SHA` semantics that vary by event.

> **Activity-type default rule.** When you specify an event without `types:`, GitHub triggers on **all** activity types listed for that event in the docs **except** for `pull_request` and `pull_request_target`, which default to only `opened`, `synchronize`, and `reopened`. There are also a few events with only one supported type (e.g. `check_suite: [completed]`, `merge_group: [checks_requested]`, `watch: [started]`) — those single types are obviously the default.

---

## Quick Reference Table

| Event | Activity Types | Default Types | Filters | Default-branch-only |
|---|---|---|---|---|
| `branch_protection_rule` | `created`, `edited`, `deleted` | all | — | yes |
| `check_run` | `created`, `rerequested`, `completed`, `requested_action` | all | — | yes |
| `check_suite` | `completed` | all (only one) | — | yes |
| `create` | — | n/a | — | no (any branch/tag created) |
| `delete` | — | n/a | — | yes |
| `deployment` | — | n/a | — | n/a |
| `deployment_status` | — | n/a | — | n/a |
| `discussion` | `created`, `edited`, `deleted`, `transferred`, `pinned`, `unpinned`, `labeled`, `unlabeled`, `locked`, `unlocked`, `category_changed`, `answered`, `unanswered` | all | — | yes |
| `discussion_comment` | `created`, `edited`, `deleted` | all | — | yes |
| `fork` | — | n/a | — | yes |
| `gollum` | — | n/a | — | yes |
| `issue_comment` | `created`, `edited`, `deleted` | all | — | yes |
| `issues` | `opened`, `edited`, `deleted`, `transferred`, `pinned`, `unpinned`, `closed`, `reopened`, `assigned`, `unassigned`, `labeled`, `unlabeled`, `locked`, `unlocked`, `milestoned`, `demilestoned`, `typed`, `untyped` | all | — | yes |
| `label` | `created`, `edited`, `deleted` | all | — | yes |
| `merge_group` | `checks_requested` | all (only one) | — | n/a |
| `milestone` | `created`, `closed`, `opened`, `edited`, `deleted` | all | — | yes |
| `page_build` | — | n/a | — | yes |
| `public` | — | n/a | — | yes |
| `pull_request` | 21 types (see below) | `opened`, `synchronize`, `reopened` | `branches`, `branches-ignore`, `paths`, `paths-ignore` | no (works on feature branches) |
| `pull_request_review` | `submitted`, `edited`, `dismissed` | all | — | no |
| `pull_request_review_comment` | `created`, `edited`, `deleted` | all | — | no |
| `pull_request_target` | same 21 types as `pull_request` | `opened`, `synchronize`, `reopened` | `branches`, `branches-ignore`, `paths`, `paths-ignore` | yes (runs in base context) |
| `push` | — | n/a | `branches`, `branches-ignore`, `tags`, `tags-ignore`, `paths`, `paths-ignore` | no |
| `registry_package` | `published`, `updated` | all | — | yes |
| `release` | `published`, `unpublished`, `created`, `edited`, `deleted`, `prereleased`, `released` | all | — | n/a |
| `repository_dispatch` | custom `event_type` (any string) | n/a | `types` (matches `event_type`) | yes |
| `schedule` | — | n/a | `cron` | yes |
| `status` | — | n/a | — | yes |
| `watch` | `started` | all (only one) | — | yes |
| `workflow_call` | — | n/a | — | inherits from caller |
| `workflow_dispatch` | — | n/a | `inputs` (custom) | yes |
| `workflow_run` | `completed`, `requested`, `in_progress` | all | `workflows`, `branches`, `branches-ignore`, `types` | yes |

---

## Per-Event Reference

### `branch_protection_rule`
- **Trigger.** Someone creates, edits, or deletes a branch protection rule on the repo.
- **Activity types.** `created`, `edited`, `deleted`. Default = all three.
- **Filters.** None.
- **Payload highlights.** `action`, `rule` (the protection rule object), `changes` (for edits), `repository`, `sender`.
- **Gotchas.** Workflow file must exist on the default branch. `GITHUB_SHA` is the last commit on the default branch.

### `check_run`
- **Trigger.** A check run is created, completed, rerequested, or had a requested action.
- **Activity types.** `created`, `rerequested`, `completed`, `requested_action`. Default = all four.
- **Filters.** None.
- **Payload highlights.** `action`, `check_run` (id, name, status, conclusion, head_sha, html_url, output, app, check_suite), `requested_action` (only on `requested_action`).
- **Gotchas.** Default-branch-only. Recursion is suppressed: if the underlying check suite was created by Actions, this event will not fire.

### `check_suite`
- **Trigger.** A check suite finishes.
- **Activity types.** Only `completed` is supported. Default = `completed`.
- **Filters.** None.
- **Payload highlights.** `action`, `check_suite` (id, head_branch, head_sha, status, conclusion, pull_requests, app), `repository`, `sender`.
- **Gotchas.** Default-branch-only. Recursion suppressed when the suite was created by Actions or its head SHA is from an Actions-created commit.

### `create`
- **Trigger.** A Git branch or tag is created.
- **Activity types.** N/A.
- **Filters.** None (no `branches`/`tags` filter on this event).
- **Payload highlights.** `ref` (branch or tag name, **not** the full `refs/heads/...` form), `ref_type` (`branch` | `tag`), `master_branch`, `description`, `pusher_type`.
- **Gotchas.** No event when more than 3 tags are created in a single push. `GITHUB_REF` points at the new ref.

### `delete`
- **Trigger.** A Git branch or tag is deleted.
- **Activity types.** N/A.
- **Filters.** None.
- **Payload highlights.** `ref`, `ref_type` (`branch` | `tag`), `pusher_type`.
- **Gotchas.** Default-branch-only (workflow file must live on default branch). Suppressed when more than 3 tags are deleted at once.

### `deployment`
- **Trigger.** Someone creates a deployment (via the API or a third-party integration).
- **Activity types.** N/A — there are no `types:` activity values.
- **Filters.** None.
- **Payload highlights.** `deployment` (id, sha, ref, task, environment, payload, creator), `workflow` (nullable), `workflow_run` (nullable), `repository`, `sender`.
- **Gotchas.** Deployments created via the REST API may have a commit SHA but no Git ref. `GITHUB_SHA` is the deployment's SHA; `GITHUB_REF` is the deployment's ref if present.

### `deployment_status`
- **Trigger.** A third party (or another workflow) provides a status update on a deployment.
- **Activity types.** N/A.
- **Filters.** None.
- **Payload highlights.** `deployment_status` (state, environment, target_url, log_url, description, creator), `deployment`, `workflow_run` (nullable), `check_run` (nullable).
- **Gotchas.** Does **not** trigger when the new state is `inactive`. Filter on `github.event.deployment_status.state` to react to specific states (`success`, `failure`, `error`, `pending`, `in_progress`, `queued`).

### `discussion` (preview)
- **Trigger.** A repository discussion is created or modified.
- **Activity types.** `created`, `edited`, `deleted`, `transferred`, `pinned`, `unpinned`, `labeled`, `unlabeled`, `locked`, `unlocked`, `category_changed`, `answered`, `unanswered`. Default = all.
- **Filters.** None.
- **Payload highlights.** `action`, `discussion` (id, number, title, body, category, state, locked, answer_chosen_at, user), `label` / `answer` / `from` (depending on action).
- **Gotchas.** Public preview. Default-branch-only.

### `discussion_comment` (preview)
- **Trigger.** A comment on a discussion is created, edited, or deleted.
- **Activity types.** `created`, `edited`, `deleted`. Default = all.
- **Filters.** None.
- **Payload highlights.** `action`, `comment`, `discussion`.
- **Gotchas.** Public preview. Default-branch-only.

### `fork`
- **Trigger.** Someone forks the repository.
- **Activity types.** N/A.
- **Filters.** None.
- **Payload highlights.** `forkee` (the new fork repo), `repository`, `sender`.
- **Gotchas.** Default-branch-only.

### `gollum`
- **Trigger.** Someone creates or updates a Wiki page.
- **Activity types.** N/A.
- **Filters.** None.
- **Payload highlights.** `pages` (array; each has `page_name`, `title`, `summary`, `action` `created`/`edited`, `sha`, `html_url`).
- **Gotchas.** Default-branch-only.

### `issue_comment`
- **Trigger.** A comment on an issue **or pull request** is created, edited, or deleted. (PRs are issues at the API layer, so PR comments come through here, not through `pull_request_review_comment`.)
- **Activity types.** `created`, `edited`, `deleted`. Default = all.
- **Filters.** None.
- **Payload highlights.** `action`, `comment` (id, body, user, created_at, updated_at), `issue` (number, title, state, user, **`pull_request`** sub-object present only when this is a PR comment).
- **Gotchas.** Default-branch-only. To distinguish PR comments from issue comments, gate on `github.event.issue.pull_request != null`. Common pattern for `/command` style ChatOps.

### `issues`
- **Trigger.** An issue is created or modified.
- **Activity types.** `opened`, `edited`, `deleted`, `transferred`, `pinned`, `unpinned`, `closed`, `reopened`, `assigned`, `unassigned`, `labeled`, `unlabeled`, `locked`, `unlocked`, `milestoned`, `demilestoned`, `typed`, `untyped`. Default = all.
- **Filters.** None.
- **Payload highlights.** `action`, `issue` (number, title, body, state, labels, assignees, user, milestone), `assignee` / `label` / `milestone` / `changes` (depending on action).
- **Gotchas.** Default-branch-only. Note that `labeled` / `unlabeled` are activity types of the `issues` event; they are **distinct** from the standalone `label` event (which fires on label-definition changes at the repo level).

### `label`
- **Trigger.** A repository **label definition** is created, edited, or deleted (not application of a label to an issue/PR).
- **Activity types.** `created`, `edited`, `deleted`. Default = all.
- **Filters.** None.
- **Payload highlights.** `action`, `label` (id, name, color, default, description), `changes` (for edits).
- **Gotchas.** Default-branch-only. Don't confuse with `issues.labeled` / `pull_request.labeled`.

### `merge_group`
- **Trigger.** A pull request is added to a merge queue and the queue requests checks.
- **Activity types.** `checks_requested` is the only supported type. Default = `checks_requested`.
- **Filters.** None.
- **Payload highlights.** `action`, `merge_group` (head_sha, head_ref, base_sha, base_ref, head_commit).
- **Gotchas.** Required if you want your status checks to be evaluated against the queued combined commit before it's merged. A workflow that only listens to `pull_request` will **not** run for queued PRs — add `merge_group` if you need the check to satisfy required-status-check rules in merge queues. The `head_ref` looks like `refs/heads/gh-readonly-queue/main/pr-123-abc`.

### `milestone`
- **Trigger.** A milestone is created or modified.
- **Activity types.** `created`, `closed`, `opened`, `edited`, `deleted`. Default = all.
- **Filters.** None.
- **Payload highlights.** `action`, `milestone` (number, title, description, state, due_on, open_issues, closed_issues), `changes` (for edits).
- **Gotchas.** Default-branch-only. Distinct from `issues.milestoned` / `issues.demilestoned`.

### `page_build`
- **Trigger.** A push to the GitHub Pages publishing source branch.
- **Activity types.** N/A.
- **Filters.** None.
- **Payload highlights.** `id`, `build` (status, error, pusher, commit, duration, created_at, updated_at).
- **Gotchas.** Default-branch-only. Requires GitHub Pages to be enabled.

### `public`
- **Trigger.** The repository changes from private to public.
- **Activity types.** N/A.
- **Filters.** None.
- **Payload highlights.** `repository`, `sender`.
- **Gotchas.** Default-branch-only. Fires once per privacy-flip event.

### `pull_request`
- **Trigger.** Activity on a pull request — opens, updates, closes, label changes, review requests, etc.
- **Activity types.** `assigned`, `unassigned`, `labeled`, `unlabeled`, `opened`, `edited`, `closed`, `reopened`, `synchronize`, `converted_to_draft`, `locked`, `unlocked`, `enqueued`, `dequeued`, `milestoned`, `demilestoned`, `ready_for_review`, `review_requested`, `review_request_removed`, `auto_merge_enabled`, `auto_merge_disabled`. **Default (when `types:` is omitted) = `opened`, `synchronize`, `reopened` only** — this is one of the few events whose default is a subset.
- **Filters.** `branches`, `branches-ignore` (apply to the **base** branch, i.e. the target), `paths`, `paths-ignore`.
- **Payload highlights.**
  - `action` — the activity type that fired.
  - `number` — PR number.
  - `pull_request.head.ref` / `head.sha` / `head.repo` — source branch, source SHA, source repo (different repo for fork PRs).
  - `pull_request.base.ref` / `base.sha` / `base.repo` — target branch, target SHA, target repo.
  - `pull_request.merged` — bool, true once merged.
  - `pull_request.draft` — bool.
  - `pull_request.labels` — array of label objects.
  - `pull_request.user` — author.
  - `pull_request.requested_reviewers`, `pull_request.requested_teams`.
  - `pull_request.mergeable`, `pull_request.mergeable_state`, `pull_request.merge_commit_sha`.
  - `pull_request.changed_files`, `additions`, `deletions`, `commits`.
  - On `closed`: check `pull_request.merged` to distinguish merge from close-without-merge.
- **`GITHUB_REF` / `GITHUB_SHA`.** For an open, mergeable PR, `GITHUB_REF` = `refs/pull/<NUMBER>/merge` and `GITHUB_SHA` = the test-merge commit (head merged into base in a temporary commit). If the PR has merge conflicts the test-merge commit doesn't exist and the **workflow does not run** at all on the conflicted state.
- **Gotchas.**
  - **Forked PRs get a read-only token.** With the exception of `GITHUB_TOKEN`, repository secrets are **not** passed when the PR is from a fork; `GITHUB_TOKEN` is downgraded to read-only.
  - The `pull_request` webhook payload is empty for already-merged PRs and for PRs from forks in some sub-fields (use `head.repo.fork == true` to detect).
  - `synchronize` fires whenever the head branch is updated. Don't accidentally cancel the in-progress run unless you've set `concurrency` carefully.
  - Use `paths` to skip docs-only changes; use `paths-ignore` for the inverse. `paths` filters are evaluated against the diff between base and head.
  - To handle PR-closed-without-merge, gate on `if: github.event.pull_request.merged == false && github.event.action == 'closed'`.

### `pull_request_review`
- **Trigger.** A review is submitted, edited, or dismissed on a PR.
- **Activity types.** `submitted`, `edited`, `dismissed`. Default = all.
- **Filters.** None (no path/branch filter — gate inside the workflow).
- **Payload highlights.** `action`, `review` (id, body, state — `approved` / `changes_requested` / `commented` / `dismissed`, user, submitted_at), `pull_request`.
- **Gotchas.** Uses the merge branch (same as `pull_request`). Filter approvals with `if: github.event.review.state == 'approved'`.

### `pull_request_review_comment`
- **Trigger.** A comment on a specific line in a PR diff is created, edited, or deleted. (Distinct from general PR comments, which arrive on `issue_comment`.)
- **Activity types.** `created`, `edited`, `deleted`. Default = all.
- **Filters.** None.
- **Payload highlights.** `action`, `comment` (id, body, path, position, line, side, commit_id, user), `pull_request`.
- **Gotchas.** Uses the merge branch (same as `pull_request`).

### `pull_request_target`
- **Trigger.** Same as `pull_request`, but the workflow runs in the **context of the base branch** (target repo's default branch) instead of the PR's head.
- **Activity types.** Same 21 types as `pull_request`. Default = `opened`, `synchronize`, `reopened`.
- **Filters.** `branches`, `branches-ignore`, `paths`, `paths-ignore`.
- **Payload highlights.** Same as `pull_request`.
- **`GITHUB_REF` / `GITHUB_SHA`.** Both point at the **base branch** (default branch of the repo), not the merge ref. The PR head SHA is available as `github.event.pull_request.head.sha`.
- **Gotchas — read carefully.**
  - Designed for cases where you need access to repository secrets while still reacting to fork PRs (e.g. labelling, comment-bot replies, integration tests against trusted infra).
  - **Do not check out and execute untrusted PR head code on `pull_request_target`** without explicit safeguards. Doing so is a known supply-chain attack vector — the attacker's PR code would run with full repo secrets and a write token. The CodeQL/`actions/checkout` docs and GitHub Security Lab have written extensively on this; the guidance is to either avoid checking out the head, restrict to PRs from collaborators / specific labels, or run the untrusted job in a sandboxed environment.
  - Cache poisoning is also a documented risk: an attacker PR can mutate caches that the base branch later reads.

### `push`
- **Trigger.** A commit is pushed to a branch, a tag is pushed, or a repository is created from a template.
- **Activity types.** N/A.
- **Filters.** `branches`, `branches-ignore`, `tags`, `tags-ignore`, `paths`, `paths-ignore`. (Use `branches` **or** `tags`, not both — the filters are mutually exclusive in semantics; an event is either a branch push or a tag push.)
- **Payload highlights.**
  - `ref` — full ref, e.g. `refs/heads/main` or `refs/tags/v1.2.3`.
  - `before`, `after` — SHAs (use `before` to compute a diff for changed-files logic).
  - `commits` — array of commit objects (limited to ~20; use the API for >20).
  - `head_commit` — the most recent commit (often the one you care about).
  - `pusher`, `sender` — who pushed.
  - `forced` — true if force-push.
  - `created`, `deleted` — true on branch/tag creation or deletion (in which case `before` or `after` is `0000…`).
  - `compare` — URL to the compare view.
- **`GITHUB_REF` / `GITHUB_SHA`.** `GITHUB_REF` = the pushed ref (e.g. `refs/heads/main`); `GITHUB_SHA` = the tip commit (`after`).
- **Gotchas.**
  - No event fires when **more than 5,000 branches** are pushed at once, or when **more than 3 tags** are pushed at once (e.g. mass-tagging from a release script).
  - Branch deletion comes through here with `deleted: true` (rather than only via the `delete` event — the `delete` event will also fire).
  - When the repo is created from a template, an initial `push` is generated for the default branch.

### `registry_package`
- **Trigger.** A package is published or updated in GitHub Packages.
- **Activity types.** `published`, `updated`. Default = both.
- **Filters.** None.
- **Payload highlights.** `action`, `registry_package` (name, namespace, package_type, package_version, registry).
- **Gotchas.** Default-branch-only. Multi-architecture container images may fire the event multiple times (once per platform).

### `release`
- **Trigger.** A release is created, edited, published, etc.
- **Activity types.** `published`, `unpublished`, `created`, `edited`, `deleted`, `prereleased`, `released`. Default = all.
- **Filters.** None.
- **Payload highlights.** `action`, `release` (id, tag_name, target_commitish, name, body, draft, prerelease, created_at, published_at, assets, html_url, tarball_url, zipball_url, author).
- **Gotchas.**
  - `created` / `edited` / `deleted` do **not** fire for **draft** releases — use `published` to detect when a draft is promoted.
  - `published` fires for both stable releases and pre-releases. Use `prereleased` (only fires when prerelease=true at publish time) and `released` (only fires when prerelease=false) for finer control.

### `repository_dispatch`
- **Trigger.** A `POST /repos/{owner}/{repo}/dispatches` REST call (a manual webhook from outside the repo).
- **Activity types.** Not predefined — **`event_type` is custom**. The `types:` filter on this event matches against `event_type` strings:
  ```yaml
  on:
    repository_dispatch:
      types: [my-custom-event, deploy-staging]
  ```
- **Filters.** `types` (array of `event_type` strings to match — omit to match any).
- **Payload highlights.** `action` = the `event_type` value, `branch` = the target branch, `client_payload` = the user-supplied JSON body, `repository`, `sender`.
- **Gotchas.**
  - Default-branch-only: the workflow must live on the default branch.
  - `event_type` is capped at **100 characters**.
  - `client_payload` is capped at **10 top-level properties** and **65,535 characters** total.
  - Access via `github.event.client_payload.*` in expressions.

### `schedule`
- **Trigger.** A POSIX cron expression matches.
- **Activity types.** N/A.
- **Filters.** Cron + (optional) timezone (IANA, e.g. `America/New_York`). If timezone is omitted, UTC is used.
  ```yaml
  on:
    schedule:
      - cron: '*/15 * * * *'
  ```
- **Payload highlights.** `schedule` field contains the cron expression that fired. Most uses rely on `github.event.schedule` plus repo/ref context rather than payload data.
- **`GITHUB_REF` / `GITHUB_SHA`.** Both pin to the default branch and its tip commit.
- **Gotchas.**
  - **Minimum interval is 5 minutes.** Shorter expressions are silently coalesced.
  - High platform load can delay scheduled runs by several minutes; do not assume punctuality.
  - In **public** repositories, scheduled workflows are **automatically disabled after 60 days of repository inactivity**. Push any commit to re-enable, or set up a humansy nudge.
  - DST: during spring-forward, schedules in skipped local hours advance to the next valid time; during fall-back, schedules can fire twice. Consider sticking to UTC unless you have a strong reason.
  - Default-branch-only.

### `status`
- **Trigger.** A Git commit status changes (legacy commit-status API, separate from check runs).
- **Activity types.** N/A.
- **Filters.** None — gate inside the workflow on `github.event.state`.
- **Payload highlights.** `id`, `sha`, `state` (`pending` | `success` | `failure` | `error`), `description`, `target_url`, `context`, `commit`, `branches`.
- **Gotchas.** Default-branch-only.

### `watch`
- **Trigger.** Someone stars (or unstars, in some payload semantics) the repo. Only `started` is wired up for Actions.
- **Activity types.** `started` (the only supported type).
- **Filters.** None.
- **Payload highlights.** `action: started`, `sender`, `repository`.
- **Gotchas.** Default-branch-only. The name is historical (originally "watch" meant "subscribe" before stars existed).

### `workflow_call`
- **Trigger.** Another workflow calls this one as a reusable workflow via `uses: org/repo/.github/workflows/wf.yml@ref`.
- **Activity types.** N/A.
- **Filters.** None — instead, declare `inputs:`, `outputs:`, and `secrets:` schemas under `on.workflow_call`.
- **Payload highlights.** The event payload, `GITHUB_REF`, and `GITHUB_SHA` are **inherited from the calling workflow** unchanged. Inputs are accessible via `inputs.*` (typed) or `github.event.inputs.*`.
- **Gotchas.**
  - Reusable workflows can declare strongly-typed `inputs`, `outputs`, and `secrets` (including `secrets: inherit` from the caller).
  - Calling depth is limited to a chain of 4 workflows total (caller + 3 nested calls); also subject to a max of 20 unique reusable workflows referenced in a tree.

### `workflow_dispatch`
- **Trigger.** A user manually triggers the workflow via the Actions UI, REST/GraphQL API, or `gh workflow run`.
- **Activity types.** N/A.
- **Filters.** None at event level. Define typed `inputs` under `on.workflow_dispatch`.
- **Payload highlights.** `inputs` (the user-supplied input map), `ref` (the branch/tag the dispatch was filed against), `workflow` (the workflow filename).
- **Inputs syntax.**
  ```yaml
  on:
    workflow_dispatch:
      inputs:
        log_level:
          type: choice
          options: [debug, info, warn]
          default: info
        environment:
          type: environment
        force:
          type: boolean
          default: false
        version:
          type: string
        retries:
          type: number
  ```
  Supported types: `string` (default if omitted), `boolean`, `choice` (with `options:`), `environment` (renders environment picker), `number`.
- **Where inputs land.** Both `inputs.*` and `github.event.inputs.*`. The two contexts are identical **except** `inputs.*` preserves booleans and numbers as their native types, while `github.event.inputs.*` stringifies them. Prefer `inputs.*` in conditionals.
- **`GITHUB_REF` / `GITHUB_SHA`.** Set to the branch or tag the user picked when dispatching, and that ref's tip commit.
- **Gotchas.**
  - Default-branch-only for the workflow definition: the workflow must exist on the default branch to appear in the UI's run-workflow picker. (You can dispatch any branch the workflow has been merged onto, but discovery happens via the default branch.)
  - Maximum **25 top-level inputs** per workflow.
  - Maximum **65,535 characters** total in the dispatch inputs payload.

### `workflow_run`
- **Trigger.** Another workflow run is requested, starts, or completes.
- **Activity types.** `completed`, `requested`, `in_progress`. Default = all three.
- **Filters.** `workflows` (list of workflow names or filenames to match), `branches`, `branches-ignore`, `types`. Example:
  ```yaml
  on:
    workflow_run:
      workflows: ["CI"]
      types: [completed]
      branches: [main]
  ```
- **Payload highlights.** `action`, `workflow_run.id`, `workflow_run.name`, `workflow_run.head_branch`, `workflow_run.head_sha`, `workflow_run.event` (the event that triggered the upstream workflow — useful for routing), `workflow_run.status`, `workflow_run.conclusion` (`success` | `failure` | `cancelled` | `skipped` | `timed_out` | `action_required` | `neutral`), `workflow_run.run_number`, `workflow_run.workflow_id`, `workflow_run.pull_requests`, `workflow_run.actor`.
- **Gotchas.**
  - Default-branch-only: the listening workflow must live on the default branch.
  - **Chaining limit:** you cannot chain more than three levels via `workflow_run`. In a chain `A → B → C → D → E → F`, only `A`, `B`, `C`, `D` will run; `E` and `F` are dropped.
  - The triggered workflow has access to the upstream run's artifacts via the API (often used for "comment on the PR after CI finishes" patterns where the upstream ran on `pull_request` from a fork with a read-only token).
  - Filter on `github.event.workflow_run.event == 'pull_request'` to scope to PR-driven upstream runs.

---

## Cross-Cutting Rules

### Default activity types

Per event docs, omitting `types:` triggers on **all** listed activity types **except** for `pull_request` and `pull_request_target`, which default to `opened`, `synchronize`, `reopened` only. If you want to trigger on (say) `labeled` PRs, you must list types explicitly:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
```

### Default-branch-only events

Many events fire only when the workflow file lives on the repository's default branch, and `GITHUB_SHA` for those runs is the default branch tip. The full list (per the docs):

`branch_protection_rule`, `check_run`, `check_suite`, `delete`, `discussion`, `discussion_comment`, `fork`, `gollum`, `issue_comment`, `issues`, `label`, `milestone`, `page_build`, `public`, `registry_package`, `repository_dispatch`, `schedule`, `status`, `watch`, `workflow_dispatch`, `workflow_run`.

`pull_request` is a notable exception — the head branch's copy of the workflow is what runs (which is part of why the fork-PR security model exists).

### Fork PR token & secret restrictions

For `pull_request` events from forked repositories:

- **Repository secrets are not exposed** to the workflow (with the sole exception of `GITHUB_TOKEN`).
- **`GITHUB_TOKEN` is downgraded to read-only** (no write to issues, comments, contents, etc.).
- The `pull_request` webhook payload may be empty or missing fields when the PR has been merged or comes from a fork.

The escape hatch for trusted-context work (commenting on PRs, posting build artifacts, etc.) is `pull_request_target`, but that comes with its own security caveats — see below.

### `pull_request_target` security model

- Runs in the **base** repository's context with full secrets and a read-write `GITHUB_TOKEN`.
- The event payload still describes the (potentially malicious) PR head.
- **Critical hazard:** if you `actions/checkout` the PR head and then run any code from it (build scripts, lint configs, even `package.json` install hooks), you have given attacker code access to your secrets and write-token. Mitigations: don't check out head; require collaborator approval; require a label; or quarantine head-code execution to a job with `permissions: {}` and no secrets.
- Cache poisoning is a related risk — actions/cache writes from `pull_request_target` runs are visible to base-branch runs.

### `workflow_run` nesting limit

You cannot chain more than three `workflow_run` hops. After three levels of indirection further triggers are dropped silently.

### `repository_dispatch` event_type and client_payload

- `event_type`: arbitrary string (max 100 chars). Use `types:` filter to match. Surfaced as `github.event.action`.
- `client_payload`: arbitrary JSON object, max 10 top-level keys, max 65,535 chars total. Surfaced as `github.event.client_payload`.

```yaml
on:
  repository_dispatch:
    types: [deploy-prod]
jobs:
  deploy:
    steps:
      - run: echo "version=${{ github.event.client_payload.version }}"
```

### `workflow_dispatch` inputs

- Defined under `on.workflow_dispatch.inputs`. Supported `type:` values: `string` (default), `boolean`, `number`, `choice` (with `options:`), `environment`.
- Available to the workflow as both `inputs.*` (typed) and `github.event.inputs.*` (string-coerced).
- Limits: max **25** top-level inputs; max **65,535** characters total payload.
- The dispatcher chooses the ref to run against; that ref becomes `GITHUB_REF`.

### `GITHUB_REF` / `GITHUB_SHA` — quick map

| Event | `GITHUB_REF` | `GITHUB_SHA` |
|---|---|---|
| `push` (branch) | `refs/heads/<branch>` | tip commit pushed |
| `push` (tag) | `refs/tags/<tag>` | tagged commit |
| `pull_request` | `refs/pull/<N>/merge` | test-merge commit (head merged into base) |
| `pull_request_target` | default branch ref | default branch tip |
| `release` | `refs/tags/<tag>` of the release | release tag commit |
| `create` / `delete` | the ref created/deleted | last commit on it (for create) |
| `schedule` | default branch ref | default branch tip |
| `workflow_dispatch` | the dispatched ref | that ref's tip commit |
| `repository_dispatch` | default branch ref | default branch tip |
| `workflow_call` | inherited from caller | inherited from caller |
| `workflow_run` | default branch ref | default branch tip (use `github.event.workflow_run.head_sha` for the upstream commit) |

### Manual dispatch inputs payload location

Inputs to `workflow_dispatch` and `workflow_call` are accessible at:

- `inputs.<name>` — preferred; preserves type (boolean/number/string).
- `github.event.inputs.<name>` — legacy; everything is a string. Available only for `workflow_dispatch`, not `workflow_call`.

### Aliases / pitfalls

- **`pull_request_comment`** is **not** a real event. It's a name people use informally for comments on PRs; the actual event is `issue_comment` (gated on `github.event.issue.pull_request != null`).
- `issues.labeled` (activity type of `issues` event) ≠ `label` event (label-definition CRUD).
- `issues.milestoned` (activity type) ≠ `milestone` event (milestone CRUD).
- `pull_request.labeled` is **not** in the default types — you must opt in with `types: [labeled]`.

---

## Sources

- https://docs.github.com/en/actions/reference/events-that-trigger-workflows — primary reference for Actions triggering events, activity types, filters, and per-event gotchas.
- https://docs.github.com/en/webhooks/webhook-events-and-payloads — underlying webhook payload schemas; Actions events mirror these except for `schedule`, `workflow_dispatch`, `workflow_call`, and the synthetic merge ref behavior of `pull_request`.
- https://docs.github.com/en/actions/using-workflows/reusing-workflows — reusable workflow input/output/secret schemas (`workflow_call`).
- https://docs.github.com/en/actions/security-guides/automatic-token-authentication — `GITHUB_TOKEN` permissions, including read-only downgrade for fork PRs.
- https://docs.github.com/en/actions/managing-workflow-runs/manually-running-a-workflow — `workflow_dispatch` UI/CLI behavior.
- https://securitylab.github.com/research/github-actions-preventing-pwn-requests/ — `pull_request_target` attack surface (referenced for the cache-poisoning / head-checkout warning).
