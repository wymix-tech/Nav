import { apiJson } from './apiClient'
let epoch = 0,
  request: Promise<{ models: string[]; systemPrompt: string }> | undefined
export function resetChatMetadata() {
  epoch++
  request = undefined
}
export function getChatMetadata() {
  const ticket = epoch
  request ??= Promise.all([
    apiJson<{ models: string[] }>('/chat/models'),
    apiJson<{ systemPrompt: string }>('/chat/defaults'),
  ])
    .then(([models, defaults]) => {
      if (ticket !== epoch) throw new Error('登录状态已改变')
      return { models: models.models, systemPrompt: defaults.systemPrompt }
    })
    .catch((e) => {
      if (ticket === epoch) request = undefined
      throw e
    })
  return request
}
