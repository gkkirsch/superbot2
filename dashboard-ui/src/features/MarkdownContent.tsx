import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  // Replace literal \n sequences (from JSON-escaped strings) with actual newlines
  const normalized = content.replace(/\\n/g, '\n')

  return (
    <div className={`markdown-compact ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalized}</ReactMarkdown>
    </div>
  )
}
