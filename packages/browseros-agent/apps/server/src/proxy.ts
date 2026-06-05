import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// 1. Determine port logic
const args = Bun.argv.slice(2)
let serverPort = 9200
let realPort = 9201
let cdpPort: number | null = null

// First check if a config file is specified
let configPath: string | null = null
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg.startsWith('--config=')) {
    configPath = arg.split('=')[1]
  } else if (arg === '--config' && i + 1 < args.length) {
    configPath = args[i + 1]
  }
}

// Parse CLI args first (highest precedence)
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg.startsWith('--cdp-port=')) {
    cdpPort = parseInt(arg.split('=')[1], 10)
  } else if (arg === '--cdp-port' && i + 1 < args.length) {
    cdpPort = parseInt(args[i + 1], 10)
  }
}

// Fallback to env variable
if (cdpPort === null && process.env.BROWSEROS_CDP_PORT) {
  cdpPort = parseInt(process.env.BROWSEROS_CDP_PORT, 10)
}

// Fallback to config file
if (cdpPort === null && configPath) {
  // Strip surrounding quotes which might be present on Windows/CLI
  configPath = configPath.replace(/^['"]|['"]$/g, '')
  try {
    const absPath = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath)
    if (fs.existsSync(absPath)) {
      const content = fs.readFileSync(absPath, 'utf-8')
      const cfg = JSON.parse(content)
      if (cfg.ports?.cdp) {
        cdpPort = parseInt(cfg.ports.cdp, 10)
      }
    }
  } catch (e) {
    console.warn(`[Proxy] Failed to read config file to extract CDP port:`, e)
  }
}

// Fallback to default
if (cdpPort === null) {
  cdpPort = 9100
}

// Build newArgs for sidecar robustly
const newArgs: string[] = []
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg.startsWith('--server-port=')) {
    const portStr = arg.split('=')[1]
    serverPort = parseInt(portStr, 10)
    realPort = serverPort === 9200 ? 9201 : serverPort + 10
    newArgs.push(`--server-port=${realPort}`)
  } else if (arg === '--server-port' && i + 1 < args.length) {
    serverPort = parseInt(args[i + 1], 10)
    realPort = serverPort === 9200 ? 9201 : serverPort + 10
    newArgs.push('--server-port', String(realPort))
    i++
  } else if (arg.startsWith('--cdp-port=')) {
    newArgs.push(`--cdp-port=${cdpPort}`)
  } else if (arg === '--cdp-port' && i + 1 < args.length) {
    newArgs.push('--cdp-port', String(cdpPort))
    i++
  } else {
    newArgs.push(arg)
  }
}

// Ensure --server-port is present
if (!newArgs.some((arg) => arg.startsWith('--server-port=') || arg === '--server-port')) {
  newArgs.push(`--server-port=${realPort}`)
}

// Ensure --cdp-port is present
if (!newArgs.some((arg) => arg.startsWith('--cdp-port=') || arg === '--cdp-port')) {
  newArgs.push(`--cdp-port=${cdpPort}`)
}

const execPath = process.execPath
const execDir = execPath.substring(0, execPath.lastIndexOf('\\'))
const realExePath = `${execDir}\\browseros_server_real.exe`

console.log(`[Proxy] Executable directory: ${execDir}`)
console.log(`[Proxy] Launching real sidecar at: ${realExePath}`)
console.log(`[Proxy] Real args: ${newArgs.join(' ')}`)

// Launch real sidecar
const child = spawn(realExePath, newArgs, {
  stdio: 'inherit',
  shell: false,
})

child.on('exit', (code) => {
  console.log(`[Proxy] Real sidecar exited with code ${code}`)
  process.exit(code ?? 0)
})

