<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import { editGoal } from '#lib/editors'
  import Icon from '#lib/components/Icon.svelte'
  import Empty from '#lib/components/Empty.svelte'
  import Pager from '#lib/components/Pager.svelte'
  let { data } = $props()
  const ui = useUi()
</script>

<header class="page-head">
  <h1>{ui.t('目标管理')}</h1>
  <button class="button primary" type="button" onclick={() => editGoal(ui)}><Icon name="plus" size={17} />{ui.t('新建目标')}</button>
</header>
<nav class="filters" aria-label={ui.t('目标状态')}>
  {#each [['all', '全部'], ['active', '进行中'], ['done', '已完成']] as [status, label]}
    <a href={status === 'all' ? '/goals' : '?status=' + status} aria-current={status === data.status ? 'page' : undefined}
      class={'button ' + (status === data.status ? 'quiet' : 'secondary')}>{ui.t(label)}</a>
  {/each}
</nav>
{#if data.list.items.length}
  <div class="collection-grid">
    {#each data.list.items as goal (goal.id)}
      <a href={'/goals/' + goal.id} class="card goal-tile">
        <h2>{goal.title}</h2>
        <span class="goal-tile-foot">
          <span>{goal.total_tasks ? ui.t('已完成 {done}/{total} 项任务', { done: goal.done_tasks, total: goal.total_tasks }) : ui.t('暂无任务')}</span>
          <Icon name="arrow" size={15} />
        </span>
      </a>
    {/each}
  </div>
{:else}
  <section class="card"><Empty icon="goals" title={data.status === 'all' ? '还没有目标' : data.status === 'done' ? '暂无已完成的目标' : '暂无进行中的目标'} /></section>
{/if}
<Pager cursor={data.list.nextCursor} />
