<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import { commit, refreshModules, RequestError } from '#lib/client'
  import { randomId } from '#lib/random-id'
  import type { Task, TaskBrief } from '#lib/contracts/workspace'

  let { tasks, dense = false }: { tasks: TaskBrief[]; dense?: boolean } = $props()
  const ui = useUi()
  // 点击后先按请求结果回显，请求结束由服务端数据接管；失败则回滚原状态并提示。
  let pending = $state<Record<string, boolean>>({})
  const attempts = new Map<string, { version: number; done: boolean; key: string }>()
  const isDone = (task: TaskBrief) => pending[task.id] ?? !!task.done

  async function toggle(task: TaskBrief) {
    if (task.id in pending) return
    const done = !isDone(task)
    pending[task.id] = done
    let attempt = attempts.get(task.id)
    if (!attempt || attempt.version !== task.version || attempt.done !== done) {
      attempt = { version: task.version, done, key: randomId() }
      attempts.set(task.id, attempt)
    }
    try {
      const result = await commit<Task>('PATCH', '/tasks/' + task.id, { done, version: task.version }, attempt.key)
      attempts.delete(task.id)
      if (result.revisions) await refreshModules(result.revisions)
    } catch (failure) {
      // 409 说明版本已被别处改动，重新拉取后以服务端状态为准；其它失败保留幂等键供重试。
      if (failure instanceof RequestError && failure.status === 409) await refreshModules({ goals: 0 })
      ui.notify(ui.error(failure))
    } finally {
      delete pending[task.id]
    }
  }
</script>

<ul class="check-list" class:dense>
  {#each tasks as task (task.id)}
    <li class="check-row">
      <label class:done={isDone(task)}>
        <input type="checkbox" checked={isDone(task)} disabled={task.id in pending}
          onchange={() => void toggle(task)}>
        <span>{task.title}</span>
      </label>
    </li>
  {/each}
</ul>
