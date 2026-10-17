// SSE messages can span TCP chunks, CRLF boundaries, and multiple data lines.
export async function readChatStream(
  stream: ReadableStream<Uint8Array>,
  append: (text: string) => void,
) {
  const reader = stream.getReader(),
    decoder = new TextDecoder()
  let buffer = '',
    data: string[] = []
  function dispatch() {
    const value = data.join('\n').trim()
    data = []
    if (!value || value === '[DONE]') return
    const event = JSON.parse(value)
    if (event.error || event.type === 'error') throw new Error('AI 服务返回错误')
    const text =
      event.choices?.[0]?.delta?.content ??
      (event.type === 'content_block_delta' ? event.delta?.text : undefined)
    if (typeof text === 'string') append(text)
  }
  function line(value: string) {
    const clean = value.replace(/\r$/, '')
    if (!clean) dispatch()
    else if (clean.startsWith('data:')) data.push(clean.slice(5).replace(/^ /, ''))
  }
  try {
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      if (buffer.length > 2097152) throw new Error('AI 响应数据过大')
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
      }
      if (chunk.done) {
        if (buffer) line(buffer)
        dispatch()
        break
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
