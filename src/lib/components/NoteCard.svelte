<script lang="ts">
  import type { Note } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { editNote, remove } from '#lib/editors'
  import Icon from './Icon.svelte'
  import Markdown from './Markdown.svelte'
  let { note }: { note: Note } = $props()
  const ui = useUi()

  // 列表里正文只露 15 行，超出的折起来，底部箭头手动展开/收起。
  const VISIBLE_LINES = 15

  let body: HTMLDivElement | undefined = $state()
  let expanded = $state(false)
  let clipped = $state(false)
  // 折起高度和全文高度都由行高算出来，CSS 只管读变量。
  let cap = $state(0)
  let full = $state(0)

  $effect(() => {
    const root = body
    const inner = root?.firstElementChild as HTMLElement | null
    if (!root || !inner) return
    // .md 在裁切容器里仍然按全文排版，展开与否都能量到完整高度。
    const check = () => {
      const line = parseFloat(getComputedStyle(inner).lineHeight) || 21.5
      cap = Math.round(line * VISIBLE_LINES)
      full = inner.offsetHeight
      clipped = full - cap > 2
    }
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
  <span class="note-meta"><time datetime={new Date(note.updated_at).toISOString()}>{ui.date(note.updated_at)}</time></span>
  {#if note.title}<strong>{note.title}</strong>{/if}
  <div class="note-body" class:clipped={clipped && !expanded} class:expanded bind:this={body}
    style:--note-cap={cap ? cap + 'px' : undefined}
    style:--note-full={full ? full + 'px' : undefined}>
    <Markdown text={note.body} />
  </div>
  {#if clipped}
    <button type="button" class="note-toggle" aria-expanded={expanded} title={ui.t(expanded ? '收起' : '展开全部')}
      aria-label={ui.t(expanded ? '收起' : '展开全部')} onclick={() => { expanded = !expanded }}>
      <Icon name="down" size={15} />
    </button>
  {/if}
</article>
