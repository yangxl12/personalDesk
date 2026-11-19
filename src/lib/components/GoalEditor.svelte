<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { commit, refreshModules, request } from '#lib/client'
  import type { DashboardGoal, Goal, GoalTask, Revisions } from '#lib/contracts/workspace'
  import { randomId } from '#lib/random-id'
  import { lockScroll } from '#lib/scroll-lock'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  let { goal, onclose }: { goal: DashboardGoal; onclose: () => void } = $props()
  const ui = useUi()
  let dialog: HTMLDialogElement
  let title = $state(untrack(() => goal.title))
  let tasks = $state<GoalTask[]>([])
  let selected = $state<string[]>([])
  let loading = $state(true)
  let busy = $state(false)
  let message = $state('')
  let confirming = $state<'goal' | 'tasks' | null>(null)

  onMount(() => {
    dialog.showModal()
    void load()
    return lockScroll()
  })

  async function load() {
    loading = true
    try {
      tasks = (await request<GoalTask[]>('/goals/' + goal.id + '/tasks')).data
    } catch (failure) {
      message = ui.error(failure)
    } finally {
      loading = false
    }
  }

  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]
  }

  async function removeTasks(ids: string[]) {
    const revisions: Revisions = {}
    for (const task of tasks.filter(item => ids.includes(item.id))) {
      const result = await commit('DELETE', '/tasks/' + task.id, { version: task.version }, randomId())
      if (result.revisions) Object.assign(revisions, result.revisions)
    }
    await refreshModules(revisions)
    tasks = tasks.filter(task => !ids.includes(task.id))
    selected = []
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (busy) return
    const next = title.trim()
    if (next === goal.title && !selected.length) {
      onclose()
      return
    }
    busy = true
    message = ''
    try {
      // 目标版本会随任务增删变化，保存前取最新版本，避免同一次弹窗内的连续操作互相冲突。
      const latest = (await request<Goal>('/goals/' + goal.id)).data
      const result = await commit('PATCH', '/goals/' + goal.id, {
        title: next, description: latest.description, tone: latest.tone, version: latest.version
      }, randomId())
      if (result.revisions) await refreshModules(result.revisions)
      if (selected.length) await removeTasks(selected)
      onclose()
      ui.notify('已保存')
    } catch (failure) {
      message = ui.error(failure)
    } finally {
      busy = false
    }
  }

  async function deleteSelected() {
    busy = true
    message = ''
    try {
      await removeTasks(selected)
      confirming = null
    } catch (failure) {
      message = ui.error(failure)
      selected = []
      await load()
    } finally {
      busy = false
    }
  }

  async function deleteGoal() {
    busy = true
    message = ''
    try {
      const latest = (await request<Goal>('/goals/' + goal.id)).data
      const result = await commit('DELETE', '/goals/' + goal.id, { version: latest.version, tasks: latest.total_tasks }, randomId())
      if (result.revisions) await refreshModules(result.revisions)
      onclose()
      ui.notify('已删除')
    } catch (failure) {
      message = ui.error(failure)
      confirming = null
    } finally {
      busy = false
    }
  }

  function cancel(event: Event) {
    event.preventDefault()
    if (!busy) onclose()
  }
</script>

<dialog bind:this={dialog} aria-labelledby="goal-editor-title" oncancel={cancel}>
  {#if confirming}
    <div class="dialog-head">
      <h2 id="goal-editor-title">{ui.t('确认删除')}</h2>
      <button type="button" class="button icon-button" aria-label={ui.t('关闭')} disabled={busy} onclick={onclose}><Icon name="close" size={18} /></button>
    </div>
    <div class="dialog-fields">
      <p class="delete-copy">
        {confirming === 'goal'
          ? goal.total_tasks
            ? ui.t('删除「{title}」及其 {tasks} 个任务？', { title: goal.title, tasks: goal.total_tasks })
            : ui.t('删除「{title}」？', { title: goal.title })
          : ui.t('删除选中的 {count} 个任务？', { count: selected.length })}
      </p>
      {#if message}<p class="form-error" role="alert">{message}</p>{/if}
    </div>
    <footer>
      <button type="button" class="button secondary" disabled={busy} onclick={() => { confirming = null; message = '' }}>{ui.t('返回')}</button>
      <button type="button" class="button danger" disabled={busy}
        onclick={() => confirming === 'goal' ? void deleteGoal() : void deleteSelected()}>{ui.t(busy ? '正在删除…' : '确认删除')}</button>
    </footer>
  {:else}
    <form onsubmit={save}>
      <header class="dialog-head">
        <h2 id="goal-editor-title">{ui.t('编辑目标')}</h2>
        <button type="button" class="button icon-button" aria-label={ui.t('关闭')} disabled={busy} onclick={onclose}><Icon name="close" size={18} /></button>
      </header>
      <div class="dialog-fields">
        <label class="field">
          <span>{ui.t('目标名称')}</span>
          <input bind:value={title} required maxlength={120} aria-invalid={!!message}>
        </label>
        <div class="task-picker">
          <div class="task-picker-head">
            <span>{ui.t('任务')}</span>
            <button type="button" class="button icon-button" aria-label={ui.t('删除所选任务')} disabled={!selected.length || busy}
              onclick={() => { confirming = 'tasks'; message = '' }}>
              <Icon name="trash" size={16} />
              {#if selected.length}<b class="task-picker-count">{selected.length}</b>{/if}
            </button>
          </div>
          {#if loading}
            <p class="task-picker-empty">{ui.t('加载中…')}</p>
          {:else if !tasks.length}
            <p class="task-picker-empty">{ui.t('暂无任务')}</p>
          {:else}
            <ul class="task-picker-list">
              {#each tasks as task (task.id)}
                <li>
                  <label class="task-picker-row">
                    <input type="checkbox" checked={selected.includes(task.id)} onchange={() => toggle(task.id)}>
                    <span class:done={!!task.done}>{task.title}</span>
                  </label>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if message}<p class="form-error" role="alert">{message}</p>{/if}
      </div>
      <footer>
        <button type="button" class="button icon-button footer-delete" aria-label={ui.t('删除目标')} disabled={busy}
          onclick={() => { confirming = 'goal'; message = '' }}><Icon name="trash" size={17} /></button>
        <button type="button" class="button secondary" disabled={busy} onclick={onclose}>{ui.t('取消')}</button>
        <button type="submit" class="button primary" disabled={busy}>{ui.t(busy ? '正在保存…' : '保存')}</button>
      </footer>
    </form>
  {/if}
</dialog>
