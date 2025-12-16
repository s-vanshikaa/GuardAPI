import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { registerRequest } from '../features/auth/authApi'
import { useAuth } from '../features/auth/AuthContext'
import { AuthLayout } from '../components/AuthLayout'

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { setSession } = useAuth()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => registerRequest(email, password),
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
      title="Create your account"
      subtitle="Start monitoring your APIs in minutes."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
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
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
