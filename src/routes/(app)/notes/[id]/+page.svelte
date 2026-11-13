<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import { editNote, remove } from '#lib/editors'
  import Icon from '#lib/components/Icon.svelte'
  let { data } = $props()
  const ui = useUi()
  let note = $derived(data.note)
</script>

<a class="back-link" href="/notes"><Icon name="back" size={17} />{ui.t('思考记录')}</a>
<header class="page-head">
  <div>
    <h1>{note.title || note.summary}</h1>
    <p><time datetime={new Date(note.updated_at).toISOString()}>{ui.date(note.updated_at)}</time></p>
  </div>
  <div class="page-actions">
    <button class="button quiet" type="button" onclick={() => ui.attach({ kind: 'note', id: note.id, label: note.title || note.summary })}><Icon name="spark" size={17} />{ui.t('发给 AI')}</button>
    <button class="button secondary" type="button" onclick={() => editNote(ui, note)}><Icon name="edit" size={17} />{ui.t('编辑')}</button>
    <button class="button icon-button" type="button" aria-label={ui.t('删除思考')} onclick={() => remove(ui, '/notes/' + note.id, { version: note.version }, ui.t('删除这条思考记录？'), '/notes')}><Icon name="trash" size={17} /></button>
  </div>
</header>
<article class="card note-body">{note.body}</article>
