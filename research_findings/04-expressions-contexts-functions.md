# Section 4: Expressions, Contexts & Functions

This document is an exhaustive reference for GitHub Actions expressions, contexts, built-in functions, workflow commands, and default environment variables. Source URLs are cited at the end.

---

## 4.1 Expressions

### 4.1.1 `${{ <expr> }}` Syntax

GitHub Actions evaluates expressions wrapped in `${{ <expression> }}`. The expression body is evaluated and the result substituted into the surrounding string at runtime.

```yaml
env:
  MY_ENV_VAR: ${{ <expression> }}
```

Expressions can be used wherever the workflow schema accepts them — most string-typed fields support interpolation. The schema documentation (or the Context Availability table below) is the authoritative list of which keys accept expressions.

### 4.1.2 The Bare Form (`if:` only)

The `if:` conditional is special: it accepts the bare expression form **without** the `${{ }}` wrapper.

```yaml
# Both forms work, the bare form is conventional:
if: github.event_name == 'push'
if: ${{ github.event_name == 'push' }}
```

Mixing literal text with `${{ }}` inside `if:` requires care — GitHub will warn if it detects an `if:` value that begins with `${{` and ends with `}}` because the wrapper is redundant.

### 4.1.3 Literal Types

| Type | Examples | Notes |
|------|----------|-------|
| `null` | `null` | Coerces to empty string in string context, `0` in numeric. |
| boolean | `true`, `false` | Coerces to `'true'`/`'false'` in string context, `1`/`0` in numeric. |
| number | `42`, `-2.99e-2`, `0xff`, `1.5` | "Any number format supported by JSON" — decimal int, decimal float, hex, exponential. |
| string | `'hello'`, `'it''s'` | Within `${{ }}`: single-quoted only. Escape a literal single quote by doubling it (`''`). Double quotes throw errors. Outside `${{ }}` (i.e., in YAML), no quotes are needed for the expression itself. |
| array | (no literal syntax) | Arrays are produced by contexts/functions (e.g., `fromJSON('[1,2,3]')`, `github.event.commits`). |
| object | (no literal syntax) | Same as arrays — produced by contexts/functions. |

#### Falsy values
The following coerce to `false` in boolean context: `false`, `0`, `-0`, `""`, `''`, `null`. Everything else is truthy.

### 4.1.4 Operators

In precedence order (highest first):

| Operator | Description |
|----------|-------------|
| `( )` | Logical grouping. |
| `[ ]` | Index — array index or object property by string key (e.g., `vars['MY_VAR']`). |
| `.` | Property dereference (e.g., `github.event.pull_request.number`). |
| `!` | Logical NOT. |
| `<`, `<=`, `>`, `>=` | Numeric/relational comparison. |
| `==`, `!=` | Equality. Loose typing; strings compared **case-insensitively**. |
| `&&` | Logical AND. |
| `\|\|` | Logical OR. |

Both `&&` and `||` short-circuit and return the value of one of their operands (not necessarily a boolean). This makes `${{ inputs.x || 'default' }}` a common default-value pattern.

### 4.1.5 Type Coercion for Equality

When `==`/`!=` operands have differing types, both are coerced to a number:

| Source type | Coerces to |
|-------------|-----------|
| `null` | `0` |
| `true` | `1` |
| `false` | `0` |
| string | parsed as JSON number; empty string `""` → `0`; non-numeric → `NaN` |
| array / object | `NaN` |

Strings compared to strings use **case-insensitive** comparison. When `NaN` is an operand of any relational operator (`>`, `<`, `>=`, `<=`), the result is always `false`.

### 4.1.6 Type Coercion to String (function arguments)

| Source type | String form |
|-------------|------------|
| `null` | `''` |
| `true` / `false` | `'true'` / `'false'` |
| number | decimal or exponential, JSON-style |
| array / object | not converted (most functions reject these) |

### 4.1.7 Property Dereference and Object Filter `.*`

- Dot dereference: `github.event.head_commit.message`.
- Index dereference (useful for keys with special characters or dynamic names): `github['event']['head_commit']['message']`.
- Object filter `*`: applied to a collection, returns an array of the matching property from each element. Works on both arrays-of-objects and object-valued objects.

