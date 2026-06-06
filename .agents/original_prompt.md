## 2026-06-04T11:16:16Z

# Teamwork Project Prompt — ServiceNow Agent Stabilization

> Goal: Stabilize and complete the ServiceNow AI Agent project within a 10-hour execution window.

Work directory: `d:/Browser_agent_OS-main/Browser_agent_OS-main`
Integrity mode: development

## Requirements

### R1. RAG-Intercepting Proxy Stability
The custom proxy server (`browseros_server.exe`) must intercept `/chat` requests, perform keyword/intent matching, query the local RAG server on port 8000, inject ServiceNow reference documentation, and forward requests to the development-mode sidecar (`browseros_server_real.exe`) without crashing or introducing console/runtime errors.
- Target Locations: Must be deployed in both:
  - `C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\`
  - `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\`

### R2. Sidecar Startup and Module Resolution
Resolve the dynamic module loading crash (e.g. `pino-pretty` missing or dynamic resolution failure) during compilation or execution of `browseros_server_real.exe` when run in non-production environments.
- Problem: The sidecar compiles successfully, but fails at runtime with: `error: unable to determine transport target for "pino-pretty"`. This must be solved (either by bundling pino-pretty, removing development mode logging formats, or passing external/loader configuration to bun build).

### R3. Security & Safety Review
Check for API leaks, hardcoded secrets, unsafe logging, or accidental exposure of tokens, keys, or endpoints. Ensure only required services are active.

### R4. Execution Validation & Tasks Suite
Test the full system using the 12 representative ServiceNow tasks: Create Catalog Item, Configure LDAP, Configure SSO, Create Business Rule, Create Client Script, Configure ACL, Create Flow, Configure CMDB Discovery, Configure MID Server, Create Knowledge Base, Configure Email Notifications, and Configure Integration Hub.
- Log for each test: Retrieved documents, generated plan, BrowserOS execution result, verification result, pass/fail status, and failure reasons.

### R5. Git Safety & Commits
After every completed task, commit and push to GitHub. Keep commits small and logical. If anything fails, revert to the last working commit and fix the issue.

## Acceptance Criteria

### Server Functionality
- [ ] The local RAG server on port 8000 successfully responds to `/retrieve` requests.
- [ ] The custom proxy on port 9200 intercepts ServiceNow-related queries and injects relevant RAG context.
- [ ] The sidecar server (`browseros_server_real.exe`) compiles and runs on port 9201 without crashing on `pino-pretty` or other dynamic dependencies.

### Verification Results
- [ ] A final verification report (e.g. `D:\knowledge_base\docs\ValidationReport.md` or similar) is produced containing the 12 tasks test outcomes.
- [ ] The planner produces reliable step-by-step actions.

### Security & Maintainability
- [ ] No API keys, credentials, or sensitive configurations are hardcoded or leaked in logs.
- [ ] A clean git recovery and rollback strategy is verified.

## 2026-06-04T12:57:47Z

# Teamwork Project Prompt — ServiceNow AI Agent Stabilization (Full Sprint)

> Status: **Launched** — Full 10-hour stabilization sprint
> Integrity mode: development

Make the ServiceNow AI Agent codebase production-ready, stable, secure, and maintainable. The system must retrieve and apply real ServiceNow documentation, generate reliable step-by-step task plans, and work with BrowserOS. Two milestones are already done — this sprint resumes from Milestone 3.

Working directory: `d:/Browser_agent_OS-main/Browser_agent_OS-main`

---

## CRITICAL CONTEXT — What Is Already Done (DO NOT REDO)

### ✅ Milestone 1 & 2 completed — commit `f24666b1` pushed to GitHub
- **`logger.ts`** patched: `isCompiled` detection prevents `pino-pretty` crash in compiled binaries
- **`config.ts`** patched: `BROWSEROS_ENV` env var bypasses production validation
- Both binaries compiled and staged side-by-side:
  - `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\browseros_server.exe` (114 MB)
  - `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\browseros_server_real.exe` (121 MB)
- Build pipeline updated: `compile.ts`, `stage.ts`, `orchestrator.ts`, `archive.ts` all updated
- Git history clean, GitHub remote: `https://github.com/satish024-024/Browser_agent_OS.git`

