# Analysis Report — Exploration and Codebase Mapping

## Executive Summary
This report details the read-only exploration and mapping of the Browser OS proxy server, sidecar server, target deploy locations, local RAG server, and Bun build-time dynamic import resolution issues for the ServiceNow AI Agent stabilization project. 

---

## 1. Custom Proxy & Sidecar Server Mapping

### 1.1 Custom Proxy Server (`browseros_server.exe`)
* **Source Code**: `packages/browseros-agent/apps/server/src/proxy.ts`
* **Lifecycle & Launch Mechanism**:
  * The proxy acts as a reverse proxy for HTTP and WebSocket traffic, listening on port `9200` by default.
  * On startup, it spawns the real sidecar server executable (`browseros_server_real.exe`) from the same directory (extracted using `process.execPath` directory) and passes arguments with the server port adjusted to `realPort` (default `9201`).
* **ServiceNow Request Interception**:
  * Intercepts `POST /chat` requests.
  * Evaluates if the `message` contains ServiceNow keywords or natural-language intent phrases (via `isServiceNowRelated` in `proxy.ts`).
  * If ServiceNow-related, it issues a `POST /retrieve` query to the local RAG server at `http://127.0.0.1:8000/retrieve` for the top 8 context chunks.
  * Formats the retrieved context chunks and injects them as a system override prefix into `body.userSystemPrompt` before forwarding the request to the sidecar `/chat` endpoint.
  * Corrects Ollama `baseUrl` parameters that lack a `/v1` suffix (e.g. `http://127.0.0.1:11434` -> `http://127.0.0.1:11434/v1`).
  * Transparently proxies all other endpoints, including WebSocket upgrade requests.

### 1.2 Sidecar Server (`browseros_server_real.exe`)
* **Source Code**: `packages/browseros-agent/apps/server/src/index.ts` (boots the `Application` class defined in `packages/browseros-agent/apps/server/src/main.ts`).
* **Functionality**:
  * Hosts the primary BrowserOS MCP (Model Context Protocol) capabilities, tool registry execution, and the main browser control engine (CDP client).
  * Listens on port `9201` by default (communicated via `--server-port=9201`).

### 1.3 Build and Staging Scripts
* **Build Scripts Location**: `packages/browseros-agent/scripts/build/`
* **Compilation**: `packages/browseros-agent/scripts/build/server/compile.ts`
  * Bundles code using `Bun.build` with `entrypoints: ['apps/server/src/index.ts']` and minification.
  * Compiles the bundled JS to a single binary executable using:
    `bun build --compile dist/prod/server/.tmp/bundle/index.js --outfile <path> --target=<bunTarget> --external=node-pty`
* **Identified Build Process Gap**:
  * The current build script compiles `index.ts` to `browseros_server.exe`. It does not compile `proxy.ts` or output a `browseros_server_real.exe`.
  * To stabilize the system, the build script needs to compile `proxy.ts` -> `browseros_server.exe` and `index.ts` -> `browseros_server_real.exe`, and stage them side-by-side.

---

## 2. Target Deploy Directories
Per `ORIGINAL_REQUEST.md`, compiled binaries must be deployed to the following target locations on Windows:
1. **User Data Directory**: 
   `C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\`
2. **Application Directory**: 
   `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\`

---

## 3. Local RAG Server (Port 8000)

### 3.1 Location and Entry Points
* **Location**: `d:\knowledge_base`
* **Source File**: `d:\knowledge_base\local_rag_server.py`
* **Answer Logic**: `d:\knowledge_base\local_rag_answer.py`
* **Configuration Script**: `d:\knowledge_base\scripts\final_rag_common.py`
* **Startup Command**: `d:\knowledge_base\start_rag_server.bat` (executes `uvicorn local_rag_server:app --host 127.0.0.1 --port 8000 --log-level warning` within a Python virtual environment).

### 3.2 Configuration Details
* **Framework**: FastAPI running on port `8000`.
* **Database**: ChromaDB persistent client storage at `d:\knowledge_base\final_chroma_db`.
* **Collection Name**: `servicenow_final_rag` containing over 7,500 chunks.
* **Embeddings Model**: `nomic-embed-text` via Ollama at `http://127.0.0.1:11434`.
* **Generation Model**: `llama3.1:8b` via Ollama.
* **Retrieval & Reranking Strategy**:
  * Fetches `top_k` documents by nomic cosine similarity.
  * Computes a hybrid ranking score (`rank_score`) based on:
    * Cosine similarity
    * Authority level (Official Admin docs = 100, Developer/API docs = 80, Generated = 50)
    * Official source family boost (+0.12)
    * Runbook/Step-by-step document boost (+0.35)
    * Keyword overlap boost (+0.15 per matched word in text, +0.35 in title, capped at +1.50)
    * Title keyword match bonus (+0.40 per title keyword match)

---

## 4. Bun Build & Pino/pino-pretty Dynamic Import Resolution

### 4.1 Pino and pino-pretty Crash
* **Problem**: In non-production/development mode (`NODE_ENV=development`), the sidecar crashes on startup with the error:
  `error: unable to determine transport target for "pino-pretty"`
* **Root Cause**: 
  * `packages/browseros-agent/apps/server/src/lib/logger.ts` tries to identify if it is running compiled via:
    `const isCompiled = process.execPath.toLowerCase().includes('browseros_server')`
  * When compile script processes target binaries, it temporarily generates hyphenated names (e.g. `browseros-server-windows-x64.exe`), causing `isCompiled` to evaluate to `false`.
  * If `NODE_ENV=development`, `isDev` evaluates to `true`.
  * This registers a console transport configuration targeting `pino-pretty`.
  * Pino's `thread-stream` manager spawns a worker thread and tries to dynamically resolve `'pino-pretty'`. This dynamic import fails inside Bun's compiled single-file binary environment because `'pino-pretty'` is not statically imported (hence not bundled) and cannot be loaded from `node_modules` at runtime.

### 4.2 Proposed Fixes
1. **Fix Compilation Detection**:
   Define `isCompiled` checking if the executable is not `bun` or `bun.exe`:
   ```typescript
   const isCompiled = !process.execPath.toLowerCase().endsWith('bun') && !process.execPath.toLowerCase().endsWith('bun.exe')
   ```
2. **Bundle pino-pretty Statically**:
   Import `pino-pretty` statically at the top of `logger.ts` and pass the instantiated stream directly to Pino. This ensures Bun bundles it, and avoids worker-thread/dynamic resolution completely.
   ```typescript
   import pinoPretty from 'pino-pretty'
   // Inside createConsoleLogger():
   if (isDev) {
     const prettyStream = pinoPretty({
       colorize: true,
       translateTime: 'SYS:HH:MM:ss.l',
       ignore: 'pid,hostname',
     })
     return pino(options, prettyStream)
   }
   ```
