<script lang="ts">
  import { randomId } from '#lib/random-id'
  import { useUi } from '#lib/ui.svelte'
  import { commit, refreshModules, RequestError } from '#lib/client'
  import type { Task, TaskBrief } from '#lib/contracts/workspace'
  import { editTask, remove } from '#lib/editors'
  import Icon from './Icon.svelte'

  let { tasks, goalId = '', readonly = false, dense = false }: {
    tasks: TaskBrief[]; goalId?: string; readonly?: boolean; dense?: boolean
  } = $props()
  const ui = useUi()
  let busy = $state<{ id: string; done: boolean } | null>(null)
  let failure = $state('')
  const attempts = new Map<string, { version: number; done: boolean; key: string }>()

  async function toggle(task: TaskBrief, checked: boolean) {
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
    } catch (error) {
      if (error instanceof RequestError && error.status === 409) await refreshModules({ goals: 0 })
      failure = ui.error(error)
    } finally {
      busy = null
    }
  }
</script>

{#if readonly}
  <ul class="check-list" class:dense>
    {#each tasks as task (task.id)}
      <li class="check-row" class:done={!!task.done}>
        <span class="check-box" class:on={!!task.done} aria-hidden="true"></span>
        <span class="check-text">{task.title}</span>
      </li>
    {/each}
  </ul>
{:else}
  <ul class="check-list">
    {#each tasks as task (task.id)}
      {@const checked = busy?.id === task.id ? busy.done : !!task.done}
      <li class="check-row">
        <label class:done={checked}>
          <input type="checkbox" checked={checked} disabled={busy !== null} onchange={event => void toggle(task, event.currentTarget.checked)}>
          <span>{task.title}</span>
        </label>
        <div class="row-actions">
          <button type="button" class="button icon-button" aria-label={ui.t('编辑任务')} onclick={() => editTask(ui, goalId, task as Task)}><Icon name="edit" size={16} /></button>
          <button type="button" class="button icon-button" aria-label={ui.t('删除任务')} onclick={() => remove(ui, '/tasks/' + task.id,
            { version: task.version }, ui.t('删除「{title}」？', { title: task.title }))}><Icon name="trash" size={16} /></button>
        </div>
      </li>
    {/each}
  </ul>
{/if}
{#if failure}<p class="form-error" role="alert">{failure}</p>{/if}
