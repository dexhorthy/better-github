# Section 5: Runners, Environments, Concurrency, Matrix

This section covers the GitHub Actions execution model: where jobs run (hosted and self-hosted runners), how to gate them with environments, how to serialize/cancel them with `concurrency`, how to fan out with `strategy.matrix`, and how to run them inside Docker containers and alongside service containers.

---

## 1. Hosted Runners

GitHub-hosted runners are ephemeral VMs provisioned per job. Each job gets a clean VM, and the VM is destroyed at job end.

### 1.1 Available labels (April 2026)

Hosted runner labels are case-insensitive strings used in `runs-on:`. The currently supported standard images are managed in [actions/runner-images](https://github.com/actions/runner-images).

**Linux:**
- `ubuntu-latest` — currently aliased to `ubuntu-24.04` (the alias was migrated from 22.04 → 24.04 during 2025; pin explicitly if you care)
- `ubuntu-24.04`
- `ubuntu-22.04`
- `ubuntu-20.04` — deprecated/removed (do not use in new workflows)
- `ubuntu-24.04-arm` / `ubuntu-22.04-arm` — public-preview ARM64 standard runners (announced under the partner-runner-images program)

**Windows:**
- `windows-latest` — currently aliased to `windows-2022`
- `windows-2025` — generally available
- `windows-2022`
- `windows-2019` — deprecated/removed
- `windows-11-arm` — preview ARM64

**macOS:**
- `macos-latest` — currently aliased to `macos-15` (Apple silicon)
- `macos-15` — Apple silicon (M1/M2)
- `macos-14` — Apple silicon (M1)
- `macos-14-large` / `macos-15-large` — Intel x86_64 variants
- `macos-13` — Intel x86_64
- `macos-13-xlarge` — Apple silicon
- `macos-12` — deprecated

> **Always pin if you depend on tooling versions.** `*-latest` aliases roll forward and silently break workflows. The runner-images repo posts deprecation notices ~6 months before alias migration.

### 1.2 Hardware specs — standard runners

Per GitHub's published specs (free for public repos; metered for private):

| OS | vCPU | RAM | SSD |
|---|---|---|---|
| Linux (x64) | 4 | 16 GB | 14 GB |
| Linux (ARM64, preview) | 4 | 16 GB | 14 GB |
| Windows (x64) | 4 | 16 GB | 14 GB |
| Windows (ARM64) | 4 | 16 GB | 14 GB |
| macOS (Apple silicon `macos-14`/`macos-15`) | 3 | 7 GB | 14 GB |
| macOS (Intel `*-large`) | 4 | 14 GB | 14 GB |

Note: GitHub upgraded the default Linux/Windows runners from 2-core to 4-core in 2024. Older docs and many third-party guides still say "2 vCPU / 7 GB"; the current default is 4 vCPU / 16 GB on Linux and Windows public-repo runners.

### 1.3 Larger runners

Larger runners are hosted by GitHub but configured at the **organization or enterprise level** (not free orgs — Team plan or higher required). They are not discovered by label alone — admins must pre-create them in `Settings → Actions → Runners → New larger runner`.

**Sizes (Linux/Windows):** 4, 8, 16, 32, 64, 96-core variants. Naming follows the convention `<os>-<size>core` or admin-chosen custom labels (e.g. `ubuntu-22.04-16core`, `4-core-ubuntu`).

**Disk:** larger runners ship with significantly more SSD (up to 2 TB on the largest sizes) and proportionally scaled RAM (e.g. 16-core ≈ 64 GB RAM).

**GPU runners:** Linux GPU runners with NVIDIA T4 (4-core / 28 GB / GPU) and A10 variants are available for org-level configuration; these are billed at premium per-minute rates.

**ARM runners:** ARM64 larger runners (`*-arm`) are supported on Linux and Windows; Apple silicon (M-series) on macOS is available via `macos-*-xlarge` labels.

**Static IPs / private networking:** larger runners can be configured with static IPv4 egress and Azure private networking — useful for allowlisting CI traffic to internal services.

**Targeting larger runners** — use either a label or the `group:` map form:
```yaml
runs-on: ubuntu-22.04-16core           # by label
# or
runs-on:
  group: my-large-runners
  labels: [ubuntu-22.04-16core]
```

### 1.4 Pre-installed software

Standard images include common toolchains: Git, GitHub CLI, Docker (Linux/Windows only — macOS no longer ships Docker on hosted runners), Node.js (multiple LTS versions), Python, Ruby, Go, .NET SDK, Java (Adoptium), PowerShell, Azure CLI, AWS CLI, gcloud, kubectl, Helm, Terraform, etc. The complete tool inventory per image is published in:

- [actions/runner-images](https://github.com/actions/runner-images) — x64 standard images (Linux, Windows, macOS)
- [actions/partner-runner-images](https://github.com/actions/partner-runner-images) — ARM64 images

Each image has a per-release `images/<os>/Ubuntu24-Readme.md` (or similar) snapshot listing every preinstalled package and version.

### 1.5 Concurrency limits per plan

Maximum concurrent jobs across all repositories in an account, per plan:

| Plan | Total concurrent jobs | macOS jobs (subset) |
|---|---|---|
| Free | 20 | 5 |
| Pro | 40 | 5 |
| Team | 60 | 5 |
| Enterprise | 180 | 50 |
| Enterprise + larger runners | 500 | 50 |

Exceeding the limit queues additional jobs. There is also a 1000-API-requests-per-hour-per-repo cap on Actions API calls.

### 1.6 Network

- **Outbound only.** Hosted runners initiate all connections; no inbound ports.
- **IP ranges.** Hosted runners run in Azure data centers. The current IPv4 ranges are published at `GET https://api.github.com/meta` under the `actions` key. They change frequently (weekly+) — do not hardcode; pull from `/meta` and refresh.
- **Allowlist for outbound.** Required hostnames for the runner itself: `github.com`, `api.github.com`, `*.actions.githubusercontent.com`, `codeload.github.com`, `*.pkg.github.com`, `ghcr.io`, `*.blob.core.windows.net` (artifacts/cache), `objects.githubusercontent.com`. The list is enumerated in the GitHub docs under "About GitHub-hosted runners".
- **Bandwidth.** Documented minimum: 70 kbps up/down. Inbound ICMP is blocked (Azure-wide policy).
- **No IPv6** on standard runners as of writing.

---

## 2. Self-Hosted Runners

Self-hosted runners are machines you operate that connect outbound to GitHub and pull jobs.

### 2.1 Supported architectures and OS

| OS | Architectures |
|---|---|
| Linux | x64, ARM64, ARM (32-bit) |
| macOS | x64, ARM64 (Apple silicon) |
| Windows | x64, ARM64 |

Container support is Linux-only (the runner agent itself runs on all three).

### 2.2 Installation

The runner agent is downloaded from `https://github.com/actions/runner/releases`. Three setup files:

- **Configure:** `./config.sh` (Linux/macOS) or `config.cmd` (Windows). Requires a registration token from `Settings → Actions → Runners → New self-hosted runner` (repo, org, or enterprise scope). Token is short-lived (~1h).
- **Run interactive:** `./run.sh` / `run.cmd` — runs in foreground, useful for testing.
- **Install as service:** `./svc.sh install` (Linux/macOS, systemd) or `.\svc install` (Windows service). Auto-restart on host reboot.

```bash
# Typical Linux registration
./config.sh --url https://github.com/myorg/myrepo \
            --token AAAAA... \
            --name my-runner-01 \
            --labels "linux,x64,gpu,docker" \
            --runnergroup default \
            --work _work
sudo ./svc.sh install
sudo ./svc.sh start
```

### 2.3 Labels

**Default labels (auto-applied):**
- `self-hosted` — every self-hosted runner gets this
- One of: `linux`, `windows`, `macOS`
- One of: `x64`, `arm64`, `arm`

**Custom labels** can be added at `config.sh --labels` time or later via the GitHub UI / REST API. Common conventions: `gpu`, `docker`, `production`, `kubernetes`, `large-disk`.

### 2.4 Targeting via `runs-on`

Self-hosted runners are matched by **logical AND** of all labels in the array:

```yaml
runs-on: [self-hosted, linux, x64, gpu]
```

A runner must carry every label listed. Best practice: always include `self-hosted` plus at least the OS and architecture labels to avoid accidentally landing on a hosted runner that happens to share a custom label name.

### 2.5 Runner groups

Available at **organization or enterprise** scope (not on personal/Free orgs). Groups segment runners and gate which repositories may schedule jobs to them — important for security (don't let a public repo target an internal-network runner).

```yaml
runs-on:
  group: production-runners
  labels: [linux, x64]
```

The runner must be in the named group **and** carry all listed labels. Group access policy lives in `Settings → Actions → Runner groups`: list of allowed repositories, allow/deny public repos, allow workflows from public forks (default off — for good reason).

### 2.6 Just-in-time (JIT) runners

JIT runners are short-lived runners provisioned via API for a single job. Generated via `POST /repos/{owner}/{repo}/actions/runners/generate-jitconfig` (or org/enterprise equivalent), which returns a base64-encoded JIT config. The runner is started with `./run.sh --jitconfig <token>`, picks up exactly one job, then exits. Used by autoscalers for stronger isolation than long-lived runners.

### 2.7 Auto-scaling — Actions Runner Controller (ARC)

ARC is the official Kubernetes operator for self-hosted runners ([actions/actions-runner-controller](https://github.com/actions/actions-runner-controller)). It watches a `RunnerScaleSet` CR, polls GitHub for queued jobs targeting its labels, and provisions ephemeral pods.

Key concepts:
- **Ephemeral mode (default & recommended):** each runner pod handles exactly one job, then the pod is deleted. Eliminates job-to-job state leakage.
- **Scale set:** declares min/max replicas, runner image, pod spec, GitHub URL, and registration token (or GitHub App credentials).
- **Runs in K8s:** isolation per job via pod boundaries; can use `runAsUser`, `securityContext`, etc.

ARC has largely replaced earlier autoscalers (e.g. summerwind/actions-runner-controller, philips-labs/terraform-aws-github-runner remains popular for non-K8s AWS deployments).

### 2.8 Security — trust boundaries

> **Self-hosted runners must NOT be used on public repositories.** This is GitHub's explicit guidance.

The risk: a fork PR can run arbitrary code in `pull_request` workflows. On a hosted ephemeral runner that's contained to a one-shot VM. On a self-hosted runner, the fork gets a shell on **your** infrastructure, persistent between jobs (unless ephemeral), with whatever network access that machine has.

Mitigations if you must:
- Use **ephemeral** runners (one job per runner instance).
- Disable "run workflows from forks" in the runner group settings.
- Use **Required reviewers** on environments to gate PR-triggered workflows.
- Network-isolate runners; no access to internal secrets/networks they don't strictly need.
- Consider `pull_request_target` carefully — but be aware it gives the fork access to repo secrets unless you scope.

### 2.9 Communication

- **Outbound HTTPS only**, long-poll style. The runner opens a long-poll connection to GitHub and waits for job dispatch.
- **No inbound ports required.** This is a major operational advantage over Jenkins-style agents.
- Required egress: `github.com`, `api.github.com`, `*.actions.githubusercontent.com`, `codeload.github.com`, `*.pkg.github.com`, `ghcr.io`, `objects.githubusercontent.com`, plus any registries/services your jobs touch.

---

## 3. `runs-on` syntax — reference

Three forms accepted by the parser:

```yaml
# 1. Single label string
runs-on: ubuntu-latest

# 2. Array — logical AND across all labels
runs-on: [self-hosted, linux, x64, gpu]

# 3. Group map — runner group + optional labels
runs-on:
  group: production-runners
  labels: [linux, x64]

# Variant: group only
runs-on:
  group: production-runners

# Variant: group + single label as string
runs-on:
  group: production-runners
  labels: ubuntu-22.04-16core
```

You may use expressions, including `${{ inputs.foo }}` and `${{ matrix.os }}`:

```yaml
runs-on: ${{ matrix.os }}
runs-on: [self-hosted, "${{ inputs.runner-arch }}"]
```

---

## 4. Containers and Services

### 4.1 Job container — `jobs.<id>.container`

Runs every step of the job inside a Docker container on the runner.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20-bookworm
      credentials:
        username: ${{ secrets.REGISTRY_USER }}
        password: ${{ secrets.REGISTRY_TOKEN }}
      env:
        NODE_ENV: test
      ports:
        - 8080
      volumes:
        - my_data:/data
        - /tmp:/tmp
      options: --cpus 2 --memory 4g --user 1001
```

Field reference:

| Field | Type | Notes |
|---|---|---|
| `image` | string | Full image ref. Required. Empty `image:` is allowed in container actions but not at the job level. |
| `credentials.username` | string | Registry login. |
| `credentials.password` | string | Registry login (use a secret). |
| `env` | map | Env vars set inside the container. |
| `ports` | array | Ports to expose on the container. |
| `volumes` | array | Bind/named-volume mounts: `name:/path`, `/host:/container`, `/path` (anonymous). |
| `options` | string | Extra `docker create` flags. **Excluded:** `--network`, `--entrypoint`, `--workdir`, and `-v`/`--volume` are reserved/managed by the runner; setting them produces an error. |

Steps run as the container's default user. GitHub injects the workspace at `/__w/<repo>/<repo>` and the runner toolcache, mounting necessary volumes automatically.

**Linux only.** Job-level containers do not work on Windows or macOS hosted runners.

### 4.2 Service containers — `jobs.<id>.services`

Service containers run **alongside** the job container (or alongside the runner if no job container). Same shape as `container`:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container: node:20
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: pw
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - run: psql -h postgres -U postgres -c 'select 1;'
        env:
          PGPASSWORD: pw
```

**Network linking — the rule:**

| Job runs… | Reach service via |
|---|---|
| In a container (`jobs.<id>.container` set) | Service hostname = service id, e.g. `postgres:5432`. Docker user-defined bridge handles DNS. |
| Directly on runner (no `container:`) | `localhost:<host-mapped-port>`. You **must** declare `ports: ["5432:5432"]` (or similar) — without an explicit host mapping, the port is unreachable from the host. |

**Lifecycle:**
- Pulled fresh per job (Docker layer cache helps but no warmth across jobs).
- Started before steps, stopped and removed after the job ends, regardless of success.
- Runner waits for service container to be running but **does not by default wait for readiness** — use `options: --health-cmd ... --health-interval ...` and Docker will mark the container "healthy"; the runner waits for healthy state if a healthcheck is defined.

**Limitations:**
- **Linux only** (Ubuntu hosted runners or Linux self-hosted with Docker).
- Service containers cannot be defined inside composite actions (Docker container actions can't nest services).
- All services share the job's user-defined network.

---

## 5. Environments

Environments are a deployment target abstraction with optional protection rules and scoped secrets/variables.

### 5.1 Definition and location

Defined in repository settings: `Settings → Environments → New environment`. Names are case-insensitive, max 255 characters, unique per repo. On Free plan, environments are public-repo only; Team/Pro/Enterprise add private-repo support.

### 5.2 Protection rules

| Rule | Limits | Notes |
|---|---|---|
| **Required reviewers** | 1–6 reviewers (users or teams) | Only one needs to approve. Optional "Prevent self-review" blocks the run-triggering user from approving. |
| **Wait timer** | 0–43,200 minutes (30 days) | Job sits in "waiting" state for this duration before running. |
| **Deployment branch and tag policy** | One of: "All branches", "Protected branches only", or "Selected branches and tags" with name patterns | Restricts which refs can deploy to this environment. |
| **Custom deployment protection rules** | Provided by GitHub Apps | E.g. ServiceNow change-management gates, observability "is staging healthy?" gates. The job pauses in `waiting` state until the App callbacks approve. |
| **Allow administrators to bypass** | Boolean | Default on. Disable for hardened prod. |

### 5.3 Environment secrets and variables

Secrets and variables defined on an environment are **only available to jobs that reference that environment** via `jobs.<id>.environment`. Resolution order: environment → repo → org. Environment secrets take precedence over repo secrets of the same name.

### 5.4 Workflow syntax

```yaml
# String form
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

# Object form with URL
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: ${{ steps.deploy.outputs.app-url }}
    steps:
      - id: deploy
        run: ./deploy.sh
```

The `url` is shown in the GitHub UI under the deployment record and on the PR/commit view. Expressions are allowed, typically referencing a step output set by the deploy step.

### 5.5 Deployment events

When a job with `environment:` runs, GitHub creates a Deployment object (REST: `/repos/{owner}/{repo}/deployments`) and emits `deployment` and `deployment_status` webhook events. This integrates with external systems (Datadog deploy markers, Sentry releases, etc.) without manual API calls.

---

## 6. Concurrency

`concurrency` lets you serialize or cancel runs that share a key. Available at workflow level (top-level `concurrency:`) and at job level (`jobs.<id>.concurrency:`).

### 6.1 Syntax

```yaml
# Workflow level — short form (group only, no cancel)
concurrency: production_environment

# Workflow level — full form
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

# Job level
jobs:
  deploy:
    concurrency:
      group: deploy-${{ github.ref }}
      cancel-in-progress: false
```

### 6.2 `group:`

Any string expression. Common context references: `github.ref`, `github.workflow`, `github.event.pull_request.number`, `github.head_ref`, `inputs.*`, `vars.*`, `matrix.*`, `needs.*.outputs.*`. **`secrets` is NOT available in concurrency expressions** — the group is evaluated at run-submission time, before secrets are resolved.

Group names are case-insensitive.

### 6.3 `cancel-in-progress:`

Accepts `true`, `false`, or an expression evaluating to a boolean. The expression form (added in 2024) is fully supported:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

This pattern cancels in-progress runs on feature branches but lets `main` runs complete (avoids killing a deploy mid-flight while still keeping PR CI snappy).

### 6.4 Behavior

For any concurrency group, GitHub maintains **at most one running and one pending** run:

1. Run A starts. Group state: `[running: A]`.
2. Run B is queued in the same group.
   - If `cancel-in-progress: true` → A is canceled, B starts. State: `[running: B]`.
   - If `cancel-in-progress: false` → A keeps running, B waits. State: `[running: A, pending: B]`.
3. Run C is queued while B is pending.
   - **B is canceled and replaced by C** (regardless of `cancel-in-progress`). Only the latest pending run survives. State: `[running: A, pending: C]`.

This "newest pending wins" rule is important: there is no FIFO queue.

### 6.5 Common patterns

**PR canceling — kill the previous run when a new commit is pushed:**
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```
Falling back to `github.run_id` ensures non-PR events get a unique group (so they're never canceled).

**Production deploy serialization — never two prod deploys at once, never cancel in flight:**
```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

**Per-environment matrix:**
```yaml
jobs:
  deploy:
    strategy:
      matrix:
        env: [staging, production]
    concurrency:
      group: deploy-${{ matrix.env }}
      cancel-in-progress: false
```

### 6.6 Limitations

- `secrets` context is unavailable in concurrency expressions.
- A canceled-due-to-concurrency run shows as "canceled" — there is no specific status differentiating it from a manual cancel.
- Concurrency does not retroactively cancel — if a workflow already completed, queuing a new one in the same group has no effect.

---

## 7. Matrix strategies

`strategy.matrix` fans out a single job into many runs varying by configuration. Defined under `jobs.<id>.strategy`.

### 7.1 Basic syntax

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
```

This produces 3 × 3 = 9 jobs (Cartesian product).

### 7.2 `include` and `exclude`

**Resolution order (important):**
1. Compute Cartesian product of all top-level matrix variables.
2. Apply `exclude:` — remove combinations matching every key in each exclude entry.
3. Apply `include:` — for each include entry:
   - If all matrix-variable keys in the entry match an existing combination, **augment** that combination with the entry's extra keys.
   - Otherwise, **add** a new combination.
4. The resulting list is the final job set.

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest]
    node: [18, 20, 22]
    exclude:
      - os: windows-latest
        node: 18
    include:
      # Augment: adds 'experimental: true' to the Linux/Node 22 combo
      - os: ubuntu-latest
        node: 22
        experimental: true
      # New combination: macOS Node 20 with extra coverage flag
      - os: macos-latest
        node: 20
        coverage: true
```

This yields: 6 base combinations − 1 excluded + 1 new = 6 jobs total, with one of them carrying `experimental: true` and the new macOS one carrying `coverage: true`.

### 7.3 `fail-fast`

```yaml
strategy:
  fail-fast: true   # default
```

When `true` (default), the **first failure** in any matrix leg cancels all other in-flight legs and refuses to start any not-yet-started legs. Set to `false` to let every leg run to completion regardless of others' outcomes — useful when you want full coverage of which combinations break.

### 7.4 `max-parallel`

Caps how many matrix legs run concurrently, regardless of available runners and account-level concurrency. Useful for rate-limiting against external services:

```yaml
strategy:
  matrix:
    region: [us-east-1, us-west-2, eu-west-1, ap-northeast-1]
  max-parallel: 2
```

### 7.5 Dynamic matrix from job output

A common pattern: one setup job emits JSON; a downstream job consumes it as the matrix.

```yaml
jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.build.outputs.matrix }}
    steps:
      - id: build
        run: |
          echo 'matrix={"target":["a","b","c"]}' >> "$GITHUB_OUTPUT"

  fanout:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      matrix: ${{ fromJSON(needs.setup.outputs.matrix) }}
    steps:
      - run: ./build.sh ${{ matrix.target }}
```

The `fromJSON` parses the string output into the matrix structure. The shape can include top-level vars, `include`, and `exclude`.

### 7.6 Limits

- **256 jobs maximum** per matrix per workflow run (Cartesian product after include/exclude).
- **10 dimensions maximum** (top-level matrix keys, not including `include`/`exclude`).
- Each leg counts against the account's concurrency cap.

### 7.7 Naming matrix legs

By default, GitHub generates the leg display name by joining matrix values: `test (ubuntu-latest, 20)`. You can customize the name template with `jobs.<id>.name`:

```yaml
jobs:
  test:
    name: test on ${{ matrix.os }} / node ${{ matrix.node }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        node: [20, 22]
```

There is **no special `name:` key inside matrix** entries that would auto-rename a leg — you control naming via `jobs.<id>.name` plus the matrix expressions. (Some third-party guides claim a top-level `matrix.name` works; it does not — `name` would be treated as another matrix variable, multiplying legs.)

---

## Sources

- https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners
- https://docs.github.com/en/actions/using-github-hosted-runners/about-larger-runners
- https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners
- https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners
- https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners-with-runner-groups
- https://docs.github.com/en/actions/hosting-your-own-runners/autoscaling-with-self-hosted-runners
- https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment
- https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment
- https://docs.github.com/en/actions/using-jobs/using-concurrency
- https://docs.github.com/en/actions/using-jobs/choosing-the-runner-for-a-job
- https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
- https://docs.github.com/en/actions/using-containerized-services/about-service-containers
- https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers
- https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
- https://docs.github.com/en/actions/administration/usage-limits-billing-and-administration
- https://github.com/actions/runner-images
- https://github.com/actions/partner-runner-images
- https://github.com/actions/actions-runner-controller
