<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { Goal } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import GoalWorkspace from './GoalWorkspace.svelte'
  import Empty from './Empty.svelte'

  let { goals, userId }: { goals: Goal[]; userId: string } = $props()
  const ui = useUi()
  let selected = $state('')
  let tabs = $state<HTMLDivElement>()
  let storageKey = $derived('buxu:directions:' + userId)
  let active = $derived(goals.find(goal => goal.id === selected) ?? goals[0])

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (typeof saved?.selected === 'string') selected = saved.selected
    } catch { /* Keep the default selection when browser storage is unavailable. */ }
    selected = active?.id ?? ''
  })

  function select(id: string) {
    selected = id
    try { localStorage.setItem(storageKey, JSON.stringify({ selected: id })) }
    catch { /* Tabs remain usable without browser storage. */ }
  }

  async function keydown(event: KeyboardEvent, id: string) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const index = goals.findIndex(goal => goal.id === id)
    let next = index
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    else if (event.key === 'ArrowRight') next = Math.min(goals.length - 1, index + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = goals.length - 1
    else return
    event.preventDefault()
    select(goals[next].id)
    await tick()
    tabs?.querySelector<HTMLButtonElement>('[data-direction="' + goals[next].id + '"]')?.focus()
  }
</script>

<section class="card dashboard-directions" aria-label={ui.t('事项与任务')}>
  {#if active}
    <div class="direction-toolbar">
      <div bind:this={tabs} class="direction-tabs" role="tablist" tabindex="-1" aria-label={ui.t('目标方向')}>
        {#each goals as goal (goal.id)}
          <button id={'direction-' + goal.id} data-direction={goal.id} class={'direction-tab ' + goal.tone}
            type="button" role="tab" aria-selected={active.id === goal.id}
            aria-controls={'direction-panel-' + goal.id} tabindex={active.id === goal.id ? 0 : -1}
            onclick={() => select(goal.id)} onkeydown={event => void keydown(event, goal.id)}>
            <span class="direction-label">{goal.title}</span>
          </button>
        {/each}
      </div>
    </div>
    <div id={'direction-panel-' + active.id} role="tabpanel" aria-labelledby={'direction-' + active.id} tabindex="0">
      {#key active.id}<GoalWorkspace goal={active} />{/key}
    </div>
  {:else}
    <Empty icon="goals" title="还没有目标" />
  {/if}
</section>
