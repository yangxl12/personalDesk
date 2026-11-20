<script lang="ts">
  import type { Note } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { editNote, remove } from '#lib/editors'
  import Icon from './Icon.svelte'
  import Markdown from './Markdown.svelte'
  let { note }: { note: Note } = $props()
  const ui = useUi()

  let body: HTMLDivElement | undefined = $state()
  // 正文超出卡片高度时补一层渐隐，让「还有下文」看得出来。
  let clipped = $state(false)

  $effect(() => {
    const root = body
    const inner = root?.firstElementChild
    if (!root || !inner) return
    const check = () => { clipped = root.scrollHeight - root.clientHeight > 2 }
    const observer = new ResizeObserver(check)
    observer.observe(inner)
    check()
    return () => observer.disconnect()
  })
</script>

<article class="note-card" id={'note-' + note.id}>
  <div class="note-actions">
    <button type="button" class="button icon-button" aria-label={ui.t('发给 AI')} onclick={() => ui.attach({ kind: 'note', id: note.id, label: note.title || note.summary })}><Icon name="spark" size={15} /></button>
    <button type="button" class="button icon-button" aria-label={ui.t('编辑思考')} onclick={() => void editNote(ui, note)}><Icon name="edit" size={15} /></button>
    <button type="button" class="button icon-button" aria-label={ui.t('删除思考')} onclick={() => remove(ui, '/notes/' + note.id, { version: note.version }, ui.t('删除这条思考记录？'))}><Icon name="trash" size={15} /></button>
  </div>
  <span class="note-meta"><Icon name="notes" size={15} /><time datetime={new Date(note.updated_at).toISOString()}>{ui.date(note.updated_at)}</time></span>
  {#if note.title}<strong>{note.title}</strong>{/if}
  <div class="note-body" class:clipped bind:this={body}>
    <Markdown text={note.body} />
  </div>
</article>
