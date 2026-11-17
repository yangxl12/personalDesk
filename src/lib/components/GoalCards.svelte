<script lang="ts">
  import type { DashboardGoal } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import EmptyArt from './EmptyArt.svelte'
  import Icon from './Icon.svelte'
  import TaskList from './TaskList.svelte'

  let { goals }: { goals: DashboardGoal[] } = $props()
  const ui = useUi()
</script>

{#if goals.length}
  <section class="goal-board" aria-label={ui.t('目标管理')}>
    {#each goals as goal (goal.id)}
      <a class="card goal-board-card" href={'/goals/' + goal.id}>
        <div class="goal-board-head"><h2>{goal.title}</h2><Icon name="arrow" size={16} /></div>
        <TaskList tasks={goal.plan.tasks} readonly dense />
        {#if !goal.plan.tasks.length}<div class="goal-board-empty">{ui.t('暂无任务')}</div>{/if}
        {#if goal.plan.total > goal.plan.tasks.length}
          <div class="goal-board-more">{ui.t('还有 {count} 项任务', { count: goal.plan.total - goal.plan.tasks.length })}</div>
        {/if}
      </a>
    {/each}
  </section>
{:else}
  <section class="card dashboard-goals goal-empty">
    <EmptyArt size={144} label={ui.t('还没有目标')} />
  </section>
{/if}
