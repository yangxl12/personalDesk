<script lang="ts">
  import { onMount } from 'svelte'
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

  // 桌面端没有触摸滑动，靠箭头和可拖动的滚动条移动轨道。
  function measure() {
    if (!rail) return
    const max = rail.scrollWidth - rail.clientWidth
    scrollable = max > 4
    atStart = rail.scrollLeft <= 2
    atEnd = rail.scrollLeft >= max - 2
    if (!scrollable) {
      thumb = { width: 0, left: 0 }
      return
    }
    const width = Math.max(48, rail.clientWidth * rail.clientWidth / rail.scrollWidth)
    const left = rail.scrollLeft / max * (rail.clientWidth - width)
    thumb = { width, left }
  }

  function step(direction: 1 | -1) {
    if (!rail) return
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.82, 260), behavior: 'smooth' })
  }

  function dragThumb(event: PointerEvent) {
    if (!rail || !track) return
    event.preventDefault()
    event.stopPropagation()
    const rect = track.getBoundingClientRect()
    const startX = event.clientX
    const startLeft = rail.scrollLeft
    const max = rail.scrollWidth - rail.clientWidth
    const scale = max / Math.max(1, rect.width - thumb.width)
    const move = (moveEvent: PointerEvent) => {
      rail!.scrollLeft = Math.min(max, Math.max(0, startLeft + (moveEvent.clientX - startX) * scale))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  // 点击滚动条空白处，翻到对应位置。
  function jumpTrack(event: PointerEvent) {
    if (!rail || !track) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - thumb.width / 2) / Math.max(1, rect.width - thumb.width)))
    rail.scrollTo({ left: ratio * (rail.scrollWidth - rail.clientWidth), behavior: 'smooth' })
  }

  onMount(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (rail) observer.observe(rail)
    rail?.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      rail?.removeEventListener('scroll', measure)
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