```yaml
# fruits = [{name: apple, quantity: 1}, {name: orange, quantity: 2}]
${{ fruits.*.name }}            # => ['apple', 'orange']

# Combined with contains() for matrix outputs:
${{ contains(steps.*.outputs.foo, 'bar') }}
```

### 4.1.8 Nullish / Missing Properties

Accessing a missing property yields `null`. Combined with `||`, this gives:

```yaml
ref: ${{ github.head_ref || github.ref_name }}
```

---

## 4.2 Contexts

There are 12 contexts, each providing read-only access to one slice of the run.

| Context | Description |
|---------|-------------|
| `github` | Information about the workflow run, repo, ref, event, actor, etc. |
| `env` | Environment variables defined at workflow / job / step `env:` keys. |
| `vars` | Configuration variables set at org / repo / environment level. |
| `job` | Information about the currently running job. |
| `jobs` | (Reusable workflows only) outputs from each job, used to set workflow-level outputs. |
| `steps` | Outputs and results of previously-run steps that have an `id`. |
| `runner` | Information about the runner executing the job. |
| `secrets` | Secrets exposed to the workflow run. |
| `strategy` | Information about the matrix strategy of the current job. |
| `matrix` | Matrix variables for the current job invocation. |
| `needs` | Outputs and results of jobs in this job's `needs:`. |
| `inputs` | Inputs to a `workflow_dispatch`, `workflow_call`, or composite action. |

### 4.2.1 `github` Context — All Properties

| Property | Type | Description |
|----------|------|-------------|
| `github.action` | string | Current action name; uses `__run` for inline `run:` steps without an `id`. |
| `github.action_path` | string | Path where a composite action is checked out (composite actions only). |
| `github.action_ref` | string | Ref of the action being executed (e.g., `v2`). |
| `github.action_repository` | string | `owner/repo` of the action being executed (e.g., `actions/checkout`). |
| `github.action_status` | string | Current result of a composite action. |
| `github.actor` | string | Username of the user that triggered the initial workflow run. |
| `github.actor_id` | string | Account ID of the triggering user/app. |
| `github.api_url` | string | URL of the GitHub REST API (e.g., `https://api.github.com`). |
| `github.base_ref` | string | Target (base) branch of a PR — only set on `pull_request*` events. |
| `github.env` | string | Path to the file used to set env vars via the file-command syntax. |
| `github.event` | object | Full event webhook payload that triggered the workflow. |
| `github.event_name` | string | Name of the triggering event (e.g., `push`, `pull_request`). |
| `github.event_path` | string | Filesystem path to the file containing the event payload. |
| `github.graphql_url` | string | URL of the GitHub GraphQL API. |
| `github.head_ref` | string | Source (head) branch of a PR — only set on `pull_request*` events. |
| `github.job` | string | The current job's `job_id`. Available within step execution only. |
| `github.job_workflow_sha` | string | Workflow SHA recorded for the job (when applicable for reusable workflow trust). |
| `github.path` | string | Path to the file used to add to `PATH` via the file-command syntax. |
| `github.ref` | string | Fully-formed ref that triggered the run (e.g., `refs/heads/main`, `refs/pull/42/merge`). |
| `github.ref_name` | string | Short ref (e.g., `main`, `v1.2.3`). |
| `github.ref_protected` | boolean | `true` if the ref has branch protection or rulesets configured. |
| `github.ref_type` | string | `branch` or `tag`. |
| `github.repository` | string | `owner/repo` (e.g., `octocat/Hello-World`). |
| `github.repository_id` | string | Numeric repository ID. |
| `github.repository_owner` | string | Repo owner's username. |
| `github.repository_owner_id` | string | Numeric account ID of the repo owner. |
| `github.repositoryUrl` | string | Git URL of the repository. |
| `github.retention_days` | string | Number of days logs/artifacts are retained. |
| `github.run_attempt` | string | Attempt number for the run (1 on first run). |
| `github.run_id` | string | Unique ID for the workflow run within the repo. |
| `github.run_number` | string | Sequential run number for this workflow. |
| `github.secret_source` | string | Source of secrets used: `None`, `Actions`, `Codespaces`, `Dependabot`. |
| `github.server_url` | string | Base URL of the GitHub instance (e.g., `https://github.com`). |
| `github.sha` | string | Commit SHA that triggered the workflow. |
| `github.token` | string | Installation token for the workflow's GitHub App (same as `secrets.GITHUB_TOKEN`). |
| `github.triggering_actor` | string | Username that initiated this run (may differ from `actor` on re-runs). |
| `github.workflow` | string | Workflow `name:` or path if unnamed. |
| `github.workflow_ref` | string | Full ref to the workflow file (e.g., `octo/repo/.github/workflows/x.yml@refs/heads/main`). |
| `github.workflow_sha` | string | Commit SHA for the workflow file. |
| `github.workspace` | string | Default working directory; where the repo is checked out. |

