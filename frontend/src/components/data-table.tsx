"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { z } from "zod"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ChevronDownIcon, Columns3Icon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, FilterIcon, XIcon, Undo2Icon, MinusIcon } from "lucide-react"
import { PageJump } from "@/components/page-jump"

export const schema = z.object({
  error_id: z.string(),
  original: z.string(),
  correction: z.string(),
  category: z.string(),
  reason: z.string(),
  page: z.number(),
  bbox: z.array(z.number()),
})

export function DataTable({
  data,
  excludedIds,
  onToggleExclude,
  columnVisibility,
  onColumnVisibilityChange,
  categoryFilters,
  onCategoryFiltersChange,
  animKey,
  loading,
  categories,
  categoryColors,
  t,
}: {
  data: z.infer<typeof schema>[]
  excludedIds: Set<string>
  onToggleExclude: (id: string) => void
  columnVisibility: VisibilityState
  onColumnVisibilityChange: (v: VisibilityState) => void
  categoryFilters: Set<string>
  onCategoryFiltersChange: (f: Set<string>) => void
  animKey?: number
  loading?: boolean
  categories: string[]
  categoryColors: Record<string, string>
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('tablePageSize') : null
    return { pageIndex: 0, pageSize: saved ? Number(saved) : 15 }
  })

  // Categories present in the unfiltered data
  const categoriesInData = React.useMemo(() => {
    const cats = new Set<string>()
    for (const d of data) cats.add(d.category)
    return cats
  }, [data])

  // Internal visibility filter (header dropdown) — defaults to all categories in data
  const [categoryVis, setCategoryVis] = React.useState<Set<string>>(new Set(categories))
  const categoryVisRef = React.useRef(categoryVis)
  categoryVisRef.current = categoryVis  // sync ref synchronously for stable column headers
  const categoryVisInitialized = React.useRef(false)
  React.useEffect(() => {
    // Only auto-include new categories on first data load; after that, respect user's manual toggles
    if (!categoryVisInitialized.current && categoriesInData.size > 0) {
      setCategoryVis(new Set(categoriesInData))
      categoryVisInitialized.current = true
    } else if (categoryVisInitialized.current) {
      // Add genuinely new categories (not yet in the filter) without removing user's choices
      setCategoryVis(prev => {
        const next = new Set(prev)
        let changed = false
        for (const cat of categoriesInData) {
          if (!next.has(cat)) { next.add(cat); changed = true }
        }
        return changed ? next : prev
      })
    }
  }, [categoriesInData])

  // filteredData uses categoryVis as the sole display filter.
  // categoryFilters controls only exclusion/restoration, not display.
  const filteredData = React.useMemo(() => {
    if (categoryVis.size === 0) return []
    if (categoryVis.size === categoriesInData.size) return data
    return data.filter(d => categoryVis.has(d.category))
  }, [data, categoryVis, categoriesInData])

  const toggleCategory = (cat: string) => {
    const next = new Set(categoryFilters)
    if (next.has(cat)) {
      next.delete(cat)
      // Exclude all items of the unchecked category
      for (const d of data) {
        if (d.category === cat && !excludedIds.has(d.error_id)) {
          onToggleExclude(d.error_id)
        }
      }
      setRowSelection(prev => {
        const nextSel: Record<string, boolean> = {}
        for (const [id, sel] of Object.entries(prev)) {
          if (sel) {
            const item = data.find(d => d.error_id === id)
            if (item && item.category !== cat) nextSel[id] = true
          }
        }
        return nextSel
      })
      // Also uncheck from visibility
      setCategoryVis(prev => {
        const next = new Set(prev)
        next.delete(cat)
        return next
      })
    } else {
      next.add(cat)
      // Restore all items of the re-checked category
      for (const d of data) {
        if (d.category === cat && excludedIds.has(d.error_id)) {
          onToggleExclude(d.error_id)
        }
      }
      // Also re-check visibility
      setCategoryVis(prev => {
        const next = new Set(prev)
        next.add(cat)
        return next
      })
    }
    onCategoryFiltersChange(next)
  }

  const toggleCategoryVis = (cat: string) => {
    setCategoryVis(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const clearCategories = () => {
    // Exclude all items and hide all
    for (const d of data) {
      if (!excludedIds.has(d.error_id)) onToggleExclude(d.error_id)
    }
    setCategoryVis(new Set())
    onCategoryFiltersChange(new Set())
  }
  const selectAllCategories = () => {
    // Restore all items and show all
    for (const d of data) {
      if (excludedIds.has(d.error_id)) onToggleExclude(d.error_id)
    }
    setCategoryVis(new Set(categoriesInData))
    onCategoryFiltersChange(new Set(categoriesInData))
  }

  const columns: ColumnDef<z.infer<typeof schema>>[] = React.useMemo(() => [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            className="border-muted-foreground"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="border-muted-foreground"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "page",
      header: () => <span className="flex justify-center">{t('table.page')}</span>,
      cell: ({ row }) => (
        <div className="text-center">
          <span className="font-medium tabular-nums">{row.original.page}</span>
        </div>
      ),
      size: 64,
      minSize: 64,
      maxSize: 64,
    },
    {
      accessorKey: "category",
      header: () => (
        <div className="flex justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              {t('table.category')}<ChevronDownIcon className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-44">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{t('table.show_categories')}</span>
              <div className="flex items-center gap-2">
                <span className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setCategoryVis(new Set())}>{t('table.clear')}</span>
                <span className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setCategoryVis(new Set(categoriesInData))}>{t('table.select_all')}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {[...categoriesInData].sort().map(cat => (
              <DropdownMenuCheckboxItem
                key={cat}
                checked={categoryVisRef.current.has(cat)}
                onCheckedChange={() => toggleCategoryVis(cat)}
                onSelect={(e) => e.preventDefault()}
              >
                {cat}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      ),
      cell: ({ row }) => {
        const hex = categoryColors[row.original.category] || '#888'
        return (
          <div className="flex justify-center">
            <Badge style={{ backgroundColor: `${hex}1a`, color: hex }} className="text-[10px]">
              {row.original.category}
            </Badge>
          </div>
        )
      },
      size: 96,
      minSize: 96,
    },
    {
      id: "correction",
      header: t('table.correction'),
      cell: ({ row }) => (
        <div className="whitespace-normal">
          <span className="text-muted-foreground line-through">{row.original.original}</span>
          {' → '}
          <span className="font-medium">{row.original.correction}</span>
        </div>
      ),
    },
    {
      accessorKey: "reason",
      header: t('table.reason'),
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-normal">{row.original.reason}</span>
      ),
    },
  ], [categoriesInData, t, categoryColors])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters, pagination },
    enableRowSelection: true,
    getRowId: (row) => row.error_id,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: (v) => onColumnVisibilityChange(v as VisibilityState),
    onPaginationChange: (updater) => {
      setPagination(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        localStorage.setItem('tablePageSize', String(next.pageSize))
        return next
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const excludedCount = excludedIds.size

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const totalCount = table.getFilteredRowModel().rows.length
  // Drag-select: clicks toggle single row; drag (≥5px) sweeps across rows
  const dragRef = React.useRef<{ active: boolean; mode: 'select' | 'deselect'; startId: string; startX: number; startY: number; toggled: Set<string> } | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Trigger animation on: page change, page size change, filter/vis change, view switch
  const animTrigger = `${animKey ?? 0}|${pagination.pageIndex}|${pagination.pageSize}|${[...categoryFilters].sort().join(',')}|${[...categoryVis].sort().join(',')}`
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const rows = el.querySelectorAll<HTMLElement>('[data-row-id]')
    if (!rows.length) return

    // 1) Clean up previously animated rows
    const prevAnimated = el.querySelectorAll<HTMLElement>('.table-row-enter')
    prevAnimated.forEach(r => {
      r.classList.remove('table-row-enter')
      r.style.animationDelay = ''
    })

    // 2) Force reflow so layout is settled before measuring
    void el.offsetHeight

    // 3) Measure visible frame
    const listRect = el.getBoundingClientRect()
    const visible: HTMLElement[] = []

    rows.forEach(r => {
      const rect = r.getBoundingClientRect()
      if (rect.top < listRect.bottom && rect.bottom > listRect.top) {
        visible.push(r)
      }
    })

    // 4) Apply staggered animation — excluded rows get dim variant
    if (visible.length > 0) {
      const total = 0.4
      const step = total / visible.length
      visible.forEach((r, i) => {
        r.style.animationDelay = `${i * step}s`
        r.style.opacity = '0'
        const dim = r.classList.contains('opacity-40')
        r.classList.add(dim ? 'table-row-enter-dim' : 'table-row-enter')
      })
    }

    // 5) Schedule cleanup right after last animation ends
    const lastDelay = visible.length > 0 ? (visible.length - 1) * (0.4 / visible.length) : 0
    const cleanupMs = (lastDelay + 0.25) * 1000 + 50
    const timer = setTimeout(() => {
      visible.forEach(r => {
        r.classList.remove('table-row-enter', 'table-row-enter-dim')
        r.style.animationDelay = ''
        r.style.opacity = ''
      })
    }, cleanupMs)
    return () => clearTimeout(timer)
  }, [animTrigger])

  // Context menu state — use refs to always have current values in callbacks
  const selCountRef = React.useRef(0)
  const rowSelectionRef = React.useRef(rowSelection)
  const excludedRef = React.useRef(excludedIds)
  React.useEffect(() => { rowSelectionRef.current = rowSelection })
  React.useEffect(() => { excludedRef.current = excludedIds })
  selCountRef.current = table.getFilteredSelectedRowModel().rows.length

  const [ctxMenuOpen, setCtxMenuOpen] = React.useState(false)
  const [ctxMenuPos, setCtxMenuPos] = React.useState({ x: 0, y: 0 })

  const onBatchExcludeSelected = React.useCallback(() => {
    const ids = Object.keys(rowSelectionRef.current).filter(k => rowSelectionRef.current[k])
    ids.forEach(id => { if (!excludedRef.current.has(id)) onToggleExclude(id) })
    setCtxMenuOpen(false)
  }, [onToggleExclude])

  const onBatchRestoreSelected = React.useCallback(() => {
    const ids = Object.keys(rowSelectionRef.current).filter(k => rowSelectionRef.current[k])
    ids.forEach(id => { if (excludedRef.current.has(id)) onToggleExclude(id) })
    setCtxMenuOpen(false)
  }, [onToggleExclude])

  const onBatchDeselect = React.useCallback(() => {
    setRowSelection({})
    setCtxMenuOpen(false)
  }, [])

  // Per-row mousedown — records start state for potential drag; toggles on clean click (mouseup)
  const getRowMouseDown = React.useCallback((id: string) => (e: React.MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-slot="checkbox"]')) return
    e.preventDefault()
    const sel = !!rowSelectionRef.current[id]
    dragRef.current = { active: false, mode: sel ? 'deselect' : 'select', startId: id, startX: e.clientX, startY: e.clientY, toggled: new Set() }
  }, [])

  // Per-row context menu handler
  const getRowContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (selCountRef.current === 0) return
    setCtxMenuPos({ x: e.clientX, y: e.clientY })
    setCtxMenuOpen(true)
  }, [])

  // Window-level mousemove/mouseup for drag
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      // Activate drag after 5px movement, then sweep across rows
      if (!d.active) {
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        if (dx * dx + dy * dy < 25) return // 5px threshold
        d.active = true
        d.toggled.add(d.startId)
        setRowSelection(prev => ({ ...prev, [d.startId]: d.mode === 'select' }))
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el) return
      if (scrollRef.current && !scrollRef.current.contains(el)) return
      const row = el.closest('[data-row-id]') as HTMLElement | null
      if (!row) return
      const rid = row.getAttribute('data-row-id')!
      if (d.toggled.has(rid)) return
      d.toggled.add(rid)
      setRowSelection(prev => ({ ...prev, [rid]: d.mode === 'select' }))
    }
    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      document.body.classList.remove('dragging-table')
      // Clean click (no drag): toggle the single clicked row
      if (d && !d.active) {
        setRowSelection(prev => ({ ...prev, [d.startId]: !prev[d.startId] }))
      }
    }
    const onDown = () => {
      document.body.classList.add('dragging-table')
    }
    const onSelectStart = (e: Event) => {
      if (dragRef.current) e.preventDefault()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousedown', onDown)
    document.addEventListener('selectstart', onSelectStart)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousedown', onDown)
      document.removeEventListener('selectstart', onSelectStart)
      document.body.classList.remove('dragging-table')
    }
  }, [])

  return (
    <div className="w-full flex flex-col flex-1 overflow-clip">
      {/* Toolbar */}
      <div className="flex items-center justify-between pl-4 pr-7 py-1.5 bg-card shrink-0 gap-2">
        <div className="flex items-center gap-2">
          {/* Columns */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3Icon data-icon="inline-start" />{t('table.columns')}
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuLabel>{t('table.select_columns')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllColumns().filter(c => typeof c.accessorFn !== "undefined" && c.getCanHide())
                .map(column => (
                  <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(!!v)}
                    onSelect={(e) => e.preventDefault()}>
                    {column.id === 'category' ? t('table.category') : column.id === 'page' ? t('table.page') :
                     column.id === 'reason' ? t('table.reason') : column.id === 'correction' ? t('table.original_correction') : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <FilterIcon data-icon="inline-start" />{t('table.category_filter')}
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>{t('table.keep_categories')}</span>
                <div className="flex items-center gap-2">
                  <span className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={clearCategories}>{t('table.clear')}</span>
                  <span className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={selectAllCategories}>{t('table.select_all')}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[...categoriesInData].sort().map(cat => (
                <DropdownMenuCheckboxItem
                  key={cat}
                  checked={categoryFilters.has(cat)}
                  onCheckedChange={() => toggleCategory(cat)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {cat}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator data-slot="toolbar-sep" orientation="vertical" className="mx-0.5 h-4" />

          {data.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('table.total', { count: data.length - excludedCount })}
            </span>
          )}
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('table.selected', { selected: selectedCount, total: totalCount })}
            </span>
          )}
          {excludedCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('table.excluded', { count: excludedCount })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('table.per_page')}</span>
            <Select value={`${table.getState().pagination.pageSize}`}
              onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger size="sm" className="w-16 h-7">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                <SelectGroup>
                  {[15, 20, 30, 50].map(n => (
                    <SelectItem key={n} value={`${n}`}>{n}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{t('table.items')}</span>
          </div>
          <PageJump
            current={table.getState().pagination.pageIndex + 1}
            total={table.getPageCount()}
            onJump={(p) => table.setPageIndex(p - 1)}
            triggerClassName="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          />
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-7" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeftIcon className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="size-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeftIcon className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="size-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRightIcon className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="size-7" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              <ChevronsRightIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 relative px-4 overflow-clip">
        <div ref={scrollRef} className="absolute inset-x-4 inset-y-0 overflow-y-scroll" data-slot="custom-scroll">
          <div style={{ minHeight: 'calc(100% + 1px)' }}>
          <div className="rounded-lg border">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        width: header.column.id === 'select' ? 40
                          : header.column.id === 'page' ? 64
                          : header.column.id === 'category' ? 96
                          : undefined,
                      }}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map(row => {
                  const ex = excludedIds.has(row.original.error_id)
                  return (
                    <TableRow
                      key={row.id}
                      data-row-id={row.original.error_id}
                      data-state={row.getIsSelected() && "selected"}
                      className={cn(
                        'cursor-pointer select-none',
                        ex && 'opacity-40'
                      )}
                      onMouseDown={getRowMouseDown(row.original.error_id)}
                      onContextMenu={getRowContextMenu}
                    >

                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })
              ) : loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={`skel-${i}`}>
                    {columns.map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {t('table.no_results')}
                  </TableCell>
                </TableRow>
              )}
                </TableBody>
          </Table>
        </div>
        </div>
        </div>
      </div>

      {/* Floating context menu at cursor position */}
      <DropdownMenu open={ctxMenuOpen} onOpenChange={setCtxMenuOpen}>
        <DropdownMenuTrigger asChild>
          <div style={{ position: 'fixed', left: ctxMenuPos.x, top: ctxMenuPos.y, width: 1, height: 1 }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onBatchExcludeSelected}>
              <XIcon />{t('table.exclude_selected')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onBatchRestoreSelected}>
              <Undo2Icon />{t('table.restore_selected')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onBatchDeselect}>
              <MinusIcon />{t('table.deselect')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
