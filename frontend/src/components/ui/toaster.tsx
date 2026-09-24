import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, Info, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const Icon = variant === 'destructive' ? TriangleAlert : variant === 'success' ? CheckCircle2 : Info
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className={cn('mt-0.5 rounded-full p-1.5', variant === 'destructive' ? 'bg-red-500/15' : variant === 'success' ? 'bg-green-500/15' : 'bg-primary/10')}><Icon className="h-4 w-4" /></div>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