### 4.2.2 `env` Context

| Property | Type | Description |
|----------|------|-------------|
| `env` | object | Map of env vars defined in workflow/job/step `env:` (and after writes to `$GITHUB_ENV`). |
| `env.<name>` | string | A specific env var. |

### 4.2.3 `vars` Context

| Property | Type | Description |
|----------|------|-------------|
| `vars.<name>` | string | Configuration variable defined at org/repo/environment level. Always strings. |

### 4.2.4 `job` Context

| Property | Type | Description |
|----------|------|-------------|
| `job.check_run_id` | number | Check run ID for the current job. |
| `job.container` | object | Job container info (when `container:` is used). |
| `job.container.id` | string | Docker container ID. |
| `job.container.network` | string | Container network ID. |
| `job.services` | object | Map of service container info, keyed by service id. |
| `job.services.<id>.id` | string | Service container ID. |
| `job.services.<id>.network` | string | Network ID for the service. |
| `job.services.<id>.ports` | object | Mapping of port assignments for the service. |
| `job.status` | string | Current status of the job: `success`, `failure`, `cancelled`. |
| `job.workflow_ref` | string | Full ref of the workflow defining the current job. |
| `job.workflow_sha` | string | SHA of the workflow file. |
| `job.workflow_repository` | string | `owner/repo` containing the workflow. |
| `job.workflow_file_path` | string | Path of the workflow file relative to repo root. |

### 4.2.5 `jobs` Context (Reusable Workflows Only)

Only available in `workflow_call` reusable workflows when setting top-level `outputs:`.

| Property | Type | Description |
|----------|------|-------------|
| `jobs.<job_id>.result` | string | `success`, `failure`, `cancelled`, or `skipped`. |
| `jobs.<job_id>.outputs` | object | Map of outputs from that job. |
| `jobs.<job_id>.outputs.<name>` | string | Specific output. |

### 4.2.6 `steps` Context

| Property | Type | Description |
|----------|------|-------------|
| `steps.<step_id>.outputs` | object | Outputs written via `$GITHUB_OUTPUT` or returned by the action. |
| `steps.<step_id>.outputs.<name>` | string | Specific output value. |
| `steps.<step_id>.conclusion` | string | Final status after `continue-on-error`: `success`, `failure`, `cancelled`, `skipped`. |
| `steps.<step_id>.outcome` | string | Status before `continue-on-error` is applied. |

Only steps with an `id:` are addressable.

### 4.2.7 `runner` Context

| Property | Type | Description |
|----------|------|-------------|
| `runner.name` | string | Runner name. |
| `runner.os` | string | `Linux`, `Windows`, or `macOS`. |
| `runner.arch` | string | `X86`, `X64`, `ARM`, or `ARM64`. |
| `runner.temp` | string | Path to a runner temp directory cleared at end of job. |
| `runner.tool_cache` | string | Path to the directory of preinstalled tools. |
| `runner.debug` | string | `'1'` if `ACTIONS_STEP_DEBUG`/`ACTIONS_RUNNER_DEBUG` is enabled, else unset. |
| `runner.environment` | string | `github-hosted` or `self-hosted`. |

### 4.2.8 `secrets` Context

