/**
 * ServiceNow Knowledge Base RAG tools.
 *
 * These tools call the local RAG retrieval server (http://127.0.0.1:8000)
 * which indexes ServiceNow documentation in ChromaDB using nomic-embed-text.
 *
 * Design principle:
 *   - RETRIEVAL is done locally (ChromaDB + Ollama embeddings).
 *   - GENERATION is done by the calling LLM (BrowserOS, OpenAI, Anthropic, Ollama, etc.)
 *     by returning the retrieved context in a prompt-ready format.
 *
 * This means both tools work correctly with ANY provider selected in BrowserOS —
 * the active model synthesises the final answer from the retrieved context.
 */

import { z } from 'zod'
import { defineTool } from './framework'

const RAG_BASE_URL = 'http://127.0.0.1:8000'
const RAG_TIMEOUT_MS = 30_000

type RagChunk = {
  id?: string
  text: string
  metadata?: Record<string, unknown>
  rank_score?: number
  distance?: number
}

type RetrieveResponse = {
  question?: string
  chunks?: RagChunk[]
  sources?: Array<{ title?: string; module?: string; source_url?: string; release?: string }>
}

async function retrieveChunks(
  question: string,
  topK: number,
): Promise<RetrieveResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RAG_TIMEOUT_MS)

  try {
    const res = await fetch(`${RAG_BASE_URL}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, top_k: topK }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`RAG server error ${res.status}: ${text}`)
    }
    return (await res.json()) as RetrieveResponse
  } finally {
    clearTimeout(timeoutId)
  }
}

function formatChunksAsContext(
  chunks: RagChunk[],
  question: string,
): string {
  const blocks = chunks.map((chunk, i) => {
    const meta = chunk.metadata ?? {}
    const title = (meta.title as string | undefined) ?? `Source ${i + 1}`
    const module = (meta.module as string | undefined) ?? ''
    const release = (meta.release as string | undefined) ?? ''
    const url = (meta.source_url as string | undefined) ?? ''
    const relevance = chunk.rank_score !== undefined
      ? ` [relevance: ${chunk.rank_score.toFixed(3)}]`
      : ''

    const header = [title, module, release].filter(Boolean).join(' | ')
    const urlLine = url ? `URL: ${url}` : ''

    return `[Source ${i + 1}]${relevance} ${header}\n${urlLine}\n\n${chunk.text}`
  })

  return (
    `The following are the top ${chunks.length} relevant excerpts from the ` +
    `official ServiceNow documentation for the question:\n` +
    `"${question}"\n\n` +
    `Use ONLY these sources to answer. Cite source numbers. ` +
    `If the sources are insufficient, say so.\n\n` +
    `---\n\n` +
    blocks.join('\n\n---\n\n')
  )
}

const OFFLINE_ERROR =
  'The ServiceNow knowledge base server is offline (http://127.0.0.1:8000). ' +
  'Start it with:\n  cd d:\\knowledge_base\\knowledge_base\n' +
  '  .venv\\Scripts\\uvicorn local_rag_server:app --host 127.0.0.1 --port 8000'

function isOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('aborted')
}

// ─── servicenow_search ────────────────────────────────────────────────────────

export const servicenow_search = defineTool({
  name: 'servicenow_search',
  description:
    'Search the ServiceNow knowledge base (7,500+ official documentation chunks) ' +
    'and return the most relevant passages. Use this to look up ServiceNow features, ' +
    'APIs, tables, scripting, workflows, ITSM processes, admin configuration, and more. ' +
    'Returns raw documentation excerpts with source links that you can use to answer the user.',
  approvalCategory: 'assistant',
  input: z.object({
    query: z
      .string()
      .min(3)
      .describe(
        'What to search for in the ServiceNow documentation. Be specific — ' +
        'e.g. "create incident from service catalog" rather than just "incident".',
      ),
    n_results: z
      .number()
      .int()
      .min(1)
      .max(15)
      .optional()
      .default(5)
      .describe('Number of documentation chunks to return (default 5, max 15).'),
  }),
  async handler(args, _ctx, response) {
    try {
      const data = await retrieveChunks(args.query, args.n_results ?? 5)
      const chunks = data?.chunks ?? []

      if (chunks.length === 0) {
        response.text(
          'No relevant ServiceNow documentation found for that query. ' +
          'Try rephrasing or use a more specific term.',
        )
        return
      }

      const formatted = chunks
        .map((chunk, i) => {
          const meta = chunk.metadata ?? {}
          const title = (meta.title as string | undefined) ?? ''
          const module = (meta.module as string | undefined) ?? ''
          const url = (meta.source_url as string | undefined) ?? ''
          const score = chunk.rank_score !== undefined
            ? ` (relevance: ${chunk.rank_score.toFixed(3)})`
            : ''
          const header = title
            ? `**${title}**${score}${module ? ` | ${module}` : ''}`
            : `Result ${i + 1}${score}`
          const sourceLine = url ? `\nSource: ${url}` : ''
          return `## ${header}${sourceLine}\n\n${chunk.text}`
        })
        .join('\n\n---\n\n')

      response.text(formatted)
    } catch (err) {
      if (isOfflineError(err)) {
        response.error(OFFLINE_ERROR)
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        response.error(`ServiceNow search failed: ${msg}`)
      }
    }
  },
})

// ─── servicenow_ask ───────────────────────────────────────────────────────────

export const servicenow_ask = defineTool({
  name: 'servicenow_ask',
  description:
    'Retrieve relevant ServiceNow documentation context for a question, ' +
    'formatted so you (the model) can synthesise a grounded answer. ' +
    'IMPORTANT: this tool returns RETRIEVED CONTEXT — you must read the context ' +
    'and produce the final answer yourself in your next response. ' +
    'Works with any LLM provider including BrowserOS, OpenAI, Anthropic, and Ollama. ' +
    'Ideal for "how do I…", "explain…", "what is…" questions about ServiceNow.',
  approvalCategory: 'assistant',
  input: z.object({
    question: z
      .string()
      .min(5)
      .describe('The ServiceNow question to answer. Write it as a complete sentence.'),
    n_context: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(6)
      .describe(
        'Number of documentation chunks to retrieve as context (default 6). ' +
        'Increase to 10 for complex multi-step questions.',
      ),
  }),
  async handler(args, _ctx, response) {
    try {
      const data = await retrieveChunks(args.question, args.n_context ?? 6)
      const chunks = data?.chunks ?? []

      if (chunks.length === 0) {
        response.text(
          'No relevant ServiceNow documentation found for that question. ' +
          'Try rephrasing or searching for a more specific topic.',
        )
        return
      }

      // Return context formatted for the calling model to synthesise the answer.
      // The model (BrowserOS, OpenAI, Anthropic, etc.) reads this and answers.
      const context = formatChunksAsContext(chunks, args.question)
      response.text(context)
    } catch (err) {
      if (isOfflineError(err)) {
        response.error(OFFLINE_ERROR)
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        response.error(`ServiceNow knowledge retrieval failed: ${msg}`)
      }
    }
  },
})
