<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { apiJson } from '../services/apiClient'
import { readChatStream } from '../services/chatStream'
import { useAuthStore } from '../stores/authStore'
const props = defineProps<{
  config: Record<string, any>
  instanceId: string
  editing: boolean
  editable: boolean
}>()
const emit = defineEmits<{ 'update:config': [value: Record<string, any>] }>()
const auth = useAuthStore()
interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}
const baseUrl = ref(props.config.baseUrl ?? ''),
  apiKey = ref(''),
  model = ref(props.config.model ?? ''),
  systemPrompt = ref(props.config.systemPrompt ?? ''),
  showConfig = ref(false)
const messages = ref<Message[]>([]),
  input = ref(''),
  loading = ref(false),
  error = ref('')
const chatContainer = ref<HTMLElement | null>(null),
  inputRef = ref<HTMLTextAreaElement | null>(null)
function openConfig() {
  baseUrl.value = props.config.baseUrl ?? ''
  model.value = props.config.model || modelOptions.value[0] || ''
  systemPrompt.value = props.config.systemPrompt ?? ''
  showConfig.value = true
}
function cancelConfig() {
  baseUrl.value = props.config.baseUrl ?? ''
  model.value = props.config.model || modelOptions.value[0] || ''
  systemPrompt.value = props.config.systemPrompt ?? ''
  apiKey.value = ''
  showConfig.value = false
}
const storageKey = computed(() => `nav_chat_${props.instanceId}`)
let abortController: AbortController | null = null
const modelOptions = ref<string[]>([])
const providerLabel = computed(() => (/anthropic|claude/i.test(baseUrl.value) ? 'Claude' : 'AI'))
function saveMessages() {
  try {
    sessionStorage.setItem(storageKey.value, JSON.stringify(messages.value.slice(-64)))
  } catch {
    /* storage can be disabled */
  }
}
function loadMessages() {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey.value) ?? '[]')
    if (Array.isArray(value))
      messages.value = value
        .filter(
          (m) =>
            m &&
            ['user', 'assistant'].includes(m.role) &&
            typeof m.content === 'string' &&
            m.content.length <= 1048576,
        )
        .slice(-64)
  } catch {
    /* malformed session data is ignored */
  }
}
function newConversation() {
  abortController?.abort()
  messages.value = []
  saveMessages()
}
async function loadDefaults() {
  if (!props.editable) return
  try {
    const [models, defaults] = await Promise.all([
      apiJson<{ models: string[] }>('/chat/models'),
      apiJson<{ systemPrompt: string }>('/chat/defaults'),
    ])
    modelOptions.value = models.models
    if (!model.value) model.value = models.models[0] ?? ''
    if (!systemPrompt.value) systemPrompt.value = defaults.systemPrompt
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function scrollToBottom() {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
}
async function sendMessage() {
  const text = input.value.trim()
  if (!text || loading.value || !props.editable) return
  if (text.length > 16384) {
    error.value = '单条消息不能超过 16384 字符'
    return
  }
  error.value = ''
  loading.value = true
  messages.value.push({ role: 'user', content: text, timestamp: Date.now() })
  input.value = ''
  const apiMessages = [
    ...(systemPrompt.value ? [{ role: 'system', content: systemPrompt.value }] : []),
    ...messages.value
      .filter((m) => m.content)
      .slice(-60)
      .map((m) => ({ role: m.role, content: m.content })),
  ]
  messages.value.push({ role: 'assistant', content: '', timestamp: Date.now() })
  const assistant = messages.value[messages.value.length - 1]
  const controller = new AbortController()
  abortController = controller
  const timer = setTimeout(() => controller.abort(), 180000)
  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.getAuthHeaders() },
      signal: controller.signal,
      body: JSON.stringify({
        baseUrl: baseUrl.value || undefined,
        apiKey: apiKey.value || undefined,
        model: model.value || modelOptions.value[0],
        messages: apiMessages,
      }),
    })
    if (response.status === 401) window.dispatchEvent(new Event('nav-auth-invalid'))
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('Content-Type')?.includes('text/event-stream')
    ) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error?.message ?? `请求失败 (${response.status})`)
    }
    await readChatStream(response.body, (text) => {
      if (assistant.content.length + text.length > 1048576) {
        controller.abort()
        throw new Error('回复过长，已停止接收')
      }
      assistant.content += text
      void scrollToBottom()
    })
  } catch (e) {
    const message = (e as Error).name === 'AbortError' ? '已停止' : (e as Error).message
    error.value = message
    if (!assistant.content) assistant.content = message
  } finally {
    clearTimeout(timer)
    abortController = null
    loading.value = false
    saveMessages()
    void scrollToBottom()
  }
}
function stopGeneration() {
  abortController?.abort()
}
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void sendMessage()
  }
}
function saveConfig() {
  const config: Record<string, any> = {
    ...props.config,
    baseUrl: baseUrl.value,
    model: model.value,
    systemPrompt: systemPrompt.value,
  }
  delete config.apiKey
  emit('update:config', config)
  showConfig.value = false
}
function formatContent(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }), {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOW_DATA_ATTR: false,
  })
}
function openPreview(content: string) {
  const html = `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 回复预览</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:24px auto;padding:20px;overflow-wrap:anywhere}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #888;padding:8px}</style><body>${formatContent(content)}</body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
async function copyOriginal(content: string) {
  try {
    await navigator.clipboard.writeText(content)
  } catch {
    error.value = '复制失败，请手动选择文本'
  }
}
onMounted(() => {
  loadMessages()
  void loadDefaults()
})
onUnmounted(() => abortController?.abort())
watch(
  () => props.editable,
  (allowed) => {
    if (allowed) void loadDefaults()
    else {
      abortController?.abort()
      apiKey.value = ''
      showConfig.value = false
    }
  },
)
watch(
  () => props.editing,
  (val) => {
    if (!val) void nextTick(() => inputRef.value?.focus())
  },
)
</script>

<template>
  <div class="chat-widget">
    <!-- 配置表单 -->
    <template v-if="showConfig">
      <div class="cfg">
        <div class="cfg-field">
          <label class="cfg-lbl">Base URL（留空使用环境变量，默认 OpenAI）</label>
          <input
            v-model="baseUrl"
            type="text"
            placeholder="https://api.openai.com/v1"
            class="cfg-inp"
          />
        </div>
        <div class="cfg-field">
          <label class="cfg-lbl">本次会话 API Key（不保存，留空使用服务端配置）</label>
          <input v-model="apiKey" type="password" placeholder="sk-..." class="cfg-inp" />
        </div>
        <div class="cfg-field">
          <label class="cfg-lbl">模型（留空使用环境变量默认值）</label>
          <input
            v-model="model"
            type="text"
            class="cfg-inp"
            :list="`model-list-${instanceId}`"
            placeholder="从列表选择或手动输入"
          />
          <datalist :id="`model-list-${instanceId}`">
            <option v-for="m in modelOptions" :key="m" :value="m" />
          </datalist>
        </div>
        <div class="cfg-field">
          <label class="cfg-lbl">系统提示词（留空使用环境变量默认值）</label>
          <textarea
            v-model="systemPrompt"
            rows="3"
            class="cfg-textarea"
            placeholder="定义 AI 的性格、说话方式、原则等"
          ></textarea>
        </div>
        <div class="cfg-btns">
          <button class="cfg-btn no" @click="cancelConfig">取消</button>
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
            <button v-if="editable && !editing" class="tool-btn" title="配置" @click="openConfig">
              ⚙
            </button>
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
            <div
              v-else-if="loading && i === messages.length - 1 && msg.role === 'assistant'"
              class="msg-content typing"
            >
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
            <div v-else class="msg-content"></div>
            <div v-if="msg.role === 'assistant' && msg.content" class="msg-actions">
              <button class="action-btn" title="新窗口预览" @click="openPreview(msg.content)">
                ↗
              </button>
              <button class="action-btn" title="复制原文" @click="copyOriginal(msg.content)">
                ⎘
              </button>
            </div>
          </div>
        </div>

        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="!editable">登录后可使用 AI 聊天。</p>
        <div class="input-area">
          <textarea
            ref="inputRef"
            v-model="input"
            rows="1"
            class="input-box"
            placeholder="输入消息..."
            :disabled="loading || !editable"
            @keydown="handleKeydown"
          ></textarea>
          <button v-if="loading" class="send-btn stop" @click="stopGeneration" title="停止">
            ■
          </button>
          <button
            v-else
            class="send-btn"
            :disabled="!input.trim() || !editable"
            @click="sendMessage"
            title="发送"
          >
            ↑
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-widget {
  height: 100%;
  width: 100%;
}

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
  transition:
    color 0.2s,
    background 0.2s;
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

.msg-content :deep(h1) {
  font-size: 1.3em;
}
.msg-content :deep(h2) {
  font-size: 1.15em;
}
.msg-content :deep(h3) {
  font-size: 1.05em;
}

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

.dot:nth-child(2) {
  animation-delay: 0.2s;
}
.dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.3;
  }
  40% {
    opacity: 1;
  }
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
  transition:
    background 0.2s,
    opacity 0.2s;
  background: var(--accent);
  color: white;
}

.send-btn:hover {
  background: var(--accent-hover);
}
.send-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

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

.cfg-inp:focus {
  border-color: var(--accent);
}

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

.cfg-textarea:focus {
  border-color: var(--accent);
}

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

.cfg-btn.ok {
  background: var(--accent);
  color: white;
}
.cfg-btn.ok:hover {
  background: var(--accent-hover);
}
.cfg-btn.no {
  background: rgba(128, 128, 128, 0.15);
  color: var(--text-secondary);
}
.cfg-btn.no:hover {
  background: rgba(128, 128, 128, 0.25);
}
</style>