| Property | Type | Description |
|----------|------|-------------|
| `secrets.GITHUB_TOKEN` | string | Auto-generated installation token for the workflow run. |
| `secrets.<name>` | string | User-defined secret. |

The `GITHUB_TOKEN` is unique per job; its permissions are set by the `permissions:` key.

### 4.2.9 `strategy` Context

| Property | Type | Description |
|----------|------|-------------|
| `strategy.fail-fast` | boolean | Whether one matrix failure cancels in-flight matrix siblings. |
| `strategy.job-index` | number | Zero-based index of this job within the matrix. |
| `strategy.job-total` | number | Total number of matrix jobs. |
| `strategy.max-parallel` | number | Cap on simultaneously-running matrix jobs. |

### 4.2.10 `matrix` Context

| Property | Type | Description |
|----------|------|-------------|
| `matrix.<key>` | any | A specific matrix variable for this job invocation (string, number, object, etc., depending on what was supplied). |

### 4.2.11 `needs` Context

| Property | Type | Description |
|----------|------|-------------|
| `needs.<job_id>.result` | string | `success`, `failure`, `cancelled`, or `skipped`. |
| `needs.<job_id>.outputs` | object | Outputs declared by the dependency job. |
| `needs.<job_id>.outputs.<name>` | string | A specific dependency output. |

### 4.2.12 `inputs` Context

| Property | Type | Description |
|----------|------|-------------|
| `inputs.<name>` | string/number/boolean | Input passed to a `workflow_dispatch`, `workflow_call`, or composite action. Type matches the declared input `type:`. |

### 4.2.13 Context Availability by Workflow Key

Not all contexts are usable everywhere — values that aren't yet known when a key is parsed are unavailable.

| Workflow key | Available contexts |
|---|---|
| `run-name` | `github`, `inputs`, `vars` |
| `concurrency` (workflow level) | `github`, `inputs`, `vars` |
| `env` (workflow level) | `github`, `secrets`, `inputs`, `vars` |
| `jobs.<job_id>.concurrency` | `github`, `needs`, `strategy`, `matrix`, `inputs`, `vars` |
| `jobs.<job_id>.if` | `github`, `needs`, `vars`, `inputs` |
| `jobs.<job_id>.outputs.*` | `github`, `needs`, `strategy`, `matrix`, `job`, `runner`, `env`, `vars`, `secrets`, `steps`, `inputs` |
| `jobs.<job_id>.steps.if` | `github`, `needs`, `strategy`, `matrix`, `job`, `runner`, `env`, `vars`, `steps`, `inputs` (no `secrets`) |
| `jobs.<job_id>.steps.run` | all of the above plus `secrets` |

Notably, `secrets` is **not** available in `if:` (preventing secret-dependent control flow that would leak secret values into logs).

---

## 4.3 Built-in Functions

### 4.3.1 String / Container Tests

#### `contains(search, item)`
Returns `true` if `search` contains `item`.
- If `search` is a string: substring test (case-insensitive).
- If `search` is an array: element-equality test.

```yaml
contains('hello world', 'world')                # true
contains(github.event.commits.*.message, 'WIP') # array form
contains(fromJSON('["a","b"]'), 'a')            # true
```

#### `startsWith(searchString, searchValue)`
Returns `true` when `searchString` starts with `searchValue`. **Not** case-sensitive.

#### `endsWith(searchString, searchValue)`
Returns `true` if `searchString` ends with `searchValue`. **Not** case-sensitive.

### 4.3.2 Formatting

#### `format(string, replaceValue0, replaceValue1, ..., replaceValueN)`
Replaces `{N}` placeholders in `string` with the corresponding values. Use `{{` and `}}` to emit literal braces.

```yaml
format('Hello {0} {1}!', 'world', 'again')   # => 'Hello world again!'
format('{{0}} is literal, {0} is value', 'X') # => '{0} is literal, X is value'
```

### 4.3.3 Array → String

#### `join(array, optionalSeparator)`
Concatenates an array's values with a separator (default `,`). Non-array values are treated as a single-element array.

```yaml
join(github.event.issue.labels.*.name, ', ')
```

