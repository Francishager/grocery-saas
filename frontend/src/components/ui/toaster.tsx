import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Children, cloneElement, isValidElement, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { NotificationIcon } from "@/components/NotificationIcon"
import { getNotificationVisual } from "@/lib/notificationVisuals"
import { sanitizeNotificationText } from "@/lib/notificationDisplay"
import { cn } from "@/lib/utils"

function cleanContent(content: ReactNode): ReactNode {
  return Children.map(content, child => {
    if (typeof child === 'string') return sanitizeNotificationText(child)
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return cloneElement(child, {}, cleanContent(child.props.children))
    }
    return child
  })
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={8000}>
      {toasts.map(function ({ id, title, description, action, variant, notificationType, ...props }) {
        const type = notificationType || (variant === 'destructive' ? 'error' : variant === 'success' ? 'success' : 'info')
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className={cn('mt-0.5 shrink-0 rounded-lg p-2', getNotificationVisual(type).color)}><NotificationIcon type={type} /></div>
            <div className="grid min-w-0 flex-1 gap-1">
              <p className="text-xs font-medium text-muted-foreground">JibuSales</p>
              {title && <ToastTitle>{cleanContent(title)}</ToastTitle>}
              {description && (
                <ToastDescription>{cleanContent(description)}</ToastDescription>
              )}
              {action && <div className="mt-2">{action}</div>}
            </div>
            <ToastClose />
          </Toast>
        )
      })}
      {createPortal(<ToastViewport />, document.body)}
    </ToastProvider>
  )
}
