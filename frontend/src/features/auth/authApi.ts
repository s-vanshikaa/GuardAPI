import { apiRequest } from '../../services/apiClient'
import type { AuthResponse, User } from '../../types/auth'

export function registerRequest(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: { email, password } })
}

export function loginRequest(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } })
}

export function fetchMe(token: string): Promise<{ user: User }> {
  return apiRequest<{ user: User }>('/auth/me', { token })
}