### 4.3.4 JSON

#### `toJSON(value)`
Returns a **pretty-printed** JSON string for `value`. Useful for debugging contexts.

```yaml
- run: echo "$EVENT"
  env:
    EVENT: ${{ toJSON(github.event) }}
```

#### `fromJSON(value)`
Parses `value` as JSON and returns the resulting object/array/scalar. Common pattern: pass a matrix list as a job output.

```yaml
jobs:
  build:
    outputs:
      matrix: ${{ steps.gen.outputs.matrix }}
    steps:
      - id: gen
        run: echo 'matrix=["a","b","c"]' >> "$GITHUB_OUTPUT"
  test:
    needs: build
    strategy:
      matrix:
        value: ${{ fromJSON(needs.build.outputs.matrix) }}
```

`fromJSON` also coerces `'true'`/`'false'`/`'42'` to booleans/numbers — useful in `if:` after reading an output.

### 4.3.5 File Hashing

#### `hashFiles(path, [path, ...])`
Generates a SHA-256 over the contents of every file matched by the glob patterns. Patterns:
- Are evaluated relative to `GITHUB_WORKSPACE`.
- Use `**` for recursive globs.
- Are case-insensitive on Windows.
- Support negation via leading `!`.
- May be supplied as multiple comma-separated arguments.

```yaml
key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
key: ${{ hashFiles('**/*.lock', '!node_modules/**/*.lock') }}
```

### 4.3.6 Conditional Selector

#### `case(pred1, val1, pred2, val2, ..., default)`
Evaluates predicates in order; returns the value paired with the first true predicate, or the trailing default argument if none match.

### 4.3.7 Status Check Functions (only meaningful in `if:`)

These functions short-circuit `if:` evaluation. **The implicit default `if:` is `success()`** — if you omit `if:`, a step/job runs only when all prior steps/jobs succeeded.

| Function | Returns `true` when |
|---|---|
| `success()` | All previous steps in the job succeeded (or for jobs: all `needs:` succeeded). |
| `failure()` | Any previous step in the job has failed (or any `needs:` job failed). |
| `cancelled()` | The workflow run was cancelled. |
| `always()` | Always — even on cancellation. |

Combine with other expressions:

```yaml
if: ${{ failure() && steps.deploy.conclusion == 'failure' }}
if: ${{ !cancelled() }}    # safer than always() — still skips on cancel
```

`always()` is dangerous on critical-failure paths because it prevents cancellation from interrupting hung work; `if: ${{ !cancelled() }}` is the recommended idiom for "always run unless cancelled."

---

## 4.4 Workflow Commands & File Commands

### 4.4.1 File-Based Commands (Current)

The runner exposes several special files; appending lines to them affects the run.

#### `GITHUB_OUTPUT` — Step Outputs
```bash
echo "color=green" >> "$GITHUB_OUTPUT"
```
Multi-line output via heredoc:
```bash
{
  echo 'json<<EOF'
  curl -s https://example.com/x.json
  echo 'EOF'
} >> "$GITHUB_OUTPUT"
```
Read via `${{ steps.<step_id>.outputs.color }}` (the step needs an `id:`).

#### `GITHUB_ENV` — Environment Variables
```bash
echo "MY_VAR=value" >> "$GITHUB_ENV"
```
Multi-line via heredoc, same syntax as `GITHUB_OUTPUT`. Variables persist for subsequent steps in the same job.

#### `GITHUB_PATH` — Prepend to PATH
```bash
echo "$HOME/.local/bin" >> "$GITHUB_PATH"
```
Each line is prepended to `PATH` for subsequent steps.

#### `GITHUB_STEP_SUMMARY` — Job Summary (Markdown)
```bash
echo "### Build complete :rocket:" >> "$GITHUB_STEP_SUMMARY"
echo "- Compiled in 12s" >> "$GITHUB_STEP_SUMMARY"
```
Supports GitHub Flavored Markdown. Per-step summaries are concatenated and shown on the run page.

