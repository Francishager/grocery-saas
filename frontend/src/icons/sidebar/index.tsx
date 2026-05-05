// Sidebar icons index - exports all sidebar icons

export { SessionsIcon, SessionsIconProps } from './Sessions'
export { UserManagementIcon, UserManagementIconProps } from './UserManagement'
export { UserProfileIcon, UserProfileIconProps } from './UserProfile'

// Re-export with shorter names
export { SessionsIcon as Sessions } from './Sessions'
export { UserManagementIcon as UserManagement } from './UserManagement'
export { UserProfileIcon as UserProfile } from './UserProfile'

export default {
  Sessions: SessionsIcon,
  UserManagement: UserManagementIcon,
  UserProfile: UserProfileIcon,
}
