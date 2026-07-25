export type UserRole = 'merchant' | 'admin'

export type AppUser = {
  id: string
  email: string
  role: UserRole
}

