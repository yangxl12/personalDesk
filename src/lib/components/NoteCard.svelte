<script lang="ts">
  import type { NoteSummary } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { editNote, remove } from '#lib/editors'
  import Icon from './Icon.svelte'
  let { note }: { note: NoteSummary } = $props()
  const ui = useUi()
</script>

<article class="note-card" id={'note-' + note.id}>
  <div class="note-actions">
    <button type="button" class="button icon-button" aria-label={ui.t('发给 AI')} onclick={() => ui.attach({ kind: 'note', id: note.id, label: note.title || note.summary })}><Icon name="spark" size={15} /></button>
    <button type="button" class="button icon-button" aria-label={ui.t('编辑思考')} onclick={() => void editNote(ui, note)}><Icon name="edit" size={15} /></button>
    <button type="button" class="button icon-button" aria-label={ui.t('删除思考')} onclick={() => remove(ui, '/notes/' + note.id, { version: note.version }, ui.t('删除这条思考记录？'))}><Icon name="trash" size={15} /></button>
  </div>
  <span class="note-meta"><Icon name="notes" size={15} /><time datetime={new Date(note.updated_at).toISOString()}>{ui.date(note.updated_at)}</time></span>
  <strong>{note.title || note.summary}</strong>
  {#if note.title}<p>{note.summary}</p>{/if}
</article>
