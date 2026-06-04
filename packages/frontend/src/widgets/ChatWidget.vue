<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { marked } from 'marked'

// 配置 marked
marked.setOptions({
  gfm: true,
  breaks: true,
})

const props = defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// ====== 配置状态 ======
const baseUrl = ref(props.config.baseUrl ?? '')
const apiKey = ref(props.config.apiKey ?? '')
const model = ref(props.config.model ?? '')
const systemPrompt = ref(props.config.systemPrompt ?? '')
const showConfig = ref(false)

// ====== 聊天状态 ======
const messages = ref<Message[]>([])
const input = ref('')
const loading = ref(false)
const abortController = ref<AbortController | null>(null)
const chatContainer = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

// ====== 会话存储 ======
const storageKey = computed(() => `nav_chat_${props.config._instanceId ?? 'default'}`)

function saveMessages() {
  try {
    sessionStorage.setItem(storageKey.value, JSON.stringify(messages.value))
  } catch {}
}

function loadMessages() {
  try {
    const raw = sessionStorage.getItem(storageKey.value)
    if (raw) messages.value = JSON.parse(raw)
  } catch {}
}

function newConversation() {
  messages.value = []
  saveMessages()
}

// ====== 模型列表（通过后端环境变量 NAV_AI_MODELS 配置，逗号分隔） ======
const modelOptions = ref<string[]>([])
const providerLabel = computed(() => {
  const url = baseUrl.value.toLowerCase()
  if (url.includes('anthropic') || url.includes('claude')) return 'Claude'
  return 'GPT'
})

async function loadDefaults() {
  try {
    const [modelsRes, defaultsRes] = await Promise.all([
      fetch('/api/chat/models'),
      fetch('/api/chat/defaults'),
    ])
    if (modelsRes.ok) {
      const data = await modelsRes.json()
      modelOptions.value = data.models ?? []
      if (modelOptions.value.length > 0 && !model.value) {
        model.value = modelOptions.value[0]
      }
    }
    if (defaultsRes.ok) {
      const data = await defaultsRes.json()
      if (!systemPrompt.value && data.systemPrompt) {
        systemPrompt.value = data.systemPrompt
      }
    }
  } catch {}
}

// ====== 发送消息 ======
async function sendMessage() {
  const text = input.value.trim()
  if (!text || loading.value) return

  const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() }
  messages.value.push(userMsg)
  input.value = ''
  saveMessages()
  await nextTick()
  scrollToBottom()

  const apiMessages = [
    ...(systemPrompt.value ? [{ role: 'system' as const, content: systemPrompt.value }] : []),
    ...messages.value.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  loading.value = true
  const assistantMsg: Message = { role: 'assistant', content: '', timestamp: Date.now() }
  messages.value.push(assistantMsg)

  try {
    abortController.value = new AbortController()
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: baseUrl.value || undefined,
        apiKey: apiKey.value || undefined,
        model: model.value || modelOptions.value[0],
        messages: apiMessages,
      }),
      signal: abortController.value.signal,
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error?.message ?? `请求失败 (${res.status})`)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          if (parsed.choices?.[0]?.delta?.content) {
            assistantMsg.content += parsed.choices[0].delta.content
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            assistantMsg.content += parsed.delta.text
          }
        } catch {}
      }

      scrollToBottom()
    }

    saveMessages()
  } catch (e: any) {
    if (e.name === 'AbortError') {
      assistantMsg.content += '\n\n*[已停止]*'
    } else {
      assistantMsg.content = `⚠️ ${e.message}`
    }
  } finally {
    loading.value = false
    abortController.value = null
    saveMessages()
    await nextTick()
    scrollToBottom()
  }
}

function stopGeneration() {
  abortController.value?.abort()
}

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function saveConfig() {
  emit('update:config', {
    ...props.config,
    baseUrl: baseUrl.value,
    apiKey: apiKey.value,
    model: model.value,
    systemPrompt: systemPrompt.value,
  })
  showConfig.value = false
}

// ====== Markdown 渲染 ======
function formatContent(text: string): string {
  if (!text) return ''
  try {
    return marked.parse(text) as string
  } catch {
    return text.replace(/\n/g, '<br>')
  }
}

