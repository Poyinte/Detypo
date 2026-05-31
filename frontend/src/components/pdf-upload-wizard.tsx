import { useState, useEffect, useRef } from 'react'
import { Field, FieldDescription } from '@/components/ui/field'
import { RangeSlider } from '@/components/range-slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty, EmptyContent, EmptyDescription, EmptyHeader,
  EmptyMedia, EmptyTitle,
} from '@/components/ui/empty'
import { FileUp as FileUpIcon, FileSearchCorner as FileSearchCornerIcon, PlayIcon, XIcon, ChevronDownIcon, CheckIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n'

const API = ''  // relative URLs — Vite proxies /api in dev, same-origin in prod

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function getBatchSize(n: number) {
  if (n <= 50) return 1
  if (n <= 300) return 5
  if (n <= 800) return 3
  return 1
}

function mode(arr: number[]): number {
  const freq = new Map<number, number>()
  for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1)
  let best = 0, bestVal = arr[0]
  for (const [v, c] of freq) if (c > best) { best = c; bestVal = v }
  return bestVal
}

// Official DeepSeek v4-flash pricing per 1M tokens (CNY)
const INPUT_MISS = 1.0   // ¥1.0 per 1M input tokens (cache miss)
const INPUT_HIT  = 0.02  // ¥0.02 per 1M input tokens (cache hit)
const OUTPUT     = 2.0   // ¥2.0 per 1M output tokens

export interface TokenOverhead {
  sys: number       // system prompt tokens (real count from tokenizer)
  per_page: number  // ID markers per page (estimate)
  per_batch: number // instruction + context headers per batch (real count from tokenizer)
  boundary_tokens?: { head: number; tail: number }[]  // per-page boundary sentence tokens
}

function estimateTokens(
  pageTokenCounts: number[], start: number, end: number,
  overhead?: TokenOverhead,
): { tokens: number; cost: number } {
  const selected = pageTokenCounts.slice(start - 1, end)
  if (!selected.length) return { tokens: 0, cost: 0 }
  const batchSize = getBatchSize(selected.length)
  const numBatches = Math.ceil(selected.length / batchSize)

  // Find mode page count per batch
  const batchPageCounts: number[] = []
  for (let i = 0; i < selected.length; i += batchSize) {
    batchPageCounts.push(Math.min(batchSize, selected.length - i))
  }
  const modePages = mode(batchPageCounts)
  if (!modePages) return { tokens: 0, cost: 0 }

  // Use average of all pages in range (upper bound: includes high-text + low-text pages)
  const totalTextTokens = selected.reduce((s, t) => s + t, 0)
  const avgTokenPerSamplePage = totalTextTokens / selected.length

  // Adaptive reply ratio: upper-bound estimate
  const REPLY_RATIO = Math.max(0.35, Math.min(0.75, 0.2 + avgTokenPerSamplePage * 0.0006))
  const MIN_REPLY = 30

  // Use real tokenizer counts when available, fall back to estimates
  const SYS = overhead?.sys ?? 5200
  const PER_PAGE = overhead?.per_page ?? 300
  const PER_BATCH = overhead?.per_batch ?? 165

  // Compute actual context text tokens from boundary sentence counts
  let avgContextTextPerBatch = 0
  const bt = overhead?.boundary_tokens
  const totalPages = pageTokenCounts.length
  if (bt && bt.length === totalPages && numBatches > 1) {
    let totalCtx = 0
    for (let bi = 0; bi < numBatches; bi++) {
      const batchStart = start - 1 + bi * batchSize
      const batchEnd = Math.min(batchStart + batchSize, end) - 1
      // Prefix: tail of page just before this batch
      if (batchStart > 0 && bt[batchStart - 1]) totalCtx += bt[batchStart - 1].tail
      // Suffix: head of page just after this batch
      if (batchEnd + 1 < totalPages && bt[batchEnd + 1]) totalCtx += bt[batchEnd + 1].head
    }
    avgContextTextPerBatch = totalCtx / numBatches
  }

  const perBatchText = avgTokenPerSamplePage * modePages
  const perBatchInput = perBatchText + modePages * PER_PAGE + PER_BATCH + avgContextTextPerBatch + SYS
  const replyTokens = Math.max(MIN_REPLY, Math.round(perBatchInput * REPLY_RATIO))
  const perBatchTotal = perBatchInput + replyTokens

  // Token estimate (all batches, full count)
  const totalTokens = numBatches * perBatchTotal

  // Cost estimate (CNY): 70% cache hit for system prompt
  const sysPerBatch = SYS * (0.3 * INPUT_MISS + 0.7 * INPUT_HIT)
  const textPerBatch = (perBatchText + modePages * PER_PAGE + PER_BATCH + avgContextTextPerBatch) * INPUT_MISS
  const outPerBatch = replyTokens * OUTPUT
  const totalCost = numBatches * (sysPerBatch + textPerBatch + outPerBatch) / 1_000_000

  return { tokens: totalTokens, cost: totalCost }
}

