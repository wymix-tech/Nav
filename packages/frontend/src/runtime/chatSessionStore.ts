export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}
export interface ChatRecord {
  version: 1
  input: string
  messages: ChatMessage[]
  status: 'idle' | 'streaming' | 'interrupted'
  error: string
  scroll: number
}
export const chatSessionKey = (space: string, id: string) =>
  `nav_chat_v1:${encodeURIComponent(space)}:${encodeURIComponent(id)}`
function messages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length <= 64 &&
    value.every(
      (m) =>
        m &&
        ['user', 'assistant'].includes(m.role) &&
        typeof m.content === 'string' &&
        m.content.length <= 1048576 &&
        Number.isFinite(m.timestamp),
    )
  )
}
export function parseChatRecord(raw: string): ChatRecord {
  const v = JSON.parse(raw)
  if (
    v?.version !== 1 ||
    typeof v.input !== 'string' ||
    v.input.length > 16384 ||
    !messages(v.messages) ||
    !['idle', 'streaming', 'interrupted'].includes(v.status) ||
    typeof v.error !== 'string' ||
    !Number.isFinite(v.scroll) ||
    v.scroll < 0
  )
    throw new Error('本机会话格式无效或版本不受支持，原记录已保留')
  return {
    version: 1,
    input: v.input,
    messages: v.messages,
    status: v.status === 'streaming' ? 'interrupted' : v.status,
    error: v.status === 'streaming' ? '上次生成已中断，不会自动重发' : v.error,
    scroll: v.scroll,
  }
}
const legacyClaims = new WeakMap<Storage, Map<string, string>>()
export function claimLegacy(storage: Storage, id: string, space: string) {
  const key = chatSessionKey(space, id),
    claims = legacyClaims.get(storage) ?? new Map<string, string>()
  const current = claims.get(id) ?? storage.getItem(`nav_chat_bound:${encodeURIComponent(id)}`)
  if (current && current !== key) throw new Error('旧记录已绑定其他空间')
  claims.set(id, key)
  legacyClaims.set(storage, claims)
  storage.setItem(`nav_chat_bound:${encodeURIComponent(id)}`, key)
}
export function legacyChat(storage: Storage, id: string, space: string): ChatMessage[] | null {
  const key = chatSessionKey(space, id),
    bound =
      legacyClaims.get(storage)?.get(id) ??
      storage.getItem(`nav_chat_bound:${encodeURIComponent(id)}`)
  if (bound && (bound !== key || storage.getItem(key))) return null
  const raw = storage.getItem(`nav_chat_${id}`)
  if (!raw) return null
  const value = JSON.parse(raw)
  if (!messages(value)) throw new Error('旧会话记录格式无效，原记录已保留')
  // space is deliberately required at the binding call site; no automatic migration.
  if (!space) return null
  return value
}
