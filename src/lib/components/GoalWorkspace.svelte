<script lang="ts">
  import { untrack } from 'svelte'
  import { request } from '#lib/client'
  import { progress, type Goal, type Item, type List } from '#lib/contracts/workspace'
  import { editGoal, editItem } from '#lib/editors'
  import { useUi } from '#lib/ui.svelte'
  import Empty from './Empty.svelte'
  import GoalItem from './GoalItem.svelte'
  import Icon from './Icon.svelte'

  let { goal }: { goal: Goal } = $props()
  const ui = useUi()
  let list = $state<List<Item> | null>(null)
  let loading = $state(false)
  let failure = $state('')
  let generation = 0

  $effect(() => {
    const version = goal.version
    untrack(() => { void load('', version) })
    return () => { generation++ }
  })

  async function load(cursor = '', expectedVersion = goal.version) {
    const ticket = ++generation
    loading = true
    failure = ''
    try {
      const result = await request<List<Item>>('/goals/' + goal.id + '/items' + (cursor ? '?cursor=' + cursor : ''))
      if (ticket !== generation || expectedVersion !== goal.version) return
      list = { ...result.data, items: cursor ? [...(list?.items ?? []), ...result.data.items] : result.data.items }
    } catch (error) {
      if (ticket === generation) failure = ui.error(error)
    } finally {
      if (ticket === generation) loading = false
    }
  }
</script>

<div class={'goal-workspace ' + goal.tone}>
  <header class="goal-workspace-head">
    <div class="goal-workspace-title">
      <h1>{goal.title}</h1>
      {#if goal.description}<p>{goal.description}</p>{/if}
    </div>
    <div class="row-actions">
      <button class="button icon-button" type="button" aria-label={ui.t('编辑目标')} onclick={() => editGoal(ui, goal)}><Icon name="edit" size={17} /></button>
      <button class="button quiet" type="button" onclick={() => editItem(ui, goal.id)}><Icon name="plus" size={16} />{ui.t('新建事项')}</button>
    </div>
  </header>
  <div class="goal-workspace-progress">
    <progress value={progress(goal)} max="100" aria-label={ui.t('目标进度')}></progress>
    <small>{ui.t('已完成 {done}/{total} 项任务', { done: goal.done_tasks, total: goal.total_tasks })}</small>
    <strong>{progress(goal)}%</strong>
  </div>
  {#if failure}
    <p class="form-error" role="alert">{failure}</p>
    <button class="button secondary" type="button" onclick={() => load()}>{ui.t('重试')}</button>
  {/if}
  {#if loading && !list}<p class="muted" role="status">{ui.t('加载中…')}</p>{/if}
  {#if list}
    {#if list.items.length}
      <div class="item-list">{#each list.items as item (item.id)}<GoalItem {item} initiallyExpanded />{/each}</div>
    {:else if !failure}
      <Empty icon="goals" title="还没有事项" />
    {/if}
    {#if list.nextCursor}
      <button class="button secondary" type="button" disabled={loading} onclick={() => load(list?.nextCursor ?? '')}>{ui.t('加载更多')}</button>
    {/if}
  {/if}
</div>
