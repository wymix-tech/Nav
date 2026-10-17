import { Hono } from 'hono'
import { assert, record } from '@nav/shared'
import { authMiddleware } from '../middleware/auth.js'
import { RateLimiter, clientAddress } from '../security.js'
type Message = { role: 'system' | 'user' | 'assistant'; content: string }
type Fetcher = typeof fetch
export function createChatRoutes(fetcher: Fetcher = (...args) => fetch(...args)) {
  const chat = new Hono()
  const limiter = new RateLimiter(20, 60000)
  let active = 0
  chat.use('*', authMiddleware)
  chat.get('/models', (c) => c.json({ models: models() }))
  chat.get('/defaults', (c) => c.json({ systemPrompt: process.env.NAV_AI_SYSTEM_PROMPT ?? '' }))
  chat.post('/stream', async (c) => {
    if (!limiter.allow(clientAddress(c)) || active >= 4) {
      c.header('Retry-After', '60')
      return c.json({ error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } }, 429)
    }
    const body = await c.req.json()
    assert(
      record(body) &&
        Array.isArray(body.messages) &&
        body.messages.length > 0 &&
        body.messages.length <= 64,
      '需要 1–64 条消息',
    )
    let length = 0
    for (const m of body.messages) {
      assert(
        record(m) &&
          ['system', 'user', 'assistant'].includes(m.role) &&
          typeof m.content === 'string' &&
          m.content.length <= 16384,
        '消息格式或长度无效',
      )
      length += m.content.length
    }
    assert(length <= 65536, '消息总长度超限')
    const model = body.model || models()[0]
    assert(typeof model === 'string' && models().includes(model), '模型未在 NAV_AI_MODELS 中启用')
    const configured = new URL(process.env.NAV_AI_BASE_URL || 'https://api.openai.com/v1')
    let base: URL
    try {
      base = new URL(body.baseUrl || configured.href)
    } catch {
      assert(false, 'Base URL 格式无效')
    }
    const allowed = new Set([
      configured.origin,
      ...(process.env.NAV_AI_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ])
    assert(
      ['http:', 'https:'].includes(base.protocol) &&
        !base.username &&
        !base.password &&
        !base.search &&
        !base.hash &&
        allowed.has(base.origin),
      'Base URL 必须由服务端配置或属于允许的源',
    )
    assert(
      body.apiKey === undefined || (typeof body.apiKey === 'string' && body.apiKey.length <= 4096),
      'API Key 格式无效',
    )
    // Never forward the server credential to an alternate endpoint, including redirects.
    const sameEndpoint = base.href.replace(/\/+$/, '') === configured.href.replace(/\/+$/, '')
    const key = body.apiKey || (sameEndpoint ? process.env.NAV_AI_API_KEY : undefined)
    if (!key)
      return c.json(
        {
          error: {
            code: 'NO_API_KEY',
            message: '请在服务端配置 API Key；自定义端点需要本次会话的独立密钥',
          },
        },
        400,
      )
    const anthropic =
      (process.env.NAV_AI_PROVIDER ||
        (base.hostname.includes('anthropic') || base.hostname.includes('claude')
          ? 'anthropic'
          : 'openai')) === 'anthropic'
    const messages = body.messages as Message[]
    const system =
      messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n') ||
      process.env.NAV_AI_SYSTEM_PROMPT ||
      ''
    const payload = anthropic
      ? {
          model,
          max_tokens: 4096,
          messages: messages.filter((m) => m.role !== 'system'),
          ...(system ? { system } : {}),
          stream: true,
        }
      : {
          model,
          messages:
            system && !messages.some((m) => m.role === 'system')
              ? [{ role: 'system', content: system }, ...messages]
              : messages,
          stream: true,
        }
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 180000)
    const disconnect = () => abort.abort()
    c.req.raw.signal.addEventListener('abort', disconnect, { once: true })
    let freed = false
    const release = () => {
      if (freed) return
      freed = true
      clearTimeout(timer)
      c.req.raw.signal.removeEventListener('abort', disconnect)
      abort.signal.removeEventListener('abort', release)
      active--
    }
    active++
    abort.signal.addEventListener('abort', release, { once: true })
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const response = await fetcher(
        base.href.replace(/\/+$/, '') + (anthropic ? '/messages' : '/chat/completions'),
        {
          method: 'POST',
          redirect: 'error',
          signal: abort.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(anthropic
              ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
              : { Authorization: `Bearer ${key}` }),
          },
          body: JSON.stringify(payload),
        },
      )
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get('Content-Type')?.includes('text/event-stream')
      ) {
        abort.abort()
        release()
        return c.json(
          { error: { code: 'UPSTREAM_ERROR', message: 'AI 服务响应失败，请检查服务端配置' } },
          502,
        )
      }
      reader = response.body.getReader()
      let released = false
      const done = () => {
        if (!released) {
          released = true
          abort.abort()
          release()
        }
      }
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = await reader!.read()
            if (chunk.done) {
              done()
              controller.close()
            } else controller.enqueue(chunk.value)
          } catch {
            done()
            controller.error(new Error('AI 响应中断'))
          }
        },
        async cancel() {
          done()
          await reader!.cancel().catch(() => {})
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      })
    } catch {
      abort.abort()
      release()
      return c.json({ error: { code: 'UPSTREAM_ERROR', message: 'AI 服务连接失败或超时' } }, 502)
    }
  })
  return chat
}
function models() {
  return (process.env.NAV_AI_MODELS || 'gpt-4o-mini')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}
export default createChatRoutes()