#### `GITHUB_STATE` — Pre/Post Action Communication
Only useful inside an action with `pre:`/`post:` scripts. Values written here are exposed as `STATE_<name>` env vars to the post-step:
```bash
echo "processID=12345" >> "$GITHUB_STATE"
# In post: $STATE_processID
```

### 4.4.2 Stdout Commands (Still Active)

#### Annotation: error, warning, notice
```bash
echo "::error file=app.js,line=1,col=5,endColumn=7,title=Bad code::Detailed message"
echo "::warning file=app.js,line=10,title=Deprecated::Use foo() instead"
echo "::notice file=README.md::Consider clarifying this section"
```
Optional parameters: `file`, `line`, `endLine`, `col`, `endColumn`, `title`. Annotations show inline in the run UI and on PR diffs.

#### Log Grouping
```bash
echo "::group::Compiling"
echo "...output..."
echo "::endgroup::"
```
Renders a collapsible section in run logs.

#### Masking Values
```bash
echo "::add-mask::sensitive-string"
```
Whitespace-separated tokens are each replaced with `***` in subsequent log output.

#### Stop / Resume Command Processing
```bash
TOKEN=$(uuidgen)
echo "::stop-commands::$TOKEN"
# Lines that look like ::xxx:: are NOT processed in this region
echo "::$TOKEN::"
```
Useful when emitting untrusted text that might contain command-like sequences.

#### Debug
```bash
echo "::debug::A debug message"
```
Only emitted when `ACTIONS_STEP_DEBUG` (secret or var) is `true`.

### 4.4.3 Deprecated / Removed Stdout Commands

| Command | Status | Replacement |
|---|---|---|
| `::set-output name=X::value` | Removed (disabled by default; deprecated since late 2022) | `echo "X=value" >> "$GITHUB_OUTPUT"` |
| `::set-env name=X::value` | Removed (disabled by default) | `echo "X=value" >> "$GITHUB_ENV"` |
| `::save-state name=X::value` | Removed | `echo "X=value" >> "$GITHUB_STATE"` |
| `::add-path::dir` | Removed | `echo "dir" >> "$GITHUB_PATH"` |

Workflows using the legacy commands now emit warnings and may fail outright on modern runners.

---

## 4.5 Default Environment Variables

The runner sets these automatically for every step. Most have a corresponding context property (the table cross-references where applicable).

