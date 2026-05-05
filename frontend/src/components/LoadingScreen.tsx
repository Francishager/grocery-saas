import React from 'react'
import { cn } from '@/lib/utils'
import { CustomLoader } from '@/components/ui/CustomLoader'

export interface LoadingScreenProps {
  /** Loading message */
  message?: string
  /** Whether to show progress */
  showProgress?: boolean
  /** Progress percentage */
  progress?: number
  /** Whether to center content */
  centered?: boolean
  /** Background color */
  backgroundColor?: string
  /** Additional className */
  className?: string
  /** Logo or icon */
  logo?: React.ReactNode
  /** Whether to show overlay */
  overlay?: boolean
  /** Loader size */
  loaderSize?: 'sm' | 'md' | 'lg' | 'xl'
  /** Custom loader component */
  loaderComponent?: React.ReactNode
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Loading...',
  showProgress = false,
  progress,
  centered = true,
  backgroundColor = 'bg-white',
  className,
  logo,
  overlay = false,
  loaderSize = 'lg',
  loaderComponent,
}) => {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-screen p-8',
        centered && 'items-center justify-center',
        backgroundColor,
        className
      )}
    >
      {logo && (
        <div className="mb-6">
          {logo}
        </div>
      )}

      {loaderComponent || (
        <CustomLoader size={loaderSize} text={message} />
      )}

      {showProgress && progress !== undefined && (
        <div className="w-64 mt-6">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )

  if (overlay) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4">
          {content}
        </div>
      </div>
    )
  }

  return content
}

export default LoadingScreen
