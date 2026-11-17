<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import { editGoal, editTask, remove } from '#lib/editors'
  import Icon from '#lib/components/Icon.svelte'
  import TaskList from '#lib/components/TaskList.svelte'
  let { data } = $props()
  const ui = useUi()
  let goal = $derived(data.goal)
  let tasks = $derived(data.tasks)
</script>

<a class="back-link" href="/goals"><Icon name="back" size={17} />{ui.t('目标管理')}</a>
<header class="page-head">
  <h1>{goal.title}</h1>
  <div class="page-actions">
    <button class="button quiet" type="button" onclick={() => ui.attach({ kind: 'goal', id: goal.id, label: goal.title })}><Icon name="spark" size={17} />{ui.t('发给 AI')}</button>
    <button class="button secondary" type="button" onclick={() => editGoal(ui, goal)}><Icon name="edit" size={17} />{ui.t('编辑')}</button>
    <button class="button icon-button" type="button" aria-label={ui.t('删除目标')} onclick={() => remove(ui, '/goals/' + goal.id,
      { version: goal.version, tasks: goal.total_tasks },
      goal.total_tasks
        ? ui.t('删除「{title}」及其 {tasks} 个任务？', { title: goal.title, tasks: goal.total_tasks })
        : ui.t('删除「{title}」？', { title: goal.title }), '/goals')}><Icon name="trash" size={17} /></button>
  </div>
</header>

<section class="card goal-board-card">
  <TaskList {tasks} goalId={goal.id} />
  {#if !tasks.length}<p class="goal-board-empty">{ui.t('暂无任务')}</p>{/if}
  <button type="button" class="button quiet add-task" onclick={() => editTask(ui, goal.id)}><Icon name="plus" size={16} />{ui.t('新建任务')}</button>
</section>