### ✅ Additional Patches & Findings (In-Progress)
- **`limits.ts`** modified in workspace: `CDP_LIMITS.CONNECT_MAX_RETRIES` increased to 30 to prevent startup connection race conditions.
- **BOM Resolution**: Writing `server_config.json` via standard PowerShell `Set-Content` introduces a UTF-8 BOM (`EF-BB-BF`), which causes a JSON parse error in the Bun sidecar. Config files must be written using clean BOM-free UTF-8 encoding (e.g. using .NET `[System.Text.UTF8Encoding]($false)` or node `fs.writeFileSync`).
- **CDP Port Bind Mismatch**: Chromium debugging port must be set to 9100, and `server_config.json` ports must be updated to `cdp: 9100` and `server: 9200` to match.

### Current System State (all services STOPPED after server restart)
| Component | Port | State |
|-----------|------|-------|
| Ollama | 11434 | STOPPED |
| RAG server (FastAPI+ChromaDB) | 8000 | STOPPED |
| Chromium (CDP) | 9100 | STOPPED |
| Proxy (browseros_server.exe) | 9200 | STOPPED |
| Sidecar (browseros_server_real.exe) | 9201 | STOPPED |

### CPU-Only Constraint
This machine has **no GPU**. Ollama runs on CPU only. The LLM model in use is `gemma3:4b`. Each inference call takes ~30–90 seconds. Do NOT run more than 3 LLM planning tasks in the validation suite. For all other tests, use the RAG `/retrieve` endpoint only (embedding lookups are fast on CPU).

---

## Key File Paths

| Resource | Path |
|----------|------|
| Proxy source | `d:\Browser_agent_OS-main\Browser_agent_OS-main\packages\browseros-agent\apps\server\src\proxy.ts` |
| Sidecar source | `d:\Browser_agent_OS-main\Browser_agent_OS-main\packages\browseros-agent\apps\server\src\index.ts` |
| Logger (patched) | `d:\Browser_agent_OS-main\Browser_agent_OS-main\packages\browseros-agent\apps\server\src\lib\logger.ts` |
| Config (patched) | `d:\Browser_agent_OS-main\Browser_agent_OS-main\packages\browseros-agent\apps\server\src\config.ts` |
| Deployed proxy | `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\browseros_server.exe` |
| Deployed sidecar | `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\browseros_server_real.exe` |
| Server config | `C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\server_config.json` |
| Chromium binary | `C:\Users\Satis\AppData\Local\Chromium\Application\chrome.exe` |
| RAG server | `D:\knowledge_base\local_rag_server.py` |
| RAG venv | `D:\knowledge_base\.venv\Scripts\uvicorn` |
| ChromaDB | `D:\knowledge_base\final_chroma_db` (collection: `servicenow_final_rag`) |
| Validation script | `D:\knowledge_base\scripts\validate_tasks.py` |
| Validation report | `D:\knowledge_base\docs\ValidationReport.md` |
| GitHub remote | `https://github.com/satish024-024/Browser_agent_OS.git` |

---

## Requirements

### R1. Phase 1 — Full System Audit

Before making any changes:
1. Inspect the repository structure at `d:\Browser_agent_OS-main\Browser_agent_OS-main`
2. List all working components and all broken/missing components
3. Identify security risks (hardcoded secrets, unsafe logs, exposed tokens)
4. Identify duplicate, unnecessary, or oversized files
5. Identify the exact proxy→sidecar CDP connection handshake issue: the proxy launches the sidecar, but does the sidecar receive the correct `--cdp-port` argument? Check `proxy.ts` for how it spawns `browseros_server_real.exe`.
6. Report findings before making any changes. Use `git status` to confirm clean working tree.

### R2. Phase 2 — Service Stack Restore

Start all services in the correct order and verify each before proceeding:

**Step 1 — Ollama**
```powershell
Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 5
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```
Must return JSON with model list. If `gemma3:4b` is not listed, run `ollama pull gemma3:4b`.

