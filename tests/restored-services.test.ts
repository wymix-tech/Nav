import test from 'node:test'
import assert from 'node:assert/strict'
import { ValidationError } from '../packages/shared/dist/index.js'
import { readChatStream } from '../packages/frontend/src/services/chatStream.ts'
import { createDockerMonitor } from '../packages/server/src/dockerMonitor.ts'
process.env.NAV_JWT_SECRET = 'restored-test-secret'
process.env.NAV_PASSWORD = 'restored-test-password'
process.env.NAV_AI_BASE_URL = 'https://ai.example.test/v1'
process.env.NAV_AI_API_KEY = 'synthetic-server-key'
process.env.NAV_AI_MODELS = 'test-model'
const { createChatRoutes } = await import('../packages/server/src/routes/chat.ts')
const { generateToken } = await import('../packages/server/src/middleware/auth.ts')
const auth = { Authorization: 'Bearer ' + generateToken(), 'Content-Type': 'application/json' }
const request = { model: 'test-model', messages: [{ role: 'user', content: 'hello' }] }
function app(fetcher: typeof fetch) {
  const root = createChatRoutes(fetcher)
  root.onError((e, c) => c.json({ error: e.message }, e instanceof ValidationError ? 400 : 500))
  return root
}
test('chat requires authentication, validates upstream and never leaks the server credential to custom endpoints', async () => {
  let calls = 0
  const root = app(async (_url, opts) => {
    calls++
    assert.equal(opts?.redirect, 'error')
    return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  })
  assert.equal((await root.request('/models')).status, 401)
  assert.equal((await root.request('/models', { headers: auth })).status, 200)
  for (const bad of [
    { ...request, baseUrl: 'http://169.254.169.254/' },
    { ...request, baseUrl: 'not a url' },
    { ...request, model: 'unapproved' },
    { ...request, messages: [{ role: 'tool', content: 'x' }] },
  ])
    assert.equal(
      (
        await root.request('/stream', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify(bad),
        })
      ).status,
      400,
    )
  process.env.NAV_AI_ALLOWED_ORIGINS = 'https://other.example.test'
  const alt = await root.request('/stream', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ ...request, baseUrl: 'https://other.example.test/v1' }),
  })
  assert.equal(alt.status, 400)
  assert.equal(calls, 0)
  const response = await root.request('/stream', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(request),
  })
  assert.equal(response.status, 200)
  await response.text()
  assert.equal(calls, 1)
})
test('SSE handles fragmented UTF-8, CRLF, trailing events and both providers', async () => {
  const bytes = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata:{"type":"content_block_delta","delta":{"text":"世界"}}\n\ndata: [DONE]',
  )
  let result = ''
  await readChatStream(
    new ReadableStream({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]))
        c.close()
      },
    }),
    (text) => {
      result += text
    },
  )
  assert.equal(result, '你好世界')
})
test('cancelling a chat response releases the upstream and concurrency slot', async () => {
  const signals: AbortSignal[] = []
  const root = app(async (_url, opts) => {
    signals.push(opts!.signal!)
    return new Response(new ReadableStream({ pull() {} }), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  })
  const responses = []
  for (let i = 0; i < 4; i++)
    responses.push(
      await root.request('/stream', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(request),
      }),
    )
  assert.equal(
    (
      await root.request('/stream', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(request),
      })
    ).status,
    429,
  )
  await responses[0].body!.cancel()
  assert.equal(signals[0].aborted, true)
  const next = await root.request('/stream', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(request),
  })
  assert.equal(next.status, 200)
  await Promise.all([...responses.slice(1), next].map((r) => r.body!.cancel()))
})
test('Docker sampling is asynchronous, shared, cached and passes only argument arrays', async () => {
  const commands: string[][] = []
  const sample = createDockerMonitor(async (args) => {
    commands.push(args)
    return JSON.stringify(
      args[0] === 'ps'
        ? { ID: 'abcdef123456', Names: 'nav', Image: 'nav:latest', State: 'running', Status: 'Up' }
        : {
            ID: 'abcdef123456',
            Name: 'nav',
            CPUPerc: '1.2%',
            MemUsage: '30MiB / 1GiB',
            MemPerc: '3%',
            NetIO: '1kB / 2kB',
            BlockIO: '0B / 0B',
            PIDs: '3',
          },
    )
  })
  const [one, two] = await Promise.all([sample(), sample()])
  assert.deepEqual(one, two)
  assert.equal(commands.length, 2)
  assert.equal(one.containers[0].cpuPercent, 1.2)
  await sample()
  assert.equal(commands.length, 2)
  assert.equal(commands[1].at(-1), 'abcdef123456')
  const unavailable = createDockerMonitor(async () => {
    throw new Error('permission denied')
  })
  assert.equal((await unavailable()).available, false)
})
test('Anthropic proxy preserves system messages and appends only the messages endpoint', async () => {
  const previous = process.env.NAV_AI_PROVIDER
  process.env.NAV_AI_PROVIDER = 'anthropic'
  try {
    const root = app(async (url, opts) => {
      assert.equal(url, 'https://ai.example.test/v1/messages')
      assert.equal((opts!.headers as Record<string, string>)['x-api-key'], 'synthetic-server-key')
      const payload = JSON.parse(opts!.body as string)
      assert.equal(payload.system, 'Be helpful')
      assert.deepEqual(payload.messages, [{ role: 'user', content: 'hello' }])
      return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    })
    const response = await root.request('/stream', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        ...request,
        messages: [{ role: 'system', content: 'Be helpful' }, ...request.messages],
      }),
    })
    assert.equal(response.status, 200)
    await response.text()
  } finally {
    if (previous === undefined) delete process.env.NAV_AI_PROVIDER
    else process.env.NAV_AI_PROVIDER = previous
  }
})
test('release checks use the fixed CNB endpoint, configured credential and a shared cache', async () => {
  const original = globalThis.fetch
  process.env.NAV_CNB_TOKEN = 'synthetic-cnb-key'
  delete process.env.NAV_RELEASE_SOURCE
  let calls = 0
  globalThis.fetch = async (url, opts) => {
    calls++
    assert.equal(url, 'https://api.cnb.cool/wymix.top/nav/-/releases/latest')
    assert.equal(
      (opts!.headers as Record<string, string>).Authorization,
      'Bearer synthetic-cnb-key',
    )
    assert.equal(opts!.redirect, 'error')
    return Response.json({ tag_name: 'v1.6.0', body: 'release notes' })
  }
  try {
    const { default: version } = await import('../packages/server/src/routes/version.ts')
    const root = version
    const one = await root.request('/latest-release'),
      two = await root.request('/latest-release')
    assert.equal(one.status, 200)
    assert.deepEqual(await one.json(), await two.json())
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = original
    delete process.env.NAV_CNB_TOKEN
  }
})
