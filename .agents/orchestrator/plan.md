# Project Plan: ServiceNow AI Agent Stabilization

## Objectives
1. Fix dynamic module loading crash (pino-pretty) in the sidecar server (`browseros_server_real.exe`).
2. Stabilize the custom RAG-intercepting proxy (`browseros_server.exe` / source) and deploy it to target directories.
3. Conduct security and safety review.
4. Execute and validate the 12 ServiceNow agent tasks.
5. Generate a comprehensive validation report.

## Milestones
### Milestone 1: Exploration and Analysis
- **Goal**: Find source code, build scripts, configuration files, and target deploy directories. Understand structure of proxy and sidecar.
- **Verification**: Explorer report submitted.

### Milestone 2: Sidecar Startup & Module Resolution
- **Goal**: Resolve `pino-pretty` runtime dynamic dependency resolution error during Bun compilation/execution.
- **Verification**: Bun compilation runs and execution succeeds on port 9201 without crashing on dependency resolution.

### Milestone 3: Proxy Stability & Deploy
- **Goal**: Ensure `/chat` interception works and queries the RAG server on port 8000. Deploy the proxy to both required target paths.
- **Verification**: Verification tests confirm proxy is running, intercepting, and not crashing. Built binaries deployed to:
  1. `C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\`
  2. `C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\`

### Milestone 4: Security & Safety Review
- **Goal**: Audit code for hardcoded secrets, tokens, endpoints, unsafe logging. Ensure unnecessary services are disabled.
- **Verification**: Reviewer / Critic report confirms no security issues.

### Milestone 5: ServiceNow Tasks Validation
- **Goal**: Run the 12 ServiceNow validation tasks. Log inputs, RAG docs retrieved, BrowserOS execution result, and pass/fail status.
- **Verification**: E2E test runs for all 12 tasks pass and results are recorded.

### Milestone 6: Final Reporting & Sign-off
- **Goal**: Publish final `ValidationReport.md` and report completion back to the Sentinel.
- **Verification**: ValidationReport.md exists and contains all required details.