**Step 2 — RAG Server**
```powershell
Start-Process -FilePath "D:\knowledge_base\.venv\Scripts\uvicorn.exe" -ArgumentList "local_rag_server:app --host 127.0.0.1 --port 8000" -WorkingDirectory "D:\knowledge_base" -WindowStyle Hidden
Start-Sleep -Seconds 5
Invoke-RestMethod http://127.0.0.1:8000/health
```
Must return `{"status":"ok"}`.

**Step 3 — Chromium with CDP**
```powershell
$chromePath = "C:\Users\Satis\AppData\Local\Chromium\Application\chrome.exe"
$userData = "C:\Users\Satis\AppData\Local\Chromium\User Data"
Start-Process -FilePath $chromePath -ArgumentList "--remote-debugging-port=9100 --user-data-dir=`"$userData`""
Start-Sleep -Seconds 8
Invoke-RestMethod http://127.0.0.1:9100/json/version
```
Must return JSON with `webSocketDebuggerUrl`.

**Step 4 — Proxy**
```powershell
$bin = "C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\browseros_server.exe"
$cfg = "C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\server_config.json"
$env:BROWSEROS_ENV = "development"
Start-Process -FilePath $bin -ArgumentList "--config=`"$cfg`" --cdp-port=9100 --server-port=9200 --extension-port=9300" -WindowStyle Hidden
Start-Sleep -Seconds 8
Invoke-RestMethod http://127.0.0.1:9200/health
```
Must return a non-error HTTP response.

**Step 5 — Stability Check (10 consecutive health checks)**
```powershell
$allPassed = $true
1..10 | ForEach-Object {
  try { Invoke-RestMethod http://127.0.0.1:9200/health -TimeoutSec 5 | Out-Null; Write-Host "[$_/10] PASS" }
  catch { Write-Host "[$_/10] FAIL"; $allPassed = $false }
}
Write-Host "All passed: $allPassed"
```
All 10 must pass.

### R3. Phase 3 — Audit and Fix Proxy→Sidecar CDP Handshake

Read `proxy.ts` carefully. The proxy must:
1. Spawn `browseros_server_real.exe` with the correct `--cdp-port` argument
2. Wait for the sidecar to be ready before forwarding traffic
3. Not crash when the sidecar takes time to initialize

If any of these are broken, fix them. Keep changes minimal. After any source fix:
1. Rebuild: `cd d:\Browser_agent_OS-main\Browser_agent_OS-main\packages\browseros-agent && bun run build:server` (or use the compile script)
2. Re-stage the binary to both deployment directories
3. Restart the proxy and re-run the 10-health-check
4. Commit and push: `git add -A && git commit --no-verify -m "fix: ..."  && git push`

