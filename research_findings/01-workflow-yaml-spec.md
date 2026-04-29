## 1. Workflow YAML Specification

This section enumerates every top-level and nested configurable field in a GitHub Actions workflow YAML file (`.github/workflows/*.yml` or `*.yaml`). For each field: type, allowed values, default, scope (where it's valid), expression support, and a small example.

Workflow files live in the `.github/workflows/` directory of a repository. A workflow is YAML 1.2 (a strict YAML subset; tabs are forbidden, indentation is significant). The file extension must be `.yml` or `.yaml`.

### 1.1 Top-Level Schema (Quick Reference)

```yaml
name: string                    # optional
run-name: string-with-expr      # optional
on: event|[events]|{event:cfg}  # required
permissions: scope|map          # optional
env: {key: value}               # optional
defaults: {run: {shell, working-directory}}  # optional
concurrency: string|{group, cancel-in-progress}  # optional
jobs:                           # required
  <job_id>:
    ...
```

The required keys are `on` and `jobs`. Everything else is optional.

---

### 1.2 `name`

- **Type:** string
- **Default:** the workflow file path relative to the repo root (e.g. `.github/workflows/ci.yml`)
- **Scope:** top-level only
- **Expressions:** NOT supported (must be a literal string)
- **Description:** Display name shown in the Actions tab and in the GitHub UI.
- **Example:**

  ```yaml
  name: CI
  ```

---

### 1.3 `run-name`

- **Type:** string
- **Default:** event-specific (e.g. commit message for `push`, PR title for `pull_request`, "Manually run by <user>" for `workflow_dispatch`)
- **Scope:** top-level only
- **Expressions:** SUPPORTED — only `github` and `inputs` contexts are available (no `secrets`, `vars`, `env`, etc.)
- **Description:** Custom display name for an individual run. Distinct from `name` (which names the workflow).
- **Example:**

  ```yaml
  run-name: Deploy to ${{ inputs.environment }} by @${{ github.actor }}
  ```

---

### 1.4 `on`

- **Type:** string | array of strings | mapping from event name to configuration
- **Required:** YES
- **Scope:** top-level only
- **Expressions:** NOT supported anywhere in `on` (filters are static)
- **Forms:**

  Single event:
  ```yaml
  on: push
  ```

  Multiple events (no per-event config possible in this form):
  ```yaml
  on: [push, pull_request]
  ```

  Map form (allows filters per event):
  ```yaml
  on:
    push:
      branches: [main]
    pull_request:
      types: [opened, synchronize]
    schedule:
      - cron: '0 9 * * *'
    workflow_dispatch:
    workflow_call:
  ```

#### 1.4.1 Common event filter keys

The detailed set of events and their payloads is covered in a later section; this section only lists the *mechanics* of filtering.

- **`types`** — array of strings; activity types for the event (e.g. `[opened, edited]` for `issues`).
- **`branches` / `branches-ignore`** — array of glob patterns. Mutually exclusive within the same event.
- **`tags` / `tags-ignore`** — array of glob patterns. Mutually exclusive.
- **`paths` / `paths-ignore`** — array of glob patterns matched against changed file paths. Mutually exclusive.

Glob support: `*`, `**`, `?`, `+`, `[]` character classes, `!` negation. Negation must come after a positive pattern.

#### 1.4.2 `on.schedule`

- **Type:** array of mappings, each with a `cron` key.
- **Format:** POSIX cron, 5 fields (min, hr, dom, mon, dow). No seconds field. No `@yearly`/`@daily` shortcuts.
- **Minimum interval:** 5 minutes.
- **Timezone:** UTC by default. An optional sibling `timezone:` field accepts IANA names (e.g. `America/New_York`).

  ```yaml
  on:
    schedule:
      - cron: '*/15 * * * *'
  ```

#### 1.4.3 `on.workflow_dispatch`

Manual trigger. Accepts `inputs` (max 10 top-level inputs historically, raised to 25; payload max 65535 chars total).

```yaml
on:
  workflow_dispatch:
    inputs:
      logLevel:
        description: 'Log level'
        required: true
        default: 'warning'
        type: choice
        options: [info, warning, debug]
      tag:
        type: string
      deploy:
        type: boolean
        default: false
      target_env:
        type: environment
```

`inputs.<id>.type` allowed values: `boolean`, `number`, `string`, `choice` (requires `options`), `environment`.

#### 1.4.4 `on.workflow_call`

Marks the workflow as reusable.

- `inputs.<id>`: same shape as `workflow_dispatch.inputs`, but `type` allowed values are `boolean`, `number`, `string` only (no `choice` / `environment`).
- `outputs.<id>`: requires `value:` (an expression usually referencing a job output) and optional `description:`.
- `secrets.<id>`: optional `description:` and `required:` boolean.

```yaml
on:
  workflow_call:
    inputs:
      config-path:
        required: true
        type: string
    outputs:
      artifact-id:
        description: ID of built artifact
        value: ${{ jobs.build.outputs.artifact_id }}
    secrets:
      npm_token:
        required: true
```

#### 1.4.5 `on.workflow_run`

Triggered when another workflow finishes/queues.

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
```

`types` accepts `requested`, `in_progress`, `completed`. `workflows` is a list of workflow names (the `name:` field, not file path).

---

### 1.5 `permissions`

Sets permissions for the `GITHUB_TOKEN` granted to the workflow.

- **Type:** string OR mapping
- **String shortcuts:** `read-all`, `write-all`, or `{}` (empty = no permissions)
- **Mapping form:** scope -> access level
- **Scope:** top-level OR `jobs.<id>.permissions` (job-level overrides workflow-level entirely — they do NOT merge)
- **Expressions:** NOT supported

**Available scopes** (each accepts `read`, `write`, or `none`, except where noted):
`actions`, `attestations`, `checks`, `contents`, `deployments`, `discussions`, `id-token` (only `write` or `none`), `issues`, `models` (only `read` or `none`), `packages`, `pages`, `pull-requests`, `repository-projects`, `security-events`, `statuses`.

```yaml
permissions:
  contents: read
  id-token: write
  pull-requests: write
```

Note: when `permissions` is unset, repository-level default permissions apply. Setting any single scope sets all unspecified scopes to `none` (in mapping form).

---

### 1.6 `env`

- **Type:** mapping of string-to-(string|number|bool)
- **Scope:** top-level | `jobs.<id>.env` | `jobs.<id>.steps[*].env`
- **Expressions:** SUPPORTED in values
- **Precedence (highest wins):** step env > job env > workflow env

```yaml
env:
  NODE_ENV: production
  RUNNER_DEBUG: 1
```

---

### 1.7 `defaults`

Sets default options inherited by every job/step.

#### `defaults.run.shell`

- **Type:** string
- **Allowed values:** `bash`, `pwsh`, `python`, `sh`, `cmd`, `powershell`, plus arbitrary custom shell with `command [options] {0}` placeholder syntax.
- **Default:** `bash` on Linux/macOS (with `--noprofile --norc -eo pipefail {0}`); `pwsh` on Windows (when present); `cmd` fallback.

#### `defaults.run.working-directory`

- **Type:** string (path)
- **Expressions:** SUPPORTED

```yaml
defaults:
  run:
    shell: bash
    working-directory: ./scripts
```

**Precedence (highest wins):** step-level `shell`/`working-directory` > job `defaults.run` > workflow `defaults.run`.

`defaults` only applies to `run:` steps — it does NOT affect `uses:` steps.

---

### 1.8 `concurrency`

- **Type:** string OR mapping `{group, cancel-in-progress}`
- **Scope:** top-level OR `jobs.<id>.concurrency`
- **Expressions:** SUPPORTED — `github`, `inputs`, `vars`, `needs`, `matrix` (job-level only) contexts; `secrets` is NOT available
- **Behavior:** at most one workflow/job per `group` runs at a time. New runs queue; `cancel-in-progress: true` cancels the running one instead.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

`cancel-in-progress` may itself be an expression (e.g. only cancel on non-default branches).

---

### 1.9 `jobs`

- **Type:** mapping from `<job_id>` to job spec.
- **Required:** YES
- **Job ID rules:** must start with a letter or `_`; subsequent chars `[A-Za-z0-9_-]`. Must be unique within the workflow.
- **Default behavior:** all jobs run in parallel unless `needs` creates dependencies.

#### 1.9.1 `jobs.<job_id>.name`

- **Type:** string
- **Expressions:** SUPPORTED
- **Default:** the job ID

#### 1.9.2 `jobs.<job_id>.permissions`

Same shape as top-level `permissions`. Job-level fully replaces workflow-level (no merge).

#### 1.9.3 `jobs.<job_id>.needs`

- **Type:** string OR array of strings (job IDs)
- **Behavior:** the job waits for all listed jobs to succeed (or skip with success). To run on failure of a dependency, combine with `if: always()` or `if: failure()`.
- **Expressions:** NOT supported (must be literal job IDs).

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps: [...]
  deploy:
    needs: [test]
    runs-on: ubuntu-latest
    steps: [...]
```

#### 1.9.4 `jobs.<job_id>.if`

- **Type:** string (conditional expression). May omit the `${{ }}` wrapper at the top level of `if:`.
- **Expressions:** SUPPORTED — `github`, `needs`, `vars`, `inputs`, `env` (limited), `secrets` (truthy-only checks for whether a secret is set are allowed via `secrets.NAME != ''`).
- **Example:**

  ```yaml
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  ```

#### 1.9.5 `jobs.<job_id>.runs-on`

- **Type:** string | array of strings | mapping `{group, labels}`
- **Required:** YES (unless using `uses:` to call a reusable workflow)
- **Allowed values:** GitHub-hosted runner labels (`ubuntu-latest`, `ubuntu-22.04`, `ubuntu-24.04`, `windows-latest`, `windows-2022`, `macos-latest`, `macos-13`, `macos-14`, `macos-15`), self-hosted labels (`self-hosted` plus optional OS/arch labels), or larger-runner names.
- **Array form:** ANDs the labels — runner must match all.
- **Group form:**

  ```yaml
  runs-on:
    group: ubuntu-runners
    labels: [ubuntu-latest-large]
  ```

- **Expressions:** SUPPORTED (e.g. dynamic runner from matrix).

#### 1.9.6 `jobs.<job_id>.environment`

- **Type:** string OR mapping `{name, url}`
- **Description:** binds the job to a deployment Environment (subject to environment protection rules — required reviewers, wait timer, deployment branches).
- **`url`:** SUPPORTS expressions; rendered as a clickable link in the deployment.

```yaml
environment:
  name: production
  url: ${{ steps.deploy.outputs.url }}
```

#### 1.9.7 `jobs.<job_id>.concurrency`

Same shape as top-level `concurrency`. Applied per job.

#### 1.9.8 `jobs.<job_id>.outputs`

- **Type:** mapping of `<output_id>` to expression string (typically referencing a step's output).
- **Caveat:** outputs are stringified; values larger than 1 MB are truncated. Total combined outputs limit per job is 50 MB.
- **Consumed by:** downstream jobs via `needs.<job_id>.outputs.<output_id>` and reusable-workflow callers via `on.workflow_call.outputs`.

```yaml
outputs:
  build-id: ${{ steps.build.outputs.id }}
  matrix:    ${{ steps.gen.outputs.matrix }}
```

#### 1.9.9 `jobs.<job_id>.env`

Same shape as top-level `env`. Visible to all steps in the job.

#### 1.9.10 `jobs.<job_id>.defaults`

Same shape as top-level `defaults`. Overrides workflow-level `defaults` for this job.

#### 1.9.11 `jobs.<job_id>.timeout-minutes`

- **Type:** number
- **Default:** 360 (6 hours)
- **Description:** wall-clock timeout for the job. Cancelled jobs report status `cancelled`.

#### 1.9.12 `jobs.<job_id>.continue-on-error`

- **Type:** boolean (or expression evaluating to boolean)
- **Default:** `false`
- **Description:** if `true`, the workflow does not fail when this job fails. Useful with `strategy.matrix` to allow some matrix legs to fail.

#### 1.9.13 `jobs.<job_id>.container`

Runs all steps in the job inside a Docker container on the runner.

| Field         | Type             | Notes |
|---------------|------------------|-------|
| `image`       | string           | Required. e.g. `node:20`, `ghcr.io/owner/img:tag`. Can be `docker://...`. |
| `credentials` | `{username, password}` | For private registries. Use `${{ secrets.X }}`. |
| `env`         | mapping          | Env vars inside container. |
| `ports`       | array of numbers/strings | Ports to expose. |
| `volumes`     | array of strings | Format `<src>:<dst>[:ro]`. |
| `options`     | string           | Extra `docker create` flags. Some flags blocked (e.g. `--network`, `--entrypoint`). |

A short string form is allowed: `container: node:20`.

```yaml
container:
  image: node:20
  credentials:
    username: ${{ secrets.REG_USER }}
    password: ${{ secrets.REG_PASS }}
  env: { CI: 'true' }
  ports: [8080]
  volumes: ['/data:/data:ro']
  options: --cpus 2 --memory 4g
```

Containers are only supported on Linux runners.

#### 1.9.14 `jobs.<job_id>.services`

- **Type:** mapping `<service_id>` -> same shape as `container`.
- **Description:** companion containers (e.g. databases) reachable by service name from the job's network.

```yaml
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_PASSWORD: postgres }
    ports: ['5432:5432']
    options: >-
      --health-cmd "pg_isready -U postgres"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

#### 1.9.15 `jobs.<job_id>.strategy`

Generates a build matrix.

- **`strategy.matrix`** — mapping of variable names to arrays of values. The cartesian product becomes one job each.
  - Values may be strings, numbers, booleans, or maps/arrays (accessed via `matrix.<name>.<sub>`).
  - The **entire** `matrix` value may itself be an expression — e.g. `matrix: ${{ fromJSON(needs.gen.outputs.matrix) }}` — letting an upstream job dynamically generate the matrix.
- **`strategy.matrix.include`** — array of mappings appended to the product. Each item either extends an existing combination (when all keys match an existing leg) or adds a new combination (when at least one key is new).
- **`strategy.matrix.exclude`** — array of mappings; any combination matching all listed keys is removed. Applied after the cartesian product, before `include`.
- **`strategy.fail-fast`** — boolean, default `true`. When `true`, cancels in-progress matrix jobs if one fails.
- **`strategy.max-parallel`** — integer; caps simultaneous matrix legs.

```yaml
strategy:
  fail-fast: false
  max-parallel: 4
  matrix:
    os: [ubuntu-latest, windows-latest]
    node: [18, 20]
    include:
      - os: ubuntu-latest
        node: 20
        experimental: true
    exclude:
      - os: windows-latest
        node: 18
```

A single matrix can have at most 256 jobs. Each variable ≤ 10 values is a soft expectation.

#### 1.9.16 `jobs.<job_id>.uses` (reusable-workflow caller)

When a job calls a reusable workflow it omits `runs-on` and `steps`, and uses these fields:

- **`uses`** — required path:
  - Remote: `{owner}/{repo}/.github/workflows/{file}.yml@{ref}` where `{ref}` is a SHA, tag, or branch. Tags take precedence over same-named branches.
  - Local (same repo): `./.github/workflows/{file}.yml` (no `@ref`; uses the caller's commit).
- **`with`** — mapping passed to the called workflow's `inputs`. Values may be expressions.
- **`secrets`** — mapping of named secrets, OR the literal string `inherit`. `inherit` only works for callers in the same org/enterprise (depending on settings).
- **`strategy`** — supported (matrix-of-reusable-workflows).
- **`permissions`**, **`needs`**, **`if`**, **`concurrency`** — supported.
- **`env`**, **`defaults`**, **`runs-on`**, **`container`**, **`services`**, **`steps`** — NOT supported on a calling job.

```yaml
jobs:
  call:
    uses: octo-org/shared/.github/workflows/build.yml@v1
    with:
      target: prod
    secrets:
      npm_token: ${{ secrets.NPM_TOKEN }}
    # or:
    # secrets: inherit
```

Outputs from the called workflow are exposed via `needs.<call-job-id>.outputs.<name>`.

---

### 1.10 `jobs.<job_id>.steps[*]`

An ordered list of steps. Each step is one of: a `run:` step (shell), a `uses:` step (action), or a reusable-workflow call (only at job level, not step level).

| Field               | Type            | Default | Expressions | Notes |
|---------------------|-----------------|---------|-------------|-------|
| `id`                | string          | —       | NO          | Used in `steps.<id>.outputs.*` references. |
| `if`                | string          | —       | YES         | `${{ }}` optional at top level. |
| `name`              | string          | inferred | YES        | Display label. |
| `uses`              | string          | —       | NO          | Action ref. Mutually exclusive with `run`. |
| `run`               | string (multiline) | — | YES (in body) | Shell script. Mutually exclusive with `uses`. |
| `working-directory` | string          | inherits defaults | YES | Only valid for `run` steps. |
| `shell`             | string          | inherits defaults | NO | Only valid for `run` steps. |
| `with`              | mapping         | —       | YES         | Inputs for an action (only with `uses`). |
| `with.args`         | string          | —       | YES         | Override `CMD` for Docker container actions. |
| `with.entrypoint`   | string          | —       | YES         | Override `ENTRYPOINT` for Docker container actions. |
| `env`              | mapping         | —       | YES         | Step-level env vars. |
| `continue-on-error` | bool/expression | `false` | YES         | If true, step failure does not fail the job. |
| `timeout-minutes`   | number          | —       | YES (number) | Per-step timeout (in minutes). |

#### 1.10.1 `uses:` reference forms

- `{owner}/{repo}@{ref}` — top-level action of a public/private repo.
- `{owner}/{repo}/{path}@{ref}` — subdirectory action.
- `./path/to/dir` — local action (path relative to default workspace).
- `docker://image:tag` or `docker://host/image:tag` — Docker Hub or registry image as an action.

Refs may be SHAs (most secure), tags, or branches. SHAs are recommended for third-party actions.

#### 1.10.2 `run:` steps

Multi-line YAML strings are common:

```yaml
- name: Build
  run: |
    set -euo pipefail
    npm ci
    npm run build
  shell: bash
  working-directory: ./web
  env:
    NODE_OPTIONS: --max-old-space-size=4096
```

Default shells use these arguments under the hood:

| Shell        | Invocation |
|--------------|------------|
| `bash`       | `bash --noprofile --norc -eo pipefail {0}` |
| `pwsh`       | `pwsh -command ". '{0}'"` |
| `powershell` | `powershell -command ". '{0}'"` |
| `python`     | `python {0}` |
| `sh`         | `sh -e {0}` |
| `cmd`        | `%ComSpec% /D /E:ON /V:OFF /S /C "CALL "{0}""` |

Custom shell: `shell: perl {0}` (or any program that takes a script path).

#### 1.10.3 Step `with` inputs

Action inputs are typed by the action's `action.yml`. Special inputs `args` and `entrypoint` apply to Docker container actions (override `CMD` and `ENTRYPOINT` respectively). For JavaScript/composite actions, `with` keys correspond to the action's declared inputs.

#### 1.10.4 Steps cannot

- Have `runs-on`, `container`, `services`, `strategy`, `outputs`, `permissions`, `defaults`, `needs` (all are job-level only).
- Have both `uses` and `run`.
- Be a reusable-workflow call (that's a job-level construct).

---

### 1.11 Expression Support — Field-by-Field

GitHub Actions evaluates `${{ }}` only in specific YAML positions. The table below summarizes where expressions are honored.

| Field | Expressions? | Available contexts (typical) |
|-------|--------------|------------------------------|
| `name` (workflow) | NO | — |
| `run-name` | YES | `github`, `inputs` |
| `on.*` (any filter) | NO | — |
| `permissions` (any level) | NO | — |
| `env` (any level, values) | YES | `github`, `env`, `vars`, `secrets`, `inputs`, `matrix` (where in scope) |
| `defaults.run.shell` | NO | — |
| `defaults.run.working-directory` | YES | as for env |
| `concurrency.group` | YES | `github`, `inputs`, `vars`, `needs`, `matrix` (job-level) — NOT `secrets` |
| `concurrency.cancel-in-progress` | YES | as above |
| `jobs.<id>.name` | YES | `github`, `inputs`, `matrix`, `needs`, `vars` |
| `jobs.<id>.if` | YES | `github`, `needs`, `vars`, `inputs`, plus `secrets` truthy checks |
| `jobs.<id>.runs-on` | YES | `github`, `inputs`, `matrix`, `needs`, `vars` |
| `jobs.<id>.environment.name` | YES | (limited; mostly literal) |
| `jobs.<id>.environment.url` | YES | full job context including `steps`, `env` |
| `jobs.<id>.outputs.<id>` (value) | YES | `steps`, `env`, `job`, `runner`, `inputs`, `matrix`, etc. |
| `jobs.<id>.timeout-minutes` | YES | numeric expression |
| `jobs.<id>.continue-on-error` | YES | boolean expression |
| `jobs.<id>.strategy.matrix` | YES (whole value or per-entry) | `github`, `inputs`, `vars`, `needs` |
| `jobs.<id>.strategy.fail-fast` | YES | boolean |
| `jobs.<id>.strategy.max-parallel` | YES | numeric |
| `jobs.<id>.container.image` etc. | YES | `secrets` allowed for `credentials` |
| `jobs.<id>.services.<id>.*` | YES | as for container |
| `jobs.<id>.uses` | NO | must be a literal path/ref string |
| `jobs.<id>.with.*` | YES | full caller context (no `secrets` going to public reusable workflows; secrets pass via `secrets:` map) |
| `jobs.<id>.secrets.<name>` | YES | `secrets` context |
| `jobs.<id>.needs` | NO | literal job IDs |
| `steps[*].id` | NO | literal |
| `steps[*].if` | YES | full step context |
| `steps[*].name` | YES | full step context |
| `steps[*].uses` | NO | literal |
| `steps[*].run` | YES (interpolated into shell text) | full step context |
| `steps[*].shell` | NO | — |
| `steps[*].working-directory` | YES | full step context |
| `steps[*].with.*` | YES | full step context |
| `steps[*].env.*` | YES | full step context |
| `steps[*].continue-on-error` | YES | boolean |
| `steps[*].timeout-minutes` | YES | numeric |

**Notable restrictions:**
- `secrets` is unavailable inside `concurrency.*` (so you cannot key concurrency on secret values).
- `secrets` is unavailable inside `if:` for full string interpolation, but `secrets.NAME != ''` truthy checks work as a way to gate steps on secret presence.
- `matrix` is only in scope inside the matrixed job (not in workflow-level `env`, etc.).
- `needs` is only in scope in jobs that declare `needs:` for that job.

---

### 1.12 Defaults Precedence Summary

For a `run:` step, the effective `shell` and `working-directory` are resolved as:

1. Step-level `shell` / `working-directory` (highest)
2. Job-level `defaults.run.shell` / `working-directory`
3. Workflow-level `defaults.run.shell` / `working-directory`
4. Runner default (`bash` on Linux/macOS, `pwsh`/`cmd` on Windows; current working directory = `$GITHUB_WORKSPACE`).

For `env`: step `env` > job `env` > workflow `env` > inherited from caller workflow (for reusable workflows) > runner system env.

For `permissions`: job-level fully replaces workflow-level (no merge). Unset = repo default permissions.

For `concurrency`: job-level concurrency is independent of workflow-level concurrency (both can apply simultaneously, with separate queues).

---

### 1.13 Reusable-Workflow Caller Cheat Sheet

Caller side (job-level only):

```yaml
jobs:
  build:
    uses: ./.github/workflows/build.yml          # local
    # uses: org/repo/.github/workflows/build.yml@v1  # remote
    with:
      version: ${{ inputs.version }}
    secrets: inherit
    # or explicit:
    # secrets:
    #   NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    permissions:
      contents: read
      id-token: write
    strategy:
      matrix:
        target: [linux, mac]
    if: github.event_name == 'push'
    needs: [lint]
    concurrency:
      group: build-${{ matrix.target }}
```

Callee (the reusable workflow itself):

```yaml
on:
  workflow_call:
    inputs:
      version: { type: string, required: true }
    outputs:
      image:
        description: pushed image ref
        value: ${{ jobs.do.outputs.image }}
    secrets:
      NPM_TOKEN: { required: false }
```

Reusable workflow constraints:
- Up to 4 levels of nesting (a workflow can call a workflow that calls a workflow…). Loops are detected and rejected.
- A single workflow can call up to 20 unique reusable workflows.
- Inputs are typed (`boolean`, `number`, `string` only — no `choice` or `environment` here).
- Outputs propagate to the caller's `needs.<job>.outputs.<name>`.
- `env` set in the caller is NOT inherited; pass values via `with:`.

---

### 1.14 Matrix Expansion Semantics

Given:

```yaml
matrix:
  a: [1, 2]
  b: [x, y]
  include:
    - a: 1
      b: x
      extra: only-here
    - a: 3
      b: z
  exclude:
    - a: 2
      b: y
```

Resolution order:
1. Cartesian product of base axes: `(1,x) (1,y) (2,x) (2,y)`.
2. Apply `exclude`: removes `(2,y)`. Remaining: `(1,x) (1,y) (2,x)`.
3. Apply `include`:
   - First entry matches existing `(1,x)` (all base keys match) → adds `extra: only-here` to that leg.
   - Second entry has `a: 3` (new value not in base axis) → appended as a new leg `(3,z)`.

Final legs: `(1,x,extra=only-here) (1,y) (2,x) (3,z)`.

A matrix may also be entirely dynamic:

```yaml
strategy:
  matrix: ${{ fromJSON(needs.setup.outputs.matrix) }}
```

where `setup` produced JSON like `{"include":[{"os":"ubuntu-latest","node":20}]}`.

---

### 1.15 GitHub Enterprise Server (GHES) Differences

- Some scopes (e.g. `attestations`, `models`) are gated by GHES version. `id-token` (OIDC) requires GHES 3.5+ and proper trust setup.
- Hosted runner labels (`ubuntu-latest`, etc.) on GHES point to whatever runners the admin configured (often only self-hosted is available).
- `workflow_run`, `workflow_call`, and reusable workflow nesting were progressively introduced in GHES 3.4–3.6.
- Larger-runner names and `runs-on.group` syntax require GHES 3.9+.
- `secrets: inherit` for cross-org reuse depends on enterprise settings (only available where the calling workflow's repo is in the same enterprise as the reusable workflow's repo).

Otherwise, the workflow YAML schema is identical between github.com and GHES.

---

### 1.16 Sources

- https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions
- https://docs.github.com/en/actions/using-jobs/using-conditions-to-control-job-execution
- https://docs.github.com/en/actions/sharing-automations/reusing-workflows
- https://docs.github.com/en/actions/learn-github-actions/expressions
- https://docs.github.com/en/actions/learn-github-actions/contexts
- https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
- https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs
- https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#concurrency
- https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container

---

