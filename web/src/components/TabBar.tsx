import { NavLink } from 'react-router'

const TABS = [
  { to: '/', label: 'Hoy' },
  { to: '/calendario', label: 'Calendario' },
  { to: '/progreso', label: 'Progreso' },
  { to: '/analisis', label: 'Análisis' },
]

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Secciones">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
