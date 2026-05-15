import { useState, useRef, useCallback, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DataTable, CATEGORIES } from '@/components/data-table'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ListIcon, LayoutGridIcon, MoonIcon, SunIcon, SunMoonIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { FakeProgress } from '@/lib/fake-progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { PageJump } from '@/components/page-jump'
import { PdfUploadWizard } from '@/components/pdf-upload-wizard'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const VERSION = 'v1.0.199' + (import.meta.env.DEV ? '-dev' : '')

type ViewType = 'list' | 'card'

interface ErrorItem {
  error_id: string
  original: string
  correction: string
  category: string
  reason: string
  page: number
  bbox: number[]
}

const CAT_BADGE: Record<string, string> = {
  '用字错误': 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  '用词不当': 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  '语法错误': 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  '标点符号': 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  '数字用法': 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  '政治敏感': 'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
}

function esc(s: string) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const fmtPages = (p: number[] | undefined) => !p || p.length === 0 ? '-' : p.length === 1 ? String(p[0]) : `${p[0]}-${p[p.length-1]}`

export default function App() {
  const [fileId, setFileId] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [errors, setErrors] = useState<ErrorItem[]>([])
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<ViewType>('list')
  const [currentPage, setCurrentPage] = useState(1)
  const [logLines, setLogLines] = useState<{ts: string, msg: string}[]>([{ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }), msg: 'connected'}])
  const [progressPct, setProgressPct] = useState(0)
  const [showProgress, setShowProgress] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const [showElapsed, setShowElapsed] = useState(false)
  const [spinnerIdx, setSpinnerIdx] = useState(0)
  const spinnerFrames = ['-', '\\', '|', '/']
  const [stalled, setStalled] = useState(false)
  useEffect(() => {
    if (!showElapsed) return
    const iv = setInterval(() => setSpinnerIdx(i => (i + 1) % spinnerFrames.length), 130)
    return () => clearInterval(iv)
  }, [showElapsed, spinnerFrames.length])

  // Fake progress: logic 100ms + rAF interpolation for 60fps smoothness
  useEffect(() => {
    if (!showElapsed) return
    const target = { v: 0 }
    const display = { v: 0 }
    let raf = 0

    // Logic tick: 100ms interval drives the state machine
    const iv = setInterval(() => {
      const fake = fakeProgressRef.current
      if (!fake) return
      target.v = fake.tick(Date.now())
      setStalled(fake.stalled)
    }, 100)

    // Visual tick: rAF interpolates display toward target at 60fps
    const frame = () => {
      const diff = target.v - display.v
      if (Math.abs(diff) > 0.0001) {
        display.v += diff * 0.35 // smooth chase, 35% of remaining gap per frame
        setProgressPct(Number((display.v * 100).toFixed(2)))
      } else {
        display.v = target.v
      }
      if (finishingRef.current && display.v >= 0.9995) {
        finishingRef.current = false
        setShowElapsed(false)
        setDisconnected(true)
        setTimeout(() => setShowProgress(false), 300)
        return // stop rAF
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      clearInterval(iv)
      cancelAnimationFrame(raf)
    }
  }, [showElapsed])

  const [totalTokens, setTotalTokens] = useState(0)
  const [proofCost, setProofCost] = useState(0)
  const [balance, setBalance] = useState('')
  const balanceRef = useRef('')
  const [filename, setFilename] = useState('')
  const [pageRange, setPageRange] = useState<[number, number] | null>(null)
  const [pageTokenCounts, setPageTokenCounts] = useState<number[]>([])
  const [reuploadOpen, setReuploadOpen] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('deepseek_api_key') || '')
  const [setupOpen, setSetupOpen] = useState(false)
  useEffect(() => {
    if (!localStorage.getItem('deepseek_api_key')) {
      const t = setTimeout(() => setSetupOpen(true), 500)
      return () => clearTimeout(t)
    }
  }, [])
  useEffect(() => {
    if (!errors.length) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [errors.length])

  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set(CATEGORIES))
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [cacheHitTokens, setCacheHitTokens] = useState(0)
  const [modelName, setModelName] = useState('')
  const [animKey, setAnimKey] = useState(0)
  const [themeMode, setThemeMode] = useState<'dark' | 'light' | 'system'>(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || stored === 'light') return stored
    return 'system'
  })
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const [darkMode, setDarkMode] = useState(themeMode === 'system' ? systemDark : themeMode === 'dark')
  const [keyStatus, setKeyStatus] = useState('')
  const [keyOk, setKeyOk] = useState(false)
  useEffect(() => {
    if (keyOk) {
      const t = setTimeout(() => setKeyOk(false), 1000)
      return () => clearTimeout(t)
    }
    if (!keyOk && keyStatus && keyStatus !== '验证中...') {
      const t = setTimeout(() => setKeyStatus(''), 1000)
      return () => clearTimeout(t)
    }
  }, [keyStatus, keyOk])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<number | null>(null)
  const abortRef = useRef<{ abort: () => void } | null>(null)
  const errCountRef = useRef(0)
  const totalPromptRef = useRef(0)
  const totalCompletionRef = useRef(0)
  const cacheHitRef = useRef(0)


  const pushLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setLogLines(prev => {
      const next = [...prev, { ts, msg }]
      return next.length > 50 ? next.slice(-50) : next
    })
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])
  const startTimer = useCallback(() => {
    const t0 = Date.now(); setShowElapsed(true)
    timerRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000)
      setElapsed(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
    }, 1000)
  }, [])

  const API = 'http://127.0.0.1:3000'

  // Load balance on mount
  useEffect(() => {
    if (!apiKey.startsWith('sk-')) return
    fetch(`${API}/api/settings/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    }).then(r => r.json()).then(d => {
      if (d.balance) setBalance(d.balance)
    }).catch(() => {})
  }, []) // eslint-disable-line

  const toggleExclude = useCallback((id: string) => {
    setExcludedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }, [])

  const batchDoneRef = useRef(0)
  const batchTotalRef = useRef(0)
  const fakeProgressRef = useRef<FakeProgress | null>(null)
  const realProgressRef = useRef(0)
  const finishingRef = useRef(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSSE = useCallback((ev: string, d: any) => {
    switch (ev) {
      case 'extracting':
        pushLog(`extracting pages=${d.pages}`)
        break
      case 'llm_waiting':
        batchDoneRef.current = 0
        batchTotalRef.current = d.batches || 1
        fakeProgressRef.current?.start(batchTotalRef.current)
        pushLog(`llm_waiting batches=${d.batches}`)
        break
      case 'batch_done': {
        batchDoneRef.current = d.current
        const total = batchTotalRef.current || d.total || 1
        const real = d.current / Math.max(total, 1)
        realProgressRef.current = real
        fakeProgressRef.current?.updateReal(real)
        pushLog([
          `batch=${d.current}/${d.total || batchTotalRef.current}`,
          `pages=${fmtPages(d.pages)}`,
          `prompt=${d.prompt_tokens || 0}`,
          `completion=${d.completion_tokens || 0}`,
          `tokens=${d.tokens || 0}`,
          `cache_hit=${d.cache_hit || 0}`,
          `cache_miss=${d.cache_miss || 0}`,
        ].join(' '))
        break
      }
      case 'page_done':
        setErrors(prev => {
          const next = [...prev, ...(d.errors || [])]
          next.sort((a, b) => a.page - b.page)
          return next
        }); errCountRef.current += (d.errors?.length || 0)
        pushLog(`errors=${d.errors?.length || 0} total_errors=${errCountRef.current}`)
        break
      case 'complete': {
        stopTimer()
        fakeProgressRef.current?.finish()
        // eslint-disable-next-line react-hooks/immutability
        finishingRef.current = true
        pushLog(`complete total_errors=${errCountRef.current} total_tokens=${totalPromptRef.current + totalCompletionRef.current}`)
        const checkBalance = (attempt: number) => {
          if (attempt > 5) return
          fetch(`${API}/api/settings/balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey }),
          }).then(r => r.json()).then(d => {
            const after = parseFloat(d.balance || '0')
            const before = parseFloat(balanceRef.current || '0')
            const cost = Math.max(0, before - after)
            setBalance(d.balance || '')
            setProofCost(cost)
            if (attempt < 6) {
              const delays = [5, 10, 20, 40, 70, 155]
              setTimeout(() => checkBalance(attempt + 1), delays[attempt] * 1000)
            }
          }).catch(() => {})
        }
        checkBalance(0)
        break
      }
      case 'proofread_error':
        stopTimer(); setShowProgress(false)
        fakeProgressRef.current?.end()
        pushLog(`proofread_error message="${d.message || 'unknown error'}"`)
        break
      case 'stopped':
        stopTimer(); setShowElapsed(false); setShowProgress(false)
        fakeProgressRef.current?.end()
        pushLog('stopped')
        break
    }
  }, [stopTimer, pushLog, apiKey])

  const upload = async (f: File) => {
    const fd = new FormData(); fd.append('file', f)
    pushLog('uploading...')
    try {
      const r = await fetch(`${API}/api/upload`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'upload failed')
      const d = await r.json()
      setFileId(d.file_id); setPageCount(d.page_count); setErrors([]); setExcludedIds(new Set())
      setActiveView('list'); setCurrentPage(1)
      setFilename(f.name)
      setPageRange(null)
      setPageTokenCounts(d.page_token_counts || [])
      pushLog('ready')
    } catch (e: unknown) { pushLog(`upload error: ${(e as Error)?.message || String(e)}`) }
  }

  const startProofread = async (range?: [number, number]) => {
    if (!fileId) return
    if (!apiKey) return
    // Set range if not already set (sidebar start button clicked from wizard)
    if (range && !pageRange) setPageRange(range)
    setErrors([]); setExcludedIds(new Set()); setCurrentPage(1)
    setTotalTokens(0); setCacheHitTokens(0); setProofCost(0); setShowElapsed(true)
    setShowProgress(true); setProgressPct(0); setDisconnected(false)
    setLogLines([])
    pushLog('proofreading started')
    totalPromptRef.current = 0; totalCompletionRef.current = 0; cacheHitRef.current = 0
    batchDoneRef.current = 0; batchTotalRef.current = 0
    // eslint-disable-next-line react-hooks/immutability
    fakeProgressRef.current = new FakeProgress()
    fakeProgressRef.current.start(1) // placeholder, llm_waiting 会以真实 batch 数重启
    // Fetch balance before proofreading (await to ensure it's available)
    try {
      const balResp = await fetch(`${API}/api/settings/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      })
      const balData = await balResp.json()
      balanceRef.current = balData.balance || '0'
    } catch { /* balance fetch is best-effort */ }
    errCountRef.current = 0
    startTimer()
    try {
      const url = new URL(`${API}/api/proofread/${fileId}`)
      url.searchParams.set('token', apiKey)
      if (range) {
        url.searchParams.set('start_page', String(range[0]))
        url.searchParams.set('end_page', String(range[1]))
      }
      const es = new EventSource(url.toString())
      abortRef.current = { abort: () => es.close() }
      ;['extracting', 'llm_waiting', 'batch_done', 'page_done', 'complete', 'proofread_error', 'stopped']
        .forEach(ev => es.addEventListener(ev, (e: MessageEvent) => {
          const d = JSON.parse(e.data)
          if (typeof d.tokens === 'number' && ev === 'batch_done') {
            totalPromptRef.current += d.prompt_tokens || 0
            totalCompletionRef.current += d.completion_tokens || 0
            cacheHitRef.current += d.cache_hit || 0
            setTotalTokens(totalPromptRef.current + totalCompletionRef.current)
            setCacheHitTokens(cacheHitRef.current)
            if (d.model && !modelName) setModelName(d.model)
          }
          handleSSE(ev, d)
        }))
      es.onerror = () => {
        es.close(); pushLog('connection closed')
        if (finishingRef.current) return // ease-out 播放中, 不打断
        setDisconnected(true); stopTimer(); setShowProgress(false)
        fakeProgressRef.current?.end()
      }
    } catch (e: unknown) {
      pushLog(`connection error: ${(e as Error).message}`)
      if (finishingRef.current) return
      stopTimer(); setShowProgress(false)
      fakeProgressRef.current?.end()
    }
  }

  const exportPdf = async () => {
    if (!fileId) return
    try {
      const r = await fetch(`${API}/api/export/${fileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclude_ids: [...excludedIds] }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '导出失败')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `proofread_${fileId}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) { pushLog(`export error: ${(e as Error).message}`) }
  }

  const validateKey = async (key: string) => {
    if (!key.startsWith('sk-')) { setKeyStatus('API Key 无效'); return }
    setKeyStatus('验证中...')
    try {
      const r = await fetch(`${API}/api/settings/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key }),
      })
      const d = await r.json()
      if (d.valid) {
        localStorage.setItem('deepseek_api_key', key)
        setApiKey(key)
        setKeyStatus(''); setKeyOk(true); setSetupOpen(false)
        fetch(`${API}/api/settings/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: key }),
        }).then(r => r.json()).then(d => {
          if (d.balance) setBalance(d.balance)
        }).catch(() => {})
      } else { setKeyStatus('API Key 无效') }
    } catch { setKeyStatus('网络错误，请重试') }
  }

  const toggleDarkMode = useCallback(() => {
    const next = themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark'
    setThemeMode(next)
    if (next === 'system') {
      localStorage.removeItem('theme')
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
    } else {
      localStorage.setItem('theme', next)
      setDarkMode(next === 'dark')
    }
  }, [themeMode])

  // Sync dark class to <html> whenever darkMode changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Listen for system theme changes (only when in system mode)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      if (themeMode === 'system') {
        setDarkMode(e.matches)
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themeMode])

  // Sync favicon with dark mode
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = darkMode ? '/favicon.svg' : '/favicon-light.svg'
  }, [darkMode])

  // Sidebar "上传 PDF" → show wizard first
  const showUploadWizard = useCallback((file?: File) => {
    if (file instanceof File) {
      upload(file)
      return
    }
    if (errors.length > 0) {
      setReuploadOpen(true)
    } else {
      setFileId(null)
      setPageRange(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors.length])

  // Wizard "选择文件" button → open file picker
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const doUpload = useCallback(() => {
    setReuploadOpen(false)
    setErrors([])
    setExcludedIds(new Set())
    setFileId(null)
    setPageRange(null)
    setPageCount(0)
    setFilename('')
  }, [])

  // ── Derived data ──
  const allPages = [...new Set(errors.map(e => e.page))].sort((a, b) => a - b)
  const pageErrors = errors.filter(e => e.page === currentPage)
  const currentPageIndex = allPages.indexOf(currentPage)

  // Default to first error page on initial data load
  const prevPageCountRef = useRef(0)
  useEffect(() => {
    if (allPages.length > 0 && errors.length > prevPageCountRef.current && !allPages.includes(currentPage)) {
      setCurrentPage(allPages[0])
    }
    prevPageCountRef.current = errors.length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPages, errors.length])

  return (
    <SidebarProvider>
      <AppSidebar
        onUpload={showUploadWizard}
        onExport={exportPdf}
        canExport={errors.length > 0}
        apiKey={apiKey}
        keyOk={keyOk}
        keyStatus={keyStatus}
        onValidateKey={validateKey}
      />
      <main className="flex flex-1 flex-col min-h-svh overflow-clip">
        {/* ── HEADER ── */}
        <header className="flex h-12 shrink-0 items-center gap-0.5 border-b px-4">
          <SidebarTrigger className="ml-0" />
          <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-4" />
          <Button variant="ghost" size="icon-sm" className="size-7" onClick={toggleDarkMode}>
            {themeMode === 'dark' ? <MoonIcon className="size-3.5" /> : themeMode === 'light' ? <SunIcon className="size-3.5" /> : <SunMoonIcon className="size-3.5" />}
          </Button>
          <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-4" />
          <Tabs value={activeView} onValueChange={(v) => { setActiveView(v as ViewType); if (v === 'list') setAnimKey(k => k + 1) }}>
            <TabsList>
              <TabsTrigger value="list">
                <ListIcon />列表
              </TabsTrigger>
              <TabsTrigger value="card">
                <LayoutGridIcon />卡片
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{VERSION}</span>
        </header>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { upload(f); e.target.value = '' } }} />

        {/* ── CONTENT ── */}
        <div className="flex-1 flex flex-col overflow-clip">
          {!pageRange ? (
            <PdfUploadWizard
              key={fileId || 'no-file'}
              pageCount={pageCount}
              fileId={fileId || ''}
              filename={filename}
              pageTokenCounts={pageTokenCounts}
              onUpload={(file) => file ? upload(file) : openFilePicker()}
              onClose={() => { setFileId(null); setPageRange(null) }}
              onStart={(range) => {
                setPageRange(range)
                startProofread(range)
              }}
            />
          ) : (
            <>
              <div className={activeView === 'list' ? 'flex flex-1 flex-col' : 'hidden'}>
                <DataTable
                  data={errors}
                  excludedIds={excludedIds}
                  onToggleExclude={toggleExclude}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                  categoryFilters={categoryFilters}
                  onCategoryFiltersChange={setCategoryFilters}
                  animKey={animKey}
                  loading={showElapsed && errors.length === 0}
                />
              </div>
              <div className={activeView === 'card' ? 'flex flex-1 flex-col' : 'hidden'}>
              <div className="flex flex-col flex-1 overflow-clip">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-1.5 bg-card shrink-0 min-h-9">
                  {showElapsed ? null : (
                  <>
                  <div className="justify-self-start">
                    {allPages.length > 0 && (
                      <PageJump
                        current={currentPage}
                        total={pageCount}
                        onJump={(p) => {
                          if (allPages.includes(p)) { setCurrentPage(p); return }
                          let nearest = allPages[0]
                          let minDiff = Infinity
                          for (const page of allPages) {
                            const diff = Math.abs(page - p)
                            if (diff < minDiff) { minDiff = diff; nearest = page }
                          }
                          setCurrentPage(nearest)
                        }}
                        triggerClassName="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        triggerLabel={`PDF 第 ${currentPage} 页`}
                        side="right"
                      />
                    )}
                  </div>
                  <div className="justify-self-center">
                  {!showElapsed && allPages.length === 0 ? (
                    <span className="text-xs text-muted-foreground py-1">暂无问题页面</span>
                  ) : (
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            text="上一页"
                            onClick={() => {
                              if (currentPageIndex <= 0) {
                                toast.info('已是第一页', { position: 'top-right' })
                                return
                              }
                              setCurrentPage(allPages[currentPageIndex - 1])
                            }}
                          />
                        </PaginationItem>
                        {(() => {
                          const total = allPages.length
                          const SLOTS = 9
                          if (total <= SLOTS) {
                            return allPages.map(p => (
                              <PaginationItem key={p}>
                                <PaginationLink isActive={p === currentPage} onClick={() => setCurrentPage(p)}>
                                  {p}
                                </PaginationLink>
                              </PaginationItem>
                            ))
                          }
                          // Always exactly SLOTS items for stable layout
                          const items: (number | 'e')[] = []
                          if (currentPageIndex <= 4) {
                            // Near start: [1..7] [...] [N]
                            for (let i = 0; i < 7; i++) items.push(i)
                            items.push('e')
                            items.push(total - 1)
                          } else if (currentPageIndex >= total - 5) {
                            // Near end: [1] [...] [N-6..N]
                            items.push(0)
                            items.push('e')
                            for (let i = total - 7; i < total; i++) items.push(i)
                          } else {
                            // Middle: [1] [...] [c-2..c+2] [...] [N]
                            items.push(0)
                            items.push('e')
                            for (let i = currentPageIndex - 2; i <= currentPageIndex + 2; i++) items.push(i)
                            items.push('e')
                            items.push(total - 1)
                          }
                          return items.map((item, idx) => {
                            if (item === 'e') return <PaginationEllipsis key={`e${idx}`} />
                            const p = allPages[item]
                            return (
                              <PaginationItem key={p}>
                                <PaginationLink isActive={p === currentPage} onClick={() => setCurrentPage(p)}>
                                  {p}
                                </PaginationLink>
                              </PaginationItem>
                            )
                          })
                        })()}
                        <PaginationNext
                          text="下一页"
                          onClick={() => {
                            if (currentPageIndex >= allPages.length - 1) {
                              toast.info('已是最后一页', { position: 'top-right' })
                              return
                            }
                            setCurrentPage(allPages[currentPageIndex + 1])
                          }}
                        />
                      </PaginationContent>
                    </Pagination>
                  )}
                  </div>
                  <div />
                  </>
                  )}
                </div>
                <div className="flex-1 min-h-0 px-4 pt-4 pb-5 overflow-y-scroll" data-slot="custom-scroll">
                  <div style={{ minHeight: 'calc(100% + 1px)' }}>
                  {showElapsed ? (
                    <div className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 8 }, (_, i) => (
                        <Card key={`skel-${i}`} className="p-3">
                          <Skeleton className="h-3 w-16 mb-2" />
                          <Skeleton className="h-4 w-full mb-1" />
                          <Skeleton className="h-3 w-3/4" />
                        </Card>
                      ))}
                    </div>
                  ) : pageErrors.length === 0 ? null : (
                    <div className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 xl:grid-cols-4">
                      {pageErrors.map(e => {
                        const ex = excludedIds.has(e.error_id)
                        return (
                          <Card
                            key={e.error_id}
                            className={cn(
                              'relative cursor-pointer transition-all duration-300 border hover:shadow-lg hover:-translate-y-1 hover:z-10',
                              ex ? 'opacity-40 hover:shadow-none hover:translate-y-0' : 'animate-in fade-in slide-in-from-bottom-2'
                            )}
                            style={ex ? undefined : { animationDelay: `${pageErrors.indexOf(e) * 25}ms`, animationFillMode: 'backwards' }}
                            onClick={() => toggleExclude(e.error_id)}
                            size="sm"
                          >
                            <CardHeader className="flex flex-col flex-1">
                              <Badge className={(CAT_BADGE[e.category] || '') + ' text-[10px]'}>
                                {esc(e.category)}
                              </Badge>
                              <CardTitle className="text-xs font-normal my-auto">
                                <span className="text-muted-foreground line-through">{esc(e.original)}</span>
                                {' → '}
                                <span className="font-medium">{esc(e.correction)}</span>
                              </CardTitle>
                            </CardHeader>
                            <CardFooter className="text-xs">
                              <CardDescription className="text-[11px]">{esc(e.reason)}</CardDescription>
                            </CardFooter>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>
                  </div>
            </div>
              </div>
            </>
          )}

        </div>

        <div className={cn(
          'px-4 border-t bg-card shrink-0 transition-all duration-300 ease-out',
          showProgress ? 'py-1.5 opacity-100 max-h-10' : 'py-0 opacity-0 border-0 max-h-0 overflow-hidden',
        )}>
          <div className="flex items-center gap-3">
            <Progress
              value={progressPct}
              className={`flex-1 h-1.5 [&>div]:!transition-none ${stalled ? 'animate-pulse' : ''}`}
            />
            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{Math.round(progressPct)}%</span>
          </div>
        </div>

        {/* ── STATUS BAR ── */}
        <footer className="flex items-center justify-between px-4 h-9 border-t bg-card text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
            <span className={cn(
              'w-2 h-2 rounded-full shrink-0',
              disconnected ? 'bg-muted-foreground' :
              showElapsed ? 'bg-primary animate-pulse-soft' :
              'bg-emerald-600 animate-pulse-soft'
            )} />
            <span className="text-foreground truncate whitespace-nowrap font-mono text-[11px]">
              [{logLines[logLines.length - 1]?.ts}]{" "}
              {showElapsed && <>{spinnerFrames[spinnerIdx]} </>}
              {logLines[logLines.length - 1]?.msg}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {elapsed && (
              <>
                <Separator orientation="vertical" className="h-3" />
                <span>耗时 {elapsed}</span>
              </>
            )}
            {modelName && (
              <>
                <Separator orientation="vertical" className="h-3" />
                <span>{modelName}</span>
              </>
            )}
            {totalTokens > 0 && (
              <>
                <Separator orientation="vertical" className="h-3" />
                <span title="prompt + completion">Tokens {fmtTokens(totalTokens)}</span>
                {cacheHitTokens > 0 && (
                  <>
                    <Separator orientation="vertical" className="h-3" />
                    <span>命中 {fmtTokens(cacheHitTokens)} ({Math.round(cacheHitTokens / totalTokens * 100)}%)</span>
                  </>
                )}
                {!showElapsed && proofCost > 0 && (
                  <>
                    <Separator orientation="vertical" className="h-3" />
                    <span>消费 ¥{proofCost.toFixed(2)}</span>
                  </>
                )}
              </>
            )}
            {balance && (
              <>
                <Separator orientation="vertical" className="h-3" />
                <span>余额 ¥{parseFloat(balance).toFixed(2)}</span>
              </>
            )}
          </div>
        </footer>
      </main>

      <AlertDialog open={reuploadOpen} onOpenChange={setReuploadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重新上传 PDF</AlertDialogTitle>
            <AlertDialogDescription>
              此操作会清空当前校对结果。请确认已导出所需文件。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doUpload} variant="destructive">确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={setupOpen} onOpenChange={() => {}}>
        <DialogContent
          showClose={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>请输入 DeepSeek API Key</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setKeyOk(false)
              }}
              placeholder="sk-"
              autoFocus
            />
            <Button
              onClick={() => validateKey(apiKey)}
              disabled={keyStatus === '验证中...'}
              variant={keyOk ? 'secondary' : keyStatus && keyStatus !== '验证中...' ? 'destructive' : 'default'}
              className={keyOk ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            >
              {keyStatus === '验证中...' && <Spinner data-icon="inline-start" />}
              {keyOk ? '验证通过' : keyStatus && keyStatus !== '验证中...' ? 'API Key 无效' : '验证并保存'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Toaster position="top-right" />
    </SidebarProvider>
  )
}
