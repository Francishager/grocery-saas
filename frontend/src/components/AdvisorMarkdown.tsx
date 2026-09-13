import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function AdvisorMarkdown({ children }: { children: string }) {
  return <div className="min-w-0 space-y-3 break-words text-sm leading-6 [overflow-wrap:anywhere] [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_strong]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={url => /^https:\/\//i.test(url) ? url : ''}
      components={{ img: () => null,
        a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2">{children}</a> : <span>{children}</span>,
        table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_td]:border [&_td]:p-2">{children}</table></div>,
      }}>{children}</ReactMarkdown>
  </div>
}
