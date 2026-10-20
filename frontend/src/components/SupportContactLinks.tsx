interface SupportContactLinksProps {
  message?: string
  compact?: boolean
  className?: string
}

export function SupportContactLinks({
  message = 'Hello JibuSales Support Team, I need help with my business account.',
  compact = false,
  className = '',
}: SupportContactLinksProps) {
  const whatsapp = `https://wa.me/256788216271?text=${encodeURIComponent(message)}`
  const email = `mailto:jibusales00@gmail.com?subject=${encodeURIComponent('JibuSales Support Request')}&body=${encodeURIComponent(message)}`
  const size = compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <a href={whatsapp} target="_blank" rel="noreferrer" className={`inline-flex items-center justify-center rounded-md bg-green-700 font-medium text-white hover:bg-green-800 ${size}`}>
        WhatsApp Support Team
      </a>
      <a href={email} className={`inline-flex items-center justify-center rounded-md border font-medium hover:bg-muted ${size}`}>
        Email Support Team
      </a>
    </div>
  )
}
