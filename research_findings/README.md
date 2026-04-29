# GitHub Actions: Comprehensive API & Specification Reference

A structured knowledge base, one file per topic.

## Index

1. [Workflow YAML Specification](./01-workflow-yaml-spec.md) — every configurable field (top-level, jobs, steps, matrix, defaults, etc.)
2. [Triggering Events & Payloads](./02-events-and-payloads.md) — every event, activity types, payload shapes, filters
3. [REST API: Actions Namespace](./03-rest-api-actions.md) — every endpoint (workflows, runs, jobs, artifacts, caches, runners, secrets, variables, OIDC, permissions)
4. [Expressions, Contexts & Functions](./04-expressions-contexts-functions.md) — `${{ }}` syntax, all contexts, all built-in functions, status checks
5. [Runners, Environments, Concurrency, Matrix](./05-runners-environments-concurrency-matrix.md)
6. [Reusable Workflows & Composite/JS/Docker Actions](./06-reusable-workflows-and-actions.md)
7. [Permissions, Security, Secrets & OIDC](./07-permissions-security-secrets-oidc.md)

Built by sequential research passes; each file cites sources at the bottom.
