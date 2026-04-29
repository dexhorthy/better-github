# Freestyle Code Execution Notes

## Two Execution Models

### Serverless Runs (V8 Isolates)
- `freestyle.serverless.runs.create({ code, envVars, nodeModules })` executes JS/TS in V8 isolate
- Fast cold starts (<10ms), median execution ~84ms
- Cannot run binaries - pure JavaScript/TypeScript only
- Good for quick script execution, data transformations, API calls

### VMs (Full Linux)
- `freestyle.vms.create(spec)` provisions a full Linux VM
- Provisions in <600ms from API request to ready
- Can run any binaries including Bun, Node, Docker
- `vm.exec({ command, timeoutMs })` runs shell commands
- `vm.fs.writeFile/readFile` for file operations
- `vm.stop()` and `vm.delete()` for cleanup

## VM Spec Configuration
```typescript
import { freestyle, VmSpec, VmBaseImage } from "freestyle";

const spec = new VmSpec()
  .baseImage(new VmBaseImage("FROM oven/bun:1"))
  .rootfsSizeGb(10)
  .memSizeGb(2)
  .vcpuCount(2)
  .workdir("/app")
  .aptDeps("git")
  .runCommands("npm install -g pnpm");

const { vm, vmId } = await freestyle.vms.create(spec);
```

## Execution Result
```typescript
const result = await vm.exec({
  command: "bun test",
  timeoutMs: 300000,
});
// result.exitCode, result.stdout, result.stderr
```

## For CI Workflows
- Use VMs, not serverless runs (need to run `bun test`, `bun install`, etc.)
- Base image should include the runtime (e.g., `oven/bun:1` for Bun projects)
- Clone repo with `git clone --depth 1 --branch <branch> <url> /app`
- Execute steps sequentially, capturing exit codes

Sources checked on 2026-04-29:
- https://docs.freestyle.sh/code-execution/run
- https://docs.freestyle.sh/code-execution/overview
- https://www.freestyle.sh/products/vms
- `node_modules/freestyle/index.d.mts`
