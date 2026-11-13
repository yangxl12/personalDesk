<script lang="ts">
  import type { NoteSummary } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'
  let { note }: { note: NoteSummary } = $props()
  const ui = useUi()
</script>

<a href={'/notes/' + note.id} class="note-card">
  <span class="note-meta"><Icon name="notes" size={15} /><time datetime={new Date(note.updated_at).toISOString()}>{ui.date(note.updated_at)}</time></span>
  <strong>{note.title || note.summary}</strong>
  {#if note.title}<p>{note.summary}</p>{/if}
</a>
