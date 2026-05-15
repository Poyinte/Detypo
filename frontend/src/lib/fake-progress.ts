/**
 * 假进度条 — 按批次驱动, 里程碑感知.
 *
 *   1. 启动   — ease-in-out 逼近 round(里程碑 × 20%), 峰值 10%/s
 *   2. 匀速   — 1%/s 向当前里程碑 80% 处前进
 *   3. 减速带 — 80%→90% 里程碑, 1%/s → 0%/s (最小 1% 宽)
 *   4a. Real ≥ 里程碑 且 progress < 检查点(90%M) → 10%/s 加速追赶
 *   4b. Progress ≥ 检查点 且 real < 里程碑 → 等待
 *   5. 强制降速 — 最后 2% (98%→100%), 强制限制步长 (所有阶段生效)
 *   6. 三次缓出 — finish() 时 2s cubic ease-out to 100%
 */

const STARTUP_PEAK = 0.01   // 10%/s peak during startup ease-in-out
const STEADY       = 0.001  // 1%/s  absolute per tick
const ACCEL        = 0.01   // 10%/s absolute per tick
const FINISH_MS    = 2000   // 2s cubic ease-out

export class FakeProgress {
  private _real = 0
  private _totalBatches = 1
  private _batchShare = 1
  private _progress = 0
  private _finished = false
  private _finishTime = 0
  private _finishFrom = 0

  private _batchIdx = 0
  private _milestone = 1
  private _decelStart = 0.8
  private _safeZone = 0.9

  progress = 0

  /** 检查点等待中 (用于触发 UI 脉冲动画) */
  get stalled(): boolean {
    return this._progress >= this._safeZone - 0.0001
      && this._real < this._milestone - 0.001
  }

  start(totalBatches: number) {
    this._real = 0
    this._totalBatches = Math.max(totalBatches, 1)
    this._batchShare = 1 / this._totalBatches
    this._progress = 0
    this._finished = false
    this.progress = 0
    this._recalc()
  }

  updateReal(real: number) {
    this._real = Math.max(this._real, real)
  }

  tick(_now: number): number {
    if (this._finished) {
      const prev = this.progress
      const elapsed = _now - this._finishTime
      const t = Math.min(1, elapsed / FINISH_MS)
      const raw = this._finishFrom + (1 - this._finishFrom) * (1 - Math.pow(1 - t, 3))
      this._progress = raw
      this._applySlowdown(prev)
      this.progress = this._progress
      return this.progress
    }

    this._recalc()

    const prev = this._progress
    const startupTarget = Math.round(this._batchShare * 0.2 * 100) / 100

    // ---- 启动 ----
    if (this._real < 0.001 && this._progress < startupTarget - 0.0001) {
      const t = this._progress / startupTarget
      const factor = 4 * t * (1 - t)
      const speed = STARTUP_PEAK * Math.max(factor, 0.05)
      const gap = startupTarget - this._progress
      this._progress += Math.min(speed, gap)
      this._applySlowdown(prev)
      this.progress = this._progress
      return this.progress
    }

    const atCheckpoint = this._progress >= this._safeZone - 0.0001
    const inDecel = !atCheckpoint && this._progress >= this._decelStart - 0.0001
    const realAtMilestone = this._real >= this._milestone - 0.001

    // ---- 检查点等待 ----
    if (atCheckpoint && !realAtMilestone) {
      this.progress = this._progress
      return this.progress
    }

    // ---- 加速追赶 ----
    if (realAtMilestone) {
      const gap = this._milestone - this._progress
      if (gap > 0.0001) {
        this._progress += Math.min(ACCEL, gap)
      }
      if (this._progress >= this._milestone - 0.0001) {
        this._progress = this._milestone
      }
      this._clamp()
      this._applySlowdown(prev)
      this.progress = this._progress
      return this.progress
    }

    // ---- 减速带 ----
    if (inDecel) {
      const zoneWidth = this._safeZone - this._decelStart
      const distToCheckpoint = this._safeZone - this._progress
      const speed = STEADY * (distToCheckpoint / zoneWidth)
      this._progress += Math.min(speed, distToCheckpoint)
      this._clamp()
      this._applySlowdown(prev)
      this.progress = this._progress
      return this.progress
    }

    // ---- 匀速 ----
    const gap = this._milestone - this._progress
    if (gap > 0.0001 && this._progress < this._decelStart - 0.0001) {
      this._progress += Math.min(STEADY, gap)
    }
    this._clamp()
    this._applySlowdown(prev)
    this.progress = this._progress
    return this.progress
  }

  finish() {
    this._finished = true
    this._finishFrom = this.progress
    this._finishTime = Date.now()
  }

  end() {
    this.progress = 1
    this._finished = true
  }

  // ---- internal ----

  private _recalc() {
    this._batchIdx = Math.min(
      Math.floor(this._progress / this._batchShare + 0.0001),
      this._totalBatches - 1,
    )
    this._milestone = Math.min((this._batchIdx + 1) * this._batchShare, 1)
    // 浮点修正: progress 已过里程碑则强制前进
    while (this._progress >= this._milestone - 0.0001 && this._batchIdx < this._totalBatches - 1) {
      this._batchIdx++
      this._milestone = Math.min((this._batchIdx + 1) * this._batchShare, 1)
    }

    const rawZone = this._batchShare * 0.1
    const MIN_ZONE = 0.01
    const zoneW = Math.max(rawZone, MIN_ZONE)

    this._safeZone = this._milestone - zoneW
    this._decelStart = Math.max(0, this._safeZone - zoneW)
  }

  /** 强制降速: 最后 2% (98%→100%), 所有阶段生效 */
  private _applySlowdown(prev: number) {
    const step = this._progress - prev
    if (step <= 0) return
    const ZONE = 0.02
    const distToEnd = 1.0 - prev
    if (distToEnd >= ZONE) return
    const maxStep = STEADY * 2 * (distToEnd / ZONE)
    if (step > maxStep) {
      this._progress = prev + maxStep
    }
  }

  private _clamp() {
    if (this._finished) return
    if (this._real < this._milestone - 0.001 && this._progress > this._safeZone) {
      this._progress = this._safeZone
    }
    if (this._progress > 0.95 && this._milestone < 1) {
      this._progress = 0.95
    }
  }
}
