import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="font-heading text-2xl text-parchment mb-4 mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="font-heading text-xl text-parchment mb-3 mt-6">{children}</h2>,
        h3: ({ children }) => <h3 className="font-heading text-lg text-parchment mb-2 mt-4">{children}</h3>,
        h4: ({ children }) => <h4 className="font-heading text-base text-parchment mb-2 mt-3">{children}</h4>,
        p: ({ children }) => <p className="text-sm text-stone leading-relaxed mb-3">{children}</p>,
        ul: ({ children }) => <ul className="text-sm text-stone space-y-1 mb-3 ml-4 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="text-sm text-stone space-y-1 mb-3 ml-4 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-stone leading-relaxed">{children}</li>,
        code: ({ className, children }) => {
          const isBlock = className?.includes('language-')
          if (isBlock) {
            return (
              <pre className="bg-codebg rounded-md p-4 overflow-x-auto mb-3">
                <code className="text-xs font-mono text-parchment">{children}</code>
              </pre>
            )
          }
          return <code className="bg-codebg rounded px-1.5 py-0.5 text-xs font-mono text-sand">{children}</code>
        },
        pre: ({ children }) => <>{children}</>,
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="text-left px-3 py-2 text-parchment font-heading text-xs border-b border-border-custom">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-stone text-xs border-b border-border-custom">{children}</td>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-sand/40 pl-4 text-stone/80 italic mb-3">{children}</blockquote>,
        strong: ({ children }) => <strong className="text-parchment font-semibold">{children}</strong>,
        a: ({ href, children }) => <a href={href} className="text-sand hover:text-sand/80 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
        hr: () => <hr className="border-border-custom my-6" />,
        input: ({ checked, ...rest }) => (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="mr-1.5 accent-sand"
            {...rest}
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
