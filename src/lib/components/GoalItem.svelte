<script lang="ts">
  import { randomId } from '#lib/random-id'
  import { untrack } from 'svelte'
  import { useUi } from '#lib/ui.svelte'
  import { commit, refreshModules, request, RequestError } from '#lib/client'
  import { progress, type Item, type List, type Task } from '#lib/contracts/workspace'
  import { editItem, editTask, remove } from '#lib/editors'
  import Icon from './Icon.svelte'

  let { item, initiallyExpanded = false }: { item: Item; initiallyExpanded?: boolean } = $props()
  const ui = useUi()
  let expanded = $state(untrack(() => initiallyExpanded))
  let list = $state<List<Task> | null>(null)
  let failure = $state('')
  let loading = $state(false)
  let busy = $state<{ id: string; done: boolean } | null>(null)
  let generation = 0
  const attempts = new Map<string, { version: number; done: boolean; key: string }>()

  $effect(() => {
    const version = item.version
    if (expanded) untrack(() => { void load('', version) })
  })

  async function load(cursor = '', expectedVersion = item.version) {
    const ticket = ++generation
    loading = true
    failure = ''
    try {
      const result = await request<List<Task>>('/items/' + item.id + '/tasks' + (cursor ? '?cursor=' + cursor : ''))
      if (ticket !== generation || expectedVersion !== item.version) return
      list = { ...result.data, items: cursor ? [...(list?.items ?? []), ...result.data.items] : result.data.items }
    } catch (error) {
      if (ticket === generation) failure = ui.error(error)
    } finally {
      if (ticket === generation) loading = false
    }
  }

  async function toggle(task: Task, checked: boolean) {
    if (busy) return
    busy = { id: task.id, done: checked }
    failure = ''
    let attempt = attempts.get(task.id)
    if (!attempt || attempt.version !== task.version || attempt.done !== checked) {
      attempt = { version: task.version, done: checked, key: randomId() }
      attempts.set(task.id, attempt)
    }
    try {
      const result = await commit<Task>('PATCH', '/tasks/' + task.id, { done: checked, version: task.version }, attempt.key)
      attempts.delete(task.id)
      if (result.revisions) await refreshModules(result.revisions)
      await load()
    } catch (error) {
      if (error instanceof RequestError && error.status === 409) {
        await refreshModules({ goals: 0 })
        await load()
      }
      failure = ui.error(error)
    } finally {
      busy = null
    }
  }
</script>

<section class="card item-card">
  <header>
    <div>
      <h3>{item.title}</h3>
      <small>{item.total_tasks ? ui.t('已完成 {done}/{total} 项任务', { done: item.done_tasks, total: item.total_tasks }) : ui.t('暂无任务')}</small>
    </div>
    <div class="row-actions">
      <button type="button" class="button icon-button" aria-label={ui.t('编辑事项')} onclick={() => editItem(ui, item.goal_id, item)}><Icon name="edit" size={17} /></button>
      <button type="button" class="button icon-button" aria-label={ui.t('删除事项')} onclick={() => remove(ui, '/items/' + item.id,
        { version: item.version, tasks: item.total_tasks }, ui.t('删除「{title}」及其 {tasks} 个任务？', { title: item.title, tasks: item.total_tasks }))}><Icon name="trash" size={17} /></button>
    </div>
  </header>
  <progress value={progress(item)} max="100" aria-label={item.title}></progress>
  <button type="button" class="button task-toggle" aria-expanded={expanded} aria-controls={'tasks-' + item.id}
    onclick={() => { expanded = !expanded }}><Icon name={expanded ? 'down' : 'chevron'} size={15} />{ui.t(expanded ? '收起任务' : '展开任务')}</button>
  <div id={'tasks-' + item.id} hidden={!expanded}>
    {#if failure}
      <p class="form-error" role="alert">{failure}</p>
      <button class="button secondary" type="button" onclick={() => load()}>{ui.t('刷新任务')}</button>
    {/if}
    {#if loading && !list}<p class="muted">{ui.t('加载中…')}</p>{/if}
    {#if list}
      <div class="task-list">
        {#each list.items as task (task.id)}
          {@const checked = busy?.id === task.id ? busy.done : !!task.done}
          <div class="task-row">
            <label class:done={checked}>
              <input type="checkbox" checked={checked} disabled={busy !== null} onchange={event => void toggle(task, event.currentTarget.checked)}>
              <span>{task.title}</span>
            </label>
            <div class="row-actions">
              <button type="button" class="button icon-button" aria-label={ui.t('编辑任务')} onclick={() => editTask(ui, item.id, load, task)}><Icon name="edit" size={17} /></button>
              <button type="button" class="button icon-button" aria-label={ui.t('删除任务')} onclick={() => remove(ui, '/tasks/' + task.id,
                { version: task.version }, ui.t('删除「{title}」？', { title: task.title }), undefined, load)}><Icon name="trash" size={17} /></button>
            </div>
          </div>
        {/each}
      </div>
      {#if list.nextCursor}
        <button type="button" class="button secondary" disabled={loading} onclick={() => load(list?.nextCursor ?? '')}>{ui.t('加载更多')}</button>
      {/if}
    {/if}
    <button type="button" class="button quiet" onclick={() => editTask(ui, item.id, load)}><Icon name="plus" size={16} />{ui.t('新建任务')}</button>
  </div>
</section>
