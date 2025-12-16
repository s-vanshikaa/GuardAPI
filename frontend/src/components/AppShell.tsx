import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { IconLogout, IconOverview, IconPulse } from './icons'
import './AppShell.css'

export function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-wordmark">
          <IconPulse />
          GuardAPI
        </div>

        <nav className="app-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `app-nav-item${isActive ? ' is-active' : ''}`}
          >
            <IconOverview />
            Overview
          </NavLink>
        </nav>

        <div className="app-sidebar-footer">
          <span className="app-user-email">{user?.email}</span>
          <button type="button" className="app-logout" onClick={logout} aria-label="Log out">
            <IconLogout />
          </button>
        </div>
      </aside>

      <div className="app-content">
        <div className="app-content-inner">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