Both deployment directories:
- `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\`
- `C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\` (if it exists)

### R4. Phase 4 — Security & Safety Review

Scan for security issues across the source code and configuration:

1. Search for hardcoded secrets:
```powershell
Select-String -Path "d:\Browser_agent_OS-main\Browser_agent_OS-main\packages\browseros-agent\apps\server\src\*.ts" -Pattern "sk-|api_key|secret|password|bearer" -CaseSensitive:$false
```
2. Read server_config.json: `Get-Content "C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\server_config.json"`
3. Check RAG server code for unsafe log output: search `D:\knowledge_base\local_rag_server.py` for any `print(` statements that output user queries or credentials.
4. Check `.env` files: `Get-ChildItem -Path "d:\Browser_agent_OS-main\Browser_agent_OS-main" -Filter ".env*" -Recurse | ForEach-Object { Get-Content $_.FullName }`

Report: PASS or FAIL with exact findings. If FAIL, fix any critical leaks before proceeding.

### R5. Phase 5 — RAG Retrieval Quality Verification (CPU-safe)

Test the RAG knowledge base retrieval for 5 queries via the `/retrieve` endpoint (NO LLM — embedding lookup only, fast on CPU):
```python
import urllib.request, json

RAG_URL = "http://127.0.0.1:8000"
queries = [
    "How do I create a catalog item in ServiceNow?",
    "How do I configure LDAP in ServiceNow?",
    "How do I create a business rule in ServiceNow?",
    "How do I configure an ACL in ServiceNow?",
    "How do I configure Integration Hub spoke in ServiceNow?"
]
for q in queries:
    body = json.dumps({"question": q, "top_k": 3}).encode()
    req = urllib.request.Request(f"{RAG_URL}/retrieve", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    chunks = data.get("chunks", [])
    print(f"Query: {q[:50]}... -> {len(chunks)} chunks, top title: {chunks[0]['metadata'].get('title','?') if chunks else 'NONE'}")
```
Each query must return ≥1 chunk. Record titles.

### R6. Phase 6 — Planning Validation (3 Tasks, CPU-Adjusted)

Run the existing validation script at `D:\knowledge_base\scripts\validate_tasks.py` BUT only run 3 tasks to avoid CPU timeout. Modify the `TEST_SUITE` in the script temporarily (or use a subset) to test only:
1. `Configure LDAP` (Administration)
2. `Create Catalog Item` (Service Catalog)
3. `Configure ACL Rule` (Security)

The script calls Ollama with `gemma3:4b` at `http://127.0.0.1:11434`. Allow up to 180 seconds per task. Run:
```powershell
cd D:\knowledge_base && .venv\Scripts\python.exe scripts\validate_tasks.py
```
Record: retrieval pass/fail, planning pass/fail, execution check pass/fail for each task.

### R7. Phase 7 — Git Safety

After completing each phase:
- `git add -A`
- `git commit --no-verify -m "phase N: <description>"`
- `git push`

Use `--no-verify` to skip the broken `lefthook` bash hooks on Windows.
Keep commits small and logical. Never batch unrelated changes.

### R8. Phase 8 — Final Report

Generate `D:\knowledge_base\docs\ValidationReport.md` containing:
1. **Service Stack Status**: Ollama ✅/❌, RAG ✅/❌, Chromium ✅/❌, Proxy ✅/❌
2. **Stability**: 10-health-check result (X/10 passed)
3. **Security Audit**: PASS/FAIL + findings
4. **RAG Retrieval**: 5-query results (query → chunk count + top title)
5. **Planning Validation**: 3-task results (retrieval/planning/execution pass/fail)
6. **What was fixed** in this session
7. **What remains weak** or needs follow-up
8. **Overall status**: STABLE / PARTIALLY_STABLE / UNSTABLE

Also push the report to GitHub.

---

## Acceptance Criteria

### Phase 2 — Services
- [ ] Ollama responds at port 11434 with model list
- [ ] RAG server `/health` returns `{"status":"ok"}`
- [ ] Chromium CDP responds at port 9100
- [ ] Proxy `/health` responds at port 9200
- [ ] 10/10 consecutive health checks pass with zero crashes

### Phase 3 — Proxy
- [ ] `proxy.ts` correctly passes `--cdp-port` to the sidecar subprocess
- [ ] If a fix was made, the updated binary is deployed and passes the 10-check test

### Phase 4 — Security
- [ ] No hardcoded API keys, secrets, or passwords found in source files
- [ ] `server_config.json` contains no credentials
- [ ] RAG server logs no sensitive data

### Phase 5 — RAG
- [ ] All 5 queries return ≥1 chunk from ChromaDB
- [ ] Top results have non-empty `title` metadata

### Phase 6 — Planning
- [ ] All 3 tasks return a valid JSON plan with keys: `goal`, `preconditions`, `navigation_steps`, `action_steps`, `verification_steps`, `expected_result`
- [ ] At least 2 of 3 tasks PASS end-to-end (retrieval + planning + URL check)

### Phase 8 — Report
- [ ] `D:\knowledge_base\docs\ValidationReport.md` exists and contains all 8 sections
- [ ] All sprint commits pushed to GitHub

---

## Absolute Rules

1. Do NOT re-do Milestone 1 or 2 work.
2. Do NOT introduce new features or major refactors.
3. Do NOT expose secrets, API keys, or internal URLs.
4. Do NOT declare success without completing Phases 5 and 6.
5. Use `--no-verify` on all git commits (lefthook bash hooks break on Windows).
6. If a change breaks something: stop, revert with `git revert HEAD`, fix, retest, recommit.
7. Keep changes minimal — fix real problems, do not expand scope.
8. After every completed phase, commit and push immediately.

## 2026-06-05T16:59:30Z

# Teamwork Project Prompt — ServiceNow AI Agent Final Stabilization & Release Prep

> Status: Launched
> Integrity mode: development
> Goal: Stabilize, validate, secure, document, and prepare the ServiceNow Task Planning Agent for migration to a more powerful GPU laptop.

Working directory: `d:\Browser_agent_OS-main\Browser_agent_OS-main`

---

## Project Overview

The ServiceNow Task Planning Agent is a production-grade, local RAG-enabled agent integrated with BrowserOS. The system allows an LLM planner to dynamically retrieve official ServiceNow documentation, construct strict JSON-formatted execution plans, and run browser automation tasks to execute administrative and development procedures in ServiceNow.

This project focuses on **observability, failure recovery, loop prevention, security audit, execution validation, and migration readiness** to prepare the system for deployment on a client/friend GPU machine.

---

## Subagent Organization & Core Tasks

The work is divided into 5 logical subagent tracks, each producing concrete code changes, tests, and documentation:

### Subagent 1: Architecture & Documentation
- **Architecture Diagram**: Create a clear ASCII or Mermaid diagram of the system topology (User -> BrowserOS -> Proxy -> Sidecar -> Local RAG Server -> ChromaDB & Ollama).
- **Service Mapping**: Map each service to its respective source paths, config files, and build/run targets.
- **Port Mapping**: Document the exact ports utilized (`11434` Ollama, `8000` RAG server, `9100` Chromium CDP, `9200` Proxy Server, `9201` Sidecar Server).
- **Startup Flow**: Document the precise service startup sequence, preconditions, and dependency chain.

### Subagent 2: Reliability & Stability
- **RAG Health Checks**: Integrate `/system_status` endpoint pinging RAG server health.
- **Ollama Dependency Checks**: Detect if Ollama is running and has the `gemma3:4b` or `nomic-embed-text` models loaded.
- **Failure Reporting**: Differentiate between RAG server offline, Ollama offline, ChromaDB locked/offline, and browser/tool errors.
- **Loop Prevention**: Validate prompt-based caps (max 3 page opens, 2 extraction attempts, 1 scroll) to prevent infinite loops.
- **Startup Validation**: Verify zero startup crashes or port-in-use exceptions under multiple restarts.

### Subagent 3: Security Review
- **Secret Scanning**: Audit codebase and configurations for hardcoded passwords, tokens, or API keys.
- **API Key & Token Review**: Check environment files, configs, and storage.
- **Unsafe Logging**: Verify no user-submitted credentials or session cookies are outputted in console/system logs.
- **Prompt Injection Review**: Confirm page text and console logs are treated strictly as untrusted data, never as system instructions.

### Subagent 4: BrowserOS & Execution
- **Planner Validation**: Ensure the planner output is validated against the strict JSON schema. No free-form plans allowed.
- **Tool Execution Validation**: Verify browser automation tool adapters map correctly.
- **BrowserOS Integration Testing**: Test navigation, form fill, and action triggers.
- **Popup Handling**: Verify the popup detection workflow (`list_pages` check after reference lookup clicks) is followed.
- **Verification Workflow**: Verify that validation scripts objectively match expected UI selectors.

### Subagent 5: Migration & Deployment
- **Friend Laptop Migration Guide**: Step-by-step instructions to boot the system on a clean Windows machine in under 1 hour.
- **Startup Scripts**: Create/validate a robust PowerShell script (`start_services.ps1`) to launch all dependencies.
- **Dependency Checklist**: List all software dependencies (Bun, Python, VS Build Tools, Git, Chrome).
- **Model Checklist**: Document the required local LLM and embedding models.
- **Deployment Documentation**: Final deployment instructions.

---

## Requirements

### R1. Architecture & System Health Endpoint (`/system_status`)
- The consolidated server must serve `/system_status` returning a JSON object representing the status (`"online"` or `"offline"`) of:
  - `browseros` (CDP active connection check)
  - `proxy` (ping to port 9200)
  - `sidecar` (always `"online"` if serving status)
  - `rag` (ping to RAG health endpoint on port 8000)
  - `ollama` (ping to Ollama tags endpoint on port 11434)
  - `chromadb` (Chroma DB path validation from RAG status)
- All compilation, linting, and typecheck checks must pass.

### R2. Error Differentiation & Loop Prevention
- The RAG client tool (`rag.ts`) must differentiate errors (connection vs. Ollama vs. ChromaDB) and return helpful diagnostic messages instead of a generic "knowledge base unavailable".
- The system prompt (`prompt.ts`) must enforce loop-prevention caps (max 3 page opens, 2 extraction attempts, 1 scroll per session) and force the agent to answer or report insufficient info when limits are reached.
- The planner must enforce a strict JSON structure for ServiceNow plans.

### R3. Security Audit & Key Safety
- Codebase must be verified clean of hardcoded secrets or passwords.
- No credentials or access tokens may be printed in any server console logs or stored in unsafe location files.

### R4. Focused 12-Task Validation Suite (5 Representative Tasks Execution)
- Maintain a focused 12-task validation suite representing the 8 functional domains:
  1. **Configure LDAP** (Administration)
  2. **Configure SSO** (Administration)
  3. **Configure MID Server** (Administration)
  4. **Create Knowledge Base** (Administration)
  5. **Configure Email Notifications** (Administration)
  6. **Configure ACL Rule** (Security)
  7. **Configure CMDB Discovery** (CMDB)
  8. **Create Catalog Item** (Service Catalog)
  9. **Create Business Rule** (Developer)
  10. **Create Client Script** (Developer)
  11. **Create Flow Designer Flow** (Flow Designer)
  12. **Configure Integration Hub** (Integrations)
- Run RAG retrieval checks on all 12 tasks.
- Execute the LLM planning and validation script for the **5 representative tasks** to save CPU resources:
  - Configure LDAP (Administration)
  - Configure ACL Rule (Security)
  - Create Catalog Item (Service Catalog)
  - Create Business Rule (Developer)
  - Create Flow Designer Flow (Flow Designer)
- Output the metrics: Retrieval Accuracy, Planning Accuracy, Execution Success, Verification Success, and E2E Success.

### R5. Migration Guide & Startup Script
- Provide a clear, step-by-step migration guide for deployment on a clean Windows GPU machine.
- Provide a robust, BOM-free PowerShell startup script (`start_services.ps1`) to automatically verify and boot all services in the correct order.

---

## Acceptance Criteria

### Health & Observability
- [ ] `/system_status` endpoint returns valid JSON with all 6 service statuses.
- [ ] Server compiles and builds successfully under Windows.

### Error Handling & Loop Prevention
- [ ] RAG client returns precise error details when Ollama is stopped vs. when RAG is offline.
- [ ] System prompt contains the strict browsing caps and JSON plan schema.

### Security
- [ ] No secrets, tokens, or passwords exist in the repository files.
- [ ] Logs do not print credentials or tokens.

### Validation Suite
- [ ] Retrieval validation is performed for the 12 tasks, verifying correct runbook mapping.
- [ ] Execution and planning validation is completed for the 5 representative tasks using Ollama (`gemma3:4b`).
- [ ] `ValidationReport.md` is generated and pushed to GitHub.

### Deployment & Migration
- [ ] `migration_guide.md` is generated and lists software, models, environment variables, folders, and commands.
- [ ] `start_services.ps1` script successfully checks and starts Ollama, RAG server, Chrome CDP, and the Proxy server.

---

## Release Deliverables (in Artifacts / Docs folder)

1. **Architecture Document** (`architecture_document.md`)
2. **System Health Document** (`system_health.md`)
3. **Reliability Report / Validation Report** (`validation_report.md`)
4. **Security Report** (`security_report.md`)
5. **Migration Guide** (`migration_guide.md`)
6. **Final Release Notes** (`release_notes.md`)
