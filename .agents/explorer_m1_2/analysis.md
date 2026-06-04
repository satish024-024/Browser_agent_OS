# Technical Analysis — Exploration and Codebase Mapping

This report documents the exploration of the proxy and sidecar server structure, RAG server setup, build mechanisms, and the dynamic dependency resolution issues.

---

## 1. Proxy and Sidecar Servers

### 1.1 Custom Proxy Server (`browseros_server.exe`)
- **Source Code**: `packages/browseros-agent/apps/server/src/proxy.ts`
- **Key Logic**:
  - The proxy acts as a transparent forwarder for WebSocket and HTTP traffic on port `9200`.
  - It intercepts `POST /chat` requests (lines 129–176).
  - It checks if the chat message contains any ServiceNow-related keywords or intents (via `isServiceNowRelated`, lines 43–79).
  - If a ServiceNow query is detected, it queries the local RAG server at `http://127.0.0.1:8000/retrieve` (via `retrieveRAG`, lines 82–119).
  - It injects the retrieved ServiceNow documentation chunks directly into the `userSystemPrompt` field of the request body (lines 150–158) before forwarding the request to the real sidecar server at port `9201`.
  - It spawns the real sidecar server executable (`browseros_server_real.exe`) from its own directory on startup (lines 23–35) and forwards exit codes upon sidecar exit.
  - It also automatically corrects Ollama `baseUrl` parameters that lack the `/v1` suffix (lines 138–145).

### 1.2 Sidecar Server (`browseros_server_real.exe`)
- **Source Code**: `packages/browseros-agent/apps/server/src/index.ts` and underlying modules under `packages/browseros-agent/apps/server/src/`.
- **Key Logic**:
  - Exposes the main BrowserOS MCP capabilities and browser automation engine (`Application` instance in `main.ts`).
  - Starts up by reading environment settings from `.env.development` or `.env.production`.
  - Runs by default on port `9201` (communicated by the proxy launcher via the `--server-port=9201` argument).

### 1.3 Build and Staging Scripts
- **Build Scripts Location**: `packages/browseros-agent/scripts/build/`
- **Orchestration**: `scripts/build/server/orchestrator.ts` -> `compile.ts` & `stage.ts`
- **Compilation Tooling**: Bun packaging via `Bun.build` and `bun build --compile`.
  - Specifically, `compile.ts` (lines 22–51) bundles the entry point `apps/server/src/index.ts` to `dist/prod/server/.tmp/bundle/index.js` using Bun.build with minify enabled and `node-pty` marked as external.
  - It then compiles the JS bundle into a single standalone binary:
    `bun build --compile dist/prod/server/.tmp/bundle/index.js --outfile <path> --target=<bunTarget> --external=node-pty`
- **Issue with Current Build Script**:
  - The build script only lists `apps/server/src/index.ts` as the entrypoint and compiles it as `browseros_server.exe` (according to the target mapping in `targets.ts`).
  - There is currently **no logic** in `compile.ts` to build `apps/server/src/proxy.ts` into a separate binary (`browseros_server.exe`), nor is there logic to rename/output the sidecar binary to `browseros_server_real.exe`.
  - **Proposed Fix**: The build/compile scripts need to compile both entry points:
    1. Compile `apps/server/src/proxy.ts` -> `browseros_server.exe`
    2. Compile `apps/server/src/index.ts` -> `browseros_server_real.exe`
  - Both binaries should be staged together in the `resources/bin` directory of the target architecture distribution folder.

---

## 2. Target Deploy Directories

