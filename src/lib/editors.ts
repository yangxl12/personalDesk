import { decimal, today, type Note, type NoteSummary, type Savings, type Transaction } from '#lib/contracts/workspace'
import type { WorkspaceUi } from '#lib/ui.svelte'
import { request } from '#lib/client'

export function createGoal(ui: WorkspaceUi) {
  ui.open({
    title: '新建目标',
    path: '/goals',
    method: 'POST',
    fields: [{ name: 'title', label: '目标名称', required: true }]
  })
}

export function createTask(ui: WorkspaceUi, goalId: string) {
  ui.open({
    title: '新建任务',
    path: '/goals/' + goalId + '/tasks',
    method: 'POST',
    fields: [{ name: 'title', label: '任务名称', required: true }]
  })
}

export function createNote(ui: WorkspaceUi) {
  ui.open({
    title: '新建思考',
    path: '/notes',
    method: 'POST',
    fields: [
      { name: 'title', label: '标题（选填）' },
      { name: 'body', label: '正文', type: 'textarea', required: true }
    ]
  })
}

export async function editNote(ui: WorkspaceUi, note: NoteSummary) {
  try {
    const { data } = await request<Note>('/notes/' + note.id)
    ui.open({
      title: '编辑思考',
      path: '/notes/' + note.id,
      method: 'PATCH',
      values: { version: data.version },
      fields: [
        { name: 'title', label: '标题（选填）', value: data.title },
        { name: 'body', label: '正文', type: 'textarea', value: data.body, required: true }
      ]
    })
  } catch (failure) {
    ui.notify(ui.error(failure))
  }
}

export function editTransaction(ui: WorkspaceUi, entry?: Transaction, refreshLocal?: (data: Record<string, string>) => Promise<void> | void) {
  ui.open({
    title: entry ? '编辑收支' : '记一笔',
    path: entry ? '/transactions/' + entry.id : '/transactions',
    method: entry ? 'PATCH' : 'POST',
    values: entry && { version: entry.version },
    fields: [
      { name: 'direction', label: '类型', type: 'select', value: entry?.direction ?? 'expense', options: [['expense', '支出'], ['income', '收入']] },
      { name: 'amount', label: '金额（元）', numeric: true, value: entry && decimal(entry.amount_cents), required: true },
      { name: 'occurredOn', label: '日期', type: 'date', value: entry?.occurred_on ?? today(ui.preferences.timezone), required: true },
      { name: 'note', label: '备注（选填）', value: entry?.note }
    ],
    refreshLocal
  })
}

export function editSavings(ui: WorkspaceUi, savings: Savings) {
  ui.open({
    title: '更新存款',
    path: '/savings',
    method: 'PATCH',
    values: { version: savings.version },
    fields: [
      { name: 'current', label: '当前存款（元）', numeric: true, value: savings.current_cents === null ? '' : decimal(savings.current_cents) },
      { name: 'target', label: '存款目标（元）', numeric: true, value: savings.target_cents === null ? '' : decimal(savings.target_cents) }
    ],
    toBody: values => ({ current: values.current.trim() || null, target: values.target.trim() || null })
  })
}

export function remove(ui: WorkspaceUi, path: string, values: object, description: string, href?: string, refreshLocal?: (data: Record<string, string>) => Promise<void> | void) {
  ui.open({
    title: '确认删除', method: 'DELETE', path, values, description, after: href ? () => href : undefined, refreshLocal
  })
}
