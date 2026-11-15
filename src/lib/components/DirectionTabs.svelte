<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { Goal } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { editGoal } from '#lib/editors'
  import GoalWorkspace from './GoalWorkspace.svelte'
  import Icon from './Icon.svelte'
  import Empty from './Empty.svelte'

  let { goals, userId }: { goals: Goal[]; userId: string } = $props()
  const ui = useUi()
  let order = $state<string[]>([])
  let selected = $state('')
  let dragging = $state('')
  let announcement = $state('')
  let tabs = $state<HTMLDivElement>()
  let gesture: { pointer: number; id: string; x: number; y: number; moved: boolean; order: string[] } | null = null
  let suppressClickUntil = 0
  let storageKey = $derived('buxu:directions:' + userId)
  let ordered = $derived.by(() => {
    const remaining = new Map(goals.map(goal => [goal.id, goal]))
    const result: Goal[] = []
    for (const id of order) {
      const goal = remaining.get(id)
      if (goal) { result.push(goal); remaining.delete(id) }
    }
    return [...result, ...remaining.values()]
  })
  let active = $derived(ordered.find(goal => goal.id === selected) ?? ordered[0])

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (saved && Array.isArray(saved.order) && saved.order.every((id: unknown) => typeof id === 'string')) order = saved.order
      if (typeof saved?.selected === 'string') selected = saved.selected
    } catch { /* Keep the default order when browser storage is unavailable. */ }
    order = ordered.map(goal => goal.id)
    selected = active?.id ?? ''
  })

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({ order: ordered.map(goal => goal.id), selected: active?.id })) }
    catch { /* Tabs remain usable without browser storage. */ }
  }

  function select(id: string) {
    if (Date.now() < suppressClickUntil) return
    selected = id
    save()
  }

  function move(id: string, target: string) {
    const ids = ordered.map(goal => goal.id)
    const from = ids.indexOf(id)
    const to = ids.indexOf(target)
    if (from < 0 || to < 0 || from === to) return
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    order = ids
  }

  function start(event: PointerEvent, id: string) {
    if (event.button !== 0 || !(event.target instanceof Element) || !event.target.closest('[data-sort-handle]')) return
    gesture = { pointer: event.pointerId, id, x: event.clientX, y: event.clientY, moved: false, order: ordered.map(goal => goal.id) }
    tabs?.setPointerCapture(event.pointerId)
  }

  function drag(event: PointerEvent) {
    if (!gesture || gesture.pointer !== event.pointerId) return
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return
    gesture.moved = true
    dragging = gesture.id
    const tab = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-direction]')
    if (tab?.dataset.direction) move(gesture.id, tab.dataset.direction)
    if (!tabs) return
    const bounds = tabs.getBoundingClientRect()
    if (event.clientX > bounds.right - 32) tabs.scrollLeft += 18
    else if (event.clientX < bounds.left + 32) tabs.scrollLeft -= 18
  }

  function finish(event: PointerEvent, cancelled = false) {
    if (!gesture || gesture.pointer !== event.pointerId) return
    if (gesture.moved) {
      suppressClickUntil = Date.now() + 300
      if (cancelled) order = gesture.order
      else { save(); announce(gesture.id) }
    }
    gesture = null
    dragging = ''
  }

  function announce(id: string) {
    const index = ordered.findIndex(goal => goal.id === id)
    announcement = ui.t('「{title}」已移至第 {position} 位', { title: ordered[index].title, position: index + 1 })
  }

  async function keydown(event: KeyboardEvent, id: string) {
    const index = ordered.findIndex(goal => goal.id === id)
    let next = index
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    else if (event.key === 'ArrowRight') next = Math.min(ordered.length - 1, index + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = ordered.length - 1
    else return
    event.preventDefault()
    if (event.altKey) { move(id, ordered[next].id); save(); announce(id) }
    else select(ordered[next].id)
    await tick()
    tabs?.querySelector<HTMLButtonElement>('[data-direction="' + (event.altKey ? id : ordered[next].id) + '"]')?.focus()
  }
</script>

<section class="dashboard-directions" aria-label={ui.t('事项与任务')}>
  {#if active}
    <div class="direction-toolbar">
      <div bind:this={tabs} class="direction-tabs" role="tablist" tabindex="-1" aria-label={ui.t('目标方向')}
        onpointermove={drag} onpointerup={event => finish(event)}
        onpointercancel={event => finish(event, true)} onlostpointercapture={event => finish(event, true)}>
        {#each ordered as goal (goal.id)}
          <button id={'direction-' + goal.id} data-direction={goal.id} class={'direction-tab ' + goal.tone}
            class:dragging={dragging === goal.id} type="button" role="tab" aria-selected={active.id === goal.id}
            aria-controls={'direction-panel-' + goal.id} aria-describedby="direction-sort-help" tabindex={active.id === goal.id ? 0 : -1}
            onclick={() => select(goal.id)} onkeydown={event => void keydown(event, goal.id)}
            onpointerdown={event => start(event, goal.id)}>
            <span data-sort-handle class="direction-grip" title={ui.t('拖动调整顺序')}><Icon name="grip" size={16} /></span>
            <span class="direction-label">{goal.title}</span>
          </button>
        {/each}
      </div>
      <button class="button icon-button" type="button" aria-label={ui.t('新建目标')} onclick={() => editGoal(ui)}><Icon name="plus" size={18} /></button>
    </div>
    <p id="direction-sort-help" class="sr-only">{ui.t('拖动手柄调整方向顺序，也可按住 Alt 并使用左右方向键排序。')}</p>
    <div class="sr-only" aria-live="polite">{announcement}</div>
    <div id={'direction-panel-' + active.id} role="tabpanel" aria-labelledby={'direction-' + active.id} tabindex="0">
      {#key active.id}<GoalWorkspace goal={active} />{/key}
    </div>
  {:else}
    <div class="card"><Empty icon="goals" title="还没有目标">
      <button class="button quiet" type="button" onclick={() => editGoal(ui)}><Icon name="plus" size={17} />{ui.t('新建目标')}</button>
    </Empty></div>
  {/if}
</section>
