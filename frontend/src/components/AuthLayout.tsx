import type { ReactNode } from 'react'
import { IconPulse } from './icons'
import './AuthLayout.css'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-wordmark">
          <IconPulse />
          GuardAPI
        </div>
        <div className="card auth-panel">
          <div className="auth-panel-heading">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
        <p className="auth-footer">{footer}</p>
      </div>
    </div>
  )
}
