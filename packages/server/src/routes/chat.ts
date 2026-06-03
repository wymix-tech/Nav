import { Hono } from 'hono'

const chat = new Hono()

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  baseUrl?: string
  apiKey?: string
  model: string
  messages: ChatMessage[]
}

// 根据 BaseURL 自动判断协议类型
function detectProvider(baseUrl: string): 'openai' | 'anthropic' {
  const lower = baseUrl.toLowerCase()
  if (lower.includes('anthropic') || lower.includes('claude')) return 'anthropic'
  return 'openai'
}

// 流式转发 SSE（通用）
function streamResponse(reader: ReadableStreamDefaultReader<Uint8Array>): Response {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
      } catch (e) {
        controller.error(e)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// OpenAI 兼容协议
async function streamOpenAI(c: any, baseUrl: string, apiKey: string, req: ChatRequest) {
  const url = `${baseUrl}/v1/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: req.model || 'gpt-4o-mini',
      messages: req.messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    return c.json({ error: { code: 'API_ERROR', message: `API 错误: ${response.status}` } }, 502)
  }

  return streamResponse(response.body!.getReader())
}

// Anthropic 协议
async function streamAnthropic(c: any, baseUrl: string, apiKey: string, req: ChatRequest) {
  const systemMsg = req.messages.find((m) => m.role === 'system')
  const otherMessages = req.messages.filter((m) => m.role !== 'system')

  const body: Record<string, any> = {
    model: req.model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: otherMessages,
    stream: true,
  }
  if (systemMsg) {
    body.system = systemMsg.content
  }

  const url = `${baseUrl}/v1/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    return c.json({ error: { code: 'API_ERROR', message: `API 错误: ${response.status}` } }, 502)
  }

  return streamResponse(response.body!.getReader())
}

chat.post('/stream', async (c) => {
  try {
    const req: ChatRequest = await c.req.json()

    if (!req.messages || req.messages.length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: '消息不能为空' } }, 400)
    }

    const baseUrl = (req.baseUrl || process.env.NAV_AI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '')
    const apiKey = req.apiKey || process.env.NAV_AI_API_KEY

    if (!apiKey) {
      return c.json({ error: { code: 'NO_API_KEY', message: '未配置 API Key' } }, 400)
    }

    const provider = detectProvider(baseUrl)

    if (provider === 'anthropic') {
      return streamAnthropic(c, baseUrl, apiKey, req)
    } else {
      return streamOpenAI(c, baseUrl, apiKey, req)
    }
  } catch (e: any) {
    return c.json({ error: { code: 'INTERNAL_ERROR', message: e.message } }, 500)
  }
})

// 获取可用模型列表（从环境变量 NAV_AI_MODELS 读取，逗号分隔）
chat.get('/models', (c) => {
  const raw = process.env.NAV_AI_MODELS || 'gpt-4o-mini'
  const models = raw.split(',').map((m) => m.trim()).filter(Boolean)
  return c.json({ models })
})

// 获取默认系统提示词（从环境变量 NAV_AI_SYSTEM_PROMPT 读取）
chat.get('/defaults', (c) => {
  return c.json({
    systemPrompt: process.env.NAV_AI_SYSTEM_PROMPT || '',
  })
})

export default chat
