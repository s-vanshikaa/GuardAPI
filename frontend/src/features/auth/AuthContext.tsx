import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe } from './authApi'
import type { User } from '../../types/auth'

const TOKEN_STORAGE_KEY = 'guardapi_token'

interface AuthContextValue {
  token: string | null
  user: User | null
  isLoading: boolean
  setSession: (token: string, user: User) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY))
  const queryClient = useQueryClient()

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => fetchMe(token as string),
    enabled: token !== null,
    retry: false,
  })

  function setSession(newToken: string, user: User) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken)
    setToken(newToken)
    queryClient.setQueryData(['me'], { user })
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken(null)
    queryClient.removeQueries({ queryKey: ['me'] })
  }

  // An expired/invalid token never resolves to a user, so treat a failed
  // /auth/me the same as being logged out rather than a stale stuck state.
  const value: AuthContextValue = {
    token,
    user: !meQuery.isError ? (meQuery.data?.user ?? null) : null,
    isLoading: token !== null && meQuery.isPending,
    setSession,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- co-located hook for the context above
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