// Sidecar readiness handshake check
const readinessPromise = (async () => {
  const healthUrl = `http://127.0.0.1:${realPort}/health`
  for (let i = 0; i < 30; i++) {
    try {
      console.log(`[Proxy] Checking sidecar health (attempt ${i + 1}/30)...`)
      const res = await fetch(healthUrl)
      if (res.ok) {
        console.log(`[Proxy] Sidecar health check passed.`)
        return true
      }
    } catch (err) {
      // Ignore connection errors/refusals while booting
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  console.error(`[Proxy] Sidecar health check failed after 30 attempts.`)
  return false
})()

// Detect ServiceNow-related queries via platform keywords and ITSM intent phrases
function isServiceNowRelated(message: string): boolean {
  if (!message) return false
  const msg = message.toLowerCase()

  // Explicit platform / API keywords
  const platformKeywords = [
    'servicenow',
    'service now',
    'gliderecord',
    'glidesystem',
    'g_form',
    'g_user',
    'sys_id',
    'client script',
    'business rule',
    'script include',
    'flow designer',
    'integrationhub',
    'cmdb',
    'mid server',
    'itsm',
    'itom',
    'itbm',
    'service portal',
    'acl',
    'ldap',
    'active directory',
    'transform map',
    'import set',
    'update set',
    'ui policy',
    'data policy',
    'ui action',
    'sys_user',
    'sys_db_object',
    'catalog item',
    'service catalog',
    'knowledge base',
    'knowledge article',
    'change request',
    'change management',
    'incident',
    'problem record',
    'service desk',
    'sla',
    'assignment group',
    'configuration item',
    'discovery',
    'now platform',
    'update set',
    'personal developer instance',
    'pdi',
    'snow',
    'sys_script',
    'sys_trigger',
    'scheduled job',
    'notification',
    'email notification',
    'approval policy',
    'approval workflow',
  ]

  // Intent phrases — common ITSM / admin actions asked in natural language
  const intentPhrases = [
    'how do i create',
    'how do i submit',
    'how to submit',
    'how to create',
    'how do i assign',
    'how to assign',
    'how do i approve',
    'how to approve',
    'how do i configure',
    'how to configure',
    'how do i set up',
    'how to set up',
    'how do i update',
    'how to update',
    'create a ticket',
    'open a ticket',
    'submit a request',
    'raise a ticket',
    'approval process',
    'onboarding request',
    'access request',
    'hardware request',
    'software request',
    'create a catalog',
    'create catalog',
    'create an incident',
    'create incident',
    'create a change',
    'create change',
    'create a problem',
    'create problem',
    'create a user',
    'assign a role',
    'assign role',
    'reset password',
    'service request',
    'create a knowledge',
    'knowledge article',
  ]

  if (platformKeywords.some((k) => msg.includes(k))) return true
  if (intentPhrases.some((p) => msg.includes(p))) return true
  return false
}

// RAG Retrieval helper
async function retrieveRAG(question: string): Promise<string | null> {
  try {
    console.log(
      `[Proxy] Querying RAG for ServiceNow question: "${question.substring(0, 60)}..."`,
    )
    const response = await fetch('http://127.0.0.1:8000/retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, top_k: 8 }),
    })
    if (!response.ok) {
      console.warn(
        `[Proxy] RAG server responded with status: ${response.status}`,
      )
      return null
    }
    const data: any = await response.json()
    const chunks = data.chunks || []
    if (chunks.length === 0) {
      console.log('[Proxy] No chunks retrieved from RAG.')
      return null
    }

    let ragContext =
      '\n\n=== CRITICAL SYSTEM OVERRIDE FOR SERVICENOW QUESTIONS ===\n'
    ragContext +=
      'The user has asked a ServiceNow-related question. You are provided with the full official ServiceNow reference documentation below.\n'
    ragContext +=
      'IMPORTANT: You MUST NOT return any tool calls (such as suggest_app_connection, search_documentation, browseros_info, or evaluate_script) for this query. Calling these tools will result in a CRITICAL ERROR. You are strictly forbidden from outputting tool calls or suggesting connections.\n'
    ragContext +=
      'You MUST answer the question directly in markdown format using only the verified reference documentation provided below.\n\n'
    ragContext += '=== SERVICENOW LOCAL KNOWLEDGE BASE REFERENCE ===\n'

    chunks.forEach((chunk: any, i: number) => {
      const title = chunk.metadata?.title || 'ServiceNow Documentation'
      const text = chunk.text || ''
      ragContext += `[Doc ${i + 1}] Title: ${title}\n${text}\n\n`
    })

    ragContext += '=========================================================\n'
    return ragContext
  } catch (error) {
    console.error('[Proxy] Failed to query RAG server:', error)
    return null
  }
}

const server: import('bun').Server<unknown> = Bun.serve({
  port: serverPort,
  idleTimeout: 0,
  async fetch(req: Request): Promise<Response | undefined> {
    const url = new URL(req.url)
    const targetUrl = `http://127.0.0.1:${realPort}${url.pathname}${url.search}`

    // Wait for sidecar readiness before forwarding traffic
    const isReady = await readinessPromise
    if (!isReady) {
      console.error(`[Proxy] Sidecar is not ready. Rejecting request: ${url.pathname}`)
      return new Response('Sidecar Not Ready', { status: 503 })
    }

    // Intercept chat request
    if (req.method === 'POST' && url.pathname === '/chat') {
      try {
        const body = await req.json()
        console.log(
          '[Proxy] Intercepted /chat request body:',
          JSON.stringify(body),
        )

        const message = body.message || ''
        let userSystemPrompt = body.userSystemPrompt || ''

        // Normalize Ollama base URL if it's missing the /v1 suffix
        if (
          body.provider === 'ollama' ||
          body.provider === 'openai-compatible'
        ) {
          const baseUrl = body.baseUrl || ''
          if (
            baseUrl &&
            baseUrl.includes('11434') &&
            !baseUrl.endsWith('/v1') &&
            !baseUrl.endsWith('/v1/')
          ) {
            const normalized = `${baseUrl.replace(/\/$/, '')}/v1`
            console.log(
              `[Proxy] Auto-correcting Ollama baseUrl from "${baseUrl}" to "${normalized}"`,
            )
            body.baseUrl = normalized
          }
        }

        // NOTE: RAG context is injected as userSystemPrompt text below.
        // No MCP server registration needed — the RAG server is a REST API, not MCP.

        if (isServiceNowRelated(message)) {
          console.log(
            '[Proxy] ServiceNow query detected in message. Initiating RAG lookup...',
          )
          const ragContext = await retrieveRAG(message)
          if (ragContext) {
            console.log('[Proxy] Injecting RAG context into userSystemPrompt.')
            userSystemPrompt = userSystemPrompt
              ? `${ragContext}\n${userSystemPrompt}`
              : ragContext
            body.userSystemPrompt = userSystemPrompt
          }
        }

        // Forward to the real sidecar
        console.log(
          `[Proxy] Forwarding /chat request to real sidecar at port ${realPort}`,
        )
        const response = await globalThis.fetch(targetUrl, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify(body),
          signal: req.signal,
        })

        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        })
      } catch (err) {
        console.error('[Proxy] Error intercepting /chat:', err)
      }
    }

    // Proxy all other HTTP requests transparently
    try {
      // Support WebSocket upgrade requests
      if (req.headers.get('upgrade') === 'websocket') {
        const success = server.upgrade(req, {
          data: {
            targetUrl: `ws://127.0.0.1:${realPort}${url.pathname}${url.search}`,
            headers: req.headers,
          },
        })
        if (success) return undefined
      }

      // Handle normal HTTP request forwarding
      const headers = new Headers(req.headers)
      headers.delete('host')

      let body: any = null
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        body = req.body
      }

      const response = await globalThis.fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
      })

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      })
    } catch (err) {
      console.error(
        `[Proxy] Proxy error for ${req.method} ${url.pathname}:`,
        err,
      )
      return new Response('Proxy Error', { status: 502 })
    }
  },
  websocket: {
    open(ws) {
      const data = ws.data as any
      console.log(`[Proxy] Opening WebSocket connection to ${data.targetUrl}`)
      const socket = new WebSocket(data.targetUrl)
      data.socket = socket

      socket.onmessage = (event) => {
        ws.send(event.data)
      }

      socket.onclose = (event) => {
        ws.close(event.code, event.reason)
      }

      socket.onerror = (error) => {
        console.error('[Proxy] Target WebSocket error:', error)
        ws.close(1006)
      }
    },
    message(ws, message) {
      const data = ws.data as any
      if (data.socket && data.socket.readyState === WebSocket.OPEN) {
        data.socket.send(message)
      }
    },
    close(ws, code, reason) {
      const data = ws.data as any
      if (data.socket) {
        data.socket.close(code, reason)
      }
    },
  },
})

console.log(`[Proxy] Server listening on http://127.0.0.1:${serverPort}`)
