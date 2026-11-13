import { decimal, today, type Goal, type Item, type Note, type Savings, type Task, type Transaction } from '#lib/contracts/workspace'
import type { WorkspaceUi } from '#lib/ui.svelte'

export function editGoal(ui: WorkspaceUi, goal?: Goal) {
  ui.open({
    title: goal ? '编辑目标' : '新建目标',
    path: goal ? '/goals/' + goal.id : '/goals',
    method: goal ? 'PATCH' : 'POST',
    values: goal && { version: goal.version },
    fields: [
      { name: 'title', label: '目标名称', value: goal?.title, required: true },
      { name: 'description', label: '目标说明', type: 'textarea', value: goal?.description },
      { name: 'tone', label: '颜色', type: 'select', value: goal?.tone, options: [['violet', '紫色'], ['mint', '绿色'], ['amber', '橙色']] }
    ],
    after: goal ? undefined : data => '/goals/' + data.id
  })
}

export function editItem(ui: WorkspaceUi, goalId: string, item?: Item) {
  ui.open({
    title: item ? '编辑事项' : '新建事项',
    path: item ? '/items/' + item.id : '/goals/' + goalId + '/items',
    method: item ? 'PATCH' : 'POST',
    values: item && { version: item.version },
    fields: [{ name: 'title', label: '事项名称', value: item?.title, required: true }]
  })
}

export function editTask(ui: WorkspaceUi, itemId: string, refresh: () => Promise<void>, task?: Task) {
  ui.open({
    title: task ? '编辑任务' : '新建任务',
    path: task ? '/tasks/' + task.id : '/items/' + itemId + '/tasks',
    method: task ? 'PATCH' : 'POST',
    values: task && { version: task.version },
    fields: [{ name: 'title', label: '任务名称', value: task?.title, required: true }],
    refreshLocal: refresh
  })
}

export function editNote(ui: WorkspaceUi, note?: Note) {
  ui.open({
    title: note ? '编辑思考' : '新建思考',
    path: note ? '/notes/' + note.id : '/notes',
    method: note ? 'PATCH' : 'POST',
    values: note && { version: note.version },
    fields: [
      { name: 'title', label: '标题（选填）', value: note?.title },
      { name: 'body', label: '正文', type: 'textarea', value: note?.body, required: true }
    ],
    after: note ? undefined : data => '/notes/' + data.id
  })
}

export function editTransaction(ui: WorkspaceUi, entry?: Transaction) {
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
    after: data => data.occurred_on ? '/finance?month=' + data.occurred_on.slice(0, 7) : location.pathname + location.search
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

export function remove(ui: WorkspaceUi, path: string, values: object, description: string, href?: string, refreshLocal?: () => Promise<void>) {
  ui.open({
    title: '确认删除', method: 'DELETE', path, values, description, after: href ? () => href : undefined, refreshLocal
  })
}