As specified in `ORIGINAL_REQUEST.md`, the built binaries must be deployed to the following target locations on the Windows filesystem:
1. **User Data version binary directory**:
   `C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\`
2. **Application binary directory**:
   `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\`

---

## 3. Local RAG Server (Port 8000)

### 3.1 Location and Configuration
- **Location**: `d:\knowledge_base`
- **Startup Script**: `d:\knowledge_base\start_rag_server.bat`
  - Runs `uvicorn local_rag_server:app --host 127.0.0.1 --port 8000 --log-level warning` after activating the Python virtual environment `.venv\Scripts\activate.bat`.
- **Primary Configuration File**: `d:\knowledge_base\scripts\final_rag_common.py`
  - **Database Path**: `final_chroma_db` directory (using ChromaDB `PersistentClient`).
  - **Collection Name**: `"servicenow_final_rag"` (contains 7,500+ official ServiceNow documentation chunks).
  - **Embedding Model**: `"nomic-embed-text"` via Ollama (configured at `OLLAMA_URL = http://127.0.0.1:11434`).
  - **Generation Model**: `"llama3.1:8b"` (or via `SN_GEN_MODEL` environment variable).

### 3.2 Retrieval Logic
- The `/retrieve` API endpoint queries ChromaDB using `nomic-embed-text` embeddings.
- In `scripts/final_rag_common.py`, a hybrid search ranking score (`rank_score`) is calculated for each retrieved chunk:
  `rank_score = cos_sim + (authority / 1000.0) + official_boost + runbook_boost + overlap_boost + title_boost`
- **Boost Components**:
  - **Authority Boost**: `authority_level / 1000.0` (higher authority documents rank higher).
  - **Official Boost**: `0.12` if the document belongs to an official source family.
  - **Runbook Boost**: `0.35` if `document_type` is `"step_by_step"` or `source_type` is `"procedural_runbook"`.
  - **Keyword Overlap Boost (Hybrid Search)**: Checks intersection between query terms and text/title. Adds `0.15` per query word match in text, and `0.35` per query word match in the document title, capped at `1.50` total.
  - **Title Word Match Boost**: `title_word_matches * 0.40` (additional weight for matching terms in titles).

---

## 4. Bun Build Process and Dynamic Dependency Resolution

### 4.1 Pino and pino-pretty Crash
- **Problem**: When the sidecar compiles, Bun packages the app into a single standalone binary. In non-production/development mode (`NODE_ENV=development`), `logger.ts` initializes `pino` with a console transport targeting `'pino-pretty'`:
  `pino.transport({ target: 'pino-pretty', options: { ... } })`
- **Root Cause**: `pino.transport` relies on worker threads (via the `thread-stream` library) to execute the transport in a background worker. In a Bun-compiled binary, dynamic resolution of transport targets inside worker threads fails because the worker thread runs in a clean context that does not have access to the bundled `pino-pretty` files or cannot load them from Bun's single-file binary environment.
- **Bug in `logger.ts` Detection**:
  - `logger.ts` tries to disable `pino-pretty` console transport if the app is compiled:
    `const isCompiled = process.execPath.toLowerCase().includes('browseros_server')`
  - However, the build target produces binaries named with hyphens, e.g., `browseros-server-windows-x64.exe` (defined in `compile.ts` as `browseros-server-${target.id}.exe`).
  - Because `browseros-server-windows-x64.exe` contains a hyphen instead of an underscore, `includes('browseros_server')` evaluates to `false`.
  - Thus, `isCompiled` is incorrectly determined as `false`.
  - When the compiled binary is run in development mode (with `.env.development` setting `NODE_ENV=development`), `isDev` evaluates to `true`, triggering the `pino-pretty` initialization, which crashes the process with `unable to determine transport target for "pino-pretty"`.

### 4.2 Proposed Fixes for R2 (Module Resolution)
1. **Fix Compilation Detection**:
   Make compilation detection robust so it doesn't depend on specific filenames.
   ```typescript
   const isCompiled = !process.execPath.toLowerCase().endsWith('bun') && !process.execPath.toLowerCase().endsWith('bun.exe')
   ```
   Or explicitly look for both hyphenated and underscore naming:
   ```typescript
   const isCompiled = process.execPath.toLowerCase().includes('browseros_server') || process.execPath.toLowerCase().includes('browseros-server')
   ```
2. **Disable `pino-pretty` Transports Under Compilation**:
   Ensure `createConsoleTransport()` returns `null` whenever `isCompiled` is `true`, forcing the application to use SonicBoom-based synchronous JSON/console logging (`pino.destination()`), which is bundle-safe and does not spawn threads.
