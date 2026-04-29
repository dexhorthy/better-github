# Cloudflare Durable Objects + WebSockets (Workers free plan)

## Free-plan migration must use `new_sqlite_classes`

The classic `[[migrations]] new_classes = [...]` form requires the paid Workers
plan. Free accounts get this from the deploy step:

```
In order to use Durable Objects with a free plan, you must create a namespace
using a `new_sqlite_classes` migration. [code: 10097]
```

Fix: declare the DO with `new_sqlite_classes` instead. The class itself does not
need any SQLite-specific code — Cloudflare just routes the namespace through the
SQLite-backed storage backend.

```toml
[[durable_objects.bindings]]
name = "WS_BROADCASTER"
class_name = "WorkflowBroadcaster"

[[migrations]]
tag = "do_v1"
new_sqlite_classes = ["WorkflowBroadcaster"]
```

## Forwarding `/ws` from a Hono Worker to a DO

Hono runs in front of the DO; to upgrade we forward a fresh `Request` to the
DO's stub with the `upgrade: websocket` header preserved:

```ts
const id = c.env.WS_BROADCASTER.idFromName("global");
const stub = c.env.WS_BROADCASTER.get(id);
return stub.fetch(new Request("https://do/ws", {
  headers: { upgrade: "websocket" },
}));
```

Inside the DO's `fetch`, accept the upgrade with `WebSocketPair`, call
`server.accept()`, and return `new Response(null, { status: 101, webSocket: client })`.

## HTTP/2 + curl note

`curl` against a Cloudflare hostname defaults to HTTP/2, which cannot carry a
WebSocket upgrade — you'll get a 400 from the edge before the request even
reaches your Worker. Forcing `--http1.1` works but blocks waiting for frames;
the cleanest verification is a `new WebSocket(...)` from Bun/Node and listening
for `open`.
