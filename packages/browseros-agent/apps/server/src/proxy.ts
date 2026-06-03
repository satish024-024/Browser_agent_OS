import { spawn } from "node:child_process";

// 1. Determine port logic
const args = Bun.argv.slice(2);
let serverPort = 9200;
let realPort = 9201;

// Update args
const newArgs = args.map(arg => {
  if (arg.startsWith('--server-port=')) {
    const portStr = arg.split('=')[1];
    serverPort = parseInt(portStr, 10);
    realPort = serverPort === 9200 ? 9201 : serverPort + 10;
    return `--server-port=${realPort}`;
  }
  return arg;
});

if (!args.some(arg => arg.startsWith('--server-port='))) {
  newArgs.push(`--server-port=${realPort}`);
}

const execPath = process.execPath;
const execDir = execPath.substring(0, execPath.lastIndexOf('\\'));
const realExePath = `${execDir}\\browseros_server_real.exe`;

console.log(`[Proxy] Executable directory: ${execDir}`);
console.log(`[Proxy] Launching real sidecar at: ${realExePath}`);
console.log(`[Proxy] Real args: ${newArgs.join(' ')}`);

// Launch real sidecar
const child = spawn(realExePath, newArgs, {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  console.log(`[Proxy] Real sidecar exited with code ${code}`);
  process.exit(code ?? 0);
});

// Heuristic to check if the message is ServiceNow-related
function isServiceNowRelated(message: string): boolean {
  if (!message) return false;
  const msg = message.toLowerCase();
  const keywords = [
    "servicenow", "service now", "gliderecord", "glidesystem", "g_form", "g_user",
    "sys_id", "client script", "business rule", "script include", "flow designer",
    "integrationhub", "cmdb", "mid server", "itsm", "itom", "itbm", "service portal",
    "acl", "ldap", "active directory", "transform map", "import set", "update set",
    "ui policy", "data policy", "ui action", "sys_user", "sys_db_object"
  ];
  return keywords.some(keyword => msg.includes(keyword));
}

// RAG Retrieval helper
async function retrieveRAG(question: string): Promise<string | null> {
  try {
    console.log(`[Proxy] Querying RAG for ServiceNow question: "${question.substring(0, 60)}..."`);
    const response = await fetch("http://127.0.0.1:8000/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, top_k: 5 }),
    });
    if (!response.ok) {
      console.warn(`[Proxy] RAG server responded with status: ${response.status}`);
      return null;
    }
    const data: any = await response.json();
    const chunks = data.chunks || [];
    if (chunks.length === 0) {
      console.log("[Proxy] No chunks retrieved from RAG.");
      return null;
    }

    let ragContext = "\n\n=== CRITICAL SYSTEM OVERRIDE FOR SERVICENOW QUESTIONS ===\n";
    ragContext += "The user has asked a ServiceNow-related question. You are provided with the full official ServiceNow reference documentation below.\n";
    ragContext += "IMPORTANT: You MUST NOT return any tool calls (such as suggest_app_connection, search_documentation, browseros_info, or evaluate_script) for this query. Calling these tools will result in a CRITICAL ERROR. You are strictly forbidden from outputting tool calls or suggesting connections.\n";
    ragContext += "You MUST answer the question directly in markdown format using only the verified reference documentation provided below.\n\n";
    ragContext += "=== SERVICENOW LOCAL KNOWLEDGE BASE REFERENCE ===\n";

    chunks.forEach((chunk: any, i: number) => {
      const title = chunk.metadata?.title || "ServiceNow Documentation";
      const text = chunk.text || "";
      ragContext += `[Doc ${i + 1}] Title: ${title}\n${text}\n\n`;
    });

    ragContext += "=========================================================\n";
    return ragContext;
  } catch (error) {
    console.error("[Proxy] Failed to query RAG server:", error);
    return null;
  }
}

