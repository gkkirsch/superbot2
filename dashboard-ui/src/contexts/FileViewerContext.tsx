import { createContext, useContext, useState, useCallback } from 'react'
import { FileViewer } from '@/features/KnowledgeFileViewer'

interface FileViewerState {
  source: string
  filename: string
  isUser?: boolean
  filePath?: string
}

interface FileViewerContextValue {
  openFile: (opts: FileViewerState) => void
}

const FileViewerContext = createContext<FileViewerContextValue | null>(null)

export function useFileViewer() {
  const ctx = useContext(FileViewerContext)
  if (!ctx) throw new Error('useFileViewer must be used within FileViewerProvider')
  return ctx
}

export function FileViewerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<FileViewerState | null>(null)

  const openFile = useCallback((opts: FileViewerState) => {
    setFile(opts)
    setOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    setFile(null)
  }, [])

  return (
    <FileViewerContext.Provider value={{ openFile }}>
      {children}
      {file && (
        <FileViewer
          open={open}
          onClose={handleClose}
          source={file.source}
          filename={file.filename}
          isUser={file.isUser}
          filePath={file.filePath}
        />
      )}
    </FileViewerContext.Provider>
  )
}