interface PdfUploadWizardProps {
  pageCount: number
  fileId: string
  filename: string
  pageTokenCounts: number[]
  overhead?: TokenOverhead
  availableLangs: Record<string, string>
  proofLang: string
  onSetProofLang: (lang: string) => void
  onStart: (range: [number, number]) => void
  onUpload: (file?: File) => void
  onClose: () => void
}

export function PdfUploadWizard({
  pageCount, fileId, filename, pageTokenCounts, overhead,
  availableLangs, proofLang, onSetProofLang,
  onStart, onUpload, onClose,
}: PdfUploadWizardProps) {
  const { t } = useI18n()
  const [dragOver, setDragOver] = useState(false)
  const [range, setRange] = useState<[number, number]>([1, pageCount])
  const [leftInput, setLeftInput] = useState('1')
  const [rightInput, setRightInput] = useState(String(pageCount))
  const [estimates, setEstimates] = useState({ tokens: 0, cost: 0 })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Synchronize range when pageCount changes (new PDF loaded)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setRange([1, pageCount])
    setLeftInput('1')
    setRightInput(String(pageCount))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pageCount])

  // Debounced estimate: recalculate 400ms after user stops adjusting
  // Also compute immediately on first load (no debounce)
  const prevRangeRef = useRef('')
  const rangeStart = range[0]
  const rangeEnd = range[1]
  useEffect(() => {
    if (!pageTokenCounts.length) return
    const key = `${rangeStart}-${rangeEnd}`
    const immediate = prevRangeRef.current === '' // first load
    prevRangeRef.current = key
    clearTimeout(debounceRef.current)
    if (immediate) {
      setEstimates(estimateTokens(pageTokenCounts, rangeStart, rangeEnd, overhead))
      return
    }
    debounceRef.current = setTimeout(() => {
      setEstimates(estimateTokens(pageTokenCounts, rangeStart, rangeEnd, overhead))
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [rangeStart, rangeEnd, pageTokenCounts, overhead])

  const selectedPages = range[1] - range[0] + 1

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

  const commitLeft = () => {
    const n = clamp(parseInt(leftInput) || 1, 1, range[1])
    setRange([n, range[1]])
    setLeftInput(String(n))
  }
  const commitRight = () => {
    const n = clamp(parseInt(rightInput) || pageCount, range[0], pageCount)
    setRange([range[0], n])
    setRightInput(String(n))
  }

  // Debounced preview images with caching and abort
  const [leftPreview, setLeftPreview] = useState('')
  const [rightPreview, setRightPreview] = useState('')
  const cacheRef = useRef<Map<string, string>>(new Map())
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!fileId) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const timer = setTimeout(() => {
      const pages = [range[0], range[1]]
      pages.forEach((p) => {
        const key = `${fileId}-${p}`
        if (cacheRef.current.has(key)) {
          if (p === range[0]) setLeftPreview(cacheRef.current.get(key)!)
          if (p === range[1]) setRightPreview(cacheRef.current.get(key)!)
          return
        }
        const url = `${API}/api/pdf/${fileId}/page/${p - 1}`
        fetch(url, { signal: ac.signal })
          .then(r => r.blob())
          .then(blob => {
            const dataUrl = URL.createObjectURL(blob)
            cacheRef.current.set(key, dataUrl)
            if (p === range[0]) setLeftPreview(dataUrl)
            if (p === range[1]) setRightPreview(dataUrl)
          })
          .catch((err: Error) => {
            if (err.name !== 'AbortError') console.error(err)
          })
      })
    }, 300)

    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, rangeStart, rangeEnd])

  const emptyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = emptyRef.current
    if (!el) return
    el.ondragover = (e: DragEvent) => { e.preventDefault(); setDragOver(true) }
    el.ondragleave = () => setDragOver(false)
    el.ondrop = (e: DragEvent) => {
      e.preventDefault(); setDragOver(false)
      const file = e.dataTransfer?.files?.[0]
      if (file && file.name.endsWith('.pdf')) { onUpload(file) }
      else if (file) { toast.error(t('wizard.only_pdf')) }
    }
    return () => {
      el.ondragover = null
      el.ondragleave = null
      el.ondrop = null
    }
  }, [onUpload, t])

  const [closing, setClosing] = useState(false)

  if (!fileId) {
    return (
      <div
        ref={emptyRef}
        className={`animate-fade-in-up-scale relative border-2 border-dashed rounded-xl max-w-sm mx-auto my-auto p-6 flex-none transition-[border-color,background-color] duration-300 ${dragOver ? 'border-primary bg-primary/5' : ''}`}
      >
        <Empty className="border-0 p-0">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileUpIcon /></EmptyMedia>
            <EmptyTitle>{t('wizard.drop_title')}</EmptyTitle>
            <EmptyDescription>
              {t('wizard.drop_hint')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => onUpload()}>
              <FileSearchCornerIcon className="size-3.5" />
              {t('wizard.pick_file')}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => onClose(), 200)
  }

  return (
    <div className={`flex-1 flex items-center justify-center p-4 ${closing ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
      <div className="relative w-full max-w-xl">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <XIcon className="size-4" />
        </button>
        <Field className="w-full rounded-xl border bg-card p-5 shadow-sm gap-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-base font-semibold">{t('wizard.range_title')}</span>
            <FieldDescription className="mt-0.5">
              {t('wizard.file_info', { filename, pages: pageCount })}
            </FieldDescription>
          </div>
          {Object.keys(availableLangs).length > 1 && (() => {
            const effective = proofLang
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5">
                    {availableLangs[effective] || effective}
                    <ChevronDownIcon className="size-3" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  {Object.entries(availableLangs).map(([code, name]) => (
                    <DropdownMenuItem
                      key={code}
                      onClick={() => onSetProofLang(code)}
                      className="flex items-center justify-between"
                    >
                      {name}
                      {effective === code && <CheckIcon className="size-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          })()}
        </div>

        {/* Page previews */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/10 p-2">
            <span className="text-[10px] text-muted-foreground">{t('wizard.start_page', { page: range[0] })}</span>
            <div className="w-full aspect-[3/4] bg-muted rounded overflow-hidden">
              {leftPreview && (
                <img src={leftPreview} alt={`Page ${range[0]}`} className="w-full h-full object-contain" />
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/10 p-2">
            <span className="text-[10px] text-muted-foreground">{t('wizard.end_page', { page: range[1] })}</span>
            <div className="w-full aspect-[3/4] bg-muted rounded overflow-hidden">
              {rightPreview && (
                <img src={rightPreview} alt={`Page ${range[1]}`} className="w-full h-full object-contain" />
              )}
            </div>
          </div>
        </div>

        {/* Range slider with inputs */}
        <div className="flex items-center gap-3">
          <Input
            value={leftInput}
            onChange={(e) => setLeftInput(e.target.value)}
            onBlur={commitLeft}
            onKeyDown={(e) => { if (e.key === 'Enter') commitLeft() }}
            className="w-16 h-8 text-center text-sm"
          />
          <RangeSlider
            min={1}
            max={pageCount}
            value={range}
            onValueChange={(v) => {
              setRange(v)
              setLeftInput(String(v[0]))
              setRightInput(String(v[1]))
            }}
            className="flex-1"
          />
          <Input
            value={rightInput}
            onChange={(e) => setRightInput(e.target.value)}
            onBlur={commitRight}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRight() }}
            className="w-16 h-8 text-center text-sm"
          />
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <span>{t('wizard.total_pages', { count: selectedPages })}</span>
          <span>{t('wizard.est_tokens', { tokens: fmtCount(estimates.tokens), cost: estimates.cost.toFixed(2) })}</span>
        </div>

        {/* Start button */}
        <Button className="w-full" size="lg" onClick={() => onStart(range)}>
          <PlayIcon className="size-4" />
          {t('wizard.start_btn')}
        </Button>
      </Field>
      </div>
    </div>
  )
}
