# Milestone 1 Synthesis: Codebase Mapping and Exploration

## Consensus Findings
1. **Proxy & Sidecar Structure**:
   - Custom proxy source: `packages/browseros-agent/apps/server/src/proxy.ts`
   - Real sidecar source: `packages/browseros-agent/apps/server/src/index.ts`
   - The custom proxy spawns the sidecar as `browseros_server_real.exe` from its own directory on port `9201` and forwards requests.
2. **Build Scripts**:
   - Location: `packages/browseros-agent/scripts/build/server/`
   - Config file: `targets.ts`
   - Compile file: `compile.ts`
   - Stage file: `stage.ts`
   - *Issue*: Current build scripts only compile `index.ts` to `browseros_server.exe`. They must be updated to compile both `proxy.ts` -> `browseros_server.exe` and `index.ts` -> `browseros_server_real.exe`.
3. **Deployment Target Locations**:
   - Target 1: `C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\`
   - Target 2: `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\`
4. **Local RAG Server (Port 8000)**:
   - FastAPI server located at `d:\knowledge_base\local_rag_server.py`.
   - ChromaDB persistent collection: `"servicenow_final_rag"` with 7,500+ official chunks.
   - Embeddings: `nomic-embed-text` via local Ollama.
   - Start script: `start_rag_server.bat` (listening on port 8000, confirmed healthy).
5. **Sidecar Crash Root Cause (R2)**:
   - File: `packages/browseros-agent/apps/server/src/lib/logger.ts`
   - Bug: `isCompiled` uses `includes('browseros_server')`. The build scripts name intermediate executables with hyphens (`browseros-server-windows-x64.exe`).
   - Consequently, `isCompiled` evaluates to `false`.
   - In non-production/development environments, `isDev` evaluates to `true` and tries to load the `pino-pretty` transport via `pino.transport()`.
   - This invokes worker threads (`thread-stream`) which fail to dynamically resolve `pino-pretty` inside the Bun compiled environment.

## Resolved Conflicts / Decision on Pino Fix
- **Option A (Explorer 3)**: Statically import and instantiate `pino-pretty` directly.
- **Option B (Explorer 2)**: Fix the compiled detection check, and force fallback to SonicBoom (`pino.destination`) whenever compiled (preventing `pino-pretty` loading in compiled binaries altogether).
- **Decision**: Option B is preferred because it avoids bundling the devDependency `pino-pretty` in the production-ready binary, and eliminates worker thread spawning which is fragile under Bun compilation. We will fix `isCompiled` in `logger.ts` to check if `process.execPath` doesn't end with `bun` or `bun.exe`, and ensure `isDev` is false when compiled.

## Action Plan for Milestone 2 & 3
1. Spawn a `teamwork_preview_worker` to:
   - Implement the `logger.ts` compilation check fix.
   - Update the build scripts (`compile.ts`, `stage.ts`, `orchestrator.ts`) to build both `proxy.ts` (as `browseros_server.exe`) and `index.ts` (as `browseros_server_real.exe`).
   - Verify Bun compiles both without errors.
   - Verify running the compiled binaries in development mode starts up correctly without crashing.
   - Deploy both compiled executables to the two target deploy paths.