const server = Bun.serve({
  port: serverPort,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const targetUrl = `http://127.0.0.1:${realPort}${url.pathname}${url.search}`;

    // Intercept chat request
    if (req.method === "POST" && url.pathname === "/chat") {
      try {
        const body = await req.json();
        console.log("[Proxy] Intercepted /chat request body:", JSON.stringify(body));

        const message = body.message || "";
        let userSystemPrompt = body.userSystemPrompt || "";

        // Normalize Ollama base URL if it's missing the /v1 suffix
        if (body.provider === "ollama" || body.provider === "openai-compatible") {
          let baseUrl = body.baseUrl || "";
          if (baseUrl && baseUrl.includes("11434") && !baseUrl.endsWith("/v1") && !baseUrl.endsWith("/v1/")) {
            const normalized = `${baseUrl.replace(/\/$/, "")}/v1`;
            console.log(`[Proxy] Auto-correcting Ollama baseUrl from "${baseUrl}" to "${normalized}"`);
            body.baseUrl = normalized;
          }
        }

        // Always inject ServiceNow local RAG MCP server into browserContext.customMcpServers
        if (!body.browserContext) {
          body.browserContext = {};
        }
        if (!body.browserContext.customMcpServers) {
          body.browserContext.customMcpServers = [];
        }
        const hasServiceNowMCP = body.browserContext.customMcpServers.some(
          (s: any) => s.url && s.url.includes("8000")
        );
        if (!hasServiceNowMCP) {
          console.log("[Proxy] Injecting ServiceNow local RAG MCP server into customMcpServers");
          body.browserContext.customMcpServers.push({
            name: "servicenow-rag",
            url: "http://127.0.0.1:8000/mcp/message"
          });
        }

        if (isServiceNowRelated(message)) {
          console.log("[Proxy] ServiceNow query detected in message. Initiating RAG lookup...");
          const ragContext = await retrieveRAG(message);
          if (ragContext) {
            console.log("[Proxy] Injecting RAG context into userSystemPrompt.");
            userSystemPrompt = userSystemPrompt ? `${ragContext}\n${userSystemPrompt}` : ragContext;
            body.userSystemPrompt = userSystemPrompt;
          }
        }

        // Forward to the real sidecar
        console.log(`[Proxy] Forwarding /chat request to real sidecar at port ${realPort}`);
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: req.headers,
          body: JSON.stringify(body),
          signal: req.signal,
        });

        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
      } catch (err) {
        console.error("[Proxy] Error intercepting /chat:", err);
      }
    }

    // Proxy all other HTTP requests transparently
    try {
      // Support WebSocket upgrade requests
      if (req.headers.get("upgrade") === "websocket") {
        const success = server.upgrade(req, {
          data: {
            targetUrl: `ws://127.0.0.1:${realPort}${url.pathname}${url.search}`,
            headers: req.headers,
          }
        });
        if (success) return undefined;
      }

      // Handle normal HTTP request forwarding
      const headers = new Headers(req.headers);
      headers.delete("host");

      let body: any = null;
      if (req.method !== "GET" && req.method !== "HEAD") {
        body = req.body;
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        redirect: "manual",
      });

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (err) {
      console.error(`[Proxy] Proxy error for ${req.method} ${url.pathname}:`, err);
      return new Response("Proxy Error", { status: 502 });
    }
  },
  websocket: {
    open(ws) {
      const data = ws.data as any;
      console.log(`[Proxy] Opening WebSocket connection to ${data.targetUrl}`);
      const socket = new WebSocket(data.targetUrl);
      data.socket = socket;

      socket.onmessage = (event) => {
        ws.send(event.data);
      };

      socket.onclose = (event) => {
        ws.close(event.code, event.reason);
      };

      socket.onerror = (error) => {
        console.error("[Proxy] Target WebSocket error:", error);
        ws.close(1006);
      };
    },
    message(ws, message) {
      const data = ws.data as any;
      if (data.socket && data.socket.readyState === WebSocket.OPEN) {
        data.socket.send(message);
      }
    },
    close(ws, code, reason) {
      const data = ws.data as any;
      if (data.socket) {
        data.socket.close(code, reason);
      }
    }
  }
});

console.log(`[Proxy] Server listening on http://127.0.0.1:${serverPort}`);
