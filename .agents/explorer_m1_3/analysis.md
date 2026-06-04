# Analysis Report: ServiceNow Agent Stabilization Exploration

## Executive Summary
This report documents the exploration of the codebase, build scripts, deployment environments, RAG server configuration, and Bun build dynamic module resolution issues. The goal is to lay out the exact architecture of the custom proxy server (`browseros_server.exe`) and sidecar server (`browseros_server_real.exe`), map their paths and dependencies, and provide a clear, actionable resolution plan for the `pino-pretty` dynamic import runtime crash.

---

## 1. Custom Proxy and Sidecar Server Mapping

We have mapped the source code, build scripts, and build artifacts for the custom proxy and the sidecar servers.

### Source Code
- **Proxy Server (`browseros_server.exe`):**
  - **Source File:** `packages/browseros-agent/apps/server/src/proxy.ts`
  - **Functionality:** Launches the real sidecar server at `browseros_server_real.exe` on a delegated port (`realPort`, default `9201`), listens on the main server port (`serverPort`, default `9200`), intercepts `/chat` requests containing ServiceNow keywords/intents, queries the local RAG server on port 8000, injects relevant documentation context, and proxies other traffic (including WebSockets) transparently to the sidecar.
- **Sidecar Server (`browseros_server_real.exe`):**
  - **Source File:** `packages/browseros-agent/apps/server/src/index.ts` (starts the `Application` located in `packages/browseros-agent/apps/server/src/main.ts`)
  - **Functionality:** Handles the core agent tasks, tool calls, and API routing.

### Build Scripts
The server build processes are located in:
- `packages/browseros-agent/scripts/build/server.ts` (Entry CLI script)
- `packages/browseros-agent/scripts/build/server/orchestrator.ts` (Orchestrates target compiling and staging)
- `packages/browseros-agent/scripts/build/server/compile.ts` (Uses Bun to bundle JS and compile binaries)
- `packages/browseros-agent/scripts/build/server/stage.ts` (Stages output binaries and templates in standard layout)
- `packages/browseros-agent/scripts/build/server/targets.ts` (Defines target configurations for macOS, Linux, and Windows)

### Build Artifacts
- **Output Directory:** `packages/browseros-agent/dist/prod/server/`
- **Current Artifact Path:** `packages/browseros-agent/dist/prod/server/windows-x64/resources/bin/browseros_server.exe`
- *Observation:* The current build scripts only compile `index.ts` and stage it directly as `browseros_server.exe`. They do not currently compile `proxy.ts` or output `browseros_server_real.exe` to the staging directory.

---

## 2. Target Deploy Directories

The following target deployment paths were identified from `ORIGINAL_REQUEST.md`:
1. **Directory 1 (Version-specific bin):**
   - Path: `C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\`
   - *Status:* Directory does not exist yet. Needs to be created during deployment.
2. **Directory 2 (Application bin):**
   - Path: `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\`
   - *Status:* Exists. Currently contains `browseros_server.exe`, `browseros_server.exe.bak`, `browseros_server_real.exe`, and `browseros_server_real.exe.bak`.

---

## 3. Local RAG Server (Port 8000)

The local RAG server was located, inspected, and verified to be operational.

### Location & Entry Points
- **RAG Server Path:** `d:\knowledge_base\local_rag_server.py`
- **RAG Answer Logic:** `d:\knowledge_base\local_rag_answer.py`
- **RAG Database/Pipeline Common Script:** `d:\knowledge_base\scripts\final_rag_common.py`

### Configuration Details
- **Framework:** FastAPI Python server running on `http://127.0.0.1:8000`
- **Database:** ChromaDB persistent client pointing to `d:\knowledge_base\final_chroma_db`
- **Chroma Collection:** `servicenow_final_rag`
- **Embedding Model:** `nomic-embed-text` (local via Ollama)
- **Generation Model:** `llama3.1:8b` (local via Ollama at `http://127.0.0.1:11434`)
- **Search Strategy:** Hybrid Search. First queries Chroma using nomic-embeddings, then performs custom reranking/boosting on:
  - Cosine similarity
  - Source authority level (Official APIs = 80, Official Admins = 100, Generated = 50)
  - Official source family boost (+0.12)
  - Procedural runbook / step-by-step document boost (+0.35)
  - Keyword overlap count (+0.15 per matched keyword in text)
  - Title keyword matches (+0.35 per matched keyword in document title)

