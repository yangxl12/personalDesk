<script lang="ts">
  import type { DashboardGoal } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { createGoal, createTask } from '#lib/editors'
  import Icon from './Icon.svelte'
  import TaskList from './TaskList.svelte'
  import GoalEditor from './GoalEditor.svelte'

  let { goals }: { goals: DashboardGoal[] } = $props()
  const ui = useUi()
  let editing = $state<DashboardGoal | null>(null)
</script>

{#if goals.length}
  <section class="goal-board" aria-label={ui.t('目标管理')} data-own-swipe>
    {#each goals as goal (goal.id)}
      <article class="card goal-board-card goal-slide" id={'goal-' + goal.id}>
        <header class="goal-card-head">
          <h2 class="goal-board-title">{goal.title}</h2>
          <div class="goal-card-actions">
            <button type="button" class="button icon-button" aria-label={ui.t('发给 AI')} onclick={() => ui.attach({ kind: 'goal', id: goal.id, label: goal.title })}><Icon name="spark" size={16} /></button>
            <button type="button" class="button icon-button" aria-label={ui.t('新建任务')} onclick={() => createTask(ui, goal.id)}><Icon name="plus" size={17} /></button>
            <button type="button" class="button icon-button" aria-label={ui.t('编辑目标')} onclick={() => { editing = goal }}><Icon name="edit" size={16} /></button>
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
    <button type="button" class="card goal-add-card goal-slide" aria-label={ui.t('新建目标')} onclick={() => createGoal(ui)}>
      <span class="goal-add-mark"><Icon name="plus" size={34} /></span>
    </button>
  </section>
{:else}
  <section class="card dashboard-goals goal-empty">
    <button type="button" class="goal-empty-add" aria-label={ui.t('新建目标')} onclick={() => createGoal(ui)}><Icon name="plus" size={42} /></button>
  </section>
{/if}

{#if editing}
  {#key editing.id}<GoalEditor goal={editing} onclose={() => { editing = null }} />{/key}
{/if}
