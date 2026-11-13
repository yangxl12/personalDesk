<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import { progress } from '#lib/contracts/workspace'
  import { editGoal, editItem, remove } from '#lib/editors'
  import Icon from '#lib/components/Icon.svelte'
  import Empty from '#lib/components/Empty.svelte'
  import Pager from '#lib/components/Pager.svelte'
  import GoalItem from '#lib/components/GoalItem.svelte'
  let { data } = $props()
  const ui = useUi()
  let goal = $derived(data.goal)
</script>

<a class="back-link" href="/goals"><Icon name="back" size={17} />{ui.t('目标管理')}</a>
<header class="page-head">
  <div><h1>{goal.title}</h1>{#if goal.description}<p>{goal.description}</p>{/if}</div>
  <div class="page-actions">
    <button class="button quiet" type="button" onclick={() => ui.attach({ kind: 'goal', id: goal.id, label: goal.title })}><Icon name="spark" size={17} />{ui.t('发给 AI')}</button>
    <button class="button secondary" type="button" onclick={() => editGoal(ui, goal)}><Icon name="edit" size={17} />{ui.t('编辑')}</button>
    <button class="button icon-button" type="button" aria-label={ui.t('删除目标')} onclick={() => remove(ui, '/goals/' + goal.id,
      { version: goal.version, items: goal.items, tasks: goal.total_tasks },
      ui.t('删除「{title}」及其 {items} 个事项和 {tasks} 个任务？', { title: goal.title, items: goal.items ?? 0, tasks: goal.total_tasks }), '/goals')}><Icon name="trash" size={17} /></button>
  </div>
</header>

<section class={'card detail-progress ' + goal.tone}>
  <span class="goal-icon"><Icon name="goals" /></span>
  <div class="detail-progress-body">
    <div>
      <strong>{ui.t('目标进度')} {progress(goal)}%</strong>
      <small>{goal.total_tasks ? ui.t('已完成 {done}/{total} 项任务', { done: goal.done_tasks, total: goal.total_tasks }) : ui.t('暂无任务')}</small>
    </div>
    <progress value={progress(goal)} max="100" aria-label={ui.t('目标进度')}></progress>
  </div>
  <span class="badge" class:complete={progress(goal) === 100}>{ui.t(progress(goal) === 100 ? '已完成' : '进行中')}</span>
</section>
<div class="section-divider">
  <h2>{ui.t('事项')}</h2>
  <button type="button" class="button primary" onclick={() => editItem(ui, goal.id)}><Icon name="plus" size={17} />{ui.t('新建事项')}</button>
</div>
{#if data.list.items.length}
  <div class="item-list">{#each data.list.items as item (item.id)}<GoalItem {item} />{/each}</div>
{:else}
  <section class="card"><Empty icon="goals" title="还没有事项" /></section>
{/if}
<Pager cursor={data.list.nextCursor} />