### Verification
A health check request was sent to the running server:
```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/health
```
**Response:**
```json
{
  "status": "ok",
  "db_path": "D:\\knowledge_base\\final_chroma_db",
  "collection": "servicenow_final_rag",
  "model": "llama3.1:8b"
}
```

---

## 4. Pino & Dynamic Import Resolution Issue (R2)

### The Problem
During development or non-production runs of the compiled binary (`browseros_server_real.exe`), the program crashes with the following error:
`error: unable to determine transport target for "pino-pretty"`

### Root Cause
In `packages/browseros-agent/apps/server/src/lib/logger.ts`, when `process.env.NODE_ENV` is not `"production"` (i.e. development/dev modes), `createConsoleTransport()` is invoked and returns:
```typescript
{
  target: 'pino-pretty',
  options: { ... }
}
```
This tells Pino to create a logging transport. Pino's transport manager dynamically invokes a worker thread (`thread-stream`) and tries to load the package `'pino-pretty'` using dynamic imports (`require` or `import()`).
Because the application is compiled to a standalone executable via `bun build --compile`, two things happen:
1. Dynamic imports/requires at runtime fail because the bundler did not see `pino-pretty` as a static import in the bundle tree, so its source code was omitted from the binary.
2. Bun's compilation target environment sandboxes dynamic directory lookups, meaning worker threads spawned by `thread-stream` cannot locate external `node_modules` at runtime.

### Proposed Solution
Instead of letting Pino launch `pino-pretty` dynamically as a separate thread-stream transport, we can **statically import** `pino-pretty` at the top of `logger.ts` and pass the instantiated stream directly to `pino`.
This achieves two goals:
1. Bun's bundler detects the static import and bundles `pino-pretty` directly into the compiled executable.
2. The runtime avoids thread-stream / dynamic package resolution completely.

#### Verifying this approach
Running the following command within Bun in the server package:
```powershell
bun -e "import pino from 'pino'; import pinoPretty from 'pino-pretty'; const log = pino({level: 'debug'}, pinoPretty({colorize: true})); log.info('test message');"
```
Successfully outputs:
```
[16:50:21.389] INFO (18116): test message
```

---

## 5. Recommended Code Proposals (For Implementer)

### Proposed Patch 1: Statically Import `pino-pretty` in `logger.ts`
Modify `packages/browseros-agent/apps/server/src/lib/logger.ts` to statically import and instantiate `pino-pretty`:

```typescript
// Insert at imports:
import pinoPretty from 'pino-pretty'

// Modify createConsoleLogger to:
  private createConsoleLogger(): pino.Logger {
    const options: pino.LoggerOptions = {
      level: this.level,
    }

    // Add source tracking in development
    if (isDev) {
      options.mixin = () => {
        const caller = parseCallerInfo(new Error().stack || '')
        return caller ? { caller } : {}
      }
    }

    if (isDev) {
      // Use statically-imported pino-pretty directly in dev/non-prod
      const prettyStream = pinoPretty({
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
      })
      return pino(options, prettyStream)
    }

    // Production: use pino.destination() for async writes without worker threads.
    return pino(options, pino.destination({ dest: 1, sync: false }))
  }
```

### Proposed Patch 2: Compile Both Proxy and Sidecar in `compile.ts`
Modify `packages/browseros-agent/scripts/build/server/compile.ts` to build both targets:

