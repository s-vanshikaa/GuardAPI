import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { loginRequest } from '../features/auth/authApi'
import { useAuth } from '../features/auth/AuthContext'
import { AuthLayout } from '../components/AuthLayout'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { setSession } = useAuth()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => loginRequest(email, password),
    onSuccess: (data) => {
      setSession(data.token, data.user)
      navigate('/', { replace: true })
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    mutation.reset()
    mutation.mutate()
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Monitor your APIs and breaking changes."
      footer={
        <>
          Don't have an account? <Link to="/register">Create one</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {mutation.isError && <p role="alert" className="form-error">{mutation.error.message}</p>}
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
