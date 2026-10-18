/**
 * Shared domain types for the control_room app, mirroring the backend's
 * existing user/role shapes (see backend/app/models.py).
 */

export type Role = 'passenger' | 'driver' | 'dispatcher'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  phone?: string
  rating?: number
}
