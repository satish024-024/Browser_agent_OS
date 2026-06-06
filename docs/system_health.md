# ServiceNow AI Agent — System Health & Observability Specification v1.0

This document outlines the observability patterns, health check structures, error differentiation rules, and troubleshooting procedures for the ServiceNow AI Agent.

---

## 1. Diagnostics Architecture

Observability is implemented through active probing at two main endpoints:

### A. Proxy Health Endpoint (`/health`)
- **Address**: `http://127.0.0.1:9200/health`
- **Output Shape**:
  ```json
  {
    "status": "ok",
    "cdpConnected": true
  }
  ```
- **Function**: Assesses whether the proxy server is running and has successfully established a WebSocket debug connection with Chromium.

### B. Consolidated Observability Endpoint (`/system_status`)
- **Address**: `http://127.0.0.1:9200/system_status`
- **Output Shape**:
  ```json
  {
    "browseros": "online",
    "proxy": "online",
    "sidecar": "online",
    "rag": "online",
    "ollama": "online",
    "chromadb": "online"
  }
  ```
- **Function**: Provides complete visibility into the health of all six sub-components.

---

## 2. Health Check Criteria

| Component | Target URL / Probe | Success Criteria |
|-----------|--------------------|------------------|
| **browseros** | `deps.browser?.isCdpConnected()` | Returns `true` (valid CDP link) |
| **proxy** | `http://127.0.0.1:9200/health` | HTTP `200 OK` |
| **sidecar** | Internal status check | HTTP `200 OK` on `/system_status` |
| **rag** | `http://127.0.0.1:8000/health` | HTTP `200 OK` and `.status` is `"ok"` |
| **ollama** | `http://127.0.0.1:11434/api/tags` | HTTP `200 OK` |
| **chromadb** | RAG health payload check | `.db_path` exists and database is accessible |

---

## 3. Error Differentiation Rules

When a tool call or RAG search fails, the system differentiates the failure cause:

1. **RAG Server Offline**:
   - *Detection*: Fetch to `http://127.0.0.1:8000/retrieve` throws `fetch failed`, `ECONNREFUSED`, or `Connection refused`.
   - *Message*: `"The ServiceNow local Knowledge Base server is offline (http://127.0.0.1:8000). Please start it with the following commands..."`
2. **Ollama Service Offline**:
   - *Detection*: RAG server returns a HTTP 500 error containing strings like `"Ollama embedding failed"`, `"11434"`, `"NewConnectionError"`, or `"WinError 10061"`.
   - *Message*: `"Ollama service (port 11434) is offline or unreachable from the RAG server. Please start the Ollama service on your machine..."`
3. **ChromaDB SQLite Lock / Corrupt**:
   - *Detection*: RAG server throws database/sqlite exceptions containing `"Chroma"`, `"chromadb"`, `"database"`, `"Sqlite"`, or `"sqlite3"`.
   - *Message*: `"ChromaDB database issue detected. The database may be locked, corrupted, or unreachable..."`

---

## 4. Troubleshooting Playbook

### Scenario A: `/system_status` reports `rag` as `"offline"`
1. Verify uvicorn uvicorn server process exists:
   ```powershell
   Get-Process -Name "python"
   ```
2. If offline, restart RAG server:
   ```powershell
   cd D:\knowledge_base
   .venv\Scripts\python.exe -m uvicorn local_rag_server:app --host 127.0.0.1 --port 8000
   ```

### Scenario B: `/system_status` reports `ollama` as `"offline"`
1. Verify if `ollama` process exists:
   ```powershell
   Get-Process -Name "ollama"
   ```
2. If offline, restart Ollama:
   ```powershell
   Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
   ```

### Scenario C: `/system_status` reports `browseros` as `"offline"`
1. Verify if Chromium is listening on debug port 9100:
   ```powershell
   Get-NetTCPConnection -LocalPort 9100 -ErrorAction SilentlyContinue
   ```
2. If port is offline, kill stray chrome processes and restart Chrome:
   ```powershell
   Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Stop-Process -Force
   Start-Process -FilePath "C:\Users\Satis\AppData\Local\Chromium\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9100", "--no-sandbox", "--no-first-run", "--disable-gpu", "--disable-background-mode", "--user-data-dir=C:\Users\Satis\AppData\Local\Chromium\User_Data_Clean_Fresh" -WindowStyle Hidden
   ```
