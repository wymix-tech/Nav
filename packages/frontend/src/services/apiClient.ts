export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter = 0,
  ) {
    super(message)
  }
}
export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('nav_token')
  const res = await fetch(`/api${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(10000),
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const isJson = res.headers.get('Content-Type')?.includes('application/json')
  const body = isJson ? await res.json() : null
  if (res.status === 401 && token && path !== '/auth/login')
    window.dispatchEvent(new Event('nav-auth-invalid'))
  if (!res.ok || !isJson)
    throw new ApiError(
      res.status,
      body?.error?.message ?? '服务响应格式无效或请求失败',
      Number(res.headers.get('Retry-After') ?? 0),
    )
  return body as T
}