// ====== 新窗口预览 ======
function openPreview(content: string) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 回复预览</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #e0e0e0;
      background: #1a1a2e;
      padding: 20px;
      max-width: 900px;
      margin: 0 auto;
    }
    h1, h2, h3, h4, h5, h6 { margin: 16px 0 8px; color: #fff; }
    h1 { font-size: 1.8em; border-bottom: 1px solid #333; padding-bottom: 8px; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #333; padding-bottom: 6px; }
    h3 { font-size: 1.2em; }
    p { margin: 8px 0; }
    ul, ol { margin: 8px 0 8px 20px; }
    li { margin: 4px 0; }
    code {
      font-family: 'SF Mono', Monaco, monospace;
      background: rgba(255,255,255,0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    pre {
      background: rgba(0,0,0,0.3);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0;
    }
    pre code {
      background: none;
      padding: 0;
    }
    blockquote {
      border-left: 4px solid #667eea;
      padding-left: 16px;
      margin: 12px 0;
      color: #aaa;
    }
    a { color: #667eea; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table { border-collapse: collapse; margin: 12px 0; width: 100%; }
    th, td { border: 1px solid #333; padding: 8px 12px; text-align: left; }
    th { background: rgba(255,255,255,0.05); }
    hr { border: none; border-top: 1px solid #333; margin: 16px 0; }
    img { max-width: 100%; border-radius: 8px; }
  </style>
</head>
<body>
  ${marked.parse(content)}
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  // 10分钟后释放URL
  setTimeout(() => URL.revokeObjectURL(url), 600000)
}

// ====== 复制原文 ======
async function copyOriginal(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    // 简单的复制成功提示
    const msg = document.createElement('div')
    msg.textContent = '已复制'
    msg.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#667eea;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;z-index:9999;animation:fadeOut 2s forwards'
    document.body.appendChild(msg)
    setTimeout(() => msg.remove(), 2000)
  } catch (e) {
    console.error('复制失败:', e)
  }
}

// ====== 生命周期 ======
onMounted(() => {
  loadMessages()
  loadDefaults()
})

watch(() => props.editing, (val) => {
  if (!val) {
    nextTick(() => inputRef.value?.focus())
  }
})
</script>

<template>
  <div class="chat-widget">

    <!-- 配置表单 -->
    <template v-if="showConfig">
      <div class="cfg">
        <div class="cfg-field">
          <label class="cfg-lbl">Base URL（留空使用环境变量，默认 OpenAI）</label>
          <input v-model="baseUrl" type="text" placeholder="https://api.openai.com/v1" class="cfg-inp" />
        </div>
        <div class="cfg-field">
          <label class="cfg-lbl">API Key（留空使用环境变量）</label>
          <input v-model="apiKey" type="password" placeholder="sk-..." class="cfg-inp" />
        </div>
        <div class="cfg-field">
          <label class="cfg-lbl">模型（留空使用环境变量默认值）</label>
          <input v-model="model" type="text" class="cfg-inp" list="model-list" placeholder="从列表选择或手动输入" />
          <datalist id="model-list">
            <option v-for="m in modelOptions" :key="m" :value="m" />
          </datalist>
        </div>
        <div class="cfg-field">
          <label class="cfg-lbl">系统提示词（留空使用环境变量默认值）</label>
          <textarea v-model="systemPrompt" rows="3" class="cfg-textarea" placeholder="定义 AI 的性格、说话方式、原则等"></textarea>
        </div>
        <div class="cfg-btns">
          <button class="cfg-btn no" @click="showConfig = false">取消</button>
          <button class="cfg-btn ok" @click="saveConfig">保存</button>
        </div>
      </div>
    </template>

    <!-- 聊天面板 -->
    <template v-else>
      <div class="panel">
        <div class="toolbar">
          <div class="toolbar-left">
            <span class="provider-badge">{{ providerLabel }}</span>
            <span class="model-name">{{ model }}</span>
          </div>
          <div class="toolbar-right">
            <button class="tool-btn" title="新建对话" @click="newConversation">✦</button>
            <button v-if="editable && !editing" class="tool-btn" title="配置" @click="showConfig = true">⚙</button>
          </div>
        </div>

        <div ref="chatContainer" class="messages">
          <div v-if="messages.length === 0" class="empty">
            <div class="empty-icon">✦</div>
            <div class="empty-text">开始新的对话</div>
          </div>
          <div v-for="(msg, i) in messages" :key="i" class="message" :class="msg.role">
            <div class="msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
            <div v-if="msg.content" class="msg-content" v-html="formatContent(msg.content)"></div>
            <div v-else-if="loading && i === messages.length - 1 && msg.role === 'assistant'" class="msg-content typing">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
            <div v-else class="msg-content"></div>
            <div v-if="msg.role === 'assistant' && msg.content" class="msg-actions">
              <button class="action-btn" title="新窗口预览" @click="openPreview(msg.content)">↗</button>
              <button class="action-btn" title="复制原文" @click="copyOriginal(msg.content)">⎘</button>
            </div>
          </div>
        </div>

        <div class="input-area">
          <textarea
            ref="inputRef"
            v-model="input"
            rows="1"
            class="input-box"
            placeholder="输入消息..."
            :disabled="loading"
            @keydown="handleKeydown"
          ></textarea>
          <button v-if="loading" class="send-btn stop" @click="stopGeneration" title="停止">■</button>
          <button v-else class="send-btn" :disabled="!input.trim()" @click="sendMessage" title="发送">↑</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-widget { height: 100%; width: 100%; }

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.provider-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--accent);
  background: rgba(96, 165, 250, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
}

.model-name {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-right {
  display: flex;
  gap: 4px;
}

.tool-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  background: transparent;
  color: var(--text-muted);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.tool-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  opacity: 0.4;
}

.empty-icon {
  font-size: 28px;
  color: var(--accent);
}

.empty-text {
  font-size: 13px;
  color: var(--text-muted);
}

.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 90%;
}

.message.user {
  align-self: flex-end;
  align-items: flex-end;
}

.message.assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.msg-role {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 4px;
}

.msg-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  padding: 8px 12px;
  border-radius: 12px;
  word-break: break-word;
}

.message.user .msg-content {
  background: var(--accent);
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant .msg-content {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border);
  border-bottom-left-radius: 4px;
}

.msg-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0;
}

.message:hover .action-btn {
  opacity: 1;
}

.action-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--glass-border);
}

