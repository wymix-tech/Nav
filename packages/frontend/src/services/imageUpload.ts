import { apiJson, ApiError } from './apiClient'

export async function uploadImage(file: File): Promise<{ url: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error('图片文件不能超过 5 MiB')
  if (!file.size) throw new Error('图片文件为空，请重新选择')
  const body = new FormData()
  body.append('file', file)
  try {
    const data = await apiJson<{ url: string }>('/upload', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(60000),
    })
    if (typeof data.url !== 'string' || !data.url.startsWith('/uploads/'))
      throw new Error('服务器未返回有效的图片地址，请稍后重试')
    return data
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) throw new Error('登录已失效，请重新登录后上传')
      if (error.status === 413 && error.message === '服务响应格式无效或请求失败')
        throw new Error('上传请求超过大小限制，请检查服务器或反向代理的上传限制')
      throw error
    }
    if (error instanceof TypeError) throw new Error('无法连接上传服务，请检查网络后重试')
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error('上传超时，请稍后重试')
    throw error
  }
}
