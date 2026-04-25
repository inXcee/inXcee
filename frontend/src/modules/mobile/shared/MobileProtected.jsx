import { Navigate } from 'react-router-dom'
import { useMobileAuth } from '../auth/useMobileAuth.js'

export default function MobileProtected({ role, children }) {
  const { token, user } = useMobileAuth()
  if (!token) return <Navigate to="/mobile" replace />
  if (role && user?.role !== role) return <Navigate to="/mobile" replace />
  return children
}
