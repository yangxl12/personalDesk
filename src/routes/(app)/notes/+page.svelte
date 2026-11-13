<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import { editNote } from '#lib/editors'
  import Icon from '#lib/components/Icon.svelte'
  import Empty from '#lib/components/Empty.svelte'
  import NoteCard from '#lib/components/NoteCard.svelte'
  import Pager from '#lib/components/Pager.svelte'
  let { data } = $props()
  const ui = useUi()
</script>

<header class="page-head">
  <h1>{ui.t('思考记录')}</h1>
  <button class="button primary" type="button" onclick={() => editNote(ui)}><Icon name="plus" size={17} />{ui.t('新建思考')}</button>
</header>
{#if data.list.items.length}
  <div class="collection-grid notes-collection">
    {#each data.list.items as note (note.id)}<NoteCard {note} />{/each}
  </div>
{:else}
  <section class="card"><Empty icon="notes" title="还没有思考记录" /></section>
{/if}
<Pager cursor={data.list.nextCursor} />
