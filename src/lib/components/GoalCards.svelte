<script lang="ts">
  import type { DashboardGoal } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { createTask } from '#lib/editors'
  import Icon from './Icon.svelte'
  import TaskList from './TaskList.svelte'
  import GoalEditor from './GoalEditor.svelte'

  let { goals }: { goals: DashboardGoal[] } = $props()
  const ui = useUi()
  let editing = $state<DashboardGoal | null>(null)
  // 新建和编辑复用 GoalEditor：editing 为空但 creating 为真时就是新建。
  let creating = $state(false)
  let rail = $state<HTMLElement | null>(null)
  let track = $state<HTMLElement | null>(null)
  let scrollable = $state(false)
  let atStart = $state(true)
  let atEnd = $state(true)
  let thumb = $state({ width: 0, left: 0 })

  // 每张卡片对齐到轨道左沿时的 scrollLeft。第一张恒为 0，其余按卡片的实测间距推，
  // CSS 里的 padding / peek / 列数怎么改都自动对得上。
  let stops: number[] = []
  // 正在滚向的卡片下标。连点时从这里继续往前推，动画没跑完也不会把后几次点击吃掉。
  let pending: number | null = null
  let watchdog = 0

  function maxScroll(el: HTMLElement) {
    return Math.max(0, el.scrollWidth - el.clientWidth)
  }

  function readStops() {
    if (!rail) return [0]
    const cards = Array.from(rail.children) as HTMLElement[]
    if (!cards.length) return [0]
    const base = cards[0].getBoundingClientRect().left
    const max = maxScroll(rail)
    const list = cards.map(card => Math.min(max, Math.max(0, Math.round(card.getBoundingClientRect().left - base))))
    // 末几张会被 max 夹到同一个位置，重复的去掉，免得连点空转
    return list.filter((value, index) => index === 0 || value > list[index - 1])
  }

  function nearest(list: number[], left: number) {
    let best = 0
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i] - left) < Math.abs(list[best] - left)) best = i
    }
    return best
  }

  function measure() {
    if (!rail) return
    const max = maxScroll(rail)
    const left = rail.scrollLeft
    stops = readStops()
    // 到位就把 pending 交还给实测位置，之后按真实滚动位置算首尾
    if (pending !== null && Math.abs(left - (stops[pending] ?? left)) <= 2) pending = null
    const index = pending ?? nearest(stops, left)
    scrollable = max > 4
    atStart = !scrollable || index <= 0
    atEnd = !scrollable || index >= stops.length - 1
    if (!scrollable) {
      thumb = { width: 0, left: 0 }
      return
    }
    const width = Math.min(rail.clientWidth, Math.max(44, rail.clientWidth * rail.clientWidth / Math.max(1, rail.scrollWidth)))
    const travel = Math.max(0, rail.clientWidth - width)
    thumb = { width, left: max > 0 ? Math.min(travel, Math.max(0, left / max * travel)) : 0 }
  }

  // 用户自己动轨道（拖动、滚轮、触摸）时，放弃之前排队的目标下标。
  function forget() {
    pending = null
  }

  function step(direction: 1 | -1) {
    const el = rail
    if (!el) return
    stops = readStops()
    if (stops.length < 2) return
    const from = pending ?? nearest(stops, el.scrollLeft)
    const to = Math.min(stops.length - 1, Math.max(0, from + direction))
    const target = stops[to]
    // 已经在尽头：位置不再变，但状态要立刻纠正，箭头该隐身就隐身
    if (to === from && Math.abs(el.scrollLeft - target) <= 2) return
    pending = to
    const startLeft = el.scrollLeft
    clearTimeout(watchdog)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollLeft = target
      pending = null
      measure()
      return
    }
    el.scrollTo({ left: target, behavior: 'smooth' })
    // 兜底：平滑滚动万一被吸附或省电模式吞掉，直接跳到目标，绝不留"点了没反应"的空点击
    watchdog = window.setTimeout(() => {
      if (pending !== to) return
      if (Math.abs(el.scrollLeft - startLeft) < 4 && target !== startLeft) el.scrollLeft = target
      pending = null
      measure()
    }, 320)
  }

  function dragThumb(event: PointerEvent) {
    if (!rail || !track) return
    event.preventDefault()
    event.stopPropagation()
    pending = null
    const rect = track.getBoundingClientRect()
    const startX = event.clientX
    const startLeft = rail.scrollLeft
    const max = maxScroll(rail)
    const scale = max / Math.max(1, rect.width - thumb.width)
    const move = (moveEvent: PointerEvent) => {
      rail!.scrollLeft = Math.min(max, Math.max(0, startLeft + (moveEvent.clientX - startX) * scale))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      measure()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  // 点击滚动条空白处，翻到对应位置。
  function jumpTrack(event: PointerEvent) {
    if (!rail || !track) return
    pending = null
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - thumb.width / 2) / Math.max(1, rect.width - thumb.width)))
    rail.scrollTo({ left: ratio * maxScroll(rail), behavior: 'smooth' })
  }

  // 轨道是条件渲染的：goals 从空变成有值时元素才出现，所以监听必须跟着 rail 走，
  // 不能放在 onMount 里（那时候元素还不存在，监听和 ResizeObserver 会全部丢掉，
  // 箭头和进度条就停在初始状态——点到底了也不置灰，看着就是"点了没反应"）。
  $effect(() => {
    const el = rail
    if (!el) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    el.addEventListener('pointerdown', forget, { passive: true })
    el.addEventListener('wheel', forget, { passive: true })
    el.addEventListener('touchstart', forget, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', measure)
      el.removeEventListener('pointerdown', forget)
      el.removeEventListener('wheel', forget)
      el.removeEventListener('touchstart', forget)
      clearTimeout(watchdog)
    }
  })

  $effect(() => {
    goals.length
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  })
</script>

