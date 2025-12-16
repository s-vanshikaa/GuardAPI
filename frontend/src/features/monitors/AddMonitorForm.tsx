import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createMonitor } from './monitorsApi'
import { useAuth } from '../auth/AuthContext'
import { IconPlus } from '../../components/icons'
import './AddMonitorForm.css'

export function AddMonitorForm() {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [endpointUrl, setEndpointUrl] = useState('')
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createMonitor(token as string, { name, endpointUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] })
      setName('')
      setEndpointUrl('')
      setIsOpen(false)
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    mutation.reset()
    mutation.mutate()
  }

  if (!isOpen) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setIsOpen(true)}>
        <IconPlus />
        Add Monitor
      </button>
    )
  }

  return (
    <form className="card add-monitor-form" onSubmit={handleSubmit}>
      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="input"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Endpoint URL</span>
        <input
          className="input"
          type="url"
          required
          placeholder="https://api.example.com/health"
          value={endpointUrl}
          onChange={(event) => setEndpointUrl(event.target.value)}
        />
      </label>
      {mutation.isError && <p role="alert" className="form-error">{mutation.error.message}</p>}
      <div className="add-monitor-form__actions">
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Adding…' : 'Add'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setIsOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
