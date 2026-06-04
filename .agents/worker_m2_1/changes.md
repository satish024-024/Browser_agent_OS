# Change Tracker - Milestone 2

The following changes have been made to resolve the sidecar startup crash and update the build/compile scripts to compile, bundle, and stage both the proxy and sidecar binaries:

## Logger Fixes
- **`packages/browseros-agent/apps/server/src/lib/logger.ts`**:
  - Fixed `isCompiled` detection: Changed from checking if `execPath` includes `'browseros_server'` to checking if the lowercase `execPath` does not end with `bun` or `bun.exe`. This robustly detects compiled Bun execution mode.
  - When compiled, `isDev` evaluates to `false` and skips dynamic loading of `pino-pretty` console transport (which fails inside Bun compiled binaries due to worker thread limitations), safely falling back to standard SonicBoom synchronous/JSON logging.

## Server Configuration Fixes
- **`packages/browseros-agent/apps/server/src/config.ts`**:
  - Modified `validateInlinedEnv()` to check `process.env.BROWSEROS_ENV` (fallback to `process.env.NODE_ENV`). This allows bypassing production-only variable validation when executing a compiled binary in a development/non-production environment (e.g. by setting `BROWSEROS_ENV=development`).

## Build Pipeline Updates
- **`packages/browseros-agent/scripts/build/server/types.ts`**:
  - Updated `CompiledServerBinary` interface to replace `binaryPath` with `proxyBinaryPath` and `sidecarBinaryPath`.
- **`packages/browseros-agent/scripts/build/server/compile.ts`**:
  - Updated `bundleServer` to bundle both `apps/server/src/proxy.ts` (as `proxy.js`) and `apps/server/src/index.ts` (as `index.js`).
  - Updated `compileTarget` to compile both bundled entries: proxy to `browseros-server-${target.id}` and sidecar to `browseros-server-real-${target.id}` (with `.exe` suffix on Windows).
  - Ensured both binaries are patched with Windows metadata in non-CI builds.
- **`packages/browseros-agent/scripts/build/server/stage.ts`**:
  - Updated `createArtifactRoot`, `stageTargetArtifact`, and `stageCompiledArtifact` to copy both the compiled proxy and sidecar binaries to `resources/bin/` side-by-side as `browseros_server.exe` and `browseros_server_real.exe` respectively.
- **`packages/browseros-agent/scripts/build/server/orchestrator.ts`**:
  - Adjusted orchestration loop to handle the updated staging signatures, forwarding both binary paths.
- **`packages/browseros-agent/scripts/build/server/archive.ts`**:
  - Implemented Windows-compatible zip compression fallback using PowerShell's `Compress-Archive` cmdlet if the native `zip` command is unavailable in the environment path.
- **`packages/browseros-agent/scripts/build/config/server-prod-resources.json`**:
  - Removed `os` and `arch` restriction from the Drizzle migrations resource rule, ensuring the database migration files are properly staged for Windows and all other platforms.
