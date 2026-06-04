# Project: ServiceNow AI Agent Stabilization

## Architecture
- **Proxy Server (`browseros_server.exe`)**: Intercepts `/chat` requests on port 9200, matches queries, retrieves context from local RAG server, injects documentation references, forwards to sidecar.
- **Local RAG Server**: Port 8000, responds to `/retrieve` requests.
- **Sidecar Server (`browseros_server_real.exe`)**: Listens on port 9201. Compiled/executed using Bun. Currently crashes at startup on `pino-pretty` dynamic dependency resolution.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Exploration & Analysis | Map codebase, identify build configs and setup | None | DONE |
| 2 | Sidecar Startup & Module Resolution | Fix `pino-pretty` runtime resolution crash on Bun | M1 | IN_PROGRESS |
| 3 | Proxy Stability & Deploy | Stabilize `browseros_server.exe` interception, deploy to targets | M2 | PLANNED |
| 4 | Security & Safety Review | Audit logs, secrets, API keys | M3 | PLANNED |
| 5 | ServiceNow Tasks Validation | Execute the 12 validation tasks and record results | M4 | PLANNED |
| 6 | Final Reporting & Sign-off | Produce final validation report and conclude | M5 | PLANNED |

## Interface Contracts
### Client ↔ Proxy (`browseros_server.exe`)
- Port: 9200
- `/chat`: Intercepts ServiceNow queries, queries RAG, forwards to Sidecar.

### Proxy ↔ RAG Server
- Port: 8000
- `/retrieve`: Query-based reference context retrieval.

### Proxy ↔ Sidecar (`browseros_server_real.exe`)
- Port: 9201
- Forwards processed queries/chats.
