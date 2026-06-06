# ServiceNow AI Agent — Migration & Deployment Guide v1.0

This guide provides step-by-step instructions to migrate and deploy the ServiceNow Task Planning Agent on a new, more powerful Windows GPU laptop, targeting complete operational readiness in under 1 hour.

---

## 1. System Requirements

### Hardware Recommendations
- **CPU**: Intel Core i7 / AMD Ryzen 7 or higher
- **GPU**: NVIDIA RTX 3060/4060 or higher with 8GB+ VRAM (for fast local LLM inference)
- **RAM**: 16 GB or higher
- **Storage**: SSD with 20 GB free space

### Software Requirements
- **Operating System**: Windows 11 / Windows 10
- **Runtime**: Bun v1.3.6 (installed via powershell: `powershell -c "irm bun.sh/install.ps1 | iex"`)
- **Python**: Python 3.11.x (with `pip` and virtual environment support)
- **Git**: Git for Windows
- **Compiler**: Visual Studio C++ Build Tools (required for Node-GYP compilation of some dependencies)
- **Browser**: Chromium or Google Chrome (installed at standard AppData or Program Files paths)

---

## 2. Model Setup (Ollama)

1. Download and install **Ollama for Windows** from [ollama.com](https://ollama.com).
2. Start the Ollama service:
   ```powershell
   ollama serve
   ```
3. Open a separate PowerShell window and pull the required models:
   ```powershell
   # Pull embedding model
   ollama pull nomic-embed-text
   
   # Pull planning LLM
   ollama pull gemma3:4b
   ```
4. Verify models are loaded:
   ```powershell
   ollama list
   ```

---

## 3. Directory & Folder Structure

Create directories matching this configuration on the new machine:
- **Workspace Directory**: `C:\projects\Browser_agent_OS` (Clone repository here)
- **RAG Knowledge Base**: `D:\knowledge_base` (Copy ChromaDB and source scripts here)
- **Chroma Vector DB**: `D:\knowledge_base\final_chroma_db`
- **Chroma Chunks**: `D:\knowledge_base\final_chroma_db\final_chroma_db.sqlite3`

---

## 4. Environment Variables

Create a `.env` file in `packages/browseros-agent/` or set the following system variables:

```ini
# Force development mode to bypass production certificates checks
BROWSEROS_ENV=development

# RAG configuration
OLLAMA_URL=http://127.0.0.1:11434
SN_EMBED_MODEL=nomic-embed-text
SN_GEN_MODEL=gemma3:4b
```

---

## 5. Deployment & Execution Steps

### Step 1: Install Dependencies
Open PowerShell in the project folder and run:
```powershell
cd C:\projects\Browser_agent_OS\packages\browseros-agent
bun install
```

### Step 2: Build the Server Binary
Compile the custom proxy and sidecar server binaries:
```powershell
bun run build:server --target=windows-x64 --ci
```

### Step 3: Deploy Compiled Binaries
Deploy the generated binaries to the target Chromium version directories:
```powershell
# Copy to local user directory
Copy-Item -Path "dist\prod\server\.tmp\binaries\browseros-server-windows-x64.exe" -Destination "$env:LOCALAPPDATA\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\browseros_server.exe" -Force
Copy-Item -Path "dist\prod\server\.tmp\binaries\browseros-server-real-windows-x64.exe" -Destination "$env:LOCALAPPDATA\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\browseros_server_real.exe" -Force
```

### Step 4: Run Services
Run the startup orchestrator script to verify all connections and start the stack:
```powershell
cd C:\projects\Browser_agent_OS
.\start_services.ps1
```

---

## 6. Verification checklist on the New Machine

- [ ] `/system_status` endpoint returns all 6 services as `"online"`.
- [ ] Ollama responds to `Invoke-RestMethod http://127.0.0.1:11434/api/tags`.
- [ ] RAG server responds to `Invoke-RestMethod http://127.0.0.1:8000/health`.
- [ ] Chrome CDP debugging responds to `Invoke-RestMethod http://127.0.0.1:9100/json/version`.
- [ ] Task planning returns a valid JSON block within 5 seconds (GPU speed).
