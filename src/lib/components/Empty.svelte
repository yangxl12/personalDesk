<script lang="ts">
  import type { Snippet } from 'svelte'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  let { icon, title, children }: { icon: string; title: string; children?: Snippet } = $props()
  const ui = useUi()
</script>

<div class="empty">
  <span class="empty-icon"><Icon name={icon} size={23} /></span>
  <p>{ui.t(title)}</p>
  {@render children?.()}
</div>