| Variable | Description | Example |
|---|---|---|
| `CI` | Always set, indicating a CI environment. | `true` |
| `GITHUB_ACTION` | Name of the running action, or step `id`; `__run` for inline `run:` steps without id. | `__repo-owner_action-name` |
| `GITHUB_ACTION_PATH` | Path where a composite action is checked out. | `/home/runner/work/_actions/owner/repo/v1` |
| `GITHUB_ACTION_REPOSITORY` | `owner/repo` of the executing action. | `actions/checkout` |
| `GITHUB_ACTIONS` | `true` while running on GitHub Actions. | `true` |
| `GITHUB_ACTOR` | Username that triggered the initial run. | `octocat` |
| `GITHUB_ACTOR_ID` | Account ID of the triggering user/app. | `1234567` |
| `GITHUB_API_URL` | REST API base URL. | `https://api.github.com` |
| `GITHUB_BASE_REF` | PR target (base) branch — set on PR events only. | `main` |
| `GITHUB_ENV` | Path to the env-file for `>> $GITHUB_ENV`. | `/home/runner/work/_temp/_runner_file_commands/set_env_<uuid>` |
| `GITHUB_EVENT_NAME` | Name of the triggering event. | `workflow_dispatch` |
| `GITHUB_EVENT_PATH` | Path to the JSON file with the full webhook payload. | `/github/workflow/event.json` |
| `GITHUB_GRAPHQL_URL` | GraphQL API URL. | `https://api.github.com/graphql` |
| `GITHUB_HEAD_REF` | PR source (head) branch — set on PR events only. | `feature-1` |
| `GITHUB_JOB` | Current job's `job_id`. | `build` |
| `GITHUB_OUTPUT` | Path to the step-output file. | `/home/runner/work/_temp/_runner_file_commands/set_output_<uuid>` |
| `GITHUB_PATH` | Path to the path-prepend file. | `/home/runner/work/_temp/_runner_file_commands/add_path_<uuid>` |
| `GITHUB_REF` | Fully-formed ref. | `refs/heads/main` / `refs/pull/42/merge` |
| `GITHUB_REF_NAME` | Short branch/tag name. | `main` |
| `GITHUB_REF_PROTECTED` | Branch protection / ruleset status. | `true` / `false` |
| `GITHUB_REF_TYPE` | `branch` or `tag`. | `branch` |
| `GITHUB_REPOSITORY` | `owner/repo`. | `octocat/Hello-World` |
| `GITHUB_REPOSITORY_ID` | Numeric repo ID. | `123456789` |
| `GITHUB_REPOSITORY_OWNER` | Repo owner username. | `octocat` |
| `GITHUB_REPOSITORY_OWNER_ID` | Numeric account ID of repo owner. | `1234567` |
| `GITHUB_RETENTION_DAYS` | Logs/artifact retention period in days. | `90` |
| `GITHUB_RUN_ATTEMPT` | Run attempt number (1 for first, increments on re-run). | `3` |
| `GITHUB_RUN_ID` | Unique run ID within the repo. | `1658821493` |
| `GITHUB_RUN_NUMBER` | Sequential run number for this workflow. | `42` |
| `GITHUB_SERVER_URL` | Base URL of the GitHub instance. | `https://github.com` |
| `GITHUB_SHA` | Commit SHA that triggered the run. | `ffac537e6cbbf934b08745a378932722df287a53` |
| `GITHUB_STEP_SUMMARY` | Path to the step-summary markdown file. | `/home/runner/_layout/_work/_temp/_runner_file_commands/step_summary_<uuid>` |
| `GITHUB_TRIGGERING_ACTOR` | User who initiated this specific run (re-runs differ from `GITHUB_ACTOR`). | `octocat` |
| `GITHUB_WORKFLOW` | Workflow `name:` or path if unnamed. | `My test workflow` |
| `GITHUB_WORKFLOW_REF` | Full workflow file ref. | `octo/repo/.github/workflows/x.yml@refs/heads/main` |
| `GITHUB_WORKFLOW_SHA` | Commit SHA of the workflow file. | `ffac537e...` |
| `GITHUB_WORKSPACE` | Default working directory (where the repo is checked out). | `/home/runner/work/repo/repo` |
| `RUNNER_ARCH` | CPU arch of the runner. | `X86` / `X64` / `ARM` / `ARM64` |
| `RUNNER_DEBUG` | `1` when step debug logging is enabled. | `1` |
| `RUNNER_ENVIRONMENT` | `github-hosted` or `self-hosted`. | `github-hosted` |
| `RUNNER_NAME` | Runner's display name. | `Hosted Agent` |
| `RUNNER_OS` | OS of the runner. | `Linux` / `Windows` / `macOS` |
| `RUNNER_TEMP` | Temp directory cleared at end of job. | `/home/runner/work/_temp` |
| `RUNNER_TOOL_CACHE` | Path to preinstalled tool cache. | `/opt/hostedtoolcache` |

### 4.5.1 Context vs Env-Var Mapping

Most `GITHUB_*` env vars have a `github.*` context counterpart (often lowercased). When choosing one over the other:

- **In shell `run:` blocks**, prefer the env var (already exported). E.g. `"$GITHUB_REF"`.
- **In YAML keys** that don't run a shell (e.g., `if:`, `with:`, `name:`), use the context: `${{ github.ref }}`.
- Avoid expression-interpolating untrusted values (PR titles, branch names) into shell strings — that's a script-injection vector. Prefer reading from env: `env: TITLE: ${{ github.event.pull_request.title }}` then `echo "$TITLE"`.

---

## Sources

- Expressions reference: https://docs.github.com/en/actions/reference/evaluate-expressions-in-workflows-and-actions
- Contexts reference: https://docs.github.com/en/actions/reference/accessing-contextual-information-about-workflow-runs
- Workflow commands reference: https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
- Variables reference (default env vars): https://docs.github.com/en/actions/reference/variables-reference
- Variables guide: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables
