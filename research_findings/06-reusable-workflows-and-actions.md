# Section 6: Reusable Workflows & Custom Actions

This section covers the two primary mechanisms for code reuse in GitHub Actions: **reusable workflows** (a workflow callable from another workflow) and **custom actions** (composite, JavaScript, and Docker container). It includes the `action.yml` schema in full and notes the security and versioning conventions that matter for production use.

---

## 1. Reusable Workflows

A reusable workflow is a normal workflow file under `.github/workflows/` whose `on:` trigger includes `workflow_call`. Once that trigger is present, other workflows can call it as a job.

### 1.1 Defining a reusable workflow

```yaml
# .github/workflows/reusable.yml
on:
  workflow_call:
    inputs:
      config-path:
        required: true
        type: string
    secrets:
      token:
        required: true
    outputs:
      firstword:
        description: "The first output string"
        value: ${{ jobs.example_job.outputs.output1 }}

jobs:
  example_job:
    runs-on: ubuntu-latest
    outputs:
      output1: ${{ steps.s1.outputs.foo }}
    steps:
      - id: s1
        run: echo "foo=hello" >> "$GITHUB_OUTPUT"
```

Notable rules:

- **File location is fixed.** Reusable workflows must live directly in `.github/workflows/`. Subdirectories of `workflows/` are not supported.
- **Inputs are typed.** `inputs.<id>.type` must be one of `string`, `number`, `boolean`. Each input may also declare `required` (default `false`), `default`, and `description`.
- **Secrets are explicit.** Each accepted secret is named under `on.workflow_call.secrets.<name>` with optional `required: true`.
- **Outputs require a job-level output.** `on.workflow_call.outputs.<id>.value` must reference a job output (`${{ jobs.<job_id>.outputs.<name> }}`); you cannot reference a step output directly.
- **`environment:` is not supported on the caller of `workflow_call`.** This means **environment-scoped secrets cannot be passed** from a caller through to a reusable workflow.

### 1.2 Calling a reusable workflow

A caller invokes the reusable workflow as a **job**, not a step:

```yaml
jobs:
  call-workflow:
    uses: octo-org/example-repo/.github/workflows/workflow.yml@v1.2.3
    with:
      config-path: .github/labeler.yml
    secrets:
      token: ${{ secrets.GITHUB_TOKEN }}
```

Reference forms for the `uses:` value:

| Form | Example |
|---|---|
| External repo at semver tag | `octo-org/example/.github/workflows/x.yml@v1` |
| External repo at branch | `octo-org/example/.github/workflows/x.yml@main` |
| External repo at full SHA | `octo-org/example/.github/workflows/x.yml@a1b2c3d…` |
| Same repo (relative path) | `./.github/workflows/x.yml` |

The same-repo form has no `@ref`; **the called workflow is taken from the same commit as the caller**. If a tag and branch share a name, the tag wins.

### 1.3 Passing secrets

Three patterns:

```yaml
# (1) explicit
secrets:
  token: ${{ secrets.MY_TOKEN }}

# (2) inherit (same org/enterprise only)
secrets: inherit

# (3) none — the called workflow gets its own GITHUB_TOKEN
```

**Secret propagation does not chain transitively.** If A → B → C, secrets that A passes to B are not automatically passed from B to C; B must explicitly pass them on (or use `secrets: inherit` itself).

### 1.4 Nesting and quantitative limits

- **Up to 10 levels** of workflows can be connected (1 top-level caller + 9 nested reusable workflows). Older docs sometimes cite "4 levels"; the current limit is 10.
- **Loops are forbidden** in the call graph.
- A single workflow run may reference up to **20 unique reusable workflows** in its call tree.

### 1.5 Matrix on the caller (now supported)

Earlier (pre-Aug 2022) you could not use `strategy.matrix` on a job whose body was `uses:`. **This is now supported:**

```yaml
jobs:
  deploy:
    strategy:
      matrix:
        target: [dev, stage, prod]
    uses: octocat/octo-repo/.github/workflows/deployment.yml@main
    with:
      target: ${{ matrix.target }}
```

### 1.6 Outputs in the caller

```yaml
jobs:
  call:
    uses: ./.github/workflows/reusable.yml
  use-output:
    needs: call
    runs-on: ubuntu-latest
    steps:
      - run: echo "${{ needs.call.outputs.firstword }}"
```

### 1.7 Visibility for private/internal repos

For a workflow in a **private** repo to be callable from another repo in the same org/enterprise, the source repo's owner must opt in:

> Settings → Actions → General → **Access** → "Accessible from repositories in the …" (none / same org / enterprise).

Public-repo workflows are callable from anywhere by default.

### 1.8 Reusable workflows vs composite actions — when to use which

| | Reusable workflow | Composite action |
|---|---|---|
| Unit of reuse | A whole **job** (or several jobs) | A sequence of **steps** inside a job |
| Has its own runner / `runs-on` | Yes (each job picks one) | No, runs on the caller's runner |
| `strategy.matrix` | Supported on the caller | Not supported |
| `concurrency` | Supported | Not supported |
| `environment:` (secrets/protection rules) | Inside the reusable workflow's jobs | Not supported |
| `permissions:` re-declaration | Yes, on each job | Inherits from caller job |
| Secrets | Declared explicitly or `inherit` | Inherits ambient env from caller |
| Where it lives | `.github/workflows/*.yml` | `action.yml` in any directory or repo |
| Versioning | `@ref` (tag/branch/SHA) | `@ref` (tag/branch/SHA) |
| Nesting depth | Up to 10 levels | Composite-in-composite supported |

Rule of thumb: if you want to **encapsulate a few steps** (e.g. "set up Bun + cache + install"), use a **composite action**. If you want to **share an entire job or pipeline** (matrix builds, deploy with environment protection, multi-runner build/test/release), use a **reusable workflow**.

### 1.9 Pinning — security implications

- `@v1` (floating major tag) — convenient; trusts the publisher to never compromise the tag. Common Marketplace convention.
- `@main` — risky; HEAD of branch can change at any time.
- `@<full-40-char-SHA>` — immutable; recommended for security-critical or third-party workflows. GitHub's own hardening guides advocate this for any third-party action/workflow.

A tag and branch with the same name resolve to the **tag**.

---

## 2. `action.yml` — the metadata schema

Every custom action (regardless of type) is declared by a single `action.yml` (or `action.yaml`) at the action's root.

### 2.1 Top-level keys

| Key | Required | Notes |
|---|---|---|
| `name` | yes | Shown in the **Actions** tab and in Marketplace listings. |
| `author` | no | Free text. |
| `description` | yes | Brief one-liner. |
| `inputs` | no | Map of input definitions (see below). |
| `outputs` | no | Map of output definitions (see below). Total output payload across all steps in a job is capped (≈ 1 MB per job, 50 MB per workflow). |
| `runs` | yes | The execution block — its shape depends on `runs.using`. |
| `branding` | no | Marketplace badge. `icon` and `color`. |

### 2.2 Inputs

```yaml
inputs:
  who-to-greet:
    description: 'Who to greet'
    required: true
    default: 'World'
    deprecationMessage: 'Use greet-target instead'
```

- Each input id must start with a letter or underscore and contain only alphanumerics, `-`, `_`.
- The runner exposes each input to JS/Docker actions as the env var `INPUT_<UPPERCASED_ID_WITH_HYPHENS_REPLACED_BY_UNDERSCORES>` — e.g. `INPUT_WHO_TO_GREET`.
- **Composite actions do NOT get `INPUT_*` env vars automatically.** They access inputs only via `${{ inputs.<id> }}`.

### 2.3 Outputs

For **JavaScript and Docker** actions, outputs declare description only — values are produced at runtime by writing `name=value` lines to `$GITHUB_OUTPUT`:

```yaml
outputs:
  time:
    description: 'The time we greeted you'
```

For **composite** actions, `value:` is **required** and references an inner step's output:

```yaml
outputs:
  time:
    description: 'The time we greeted you'
    value: ${{ steps.greet.outputs.time }}
```

### 2.4 `runs.using`

| Value | Meaning | Status |
|---|---|---|
| `composite` | Inline steps in `runs.steps[]` | current |
| `node20` | JS action on Node 20 | current |
| `node24` | JS action on Node 24 | current |
| `node16` | JS action on Node 16 | **deprecated** (EOL'd; warnings emitted) |
| `node12` | JS action on Node 12 | **deprecated / removed** |
| `docker` | Docker container action | current (Linux only) |

### 2.5 Per-type `runs:` shape

**JavaScript:**

```yaml
runs:
  using: 'node20'
  main: 'dist/index.js'
  pre: 'dist/setup.js'         # optional
  pre-if: runner.os == 'Linux' # optional, defaults to always() when pre is set
  post: 'dist/cleanup.js'      # optional
  post-if: success()           # optional, defaults to always() when post is set
```

**Composite:**

```yaml
runs:
  using: 'composite'
  steps:
    - name: Echo
      id: e1
      run: echo "hello ${{ inputs.who-to-greet }}"
      shell: bash             # REQUIRED for run steps
    - uses: actions/checkout@v4   # nested action call
      with:
        fetch-depth: 0
```

Allowed step keys: `id`, `name`, `if`, `env`, `working-directory`, `run`, `shell`, `uses`, `with`, `continue-on-error`.

**Docker container:**

```yaml
runs:
  using: 'docker'
  image: 'Dockerfile'                # OR 'docker://ghcr.io/owner/img:tag'
  pre-entrypoint: 'pre.sh'           # optional
  entrypoint: '/entrypoint.sh'       # optional, overrides Dockerfile ENTRYPOINT
  post-entrypoint: 'cleanup.sh'      # optional
  args:
    - ${{ inputs.who-to-greet }}
  env:
    GREETING: 'Hello'
```

### 2.6 Branding

```yaml
branding:
  icon: 'activity'   # Feather v4.28.0 icon name
  color: 'blue'
```

`color` allowed values: **`white`, `black`, `yellow`, `blue`, `green`, `orange`, `red`, `purple`, `gray-dark`**.

`icon` is a Feather v4.28.0 icon name. The full allowed list (a few Feather icons are explicitly **excluded**: `coffee`, `columns`, `divide-circle`, `divide-square`, `divide`, `frown`, `hexagon`, `key`, `meh`, `mouse-pointer`, `smile`, `tool`, `x-octagon`). Common usable icons include: `activity`, `alert-circle`, `alert-triangle`, `archive`, `award`, `book`, `box`, `check-circle`, `cloud`, `code`, `cpu`, `database`, `download`, `edit`, `eye`, `feather`, `file`, `file-text`, `filter`, `flag`, `folder`, `git-branch`, `git-commit`, `git-merge`, `git-pull-request`, `globe`, `hard-drive`, `hash`, `heart`, `image`, `info`, `layers`, `link`, `lock`, `package`, `play`, `power`, `refresh-cw`, `search`, `send`, `server`, `settings`, `shield`, `star`, `tag`, `target`, `terminal`, `trash`, `upload`, `users`, `zap`. (Full list in the GitHub docs link below.)

---

## 3. Composite Actions

A composite action bundles a sequence of steps into a reusable unit. It is platform-agnostic (whatever the caller's runner can do, the composite can do).

### 3.1 Layout

Either a dedicated repo:

```
my-action/
  action.yml
  scripts/setup.sh
```

Or a subfolder of the consumer repo, conventionally:

```
.github/actions/setup-bun/
  action.yml
```

Used by the consumer with `uses: ./.github/actions/setup-bun`.

### 3.2 Inner steps

Composite step keys mirror workflow steps with a few important differences:

- **`run` requires `shell:`** explicitly. There is no inherited default; you must specify (e.g. `shell: bash`, `shell: pwsh`, `shell: 'python'`).
- **`uses:`** can call any other action — nesting composites and JS/Docker actions is supported.
- **Inputs are accessed only via `${{ inputs.<id> }}`** (no auto-set `INPUT_*` env vars).
- `id`, `if`, `env`, `working-directory`, `with`, `continue-on-error` all behave as in workflow steps.
- The path of the action's own files is exposed via `${{ github.action_path }}`.

### 3.3 Outputs

Outputs must be wired up explicitly:

```yaml
outputs:
  result:
    description: 'Final result'
    value: ${{ steps.final.outputs.x }}

runs:
  using: 'composite'
  steps:
    - id: final
      run: echo "x=42" >> "$GITHUB_OUTPUT"
      shell: bash
```

### 3.4 Limitations vs reusable workflows

A composite cannot:

- declare a `strategy.matrix`
- declare `concurrency`
- declare an `environment:`
- override `runs-on`

These belong to the surrounding job in the caller workflow.

### 3.5 Default shell

There is **no `defaults.run.shell` at the `action.yml` level** — every `run` step must set its own `shell:`. (`defaults` is a workflow-level concept, not an action-metadata concept.)

---

## 4. JavaScript Actions

The fastest action type and the only one that runs natively on **all hosted-runner OSes** (Linux, Windows, macOS).

### 4.1 Runtime

Use `runs.using: 'node20'` for current actions. `node24` is also supported. `node16` is deprecated (warnings emitted; scheduled removal). New actions should target `node20` or later.

### 4.2 Entry points

```yaml
runs:
  using: 'node20'
  main: 'dist/index.js'
  pre: 'dist/setup.js'
  post: 'dist/cleanup.js'
```

`pre`/`post` are useful for setup (e.g. authenticate to a service) and teardown (e.g. always upload logs even on failure).

### 4.3 Bundling

Action repos must include the JS that actually runs. Two approaches:

- **Commit `node_modules/`** — discouraged; bloats the repo.
- **Commit a bundled `dist/index.js`** — the standard pattern. Tools used:
  - `@vercel/ncc` — `ncc build src/index.ts -o dist` produces a single self-contained JS file. This is the dominant convention.
  - `rollup` / `esbuild` are also valid.

CI on the action's own repo typically asserts `dist/` is up to date (e.g. via a "no-uncommitted-changes" check after rebuild).

### 4.4 Toolkit packages

| Package | Purpose |
|---|---|
| `@actions/core` | I/O primitives: `getInput`, `getBooleanInput`, `setOutput`, `setFailed`, `info`/`warning`/`error`, `setSecret` (masking), `exportVariable`, `addPath`, `summary`, `group`/`endGroup`, `saveState`/`getState` (pre/main/post handoff). |
| `@actions/github` | Pre-authenticated Octokit (`getOctokit(token)`) and the `context` object (event payload, repo, sha, etc.). |
| `@actions/exec` | `exec(cmd, args, opts)` with stdout/stderr capture. |
| `@actions/io` | Cross-platform fs helpers: `which`, `mkdirP`, `cp`, `mv`, `rmRF`. |
| `@actions/cache` | `saveCache` / `restoreCache` for the cache backend. |
| `@actions/artifact` | Upload/download workflow artifacts. |
| `@actions/tool-cache` | Download / extract tools and cache them across runs. |

### 4.5 Inputs and outputs at runtime

- Inputs: `core.getInput('name')` — reads `INPUT_NAME` env var that the runner set automatically. Hyphens in the `action.yml` id are converted to underscores when uppercased.
- Outputs: `core.setOutput('name', value)` — appends to the file at `$GITHUB_OUTPUT` (replacing the older `::set-output::` workflow command, which is deprecated).
- Failure: `core.setFailed('reason')` — sets exit code and logs an error.

### 4.6 State between pre/main/post

`core.saveState('key', value)` in `pre` or `main` is readable via `core.getState('key')` in `post`. The runner persists these to env vars (`STATE_<key>`) under the hood.

### 4.7 Cross-platform

Pure-JS actions run identically on Linux, Windows, macOS — no native binary dependencies, no shell assumptions. Anything that shells out should use `@actions/exec` and avoid Bash-isms.

---

## 5. Docker Container Actions

Bundle a full OS environment with the action's code. Highest reproducibility, but heaviest and most constrained.

### 5.1 Hard constraint: Linux only

Docker container actions can run **only on Linux runners**. Hosted `windows-*` and `macos-*` runners cannot execute them. Self-hosted runners need Linux + Docker installed.

### 5.2 Image source

Two options for `runs.image`:

```yaml
# (a) Build from a Dockerfile in the action repo
runs:
  using: 'docker'
  image: 'Dockerfile'

# (b) Pull a prebuilt image
runs:
  using: 'docker'
  image: 'docker://ghcr.io/owner/my-image:1.2.3'
```

Form (b) is faster on cold start (no build) and pins the runtime by digest if you use one (`docker://image@sha256:…`).

### 5.3 Inputs

The runner passes inputs two ways:

- As **env vars** `INPUT_<NAME>` (always — automatic).
- As **command-line args** if you supply `runs.args:`. The `args` array is templated per-call:

  ```yaml
  runs:
    using: 'docker'
    image: 'Dockerfile'
    args:
      - ${{ inputs.who-to-greet }}
      - --verbose
  ```

  These become `CMD` to the container, appended after the entrypoint.

### 5.4 Entrypoint hooks

```yaml
runs:
  using: 'docker'
  image: 'Dockerfile'
  pre-entrypoint: '/setup.sh'    # runs before main entrypoint
  entrypoint: '/run.sh'          # overrides Dockerfile ENTRYPOINT
  post-entrypoint: '/cleanup.sh' # always runs (with `post-if` style semantics)
  env:
    LOG_LEVEL: debug
```

`pre-entrypoint` and `post-entrypoint` run in **separate container invocations** from the main entrypoint.

### 5.5 USER and filesystem

The runner mounts:

- **`GITHUB_WORKSPACE`** (the checked-out repo) → `/github/workspace` (cwd inside container)
- **`GITHUB_EVENT_PATH`** → `/github/workflow/event.json` (the event payload)
- **`HOME`** → `/github/home`
- A few others (`/github/file_commands`, etc.)

The container's `USER` must be either `root` or able to read/write `/github/workspace`. A common gotcha: `Dockerfile`s that switch to a non-root `USER` whose UID doesn't match the workspace owner will fail with permission errors. Easiest solution: leave the container as root, or `chown` `/github/workspace` in the entrypoint.

### 5.6 Networking

The container shares the runner's network namespace — it can reach whatever the runner can reach (services, localhost ports of sibling steps, the internet).

### 5.7 Private registries

There is **no built-in** `with:`-style auth for `runs.image: 'docker://...'` private registries. Workarounds:

- Run a `docker login` step **before** the action step (the daemon's auth state then makes the pull succeed).
- Or build from `Dockerfile` and use a multi-stage `FROM` whose base is public.
- Or push the image to GHCR using the workflow's `GITHUB_TOKEN` (which has registry scope) and reference it with `docker://ghcr.io/...`.

### 5.8 Why pick Docker

- You need a specific OS / system packages / language runtime not on the runner.
- You need byte-for-byte reproducibility.
- Your tool ships as a binary that's hard to redistribute via npm/pip.

### 5.9 Why **not** pick Docker

- Slower cold start (build or pull on every run).
- Linux runners only.
- Can't run on macOS/Windows users' machines.
- Larger surface area for runner permissions issues.

---

## 6. Action Versioning Best Practices

| Reference | Behavior | Use when |
|---|---|---|
| `@v3` (major tag) | Re-pointed by maintainer to latest 3.x | You trust the publisher; you want bug-fix updates |
| `@v3.1.4` (full tag) | Pinned to one release | You want stability + readable diffs in dependabot PRs |
| `@<40-char-SHA>` | Immutable — no one can overwrite | Security-critical or any third-party action |
| `@main` | HEAD of default branch | Internal/test only — never for prod |

Conventions:

- Marketplace publishers maintain a major tag (`v1`, `v2`, …) that floats to the latest minor/patch.
- Verified-creator actions (Marketplace blue checkmark) are reviewed by GitHub but are still re-pointable tags — pin SHAs if you need supply-chain safety.
- Dependabot's `package-ecosystem: github-actions` updates these references.
- For internal reusable workflows in a monorepo, pinning to `@main` from same-repo callers is fine (it just resolves to the same commit anyway via `./.github/...`).

---

## 7. Marketplace Publishing (brief)

To publish an action to the Marketplace:

1. Action lives in a public repo with `action.yml` at the root.
2. Repo settings → enable "Publish this Action to the GitHub Marketplace."
3. Each release with a tag becomes a Marketplace listing version.
4. `branding.icon` + `branding.color` produce the badge.
5. Verified-creator status is per-org; GitHub reviews and grants it.

---

## Sources

- https://docs.github.com/en/actions/using-workflows/reusing-workflows
- https://docs.github.com/en/actions/creating-actions/about-custom-actions
- https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions
- https://docs.github.com/en/actions/creating-actions/creating-a-composite-action
- https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action
- https://docs.github.com/en/actions/creating-actions/creating-a-docker-container-action
- https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions (pinning to SHA recommendation)
- https://github.com/actions/toolkit (toolkit packages)
- https://github.com/vercel/ncc (`@vercel/ncc` bundler)
