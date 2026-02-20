import * as React from "react"
import { cn } from "@/lib/utils"

const Collapsible = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { open?: boolean; onOpenChange?: (open: boolean) => void }>(
  ({ className, children, open: controlledOpen, onOpenChange, ...props }, ref) => {
    const [internalOpen, setInternalOpen] = React.useState(false)
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen
    const handleToggle = () => {
      const newOpen = !open
      setInternalOpen(newOpen)
      onOpenChange?.(newOpen)
    }
    return (
      <CollapsibleContext.Provider value={{ open, toggle: handleToggle }}>
        <div ref={ref} className={cn("", className)} {...props}>{children}</div>
      </CollapsibleContext.Provider>
    )
  }
)
Collapsible.displayName = "Collapsible"

const CollapsibleContext = React.createContext<{ open: boolean; toggle: () => void }>({ open: false, toggle: () => {} })

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => {
    const { toggle } = React.useContext(CollapsibleContext)
    return <button ref={ref} className={cn("", className)} onClick={toggle} {...props} />
  }
)
CollapsibleTrigger.displayName = "CollapsibleTrigger"

const CollapsibleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { open } = React.useContext(CollapsibleContext)
    if (!open) return null
    return <div ref={ref} className={cn("", className)} {...props} />
  }
)
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
