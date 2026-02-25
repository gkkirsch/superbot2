import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
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
          "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full max-w-lg border-l border-border-custom bg-ink shadow-xl transition-transform duration-200 ease-out",
          visible ? "translate-x-0" : "translate-x-full"
        )}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

interface SheetHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SheetHeader({ className, ...props }: SheetHeaderProps) {
  return (
    <div
      className={cn("flex items-center justify-between px-5 py-4 border-b border-border-custom", className)}
      {...props}
    />
  )
}

interface SheetBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SheetBody({ className, ...props }: SheetBodyProps) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto px-5 py-4", className)}
      {...props}
    />
  )
}
