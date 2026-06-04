# Original User Request

## Initial Request — 2026-06-04T16:46:16+05:30

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

## Follow-up — 2026-06-04T17:36:30+05:30

# Teamwork Project Prompt — ServiceNow AI Agent Stabilization (Full Sprint)

> Status: **Launched** — Full 10-hour stabilization sprint  
> Integrity mode: development

Make the ServiceNow AI Agent codebase production-ready, stable, secure, and maintainable. The system must retrieve and apply real ServiceNow documentation, generate reliable step-by-step task plans, and work with BrowserOS. Two milestones are already done — this sprint resumes from Milestone 3.

Working directory: `d:/Browser_agent_OS-main/Browser_agent_OS-main`

### CRITICAL CONTEXT — What Is Already Done (DO NOT REDO)
- Milestone 1 & 2 completed — commit `f24666b1` pushed to GitHub
- `logger.ts` patched: `isCompiled` detection prevents `pino-pretty` crash
- `config.ts` patched: `BROWSEROS_ENV` env var bypasses production validation
- Both binaries compiled and staged:
  - `browseros_server.exe` (114 MB) - proxy
  - `browseros_server_real.exe` (121 MB) - sidecar
- All services currently STOPPED after server restart

### Sprint resumes from Milestone 3 with 8 phases:
- R1: Full System Audit
- R2: Service Stack Restore (Ollama→RAG→Chromium→Proxy)
- R3: Proxy→Sidecar CDP handshake audit & fix
- R4: Security & Safety Review
- R5: RAG Retrieval Quality Verification (5 queries, CPU-safe)
- R6: Planning Validation (3 tasks, CPU-adjusted, gemma3:4b)
- R7: Git Safety (commit after each phase)
- R8: Final Report to D:\knowledge_base\docs\ValidationReport.md
