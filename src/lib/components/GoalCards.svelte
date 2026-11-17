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
      <article class="card goal-board-card goal-slide">
        <h2 class="goal-board-title">{goal.title}</h2>
        <div class="goal-board-body">
          <TaskList tasks={goal.plan.tasks} readonly dense />
          {#if !goal.plan.tasks.length}<div class="goal-board-empty">{ui.t('暂无任务')}</div>{/if}
          {#if goal.plan.total > goal.plan.tasks.length}
            <div class="goal-board-more">{ui.t('还有 {count} 项任务', { count: goal.plan.total - goal.plan.tasks.length })}</div>
          {/if}
        </div>
        <a class="goal-board-go" href={'/goals/' + goal.id} aria-label={ui.t('查看目标')}><Icon name="chevron" size={18} /></a>
      </article>
    {/each}
  </section>
{:else}
  <section class="card dashboard-goals goal-empty">
    <EmptyArt size={144} label={ui.t('还没有目标')} />
  </section>
{/if}
