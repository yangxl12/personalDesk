<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import { commit, refreshModules, request } from '#lib/client'
  import type { DashboardGoal, Goal, GoalTask, Revisions } from '#lib/contracts/workspace'
  import { randomId } from '#lib/random-id'
  import { lockScroll } from '#lib/scroll-lock'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  // 弹窗里任务是本地草稿：id 为空的等保存时新建，改过的按原版本提交，删掉的行记账后统一删除。
  type Draft = {
    key: string; id: string | null; title: string; done: boolean; version: number
    savedTitle: string; savedDone: boolean
  }

  // 新建和编辑共用同一个弹窗：传 goal 就是编辑，不传就是新建。
  let { goal = null, onclose }: { goal?: DashboardGoal | null; onclose: () => void } = $props()
  const ui = useUi()
  let dialog: HTMLDialogElement
  let input = $state<HTMLInputElement>()
  let list = $state<HTMLElement>()
  let title = $state(untrack(() => goal?.title ?? ''))
  let rows = $state<Draft[]>([])
  let loading = $state(untrack(() => !!goal))
  let busy = $state(false)
  let message = $state('')
  // 批量删除后的一次性提示：列表空了也要让用户知道刚才发生了什么。
  let notice = $state('')
  // 勾选中的草稿行（存 key，改名不影响）。
  let selected = $state<string[]>([])
  let confirming = $state(false)
  // 已落库、待删除的任务：id → 版本号。
  let removed = $state<Record<string, number>>({})

  let dirty = $derived(!!goal && (
    title.trim() !== goal.title ||
    Object.keys(removed).length > 0 ||
    rows.some(row => row.title.trim() !== row.savedTitle || row.done !== row.savedDone)
  ))

  onMount(() => {
    dialog.showModal()
    if (goal) void load()
    // 新建时直接聚焦名称输入，省得再点一下。
    else input?.focus()
    return lockScroll()
  })

  async function load() {
    const id = goal?.id
    if (!id) return
    loading = true
    try {
      const tasks = (await request<GoalTask[]>('/goals/' + id + '/tasks')).data
      rows = tasks.map(task => ({
        key: task.id, id: task.id, title: task.title, done: !!task.done, version: task.version,
        savedTitle: task.title, savedDone: !!task.done
      }))
      removed = {}
      selected = []
      notice = ''
    } catch (failure) {
      message = ui.error(failure)
    } finally {
      loading = false
    }
  }

  function taskFields() {
    return list?.querySelectorAll<HTMLInputElement>('input.goal-task-input')
  }

  async function addRow() {
    // 移动端只在用户手势的同步栈里认 focus（才会拉起输入法）。所以先在同一个栈里把焦点落到一个
    // 已存在的输入框上，等新行渲染出来再把焦点搬过去——此时键盘已经开着，换焦点不会被拦。
    // 这一步用 preventScroll，免得焦点先跳到名称框把弹窗滚到顶部。
    const active = document.activeElement
    const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    if (!typing) {
      const fields = taskFields()
      ;(fields?.[fields.length - 1] ?? input)?.focus({ preventScroll: true })
    }
    rows = [...rows, {
      key: randomId(), id: null, title: '', done: false, version: 0, savedTitle: '', savedDone: false
    }]
    notice = ''
    await tick()
    const fields = taskFields()
    fields?.[fields.length - 1]?.focus()
    if (list) list.scrollTop = list.scrollHeight
  }

  function removeRow(row: Draft) {
    if (row.id) removed = { ...removed, [row.id]: row.version }
    rows = rows.filter(item => item.key !== row.key)
    selected = selected.filter(key => key !== row.key)
  }

  function isSelected(row: Draft) {
    return selected.includes(row.key)
  }

  function toggleRow(row: Draft) {
    selected = isSelected(row) ? selected.filter(key => key !== row.key) : [...selected, row.key]
  }

  // 批量删除选中的行：落库过的记进 removed（保存时统一 DELETE），新建或改过的直接丢弃。
  function deleteSelected() {
    if (!selected.length) return
    const keys = new Set(selected)
    const next = { ...removed }
    let count = 0
    for (const row of rows) {
      if (!keys.has(row.key)) continue
      if (row.id) next[row.id] = row.version
      count++
    }
    removed = next
    rows = rows.filter(row => !keys.has(row.key))
    selected = []
    notice = ui.t('已删除 {count} 个任务，保存后生效。', { count })
  }

  async function deleteTask(id: string, version: number, revisions: Revisions) {
    const result = await commit('DELETE', '/tasks/' + id, { version }, randomId())
    if (result.revisions) Object.assign(revisions, result.revisions)
  }

  // 把草稿同步到库里：新建的 POST，改过的 PATCH，删掉的 DELETE。
  async function syncTasks(goalId: string, revisions: Revisions) {
    for (const [id, version] of Object.entries(removed)) await deleteTask(id, version, revisions)
    removed = {}
    for (const row of rows) {
      const name = row.title.trim()
      if (!name) {
        // 名字被清空等于删掉这条任务。
        if (row.id) await deleteTask(row.id, row.version, revisions)
        continue
      }
      if (!row.id) {
        const created = await commit<GoalTask>('POST', '/goals/' + goalId + '/tasks', { title: name }, randomId())
        if (created.revisions) Object.assign(revisions, created.revisions)
        if (row.done) {
          const marked = await commit('PATCH', '/tasks/' + created.data.id, { done: true, version: created.data.version }, randomId())
          if (marked.revisions) Object.assign(revisions, marked.revisions)
        }
        continue
      }
      const body: { title?: string; done?: boolean; version: number } = { version: row.version }
      if (name !== row.savedTitle) body.title = name
      if (row.done !== row.savedDone) body.done = row.done
      if (body.title === undefined && body.done === undefined) continue
      const patched = await commit('PATCH', '/tasks/' + row.id, body, randomId())
      if (patched.revisions) Object.assign(revisions, patched.revisions)
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (busy) return
    const next = title.trim()
    if (!next) return
    if (goal && !dirty) {
      onclose()
      return
    }
    busy = true
    message = ''
    const revisions: Revisions = {}
    try {
      const current = goal
      let goalId: string
      if (!current) {
        const created = await commit<Goal>('POST', '/goals', { title: next, description: '', tone: 'violet' }, randomId())
        if (created.revisions) Object.assign(revisions, created.revisions)
        goalId = created.data.id
      } else {
        goalId = current.id
        if (next !== current.title) {
          // 目标版本会随任务增删变化，保存前取最新版本，避免同一次弹窗内的连续操作互相冲突。
          const latest = (await request<Goal>('/goals/' + goalId)).data
          const result = await commit('PATCH', '/goals/' + goalId, {
            title: next, description: latest.description, tone: latest.tone, version: latest.version
          }, randomId())
          if (result.revisions) Object.assign(revisions, result.revisions)
        }
      }
      await syncTasks(goalId, revisions)
      await refreshModules(revisions)
      onclose()
      ui.notify(ui.t(goal ? '已保存' : '已创建'))
    } catch (failure) {
      message = ui.error(failure)
      if (goal) await load()
    } finally {
      busy = false
    }
  }

  async function deleteGoal() {
    const id = goal?.id
    if (!id) return
    busy = true
    message = ''
    try {
      const latest = (await request<Goal>('/goals/' + id)).data
      const result = await commit('DELETE', '/goals/' + id, { version: latest.version, tasks: latest.total_tasks }, randomId())
      if (result.revisions) await refreshModules(result.revisions)
      onclose()
      ui.notify(ui.t('已删除'))
    } catch (failure) {
      message = ui.error(failure)
      confirming = false
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
        {goal?.total_tasks
          ? ui.t('删除「{title}」及其 {tasks} 个任务？', { title: goal?.title ?? '', tasks: goal?.total_tasks ?? 0 })
          : ui.t('删除「{title}」？', { title: goal?.title ?? '' })}
      </p>
      {#if message}<p class="form-error" role="alert">{message}</p>{/if}
    </div>
    <footer>
      <button type="button" class="button secondary" disabled={busy} onclick={() => { confirming = false; message = '' }}>{ui.t('返回')}</button>
      <button type="button" class="button danger" disabled={busy} onclick={() => void deleteGoal()}>{ui.t(busy ? '正在删除…' : '确认删除')}</button>
    </footer>
  {:else}
    <form onsubmit={save}>
      <header class="dialog-head">
        <h2 id="goal-editor-title">{ui.t(goal ? '编辑目标' : '新建目标')}</h2>
        <button type="button" class="button icon-button" aria-label={ui.t('关闭')} disabled={busy} onclick={onclose}><Icon name="close" size={18} /></button>
      </header>
      <div class="dialog-fields">
        <label class="field">
          <span>{ui.t('目标名称')}</span>
          <input bind:this={input} bind:value={title} required maxlength={120} aria-invalid={!!message}>
        </label>
        <div class="task-picker">
          <div class="task-picker-head">
            <span>{ui.t('任务')}</span>
            <div class="task-picker-tools">
              {#if selected.length}
                <span class="task-picker-selected">{ui.t('已选 {count} 项', { count: selected.length })}</span>
              {/if}
              <button type="button" class="button icon-button task-picker-clear" class:armed={selected.length > 0}
                aria-label={ui.t('删除选中的任务')} title={ui.t('删除选中的任务')}
                disabled={busy || loading || !selected.length} onclick={deleteSelected}>
                <Icon name="trash" size={16} />
              </button>
              <button type="button" class="button icon-button" aria-label={ui.t('添加任务')} disabled={busy || loading} onclick={() => void addRow()}>
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
          {#if loading}
            <p class="task-picker-empty">{ui.t('加载中…')}</p>
          {:else if !rows.length}
            <p class="task-picker-empty" role="status">{notice || ui.t('暂无任务，点右上角添加。')}</p>
          {:else}
            <ul class="task-picker-list" bind:this={list}>
              {#each rows as row (row.key)}
                <li class="task-picker-row" class:selected={isSelected(row)}>
                  <input type="checkbox" checked={isSelected(row)} aria-label={ui.t('选择任务')}
                    onchange={() => toggleRow(row)}>
                  <input class="goal-task-input" class:done={row.done} bind:value={row.title}
                    maxlength={120} placeholder={ui.t('任务名称')} aria-label={ui.t('任务名称')}>
                  <button type="button" class="button icon-button goal-task-remove" aria-label={ui.t('删除任务')}
                    onclick={() => removeRow(row)}><Icon name="trash" size={16} /></button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if message}<p class="form-error" role="alert">{message}</p>{/if}
      </div>
      <footer>
        {#if goal}
          <button type="button" class="button icon-button footer-delete" aria-label={ui.t('删除目标')} disabled={busy}
            onclick={() => { confirming = true; message = '' }}><Icon name="trash" size={17} /></button>
        {/if}
        <button type="button" class="button secondary" disabled={busy} onclick={onclose}>{ui.t('取消')}</button>
        <button type="submit" class="button primary" disabled={busy}>{ui.t(busy ? '正在保存…' : '保存')}</button>
      </footer>
    </form>
  {/if}
</dialog>
