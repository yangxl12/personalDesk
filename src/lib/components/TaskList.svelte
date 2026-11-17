<script lang="ts">
  import type { TaskBrief } from '#lib/contracts/workspace'

  let { tasks, dense = false }: { tasks: TaskBrief[]; dense?: boolean } = $props()
  // 勾选只是工作台上的视觉反馈：记录在任务的当前版本上，服务端版本变化后自动回到真实状态。
  let toggles = $state<Record<string, { version: number; done: boolean }>>({})
  const isDone = (task: TaskBrief) =>
    toggles[task.id]?.version === task.version ? toggles[task.id].done : !!task.done
</script>

<ul class="check-list" class:dense>
  {#each tasks as task (task.id)}
    <li class="check-row">
      <label class:done={isDone(task)}>
        <input type="checkbox" checked={isDone(task)} onchange={() => { toggles[task.id] = { version: task.version, done: !isDone(task) } }}>
        <span>{task.title}</span>
      </label>
    </li>
  {/each}
</ul>