```typescript
// Replace BUNDLE_ENTRY & compiledBinaryPath with:
const INDEX_BUNDLE_ENTRY = join(BUNDLE_DIR, 'index.js')
const PROXY_BUNDLE_ENTRY = join(BUNDLE_DIR, 'proxy.js')

function compiledBinaryPath(target: BuildTarget): string {
  return join(
    BINARIES_DIR,
    `browseros-server-real-${target.id}${target.os === 'windows' ? '.exe' : ''}`,
  )
}

function compiledProxyBinaryPath(target: BuildTarget): string {
  return join(
    BINARIES_DIR,
    `browseros-server-${target.id}${target.os === 'windows' ? '.exe' : ''}`,
  )
}

// Modify bundleServer to:
async function bundleServer(
  envVars: Record<string, string>,
  version: string,
): Promise<void> {
  rmSync(BUNDLE_DIR, { recursive: true, force: true })
  mkdirSync(BUNDLE_DIR, { recursive: true })

  const result = await Bun.build({
    entrypoints: ['apps/server/src/index.ts', 'apps/server/src/proxy.ts'],
    outdir: BUNDLE_DIR,
    target: 'bun',
    minify: true,
    define: {
      ...Object.fromEntries(
        Object.entries(envVars).map(([key, value]) => [
          `process.env.${key}`,
          JSON.stringify(value),
        ]),
      ),
      __BROWSEROS_VERSION__: JSON.stringify(version),
    },
    external: ['node-pty'],
    plugins: [wasmBinaryPlugin()],
  })

  if (!result.success) {
    const error = result.logs.map((entry) => String(entry)).join('\n')
    throw new Error(`Failed to bundle server:\n${error}`)
  }
}

// Modify compileTarget to:
async function compileTarget(
  target: BuildTarget,
  env: NodeJS.ProcessEnv,
  ci: boolean,
): Promise<{ binaryPath: string; proxyBinaryPath: string }> {
  const binaryPath = compiledBinaryPath(target)
  const proxyBinaryPath = compiledProxyBinaryPath(target)

  // Compile real sidecar
  await runCommand(
    'bun',
    [
      'build',
      '--compile',
      INDEX_BUNDLE_ENTRY,
      '--outfile',
      binaryPath,
      `--target=${target.bunTarget}`,
      '--external=node-pty',
    ],
    env,
  )

  // Compile custom proxy
  await runCommand(
    'bun',
    [
      'build',
      '--compile',
      PROXY_BUNDLE_ENTRY,
      '--outfile',
      proxyBinaryPath,
      `--target=${target.bunTarget}`,
    ],
    env,
  )

  if (target.os === 'windows') {
    if (ci) {
      log.warn('Skipping Windows exe metadata patching in CI mode')
    } else {
      await runCommand('bun', ['scripts/patch-windows-exe.ts', binaryPath], process.env)
      await runCommand('bun', ['scripts/patch-windows-exe.ts', proxyBinaryPath], process.env)
    }
  }

  return { binaryPath, proxyBinaryPath }
}
```

### Proposed Patch 3: Stage Both Proxy and Sidecar in `stage.ts`
Modify `packages/browseros-agent/scripts/build/server/stage.ts` to stage both files in target locations:

```typescript
// Modify createArtifactRoot to:
async function createArtifactRoot(
  distRoot: string,
  compiledBinaryPath: string,
  compiledProxyBinaryPath: string,
  target: BuildTarget,
): Promise<string> {
  const rootDir = artifactRoot(distRoot, target)
  await rm(rootDir, { recursive: true, force: true })
  await mkdir(rootDir, { recursive: true })

  // Stage proxy as browseros_server.exe
  await copyServerBinary(
    compiledProxyBinaryPath,
    serverDestinationPath(rootDir, target),
    target,
  )

  // Stage sidecar as browseros_server_real.exe
  const realBinaryName = target.serverBinaryName.includes('.')
    ? target.serverBinaryName.replace('.', '_real.')
    : `${target.serverBinaryName}_real`
  const sidecarDest = join(rootDir, 'resources', 'bin', realBinaryName)
  await copyServerBinary(compiledBinaryPath, sidecarDest, target)

  return rootDir
}
```
*Note: Make corresponding signature updates to `compileServerBinaries`, `stageTargetArtifact`, `stageCompiledArtifact` and `orchestrator.ts` to forward the new compiled file paths struct.*
