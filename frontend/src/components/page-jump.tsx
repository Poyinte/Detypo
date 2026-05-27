import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { CornerDownLeftIcon } from "lucide-react"
import { useI18n } from "@/i18n"

export function PageJump({
  current,
  total,
  onJump,
  triggerClassName,
  triggerLabel,
  side = "top",
  align = "center",
}: {
  current: number
  total: number
  onJump: (page: number) => void
  triggerClassName?: string
  triggerLabel?: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "center" | "start" | "end"
}) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("")

  const handleJump = () => {
    let n = parseInt(value, 10)
    if (isNaN(n) || n < 1) return
    if (n > total) n = total
    onJump(n)
    setOpen(false)
    setValue("")
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setValue("") }}>
      <PopoverTrigger asChild>
        <button className={triggerClassName}>
          {triggerLabel || t('pagination.page', { n: current })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" side={side} align={side === 'right' ? 'center' : align} sideOffset={8}>
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleJump() }}
            placeholder={t('pagination.jump_placeholder')}
            className="h-8 text-sm pr-8"
          />
          <button
            onClick={handleJump}
            className="absolute right-1 top-1/2 -translate-y-1/2 size-6 inline-flex items-center justify-center rounded hover:bg-accent transition-colors"
          >
            <CornerDownLeftIcon className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
