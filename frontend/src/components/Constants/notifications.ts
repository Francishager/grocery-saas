// Notification-related constants

export interface NotificationType {
  id: string
  name: string
  icon: string
  color: string
}

export interface NotificationPriority {
  id: string
  name: string
  color: string
}

// Notification types
export const notificationTypes: NotificationType[] = [
  { id: 'info', name: 'Information', icon: 'ℹ️', color: 'blue' },
  { id: 'success', name: 'Success', icon: '✅', color: 'green' },
  { id: 'warning', name: 'Warning', icon: '⚠️', color: 'yellow' },
  { id: 'error', name: 'Error', icon: '❌', color: 'red' },
  { id: 'sale', name: 'Sale', icon: '💰', color: 'green' },
  { id: 'purchase', name: 'Purchase', icon: '📦', color: 'blue' },
  { id: 'inventory', name: 'Inventory', icon: '📊', color: 'purple' },
  { id: 'payment', name: 'Payment', icon: '💳', color: 'green' },
  { id: 'user', name: 'User', icon: '👤', color: 'gray' },
  { id: 'system', name: 'System', icon: '⚙️', color: 'gray' },
]

// Notification priorities
export const notificationPriorities: NotificationPriority[] = [
  { id: 'low', name: 'Low', color: 'gray' },
  { id: 'medium', name: 'Medium', color: 'yellow' },
  { id: 'high', name: 'High', color: 'orange' },
  { id: 'urgent', name: 'Urgent', color: 'red' },
]

// Notification type options for select
export const notificationTypeOptions = notificationTypes.map((type) => ({
  value: type.id,
  label: `${type.icon} ${type.name}`,
}))

// Notification priority options for select
export const notificationPriorityOptions = notificationPriorities.map((priority) => ({
  value: priority.id,
  label: priority.name,
}))

// Notification categories
export const notificationCategories = [
  { value: 'all', label: 'All Notifications' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'starred', label: 'Starred' },
  { value: 'archived', label: 'Archived' },
]

// Notification actions
export const notificationActions = [
  { value: 'mark_read', label: 'Mark as Read' },
  { value: 'mark_unread', label: 'Mark as Unread' },
  { value: 'star', label: 'Star' },
  { value: 'unstar', label: 'Unstar' },
  { value: 'archive', label: 'Archive' },
  { value: 'delete', label: 'Delete' },
]

// Notification settings defaults
export const defaultNotificationSettings = {
  enableEmail: true,
  enablePush: true,
  enableSound: true,
  enableDesktop: false,
  digestEnabled: false,
  digestFrequency: 'daily', // daily, weekly, real-time
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
}

// Notification sound options
export const notificationSounds = [
  { value: 'default', label: 'Default' },
  { value: 'chime', label: 'Chime' },
  { value: 'bell', label: 'Bell' },
  { value: 'ping', label: 'Ping' },
  { value: 'none', label: 'None (Silent)' },
]

// Predefined notification templates
export const notificationTemplates = {
  sale_created: {
    type: 'sale',
    title: 'New Sale',
    message: 'A new sale has been created',
    priority: 'medium',
  },
  low_stock: {
    type: 'inventory',
    title: 'Low Stock Alert',
    message: 'Stock level is below threshold',
    priority: 'high',
  },
  payment_received: {
    type: 'payment',
    title: 'Payment Received',
    message: 'A payment has been received',
    priority: 'medium',
  },
  user_registered: {
    type: 'user',
    title: 'New User',
    message: 'A new user has registered',
    priority: 'low',
  },
  system_update: {
    type: 'system',
    title: 'System Update',
    message: 'System update available',
    priority: 'medium',
  },
}

// Get notification type by ID
export const getNotificationTypeById = (id: string): NotificationType | undefined => {
  return notificationTypes.find((type) => type.id === id)
}

// Get notification priority by ID
export const getNotificationPriorityById = (id: string): NotificationPriority | undefined => {
  return notificationPriorities.find((priority) => priority.id === id)
}

export default notificationTypes
