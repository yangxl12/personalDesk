<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { commit, refreshModules } from '#lib/client'
  import type { Note, Revisions } from '#lib/contracts/workspace'
  import { randomId } from '#lib/random-id'
  import { lockScroll } from '#lib/scroll-lock'
  import { useUi, type NoteDraft } from '#lib/ui.svelte'

  let { draft = {} }: { draft?: NoteDraft } = $props()
  const ui = useUi()
  let dialog: HTMLDialogElement
  let input: HTMLTextAreaElement
  // 每次打开都会重建（外层用 key 包着），初始内容只取打开的那一刻。
  const start = untrack(() => ({ ...draft }))
  // 只有一个正文框：停下来 600ms 就落库。新建时先 POST 拿 id，之后按 id PATCH。
  let body = $state(start.body ?? '')
  const title = start.title ?? ''
  // 只有这次会话里新建出来的记录，清空正文再关才当「放弃」删掉；已有笔记清空只丢弃改动。
  const created = !start.id
  let saved = start.body ?? ''
  let noteId: string | null = start.id ?? null
  let version = start.version ?? 0
  let busy = $state(false)
  let error = $state('')
  let persisted = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  onMount(() => {
    dialog.showModal()
    input.focus()
    // 编辑已有笔记：光标落在正文末尾，接着往下写就行
    if (start.id) input.setSelectionRange(body.length, body.length)
    const unlock = lockScroll()
    return () => {
      clearTimeout(timer)
      unlock()
    }
  })

  function schedule() {
    persisted = false
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), 600)
  }

  async function write(text: string) {
    return noteId
      ? commit<Note>('PATCH', '/notes/' + noteId, { title, body: text, version }, randomId())
      : commit<Note>('POST', '/notes', { title, body: text }, randomId())
  }

  async function flush() {
    clearTimeout(timer)
    // 上一次还在写：它收尾时会自己再排一次，这里直接让开，避免并发写同一行。
    if (busy) return
    const text = body.trim()
    if (!text || text === saved) return
    busy = true
    try {
      const result = await write(text)
      noteId = result.data.id
      version = result.data.version
      saved = text
      error = ''
      persisted = true
      if (result.revisions) await refreshModules(result.revisions)
    } catch (failure) {
      error = ui.error(failure)
    } finally {
      busy = false
    }
    if (body.trim() !== saved) schedule()
  }

  async function close() {
    while (busy) await new Promise(resolve => setTimeout(resolve, 40))
    await flush()
    // 建出来了又清空再关：这次等于没写，别留一条空壳。
    if (created && noteId && !body.trim()) {
      const removed = await commit<{ revisions?: Revisions }>('DELETE', '/notes/' + noteId, { version }, randomId()).catch(() => null)
      noteId = null
      if (removed?.revisions) await refreshModules(removed.revisions)
    }
    ui.endCompose()
  }

  // 手机上没有 Esc，点遮罩也要能关；点框内（含那行状态文字）不算。
  function backdrop(event: MouseEvent) {
    const box = dialog.getBoundingClientRect()
    const outside = event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom
    if (outside) void close()
  }
</script>

<dialog bind:this={dialog} class="note-composer" aria-label={ui.t(start.id ? '编辑思考' : '新建思考')} onclick={backdrop}
  oncancel={event => { event.preventDefault(); void close() }}>
  <textarea bind:this={input} bind:value={body} oninput={schedule} rows={7}
    placeholder={ui.t('写点什么…停下就自动保存')}></textarea>
  <!-- 这行常驻（内容为空也占位），保存状态切换时弹窗高度不会跳 -->
  <p class="composer-status" class:error={!!error} role={error ? 'alert' : 'status'}>{error || (persisted ? ui.t('已保存') : '')}</p>
</dialog>
