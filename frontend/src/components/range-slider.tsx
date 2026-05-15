"use client"

import { useRef, useCallback } from 'react'

export function RangeSlider({
  min,
  max,
  value,
  onValueChange,
  className,
}: {
  min: number
  max: number
  value: [number, number]
  onValueChange: (value: [number, number]) => void
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  const leftPct = ((value[0] - min) / (max - min)) * 100
  const rightPct = ((value[1] - min) / (max - min)) * 100
  const rangeWidth = rightPct - leftPct

  const getValue = useCallback((clientX: number, thumb: 0 | 1): number => {
    const track = trackRef.current
    if (!track) return value[thumb]
    const rect = track.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = Math.round(min + pct * (max - min))
    return Math.max(min, Math.min(max, raw))
  }, [min, max, value])

  const onPointerDown = useCallback((thumb: 0 | 1) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      const v = getValue(ev.clientX, thumb)
      if (thumb === 0) {
        onValueChange([Math.min(v, value[1]), value[1]])
      } else {
        onValueChange([value[0], Math.max(v, value[0])])
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [getValue, onValueChange, value])

  return (
    <div className={`relative flex items-center w-full h-5 touch-none select-none ${className || ''}`}>
      {/* Track */}
      <div
        ref={trackRef}
        data-slot="slider-track"
        className="absolute left-0 right-0 h-1 rounded-full"
      >
        {/* Range fill */}
        <div
          data-slot="slider-range"
          className="absolute h-full rounded-full"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(rangeWidth, 0)}%`,
          }}
        />
      </div>
      {/* Thumb 1 (left) */}
      <div
        data-slot="slider-thumb"
        className="absolute top-1/2 -translate-y-1/2 size-3.5 rounded-full border-2 border-white bg-primary cursor-pointer shadow-sm transition-shadow duration-150 hover:ring-3 hover:ring-primary/30"
        style={{ left: `calc(${leftPct}% - 7px)` }}
        onPointerDown={onPointerDown(0)}
      />
      {/* Thumb 2 (right) */}
      <div
        data-slot="slider-thumb"
        className="absolute top-1/2 -translate-y-1/2 size-3.5 rounded-full border-2 border-white bg-primary cursor-pointer shadow-sm transition-shadow duration-150 hover:ring-3 hover:ring-primary/30"
        style={{ left: `calc(${rightPct}% - 7px)` }}
        onPointerDown={onPointerDown(1)}
      />
    </div>
  )
}
