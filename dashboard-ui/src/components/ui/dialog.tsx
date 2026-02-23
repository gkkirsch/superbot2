import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const [mounted, setMounted] = React.useState(false)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", handleEsc)
    return () => document.removeEventListener("keydown", handleEsc)
  }, [open, onOpenChange])

  if (!mounted) return null

  return createPortal(
    <>
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/60 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className={cn(
            "pointer-events-auto w-full max-w-md rounded-xl border border-border-custom bg-ink shadow-2xl transition-all duration-200",
            visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          )}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return (
    <div
      className={cn("px-5 py-4 border-b border-border-custom", className)}
      {...props}
    />
  )
}

interface DialogBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DialogBody({ className, ...props }: DialogBodyProps) {
  return (
    <div className={cn("px-5 py-4", className)} {...props} />
  )
}

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 px-5 py-3 border-t border-border-custom", className)}
      {...props}
    />
  )
}
