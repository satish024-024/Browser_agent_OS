# Project: ServiceNow AI Agent Stabilization

## Architecture
- **User / BrowserOS**: The frontend interface representing the browser window and debug commands.
- **Proxy (`browseros_server.exe`)**: Intercepts ServiceNow queries on port 9200 and injects documentation retrieved from RAG.
- **Sidecar (`browseros_server_real.exe`)**: Executes the core agent logic, planning, and runs browser automation commands on port 9201.
- **Local RAG Server**: A FastAPI app running on port 8000 that queries ChromaDB to find relevant ServiceNow guides.
- **ChromaDB**: Document database containing ServiceNow final RAG collection.
- **Ollama**: Local LLM runner running on port 11434, loading `gemma3:4b` and `nomic-embed-text`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | R1: Architecture & /system_status | Create architecture doc, implement and register `/system_status` endpoint | None | PLANNED |
| 2 | R2: Reliability & Loop Prevention | Enhance RAG error handling, prompt-based caps, and Ollama model checks | R1 | PLANNED |
| 3 | R3: Security Scan & Audit | Secret scanning, API key review, log check, prompt injection review | R2 | PLANNED |
| 4 | R4: Execution Validation | Run 12-task RAG checks & 5-task LLM planning validation, write ValidationReport.md | R3 | PLANNED |
| 5 | R5: PowerShell Script & Migration | Create BOM-free start_services.ps1 & migration_guide.md | R4 | PLANNED |

## Interface Contracts
### Proxy ↔ Sidecar
- Ports: Proxy = `9200`, Sidecar = `9201`
- Communication: Proxy forwards /chat to Sidecar. Spawns sidecar with `--cdp-port` and `--server-port`.

### RAG Server ↔ Sidecar/Proxy
- Port: `8000`
- Endpoint: `/retrieve` (POST with `{"question": string, "top_k": number}`) returns `{"chunks": [...]}`
- Endpoint: `/health` (GET) returns `{"status": "ok", "db_path": string}`

### Ollama ↔ Sidecar/RAG
- Port: `11434`
- Endpoint: `/api/tags` (GET) returns lists of models.

## Code Layout
- Proxy: `packages/browseros-agent/apps/server/src/proxy.ts`
- Sidecar: `packages/browseros-agent/apps/server/src/index.ts`
- Routes: `packages/browseros-agent/apps/server/src/api/routes/`
- RAG Client: `packages/browseros-agent/apps/server/src/agent/rag.ts` (or similar)
- System Prompt: `packages/browseros-agent/apps/server/src/agent/prompt.ts`
