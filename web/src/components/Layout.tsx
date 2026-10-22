import { Outlet } from 'react-router'
import SyncBadge from './SyncBadge'
import TabBar from './TabBar'

export default function Layout() {
  return (
    <div className="layout">
      <div className="content">
        <SyncBadge />
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}
