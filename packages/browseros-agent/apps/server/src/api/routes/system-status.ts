/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Hono } from 'hono'
import type { Browser } from '../../browser/browser'

interface SystemStatusDeps {
  browser?: Browser
}

export function createSystemStatusRoute(deps: SystemStatusDeps = {}) {
  return new Hono().get('/', async (c) => {
    const status = {
      browseros: 'offline',
      proxy: 'offline',
      sidecar: 'online',
      rag: 'offline',
      ollama: 'offline',
      chromadb: 'offline',
    }

    // 1. Check BrowserOS (CDP connection)
    try {
      const cdpConnected = deps.browser?.isCdpConnected()
      status.browseros = cdpConnected ? 'online' : 'offline'
    } catch {
      status.browseros = 'offline'
    }

    // 2. Check Proxy (port 9200)
    try {
      const proxyRes = await fetch('http://127.0.0.1:9200/health', {
        signal: AbortSignal.timeout(1000),
      })
      if (proxyRes.ok) {
        status.proxy = 'online'
      }
    } catch {
      status.proxy = 'offline'
    }

    // 3. Check RAG Server & ChromaDB (port 8000)
    try {
      const ragRes = await fetch('http://127.0.0.1:8000/health', {
        signal: AbortSignal.timeout(1000),
      })
      if (ragRes.ok) {
        const data = (await ragRes.json()) as { status?: string; db_path?: string }
        status.rag = 'online'
        // If RAG server is healthy and connected to database
        if (data.status === 'ok' && data.db_path) {
          status.chromadb = 'online'
        }
      }
    } catch {
      status.rag = 'offline'
      status.chromadb = 'offline'
    }

    // 4. Check Ollama (port 11434)
    try {
      const ollamaRes = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(1000),
      })
      if (ollamaRes.ok) {
        status.ollama = 'online'
      }
    } catch {
      status.ollama = 'offline'
    }

    return c.json(status)
  })
}