.msg-content :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 6px 0;
  font-size: 12px;
}

.msg-content :deep(code) {
  font-family: var(--font-mono);
  font-size: 12px;
  background: rgba(0, 0, 0, 0.2);
  padding: 1px 4px;
  border-radius: 3px;
}

.msg-content :deep(pre code) {
  background: none;
  padding: 0;
}

.msg-content :deep(p) {
  margin: 6px 0;
}

.msg-content :deep(ul),
.msg-content :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}

.msg-content :deep(li) {
  margin: 4px 0;
}

.msg-content :deep(blockquote) {
  border-left: 3px solid var(--accent);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-muted);
}

.msg-content :deep(a) {
  color: var(--accent);
  text-decoration: none;
}

.msg-content :deep(a:hover) {
  text-decoration: underline;
}

.msg-content :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
  font-size: 12px;
}

.msg-content :deep(th),
.msg-content :deep(td) {
  border: 1px solid var(--glass-border);
  padding: 6px 10px;
  text-align: left;
}

.msg-content :deep(th) {
  background: rgba(255, 255, 255, 0.04);
  font-weight: 600;
}

.msg-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--glass-border);
  margin: 12px 0;
}

.msg-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}

.msg-content :deep(h1),
.msg-content :deep(h2),
.msg-content :deep(h3),
.msg-content :deep(h4) {
  margin: 12px 0 6px;
  color: var(--text-primary);
}

.msg-content :deep(h1) { font-size: 1.3em; }
.msg-content :deep(h2) { font-size: 1.15em; }
.msg-content :deep(h3) { font-size: 1.05em; }

.typing {
  display: flex;
  gap: 4px;
  padding: 10px 14px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: blink 1.4s infinite both;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}

.input-area {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.input-box {
  flex: 1;
  resize: none;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--font-body);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.03);
  outline: none;
  max-height: 100px;
  line-height: 1.5;
  transition: border-color 0.2s;
}

.input-box:focus {
  border-color: var(--accent);
}

.input-box::placeholder {
  color: var(--text-muted);
}

.send-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s, opacity 0.2s;
  background: var(--accent);
  color: white;
}

.send-btn:hover { background: var(--accent-hover); }
.send-btn:disabled { opacity: 0.3; cursor: default; }

.send-btn.stop {
  background: var(--danger);
}

.send-btn.stop:hover {
  background: #dc2626;
}

.cfg {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow-y: auto;
}

.cfg-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cfg-lbl {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.cfg-inp {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  background: rgba(128, 128, 128, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 8px;
  outline: none;
}

.cfg-inp:focus { border-color: var(--accent); }

.cfg-textarea {
  font-size: 12px;
  font-family: var(--font-body);
  color: var(--text-primary);
  background: rgba(128, 128, 128, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 8px;
  outline: none;
  resize: vertical;
  line-height: 1.5;
}

.cfg-textarea:focus { border-color: var(--accent); }

.cfg-btns {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.cfg-btn {
  flex: 1;
  padding: 6px;
  font-size: 11px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.cfg-btn.ok { background: var(--accent); color: white; }
.cfg-btn.ok:hover { background: var(--accent-hover); }
.cfg-btn.no { background: rgba(128, 128, 128, 0.15); color: var(--text-secondary); }
.cfg-btn.no:hover { background: rgba(128, 128, 128, 0.25); }
</style>
