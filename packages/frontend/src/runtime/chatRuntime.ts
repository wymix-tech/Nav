import { ref, shallowRef, watch } from 'vue'
import { readChatStream } from '../services/chatStream'
import {
  chatSessionKey,
  parseChatRecord,
  legacyChat,
  claimLegacy,
  type ChatMessage,
  type ChatRecord,
} from './chatSessionStore'
export interface ChatRequestConfig {
  baseUrl?: string
  model?: string
  systemPrompt?: string
}
export function createChatRuntime(
  space: string,
  id: string,
  options: {
    storage?: Storage
    restore?: boolean
    canStart?: () => boolean
    fetch?: typeof fetch
    headers: () => Record<string, string>
    invalidAuth: () => void
  },
) {
  const storage = options.storage,
    key = chatSessionKey(space, id)
  const input = ref(''),
    messages = shallowRef<ChatMessage[]>([]),
    loading = ref(false),
    error = ref(''),
    storageError = ref(''),
    scroll = ref(0),
    apiKey = ref(''),
    legacy = shallowRef<ChatMessage[] | null>(null)
  let raw: ChatMessage[] = [],
    disposed = false,
    serial = 0,
    visible = true,
    controller: AbortController | undefined,
    publishTimer: ReturnType<typeof setTimeout> | undefined,
    checkpointTimer: ReturnType<typeof setTimeout> | undefined,
    readable = true,
    accepted: ChatRequestConfig = {}
  if (!storage) storageError.value = '本机会话存储不可用，当前内容仅保留在内存中'
  function publish() {
    if (visible && !disposed) messages.value = raw.map((m) => ({ ...m }))
  }
  function checkpoint() {
    if (checkpointTimer) clearTimeout(checkpointTimer)
    checkpointTimer = undefined
    if (!storage || !readable) return
    if (input.value.length > 16384) {
      storageError.value = '草稿超过 16384 字符，当前内容仍在内存中'
      return
    }
    const row: ChatRecord = {
      version: 1,
      input: input.value,
      messages: raw,
      status: loading.value ? 'streaming' : 'idle',
      error: error.value,
      scroll: scroll.value,
    }
    try {
      storage.setItem(key, JSON.stringify(row))
      storageError.value = ''
    } catch {
      storageError.value = '本机会话未保存，当前内容仍在内存中'
    }
  }
  function scheduleCheckpoint() {
    if (!checkpointTimer) checkpointTimer = setTimeout(checkpoint, 250)
  }
  function changed() {
    scheduleCheckpoint()
    if (visible && !publishTimer)
      publishTimer = setTimeout(() => {
        publishTimer = undefined
        publish()
      }, 50)
  }
  try {
    const old = options.restore === false ? null : storage?.getItem(key)
    if (old) {
      const row = parseChatRecord(old)
      input.value = row.input
      raw = row.messages
      error.value = row.error
      scroll.value = row.scroll
      publish()
    } else if (storage) legacy.value = legacyChat(storage, id, space)
  } catch (e) {
    readable = false
    storageError.value = (e as Error).message
  }
  const unwatch = watch([input, scroll], scheduleCheckpoint, { flush: 'sync' })
  function stop(reason = '已停止') {
    serial++
    controller?.abort()
    controller = undefined
    if (loading.value) error.value = reason
    loading.value = false
    publish()
    checkpoint()
  }
  return {
    input,
    messages,
    loading,
    error,
    storageError,
    scroll,
    apiKey,
    legacy,
    updateConfig(config: ChatRequestConfig) {
      accepted = { ...config }
    },
    setVisible(value: boolean) {
      visible = value
      if (value) publish()
    },
    checkpoint,
    bindLegacy() {
      if (!storage || !legacy.value || !readable) return
      if (loading.value || raw.length) {
        storageError.value = '请先停止生成并新建空白会话，再绑定旧记录'
        return
      }
      // Re-check binding immediately before writing; a second space cannot claim it.
      try {
        const current = legacyChat(storage, id, space)
        if (!current) {
          legacy.value = null
          return
        }
        const row: ChatRecord = {
          version: 1,
          input: input.value,
          messages: current,
          status: 'idle',
          error: '',
          scroll: 0,
        }
        claimLegacy(storage, id, space)
        storage.setItem(key, JSON.stringify(row))
        raw = current
        publish()
        legacy.value = null
      } catch {
        storageError.value = '旧会话绑定未完成，原记录已保留'
      }
    },
    async send(allowed: boolean, defaults: ChatRequestConfig = {}) {
      const text = input.value.trim()
      if (disposed || loading.value || !allowed || !text) return
      if (options.canStart && !options.canStart()) {
        error.value = '运行状态已超过内存软预算，请先结束其他任务或保存会话'
        return
      }
      if (text.length > 16384) {
        error.value = '单条消息不能超过 16384 字符'
        return
      }
      if (raw.length + 2 > 64) {
        error.value = '会话已达 64 条，请先新建对话'
        return
      }
      const config = {
          ...defaults,
          ...Object.fromEntries(
            Object.entries(accepted).filter(([, v]) => v !== undefined && v !== ''),
          ),
        },
        temporaryKey = apiKey.value,
        request = ++serial
      error.value = ''
      loading.value = true
      raw.push({ role: 'user', content: text, timestamp: Date.now() })
      input.value = ''
      const apiMessages = [
        ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
        ...raw
          .filter((m) => m.content)
          .slice(-60)
          .map(({ role, content }) => ({ role, content })),
      ]
      const assistant: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() }
      raw.push(assistant)
      publish()
      checkpoint()
      const pending = new AbortController()
      controller = pending
      const timer = setTimeout(() => pending.abort(), 180000)
      const current = () => !disposed && serial === request
      try {
        const response = await (options.fetch ?? fetch)('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...options.headers() },
          signal: pending.signal,
          body: JSON.stringify({
            baseUrl: config.baseUrl || undefined,
            model: config.model || undefined,
            apiKey: temporaryKey || undefined,
            messages: apiMessages,
          }),
        })
        if (!current()) {
          await response.body?.cancel()
          return
        }
        if (response.status === 401) options.invalidAuth()
        if (
          !response.ok ||
          !response.body ||
          !response.headers.get('Content-Type')?.includes('text/event-stream')
        ) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.error?.message ?? `请求失败 (${response.status})`)
        }
        await readChatStream(response.body, (chunk) => {
          if (!current()) return
          if (assistant.content.length + chunk.length > 1048576) {
            pending.abort()
            throw new Error('回复过长，已停止接收')
          }
          assistant.content += chunk
          changed()
        })
      } catch (e) {
        if (current()) {
          error.value = (e as Error).name === 'AbortError' ? '已停止' : (e as Error).message
          if (!assistant.content) assistant.content = error.value
        }
      } finally {
        clearTimeout(timer)
        if (current()) {
          controller = undefined
          loading.value = false
          publish()
          checkpoint()
        }
      }
    },
    stop,
    newConversation() {
      stop()
      raw = []
      error.value = ''
      scroll.value = 0
      publish()
      checkpoint()
    },
    revoke() {
      stop('登录已失效，生成已结束')
      apiKey.value = ''
    },
    dispose(reason: string) {
      if (disposed) return
      stop(reason)
      disposed = true
      apiKey.value = ''
      unwatch()
      if (publishTimer) clearTimeout(publishTimer)
      if (checkpointTimer) clearTimeout(checkpointTimer)
    },
    estimatedBytes() {
      return (input.value.length + raw.reduce((n, m) => n + m.content.length, 0)) * 2
    },
  }
}
export type ChatRuntime = ReturnType<typeof createChatRuntime>
