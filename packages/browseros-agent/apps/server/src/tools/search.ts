/**
 * Web Search tool for BrowserOS Server.
 *
 * Uses keyless DuckDuckGo HTML scraping to quickly look up information on the web,
 * bypassing the need to perform slow Chromium-based page navigation for simple queries.
 */

import { z } from 'zod'
import { defineTool } from './framework'

export const search_web = defineTool({
  name: 'search_web',
  description:
    'Search the web using DuckDuckGo and return the top search result titles, URLs, and snippets. ' +
    'Use this to find online documentation, search public websites, or get up-to-date information.',
  approvalCategory: 'assistant',
  input: z.object({
    query: z
      .string()
      .min(3)
      .describe('The search query to look up on the web.'),
    n_results: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Number of search results to return (default 5, max 10).'),
  }),
  async handler(args, _ctx, response) {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`
      const res = await globalThis.fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
      if (!res.ok) {
        throw new Error(`DuckDuckGo responded with status ${res.status}`)
      }
      const html = await res.text()
      const blocks = html.split('<div class="result results_links results_links_deep web-result ">')
      const results: Array<{ title: string; url: string; snippet: string }> = []

      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i]
        const titleMatch = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block)
        if (!titleMatch) continue

        let link = titleMatch[1]
        if (link.includes('uddg=')) {
          try {
            const decodedUrl = decodeURIComponent(link.split('uddg=')[1].split('&')[0])
            link = decodedUrl
          } catch (e) {
            // Fallback
          }
        } else if (link.startsWith('//')) {
          link = `https:${link}`
        }

        const title = titleMatch[2].replace(/<[^>]*>/g, '').trim()
        const snippetMatch = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block)
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : ''

        results.push({ title, url: link, snippet })
      }

      const count = Math.min(results.length, args.n_results ?? 5)
      if (count === 0) {
        response.text('No search results found on the web for that query.')
        return
      }

      const formatted = results
        .slice(0, count)
        .map((r, idx) => `## [${idx + 1}] ${r.title}\nSource: ${r.url}\nSnippet: ${r.snippet}`)
        .join('\n\n---\n\n')

      response.text(formatted)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      response.error(`Web search failed: ${msg}`)
    }
  },
})
