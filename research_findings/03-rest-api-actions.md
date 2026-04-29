# GitHub REST API: Actions Reference

A complete reference for the GitHub REST API endpoints in the **Actions** namespace, covering every sub-category at `https://docs.github.com/en/rest/actions/*` plus Actions-adjacent endpoints (repository dispatch).

All endpoints below are relative to `https://api.github.com`. All endpoints accept `Accept: application/vnd.github+json` and the `X-GitHub-Api-Version: 2022-11-28` header. Pagination, where supported, uses `per_page` (default 30, max 100) and `page` (default 1) query parameters and follows GitHub's standard `Link` header convention.

Permissions glossary:
- **Classic PAT scopes**: `repo`, `admin:org`, `admin:enterprise`, `read:org`, `manage_runners:org`, `manage_runners:enterprise`.
- **Fine-grained PAT / GITHUB_TOKEN permissions**: typically `actions: read|write`, `administration: read|write`, `secrets: read|write`, `variables: read|write`, `organization_secrets: read|write`, `organization_self_hosted_runners: read|write`, `deployments: read|write`, `metadata: read`.

---

## Table of Contents

1. [Workflows](#1-workflows)
2. [Workflow Runs](#2-workflow-runs)
3. [Workflow Jobs](#3-workflow-jobs)
4. [Artifacts](#4-artifacts)
5. [Cache](#5-cache)
6. [Permissions](#6-permissions)
7. [Secrets](#7-secrets)
8. [Variables](#8-variables)
9. [Self-hosted Runners](#9-self-hosted-runners)
10. [Self-hosted Runner Groups](#10-self-hosted-runner-groups)
11. [GitHub-hosted (larger) Runners](#11-github-hosted-larger-runners)
12. [OIDC](#12-oidc)
13. [Repository Dispatch](#13-repository-dispatch)
14. [Notable cross-cutting behaviors](#14-notable-cross-cutting-behaviors)
15. [Sources](#15-sources)

---

## 1. Workflows

The "workflow" resource is the YAML file checked into `.github/workflows/`. `workflow_id` accepts either the numeric workflow ID or the file name (e.g. `main.yml`).

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/repos/{owner}/{repo}/actions/workflows` | List workflows in repo |
| 2 | GET | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}` | Get a single workflow |
| 3 | PUT | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable` | Disable a workflow |
| 4 | POST | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` | Trigger `workflow_dispatch` |
| 5 | PUT | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable` | Enable a workflow |
| 6 | GET | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/timing` | Workflow billable time (deprecating) |
| 7 | GET | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs` | List runs for a workflow |

### 1.1 List repository workflows

- Path: `GET /repos/{owner}/{repo}/actions/workflows`
- Permission: classic `repo` (private), `actions: read` fine-grained.
- Query: `per_page` (int, default 30, max 100), `page` (int, default 1).
- Response 200:
  ```json
  {
    "total_count": 2,
    "workflows": [
      {
        "id": 161335,
        "node_id": "MDg6V29ya2Zsb3cxNjEzMzU=",
        "name": "CI",
        "path": ".github/workflows/blank.yml",
        "state": "active",
        "created_at": "2020-01-08T23:48:37.000-08:00",
        "updated_at": "2020-01-08T23:50:21.000-08:00",
        "url": "https://api.github.com/...",
        "html_url": "https://github.com/...",
        "badge_url": "https://github.com/.../workflows/CI/badge.svg"
      }
    ]
  }
  ```
- Org/enterprise: not directly; aggregate via repo iteration.

### 1.2 Get a workflow

- Path: `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}`
- Permission: `actions: read`.
- Response 200: a single Workflow object as in 1.1.
- `workflow_id` may be the file name (e.g. `ci.yml`).

### 1.3 Disable / Enable a workflow

- Disable: `PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable` → 204.
- Enable:  `PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable` → 204.
- Permission: `actions: write`.
- Disabling sets state to `disabled_manually`; enabling sets `active`. A disabled workflow is also auto-set when not run for 60 days on inactive forks.

### 1.4 Create a workflow dispatch event

- Path: `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
- Permission: `actions: write`. Workflow must declare `on: workflow_dispatch:`.
- Body:
  ```json
  {
    "ref": "main",
    "inputs": {
      "name": "Mona",
      "favorite_food": "pizza"
    }
  }
  ```
  - `ref` (string, required): branch or tag.
  - `inputs` (object, optional): up to 10 top-level keys for `workflow_dispatch`; values are strings, choices, booleans, or numbers per the workflow's `inputs:` schema.
- Response: **204 No Content** (no body, no run ID returned synchronously). Some OpenAPI extracts list a 200 with `workflow_run_id`; in production this endpoint historically returns 204 — discover the run via list workflow runs filtered by `event=workflow_dispatch` and `head_sha`/`actor`.
- Notable: there is a subtle race — the run does not exist immediately after 204; poll runs list briefly.

### 1.5 Get workflow usage (timing)

- Path: `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/timing` → 200.
- Permission: `actions: read`.
- Response: `billable.UBUNTU.total_ms`, `billable.MACOS.total_ms`, `billable.WINDOWS.total_ms`. Deprecating; reflects current billing cycle.

### 1.6 List workflow runs for a workflow

- Path: `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs`
- Permission: `actions: read`.
- Query: same set as [list workflow runs](#21-list-workflow-runs-for-a-repository).

---

## 2. Workflow Runs

A workflow **run** is a single execution. Re-runs spawn run **attempts** under the same `run_id`.

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/repos/{owner}/{repo}/actions/runs` | List runs for repo (with filters) |
| 2 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}` | Get a run |
| 3 | DELETE | `/repos/{owner}/{repo}/actions/runs/{run_id}` | Delete a run |
| 4 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/approvals` | Get review history |
| 5 | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/approve` | Approve fork-PR run |
| 6 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts` | List artifacts for a run |
| 7 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}` | Get a run attempt |
| 8 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs` | List jobs for attempt |
| 9 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/logs` | Download attempt logs (302) |
| 10 | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/cancel` | Cancel a run |
| 11 | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/deployment_protection_rule` | Custom deployment protection rule decision |
| 12 | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/force-cancel` | Force-cancel (bypass `always()`) |
| 13 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/jobs` | List jobs for run |
| 14 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/logs` | Download run logs (302) |
| 15 | DELETE | `/repos/{owner}/{repo}/actions/runs/{run_id}/logs` | Delete run logs |
| 16 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments` | List pending deployment reviewers |
| 17 | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments` | Approve/reject pending deployments |
| 18 | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/rerun` | Re-run all jobs |
| 19 | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs` | Re-run failed jobs |
| 20 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/timing` | Run usage / duration |

### 2.1 List workflow runs for a repository

- Path: `GET /repos/{owner}/{repo}/actions/runs`
- Permission: `actions: read`.
- Query parameters:

| Param | Type | Default | Description |
|---|---|---|---|
| `actor` | string | — | Filter by login of triggering user |
| `branch` | string | — | Filter by branch name |
| `event` | string | — | Filter by triggering event (`push`, `pull_request`, `workflow_dispatch`, `schedule`, etc.) |
| `status` | string | — | One of `completed`, `action_required`, `cancelled`, `failure`, `neutral`, `skipped`, `stale`, `success`, `timed_out`, `in_progress`, `queued`, `requested`, `waiting`, `pending` |
| `per_page` | int | 30 | Max 100 |
| `page` | int | 1 | |
| `created` | string | — | Date or date-range (`>=2024-01-01`, `2024-01-01..2024-02-01`) |
| `exclude_pull_requests` | bool | false | Drop the `pull_requests` field for performance |
| `check_suite_id` | int | — | Filter by associated check suite |
| `head_sha` | string | — | Filter by head commit SHA |

- Response 200: `{ "total_count": N, "workflow_runs": [WorkflowRun, ...] }`. Capped at the most recent 1000 runs across pages.

### 2.2 Get a workflow run

- `GET /repos/{owner}/{repo}/actions/runs/{run_id}` → 200 with WorkflowRun object.
- Query: `exclude_pull_requests` (bool, default false).

### 2.3 Delete a workflow run

- `DELETE /repos/{owner}/{repo}/actions/runs/{run_id}` → 204.
- Permission: `actions: write`.

### 2.4 Get review history

- `GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals` → 200, array of `EnvironmentApproval { state, comment, environments[], user, ... }`.

### 2.5 Approve a workflow run for a fork PR

- `POST /repos/{owner}/{repo}/actions/runs/{run_id}/approve` → 201.
- For runs blocked by "approval required for first-time contributors" or org-fork-PR policy.

### 2.6 Workflow run attempts

- `GET .../runs/{run_id}/attempts/{attempt_number}` → 200, WorkflowRun for that attempt; supports `exclude_pull_requests`.
- `GET .../runs/{run_id}/attempts/{attempt_number}/jobs` → 200, paginated jobs for attempt.
- `GET .../runs/{run_id}/attempts/{attempt_number}/logs` → **302 Found**, `Location` header points at a short-lived (≈1 min) signed download URL for a ZIP.
- There is **no separate "list attempts" endpoint**; the run object's `run_attempt` field tells you the latest, and you walk attempt numbers `1..run_attempt`.

### 2.7 Cancel / force-cancel

- `POST .../runs/{run_id}/cancel` → 202; 409 if not cancelable.
- `POST .../runs/{run_id}/force-cancel` → 202; bypasses `if: always()` and other `cancelled()` guards. Use when normal cancel hangs.

### 2.8 Logs

- `GET .../runs/{run_id}/logs` → **302** redirect to ZIP archive of all job logs (1-minute signed URL).
- `DELETE .../runs/{run_id}/logs` → 204; permanently deletes log archive.

### 2.9 Pending deployments (manual environment approvals)

- `GET .../runs/{run_id}/pending_deployments` → 200, array of `PendingDeployment { environment, wait_timer, wait_timer_started_at, current_user_can_approve, reviewers[] }`.
- `POST .../runs/{run_id}/pending_deployments`:
  ```json
  {
    "environment_ids": [161088],
    "state": "approved",
    "comment": "LGTM"
  }
  ```
  `state` is `approved` or `rejected`. Returns array of `Deployment` objects.

### 2.10 Custom deployment protection rule callback

- `POST .../runs/{run_id}/deployment_protection_rule`:
  ```json
  {
    "environment_name": "production",
    "state": "approved",
    "comment": "Passed checks"
  }
  ```
- Used by **GitHub Apps** implementing custom deployment-protection rules. Returns 204.

### 2.11 Re-run

- `POST .../runs/{run_id}/rerun` (all jobs).
- `POST .../runs/{run_id}/rerun-failed-jobs` (only failed/required-failed dependents).
- Body: `{ "enable_debug_logging": false }` (optional). Both return 201 and create a new attempt.

### 2.12 Run usage / timing

- `GET .../runs/{run_id}/timing` → 200:
  ```json
  {
    "billable": {
      "UBUNTU": { "total_ms": 180000, "jobs": 1, "job_runs": [{ "job_id": 1, "duration_ms": 180000 }] }
    },
    "run_duration_ms": 180000
  }
  ```

---

## 3. Workflow Jobs

A **job** is one step-group within a workflow run — typically one runner.

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/repos/{owner}/{repo}/actions/jobs/{job_id}` | Get a single job |
| 2 | GET | `/repos/{owner}/{repo}/actions/jobs/{job_id}/logs` | Download job logs (302) |
| 3 | POST | `/repos/{owner}/{repo}/actions/jobs/{job_id}/rerun` | Re-run a single job (with deps) |
| 4 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/jobs` | List jobs for run |
| 5 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs` | List jobs for attempt |

### 3.1 Get a job

- `GET /repos/{owner}/{repo}/actions/jobs/{job_id}` → 200.
- Permission: `actions: read`.
- Key response fields: `id`, `run_id`, `run_attempt`, `node_id`, `head_sha`, `url`, `html_url`, `status` (`queued`/`in_progress`/`completed`), `conclusion`, `created_at`, `started_at`, `completed_at`, `name`, `steps[]` (each with `name`, `status`, `conclusion`, `number`, `started_at`, `completed_at`), `runner_id`, `runner_name`, `runner_group_id`, `runner_group_name`, `workflow_name`, `head_branch`, `labels[]`.

### 3.2 Download job logs

- `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` → **302** redirect to plain-text log file. Signed URL valid ≈1 minute.
- Permission: `actions: read`.

### 3.3 Re-run a job

- `POST /repos/{owner}/{repo}/actions/jobs/{job_id}/rerun` → 201; 403 if run is archived.
- Body: `{ "enable_debug_logging": false }` (optional).
- Re-runs the specified job AND all jobs whose `needs:` graph depends on it.

### 3.4 List jobs for a run / attempt

- `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`
  - Query: `filter` ∈ `{latest, all}` (default `latest` — only most recent attempt's jobs); `per_page`, `page`.
- `GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs`
  - Query: `per_page`, `page`.
- Both → 200 `{ "total_count": N, "jobs": [Job, ...] }`.

---

## 4. Artifacts

Build artifacts are uploaded by `actions/upload-artifact` and persist 90 days by default (configurable via repo/org/enterprise retention setting).

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/repos/{owner}/{repo}/actions/artifacts` | List repo artifacts |
| 2 | GET | `/repos/{owner}/{repo}/actions/artifacts/{artifact_id}` | Get artifact |
| 3 | DELETE | `/repos/{owner}/{repo}/actions/artifacts/{artifact_id}` | Delete artifact |
| 4 | GET | `/repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}` | Download (302) |
| 5 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts` | List a run's artifacts |

### 4.1 List repo artifacts

- Query: `per_page`, `page`, `name` (exact-match filter on artifact name).
- Response: `{ total_count, artifacts: [Artifact, ...] }` where Artifact has `id`, `node_id`, `name`, `size_in_bytes`, `url`, `archive_download_url`, `expired` (bool), `created_at`, `updated_at`, `expires_at`, `digest`, `workflow_run { id, repository_id, head_repository_id, head_branch, head_sha }`.

### 4.2 Get / Delete

- Get: 200 with Artifact object.
- Delete: 204. Permission: `actions: write`.

### 4.3 Download

- `GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}` → **302**. `archive_format` MUST be `zip` (only supported value). Signed URL valid 1 minute. Returns 410 if the artifact has expired.

### 4.4 List run artifacts

- Query: `per_page`, `page`, `name`, `direction` (`asc`|`desc`, default `desc`).

---

## 5. Cache

Powers `actions/cache`. Caches are keyed by `(repo, key, version, ref)` and evicted when the per-repo limit (default 10 GB) is reached.

### 5.1 Repository

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/repos/{owner}/{repo}/actions/cache/usage` | Repo usage summary |
| 2 | GET | `/repos/{owner}/{repo}/actions/caches` | List caches |
| 3 | DELETE | `/repos/{owner}/{repo}/actions/caches?key=...&ref=...` | Delete by key (+ optional ref) |
| 4 | DELETE | `/repos/{owner}/{repo}/actions/caches/{cache_id}` | Delete by id |
| 5 | GET/PUT | `/repos/{owner}/{repo}/actions/cache/retention-limit` | Get/set retention days |
| 6 | GET/PUT | `/repos/{owner}/{repo}/actions/cache/storage-limit` | Get/set storage GB |

#### List caches `GET /repos/{owner}/{repo}/actions/caches`

- Query: `per_page`, `page`, `ref` (e.g. `refs/heads/main`), `key` (full key or prefix), `sort` ∈ `{created_at, last_accessed_at, size_in_bytes}` (default `last_accessed_at`), `direction` ∈ `{asc, desc}` (default `desc`).
- Response: `{ total_count, actions_caches: [{ id, ref, key, version, last_accessed_at, created_at, size_in_bytes }] }`.

#### Delete by key

- `DELETE /repos/{owner}/{repo}/actions/caches?key={key}&ref={ref}` returns the list of deleted entries.

### 5.2 Organization

| Method | Path | Permission |
|---|---|---|
| GET | `/orgs/{org}/actions/cache/usage` | `read:org` |
| GET | `/orgs/{org}/actions/cache/usage-by-repository` | `read:org` |
| GET/PUT | `/organizations/{org}/actions/cache/retention-limit` | `admin:organization` |
| GET/PUT | `/organizations/{org}/actions/cache/storage-limit` | `admin:organization` |

`usage-by-repository` paginates `{ total_count, repository_cache_usages: [{ full_name, active_caches_size_in_bytes, active_caches_count }] }`.

### 5.3 Enterprise

| Method | Path | Permission |
|---|---|---|
| GET/PUT | `/enterprises/{enterprise}/actions/cache/retention-limit` | `admin:enterprise` |
| GET/PUT | `/enterprises/{enterprise}/actions/cache/storage-limit` | `admin:enterprise` |

Body for retention-limit PUT: `{ "max_cache_retention_days": 30 }`. For storage-limit PUT: `{ "max_cache_size_gb": 50 }`.

---

## 6. Permissions

Controls what Actions can run, what tokens can do, and which fork-PR rules apply.

### 6.1 Organization-level

| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/orgs/{org}/actions/permissions` | Top-level policy: `enabled_repositories`, `allowed_actions`, `sha_pinning_required` |
| GET / PUT | `/orgs/{org}/actions/permissions/repositories` | List/replace repos enabled for Actions (when `enabled_repositories=selected`) |
| PUT / DELETE | `/orgs/{org}/actions/permissions/repositories/{repository_id}` | Add/remove single repo |
| GET / PUT | `/orgs/{org}/actions/permissions/selected-actions` | `github_owned_allowed`, `verified_allowed`, `patterns_allowed` |
| GET / PUT | `/orgs/{org}/actions/permissions/workflow` | `default_workflow_permissions` (`read`/`write`), `can_approve_pull_request_reviews` (bool) |
| GET / PUT | `/orgs/{org}/actions/permissions/artifact-and-log-retention` | `days`, `maximum_allowed_days` |
| GET / PUT | `/orgs/{org}/actions/permissions/fork-pr-contributor-approval` | `approval_policy` (`first_time_contributors_new_to_github`, `first_time_contributors`, `all_external_contributors`) |
| GET / PUT | `/orgs/{org}/actions/permissions/fork-pr-workflows-private-repos` | Body: `run_workflows_from_fork_pull_requests`, `send_write_tokens_to_workflows`, `send_secrets_and_variables`, `require_approval_for_fork_pr_workflows` |
| GET / PUT | `/orgs/{org}/actions/permissions/self-hosted-runners` | `enabled_repositories` policy for self-hosted runner access |
| GET / PUT | `/orgs/{org}/actions/permissions/self-hosted-runners/repositories` | Selected repos with self-hosted runner access |
| PUT / DELETE | `/orgs/{org}/actions/permissions/self-hosted-runners/repositories/{repository_id}` | Add/remove single repo |

Permission: `admin:org` (some additionally accept fine-grained "Actions policies" permission). All PUT 204.

#### Example: set workflow permissions

```http
PUT /orgs/myorg/actions/permissions/workflow
{
  "default_workflow_permissions": "read",
  "can_approve_pull_request_reviews": false
}
```

#### Example: allowed actions

```http
PUT /orgs/myorg/actions/permissions/selected-actions
{
  "github_owned_allowed": true,
  "verified_allowed": true,
  "patterns_allowed": ["docker/*", "octo-org/*@*"]
}
```

### 6.2 Repository-level

| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/repos/{owner}/{repo}/actions/permissions` | `enabled` (bool), `allowed_actions`, `sha_pinning_required` |
| GET / PUT | `/repos/{owner}/{repo}/actions/permissions/access` | `access_level` (`none`/`organization`/`enterprise`) — controls who outside the repo can use its actions/reusable workflows |
| GET / PUT | `/repos/{owner}/{repo}/actions/permissions/selected-actions` | Same shape as org |
| GET / PUT | `/repos/{owner}/{repo}/actions/permissions/workflow` | Same shape as org |
| GET / PUT | `/repos/{owner}/{repo}/actions/permissions/artifact-and-log-retention` | Same shape as org |
| GET / PUT | `/repos/{owner}/{repo}/actions/permissions/fork-pr-contributor-approval` | Same shape as org |
| GET / PUT | `/repos/{owner}/{repo}/actions/permissions/fork-pr-workflows-private-repos` | Same shape as org |

Permission: `repo` (classic) or `administration: write` (fine-grained).

---

## 7. Secrets

Encrypted via libsodium sealed boxes against the appropriate `public-key`. Secrets are write-only via API; values cannot be read back.

Common body for create-or-update:
```json
{
  "encrypted_value": "<base64 sealed-box ciphertext>",
  "key_id": "568250167242549743",
  "visibility": "selected",
  "selected_repository_ids": [1296269, 1296270]
}
```
`visibility` and `selected_repository_ids` apply only at org level.

### 7.1 Organization

| Method | Path | Purpose |
|---|---|---|
| GET | `/orgs/{org}/actions/secrets` | List org secrets |
| GET | `/orgs/{org}/actions/secrets/public-key` | Get org public key (encryption) |
| GET | `/orgs/{org}/actions/secrets/{secret_name}` | Get secret metadata |
| PUT | `/orgs/{org}/actions/secrets/{secret_name}` | Create or update |
| DELETE | `/orgs/{org}/actions/secrets/{secret_name}` | Delete |
| GET | `/orgs/{org}/actions/secrets/{secret_name}/repositories` | List selected repos |
| PUT | `/orgs/{org}/actions/secrets/{secret_name}/repositories` | Replace selected repos (`{ "selected_repository_ids": [...] }`) |
| PUT/DELETE | `/orgs/{org}/actions/secrets/{secret_name}/repositories/{repository_id}` | Add/remove single repo |

Permission: `admin:org` + `secrets` write fine-grained.

### 7.2 Repository

| Method | Path | Purpose |
|---|---|---|
| GET | `/repos/{owner}/{repo}/actions/organization-secrets` | List org secrets visible to repo |
| GET | `/repos/{owner}/{repo}/actions/secrets` | List repo secrets |
| GET | `/repos/{owner}/{repo}/actions/secrets/public-key` | Get public key |
| GET / PUT / DELETE | `/repos/{owner}/{repo}/actions/secrets/{secret_name}` | Get/Create-Update/Delete |

Permission: `repo` + `secrets` write fine-grained.

### 7.3 Environment

| Method | Path |
|---|---|
| GET | `/repos/{owner}/{repo}/environments/{environment_name}/secrets` |
| GET | `/repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key` |
| GET / PUT / DELETE | `/repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}` |

PUT body: `{ "encrypted_value": "...", "key_id": "..." }`. URL-encode `environment_name`.

### 7.4 Encryption flow

1. `GET .../public-key` → `{ key_id, key }` (key is base64 Curve25519 public key).
2. Encrypt `value` with libsodium `crypto_box_seal(key)`; base64 the ciphertext.
3. `PUT` the secret with `encrypted_value` + `key_id`.

201 = created, 204 = updated. `visibility` ∈ `{all, private, selected}` (org only).

---

## 8. Variables

Same shape as secrets but **plaintext** and PATCH (not PUT) for updates. Useful for non-sensitive configuration.

### 8.1 Organization

| Method | Path | Notes |
|---|---|---|
| GET | `/orgs/{org}/actions/variables` | List |
| POST | `/orgs/{org}/actions/variables` | Create. Body: `name`, `value`, `visibility` ∈ `{all, private, selected}`, `selected_repository_ids[]` |
| GET | `/orgs/{org}/actions/variables/{name}` | Get |
| PATCH | `/orgs/{org}/actions/variables/{name}` | Update (any of `name`, `value`, `visibility`, `selected_repository_ids`) |
| DELETE | `/orgs/{org}/actions/variables/{name}` | Delete (204) |
| GET / PUT | `/orgs/{org}/actions/variables/{name}/repositories` | List/replace selected repos |
| PUT / DELETE | `/orgs/{org}/actions/variables/{name}/repositories/{repository_id}` | Add/remove single |

`409 Conflict` when manipulating selected-repo lists if visibility is not `selected`.

### 8.2 Repository

| Method | Path |
|---|---|
| GET | `/repos/{owner}/{repo}/actions/organization-variables` |
| GET / POST | `/repos/{owner}/{repo}/actions/variables` |
| GET / PATCH / DELETE | `/repos/{owner}/{repo}/actions/variables/{name}` |

POST/PATCH body: `{ "name": "USER_NAME", "value": "octocat" }`.

### 8.3 Environment

| Method | Path |
|---|---|
| GET / POST | `/repos/{owner}/{repo}/environments/{environment_name}/variables` |
| GET / PATCH / DELETE | `/repos/{owner}/{repo}/environments/{environment_name}/variables/{name}` |

Permission: `admin:org` (org), `repo` (repo/env). All paths URL-encode `environment_name`.

---

## 9. Self-hosted Runners

Three scopes: enterprise, organization, repository. Same shape across scopes.

### 9.1 Common shape (substitute the scope prefix)

Scope prefixes:
- Enterprise: `/enterprises/{enterprise}/actions/runners` — needs `manage_runners:enterprise`.
- Organization: `/orgs/{org}/actions/runners` — needs `admin:org`.
- Repository: `/repos/{owner}/{repo}/actions/runners` — needs `repo`.

| Method | Sub-path | Purpose |
|---|---|---|
| GET | `` | List runners (`name`, `per_page`, `page`) |
| GET | `/downloads` | List runner application binaries (os, arch, download_url, filename, sha256_checksum) |
| POST | `/generate-jitconfig` | Create just-in-time runner config |
| POST | `/registration-token` | Token to register a runner (1h TTL) |
| POST | `/remove-token` | Token to remove a runner (1h TTL) |
| GET | `/{runner_id}` | Get runner |
| DELETE | `/{runner_id}` | Force-remove runner |
| GET | `/{runner_id}/labels` | List labels |
| POST | `/{runner_id}/labels` | Add custom labels (`{ "labels": ["self-hosted","gpu"] }`) |
| PUT | `/{runner_id}/labels` | Replace ALL custom labels |
| DELETE | `/{runner_id}/labels` | Remove all custom labels (read-only labels remain) |
| DELETE | `/{runner_id}/labels/{name}` | Remove one custom label |

#### Generate registration token

```http
POST /orgs/octo-org/actions/runners/registration-token
```
Response 201:
```json
{
  "token": "LLBF3JGZDX3P5PMEXLND6TS6FCWO6",
  "expires_at": "2020-01-22T12:13:35.123-08:00"
}
```

#### Generate JIT config

```json
POST /orgs/octo-org/actions/runners/generate-jitconfig
{
  "name": "New JIT runner",
  "runner_group_id": 1,
  "labels": ["self-hosted", "linux", "x64"],
  "work_folder": "_work"
}
```
Returns 201 with full runner object plus `encoded_jit_config` (base64 string passed to `./run.sh --jitconfig <encoded>`). JIT runners auto-deregister after a single job.

#### Runner object

```json
{
  "id": 23,
  "name": "MBP",
  "os": "macos",
  "status": "online",
  "busy": true,
  "labels": [
    { "id": 5, "name": "self-hosted", "type": "read-only" },
    { "id": 9, "name": "gpu", "type": "custom" }
  ],
  "ephemeral": false,
  "runner_group_id": 1
}
```

---

## 10. Self-hosted Runner Groups

Groups gate which orgs/repos can use a set of runners. Available at organization and (with a different shape) enterprise.

### 10.1 Organization

Base: `/orgs/{org}/actions/runner-groups` — needs `admin:org`.

| Method | Sub-path | Purpose |
|---|---|---|
| GET | `` | List groups (`per_page`, `page`, `visible_to_repository`) |
| POST | `` | Create group |
| GET | `/{runner_group_id}` | Get group |
| PATCH | `/{runner_group_id}` | Update group |
| DELETE | `/{runner_group_id}` | Delete group |
| GET | `/{runner_group_id}/hosted-runners` | List **hosted** runners in group |
| GET | `/{runner_group_id}/repositories` | List repos with access |
| PUT | `/{runner_group_id}/repositories` | Replace repos (`{selected_repository_ids: []}`) |
| PUT/DELETE | `/{runner_group_id}/repositories/{repository_id}` | Add/remove single repo |
| GET | `/{runner_group_id}/runners` | List self-hosted runners |
| PUT | `/{runner_group_id}/runners` | Replace runners (`{runners: [ids]}`) |
| PUT/DELETE | `/{runner_group_id}/runners/{runner_id}` | Add/remove runner |

Create body:
```json
{
  "name": "Expensive hardware runners",
  "visibility": "selected",
  "selected_repository_ids": [32, 91],
  "runners": [9, 2],
  "allows_public_repositories": false,
  "restricted_to_workflows": true,
  "selected_workflows": ["octo-org/octo-repo/.github/workflows/build.yml@main"],
  "network_configuration_id": "abcd-1234"
}
```
`visibility` ∈ `{all, selected, private}`.

### 10.2 Enterprise

Base: `/enterprises/{enterprise}/actions/runner-groups` — needs `manage_runners:enterprise`.

| Method | Sub-path | Notes |
|---|---|---|
| GET | `` | `visible_to_organization` filter |
| POST | `` | Body uses `selected_organization_ids` instead of `selected_repository_ids` |
| GET | `/{runner_group_id}` | |
| PATCH | `/{runner_group_id}` | |
| DELETE | `/{runner_group_id}` | |
| GET | `/{runner_group_id}/organizations` | List orgs with access |
| PUT | `/{runner_group_id}/organizations` | Replace orgs (`{selected_organization_ids:[]}`) |
| PUT/DELETE | `/{runner_group_id}/organizations/{org_id}` | Add/remove org |
| GET | `/{runner_group_id}/runners` | |
| PUT | `/{runner_group_id}/runners` | |
| PUT/DELETE | `/{runner_group_id}/runners/{runner_id}` | |

---

## 11. GitHub-hosted (larger) Runners

Manage org-level GitHub-hosted larger runners (paid). Permission: `manage_runners:org`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/orgs/{org}/actions/hosted-runners` | List runners |
| POST | `/orgs/{org}/actions/hosted-runners` | Create |
| GET | `/orgs/{org}/actions/hosted-runners/{hosted_runner_id}` | Get |
| PATCH | `/orgs/{org}/actions/hosted-runners/{hosted_runner_id}` | Update |
| DELETE | `/orgs/{org}/actions/hosted-runners/{hosted_runner_id}` | Delete (202) |
| GET | `/orgs/{org}/actions/hosted-runners/images/github-owned` | GitHub-owned images |
| GET | `/orgs/{org}/actions/hosted-runners/images/partner` | Partner images |
| GET | `/orgs/{org}/actions/hosted-runners/images/custom` | List custom images |
| GET / DELETE | `/orgs/{org}/actions/hosted-runners/images/custom/{image_definition_id}` | Get/Delete image |
| GET | `/orgs/{org}/actions/hosted-runners/images/custom/{image_definition_id}/versions` | List versions |
| GET / DELETE | `/orgs/{org}/actions/hosted-runners/images/custom/{image_definition_id}/versions/{version}` | Get/Delete version |
| GET | `/orgs/{org}/actions/hosted-runners/limits` | `public_ips: { maximum, current_usage }` |
| GET | `/orgs/{org}/actions/hosted-runners/machine-sizes` | Machine specs |
| GET | `/orgs/{org}/actions/hosted-runners/platforms` | Available platforms |

Create body:
```json
{
  "name": "my-larger-runner",
  "image": { "id": "ubuntu-latest", "source": "github" },
  "size": "8-core",
  "runner_group_id": 1,
  "maximum_runners": 10,
  "enable_static_ip": false,
  "image_gen": "1"
}
```

---

## 12. OIDC

Customize the OIDC `sub` claim shape for cloud-provider trust policies.

### 12.1 Organization-level subject claim template

- `GET /orgs/{org}/actions/oidc/customization/sub` — needs `read:org`.
- `PUT /orgs/{org}/actions/oidc/customization/sub` — needs `admin:org` (write).
- Body:
  ```json
  { "include_claim_keys": ["repo", "context", "job_workflow_ref"] }
  ```
- Allowed claim keys (subset): `repo`, `context`, `job_workflow_ref`, `repository_id`, `repository_owner`, `repository_owner_id`, `run_id`, `run_number`, `run_attempt`, `actor`, `actor_id`, `workflow`, `head_ref`, `base_ref`, `event_name`, `ref_type`, `ref`, `environment`, plus enterprise/org custom property keys exposed via the OIDC custom-properties endpoints.
- Returns 201.

### 12.2 Repository-level subject claim template

- `GET /repos/{owner}/{repo}/actions/oidc/customization/sub` → `{ use_default: bool, include_claim_keys: [...] }`.
- `PUT /repos/{owner}/{repo}/actions/oidc/customization/sub` body:
  ```json
  { "use_default": false, "include_claim_keys": ["repo", "context", "job_workflow_ref"] }
  ```
  When `use_default=true`, `include_claim_keys` is ignored. Returns 201.

### 12.3 OIDC custom property inclusion (org/enterprise)

| Method | Path | Permission |
|---|---|---|
| GET | `/orgs/{org}/actions/oidc/customization/properties/repo` | `read:org` |
| POST | `/orgs/{org}/actions/oidc/customization/properties/repo` | `admin:org` |
| DELETE | `/orgs/{org}/actions/oidc/customization/properties/repo/{custom_property_name}` | `admin:org` |
| GET | `/enterprises/{enterprise}/actions/oidc/customization/properties/repo` | `admin:enterprise` |
| POST | `/enterprises/{enterprise}/actions/oidc/customization/properties/repo` | `admin:enterprise` |
| DELETE | `/enterprises/{enterprise}/actions/oidc/customization/properties/repo/{custom_property_name}` | `admin:enterprise` |

POST body: `{ "custom_property_name": "environment_tier" }`. Each entry response includes `inclusion_source` ∈ `{organization, enterprise}`.

---

## 13. Repository Dispatch

Adjacent to Actions; lives under the Repos namespace but is the standard external trigger for `repository_dispatch`-typed workflows.

- Path: `POST /repos/{owner}/{repo}/dispatches`
- Permission: classic `repo` scope, fine-grained `contents: write`.
- Body:
  ```json
  {
    "event_type": "deploy-staging",
    "client_payload": {
      "version": "1.2.3",
      "trigger": "manual"
    }
  }
  ```
  - `event_type` (string, required): your custom name, ≤100 chars; matches `on.repository_dispatch.types`.
  - `client_payload` (object, optional): max 10 top-level properties, total payload < 64 KB; available in workflows as `${{ github.event.client_payload }}`.
- Response: **204 No Content**. 404 if repo missing, 422 on validation/abuse.
- Notable: dispatch is asynchronous; will not block on workflow start.

Note: **`workflow_dispatch`** lives under `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` (covered in §1.4) and triggers a single specific workflow with typed `inputs`. **`repository_dispatch`** triggers any workflow listening for that `event_type` and accepts a free-form `client_payload`.

---

## 14. Notable cross-cutting behaviors

- **Pagination**: `per_page` (max 100) and `page`. The `Link` response header has `rel="next"`, `rel="last"`, etc. Workflow runs cap at 1000 results regardless of pages.
- **Rate limits**: Standard 5000 req/h authenticated. Several Actions endpoints have **secondary** rate limits — particularly `dispatches`, `rerun*`, and log-download endpoints. Repository dispatch returns 422 on abuse detection.
- **Log redirects**: `runs/{run_id}/logs`, `runs/{run_id}/attempts/{attempt}/logs`, `jobs/{job_id}/logs`, and `artifacts/{artifact_id}/zip` all return **HTTP 302** with a `Location` header pointing at a short-lived (~1 min) signed Azure Blob URL. Do not follow redirects for the API token (they include their own auth). Most clients should disable auto-redirect-with-headers.
- **Run TTL**: Runs older than the repo retention setting (default 90 days) are deleted; logs may be removed earlier per `artifact-and-log-retention`.
- **Workflow ID polymorphism**: most workflow endpoints accept either the numeric ID or the workflow filename (e.g. `ci.yml`). Filename matches are case-sensitive and must include the extension.
- **Cancel vs force-cancel**: `cancel` respects `if: always()` jobs and `cancelled()` cleanup steps. `force-cancel` aborts immediately and skips them — use only when normal cancel is hung.
- **Re-run behavior**: re-running creates a new `run_attempt` under the same `run_id`. The workflow run's `run_attempt` field increments. Logs/jobs from prior attempts remain accessible via attempt-scoped endpoints.
- **Approval flow ordering**: `pending_deployments` (environment reviewers) and `deployment_protection_rule` (custom GitHub App rules) are independent gates; both must pass before a deployment job starts.
- **Selected-repo conflict (409)**: Variables/secrets with `visibility != selected` will return 409 on `/repositories` add/remove operations.
- **Required workflows**: The standalone `required_workflows` API has been **superseded by Repository Rulesets** (see `/repos/{owner}/{repo}/rulesets`); endpoints like `/orgs/{org}/actions/required_workflows` are deprecated/removed for new orgs.
- **Fine-grained tokens**: Many endpoints accept fine-grained PAT permissions in addition to classic scopes — typical mappings: `actions: read|write`, `administration: read|write` (for permissions endpoints), `secrets: write`, `variables: write`, `organization_self_hosted_runners: write`.

---

## 15. Sources

- https://docs.github.com/en/rest/actions
- https://docs.github.com/en/rest/actions/workflows
- https://docs.github.com/en/rest/actions/workflow-runs
- https://docs.github.com/en/rest/actions/workflow-jobs
- https://docs.github.com/en/rest/actions/artifacts
- https://docs.github.com/en/rest/actions/cache
- https://docs.github.com/en/rest/actions/permissions
- https://docs.github.com/en/rest/actions/secrets
- https://docs.github.com/en/rest/actions/variables
- https://docs.github.com/en/rest/actions/self-hosted-runners
- https://docs.github.com/en/rest/actions/self-hosted-runner-groups
- https://docs.github.com/en/rest/actions/hosted-runners
- https://docs.github.com/en/rest/actions/oidc
- https://docs.github.com/en/enterprise-cloud@latest/rest/actions/self-hosted-runners
- https://docs.github.com/en/enterprise-cloud@latest/rest/actions/self-hosted-runner-groups
- https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event
