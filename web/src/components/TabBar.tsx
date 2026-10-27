import { NavLink } from 'react-router'
import Icon, { type IconName } from './Icon'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Hoy', icon: 'flame' },
  { to: '/calendario', label: 'Calendario', icon: 'calendar' },
  { to: '/progreso', label: 'Progreso', icon: 'chart' },
  { to: '/analisis', label: 'Análisis', icon: 'sparkles' },
]

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Secciones">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'}>
          <Icon name={tab.icon} size={22} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
