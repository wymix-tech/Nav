export interface AuthState {
  isAuthenticated: boolean
  token: string | null
}

export interface LoginResponse {
  token: string
  expiresIn: number
}
