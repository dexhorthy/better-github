# Freestyle SDK on Cloudflare Workers

## Two gotchas hit when using `freestyle` (npm) inside a CF Worker

### 1. The lazy `freestyle` proxy → "Illegal invocation"

The package's default `freestyle` export is a `Proxy` returned by
`createLazyFreestyle()` which lazily constructs a singleton `Freestyle` on first
property access. In CF Workers this triggers
`Illegal invocation: function called with incorrect this reference` when nested
namespaces (`.git.repos.ref(...).commits.create(...)`) are eventually called.

**Fix:** import `Freestyle` directly and instantiate it once explicitly.

```ts
import { Freestyle } from "freestyle";
const client = new Freestyle({ apiKey: process.env.FREESTYLE_API_KEY, fetch: ... });
```

### 2. The SDK stores `fetch` unbound → also "Illegal invocation"

`ApiClient` does `this.fetchFn = config.fetch || fetch;` and later calls
`this.fetchFn(url, ...)`. In CF Workers, calling the global `fetch` without the
right `this` throws "Illegal invocation".

**Fix:** pass an arrow-function wrapper as the `fetch` option so it captures the
correct binding:

```ts
new Freestyle({
  apiKey: process.env.FREESTYLE_API_KEY,
  fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init)) as typeof fetch,
});
```

With both fixes the SDK's `repo.contents.get()`, `repo.commits.create()`, etc.
work end-to-end on a deployed Worker (verified via the Better GitHub Worker's
`/api/repos/:owner/:repo/workflows` create/edit/delete round trip).

## Writing/deleting files

The SDK does **not** expose `repo.contents.upsert()` or `repo.contents.delete()`
(despite earlier code that `as`-cast them into existence — those calls fail with
`contents.upsert is not a function`). Use `repo.commits.create({ files: [...] })`
instead:

- Create/update: `{ path, content }` (UTF-8 text by default; pass `encoding: "base64"` for binary).
- Delete: `{ path, deleted: true }`.
