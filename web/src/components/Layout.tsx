import { Outlet } from 'react-router'
import TabBar from './TabBar'

export default function Layout() {
  return (
    <div className="layout">
      <div className="content">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}
