import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home,
  ShoppingCart,
  Package,
  Box,
  Folder,
  Warehouse,
  TrendingUp,
  FileText,
  DollarSign,
  Settings,
  Users,
  Plug,
  Calculator,
  BarChart,
  Shield,
  Building,
  CreditCard,
  Receipt,
  ChevronDown,
  ChevronRight,
  LucideIcon,
} from 'lucide-react'

export interface MenuItem {
  id: string
  label: string
  path?: string
  icon?: string
  badge?: string | number
  badgeColor?: 'primary' | 'success' | 'warning' | 'error' | 'info'
  children?: MenuItem[]
  permission?: string
  roles?: string[]
  external?: boolean
  disabled?: boolean
}

export interface MenuListProps {
  /** Menu items */
  items: MenuItem[]
  /** Whether menu is collapsed */
  collapsed?: boolean
  /** Callback when item is clicked */
  onItemClick?: (item: MenuItem) => void
  /** Additional className */
  className?: string
}

const iconMap: Record<string, LucideIcon> = {
  Home,
  ShoppingCart,
  Package,
  Box,
  Folder,
  Warehouse,
  TrendingUp,
  FileText,
  DollarSign,
  Settings,
  Users,
  Plug,
  Calculator,
  BarChart,
  Shield,
  Building,
  CreditCard,
  Receipt,
}

const badgeColorClasses = {
  primary: 'bg-primary text-white',
  success: 'bg-green-500 text-white',
  warning: 'bg-yellow-500 text-white',
  error: 'bg-red-500 text-white',
  info: 'bg-blue-500 text-white',
}

export const MenuList: React.FC<MenuListProps> = ({
  items,
  collapsed = false,
  onItemClick,
  className,
}) => {
  const location = useLocation()
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }

  const isActive = (item: MenuItem): boolean => {
    if (item.path === location.pathname) return true
    if (item.children) {
      return item.children.some((child) => child.path === location.pathname)
    }
    return false
  }

  const renderIcon = (iconName?: string) => {
    if (!iconName) return null
    const IconComponent = iconMap[iconName]
    if (!IconComponent) return null
    return <IconComponent className="h-5 w-5" />
  }

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedItems.has(item.id)
    const active = isActive(item)

    if (hasChildren) {
      return (
        <div key={item.id}>
          <button
            type="button"
            onClick={() => toggleExpand(item.id)}
            className={cn(
              'flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-gray-700 hover:bg-gray-100',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? item.label : undefined}
          >
            <div className="flex items-center gap-3">
              {renderIcon(item.icon)}
              {!collapsed && <span>{item.label}</span>}
            </div>
            {!collapsed && (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            )}
          </button>

          {isExpanded && !collapsed && (
            <div className="ml-4 mt-1 space-y-1">
              {item.children!.map((child) => renderMenuItem(child, level + 1))}
            </div>
          )}
        </div>
      )
    }

    return (
      <NavLink
        key={item.id}
        to={item.path || '#'}
        onClick={() => onItemClick?.(item)}
        target={item.external ? '_blank' : undefined}
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-gray-700 hover:bg-gray-100',
          item.disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          collapsed && 'justify-center px-2',
          level > 0 && 'text-gray-600'
        )}
        title={collapsed ? item.label : undefined}
      >
        {renderIcon(item.icon)}
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span
                className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  badgeColorClasses[item.badgeColor || 'primary']
                )}
              >
                {item.badge}
              </span>
            )}
          </>
        )}
      </NavLink>
    )
  }

  return (
    <nav className={cn('space-y-1 px-2', className)}>
      {items.map((item) => renderMenuItem(item))}
    </nav>
  )
}

export default MenuList