{#if goals.length}
  <div class="goal-rail">
    <section bind:this={rail} class="goal-board" aria-label={ui.t('目标管理')} data-own-swipe>
      {#each goals as goal (goal.id)}
        <article class="card goal-board-card goal-slide" id={'goal-' + goal.id}>
          <header class="goal-card-head">
            <h2 class="goal-board-title">{goal.title}</h2>
            <div class="goal-card-actions">
              <button type="button" class="button icon-button" aria-label={ui.t('发给 AI')} onclick={() => ui.attach({ kind: 'goal', id: goal.id, label: goal.title })}><Icon name="spark" size={16} /></button>
              <button type="button" class="button icon-button" aria-label={ui.t('新建任务')} onclick={() => createTask(ui, goal.id)}><Icon name="plus" size={17} /></button>
              <button type="button" class="button icon-button" aria-label={ui.t('编辑目标')} onclick={() => { editing = goal; creating = false }}><Icon name="edit" size={16} /></button>
            </div>
          </header>
          <div class="goal-board-body">
            <TaskList tasks={goal.plan.tasks} dense />
            {#if !goal.plan.tasks.length}<div class="goal-board-empty">{ui.t('暂无任务')}</div>{/if}
            {#if goal.plan.total > goal.plan.tasks.length}
              <div class="goal-board-more">{ui.t('还有 {count} 项任务', { count: goal.plan.total - goal.plan.tasks.length })}</div>
            {/if}
          </div>
        </article>
      {/each}
      <button type="button" class="card goal-add-card goal-slide" aria-label={ui.t('新建目标')} onclick={() => { editing = null; creating = true }}>
        <span class="goal-add-mark"><Icon name="plus" size={34} /></span>
      </button>
    </section>
    {#if scrollable}
      <button type="button" class="button icon-button rail-arrow rail-prev" aria-label={ui.t('上一组目标')} disabled={atStart} onclick={() => step(-1)}>
        <Icon name="chevron" size={17} />
      </button>
      <button type="button" class="button icon-button rail-arrow rail-next" aria-label={ui.t('下一组目标')} disabled={atEnd} onclick={() => step(1)}>
        <Icon name="chevron" size={17} />
      </button>
      <div class="rail-scrollbar" bind:this={track} aria-hidden="true" onpointerdown={jumpTrack}>
        <!-- 纯视觉的拖动条：键盘和读屏用户用两侧箭头按钮操作轨道。 -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="rail-thumb" style:width={thumb.width + 'px'} style:transform={`translateX(${thumb.left}px)`} onpointerdown={dragThumb}></span>
      </div>
    {/if}
  </div>
{:else}
  <section class="card dashboard-goals goal-empty">
    <button type="button" class="goal-empty-add" aria-label={ui.t('新建目标')} onclick={() => { editing = null; creating = true }}><Icon name="plus" size={42} /></button>
  </section>
{/if}

{#if creating || editing}
  {#key editing?.id ?? 'new'}<GoalEditor goal={editing} onclose={() => { editing = null; creating = false }} />{/key}
{/if}
