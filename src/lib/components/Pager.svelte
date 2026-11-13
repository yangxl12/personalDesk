<script lang="ts">
  import { page } from '$app/state'
  import { nextPage } from '#lib/client'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'
  let { cursor }: { cursor: string | null } = $props()
  const ui = useUi()
  let first = $derived.by(() => {
    const params = new URLSearchParams(page.url.search)
    params.delete('cursor')
    return page.url.pathname + (params.size ? '?' + params : '')
  })
</script>

{#if cursor || page.url.searchParams.has('cursor')}
  <nav class="pagination" aria-label={ui.t('分页')}>
    {#if page.url.searchParams.has('cursor')}<a class="button secondary" href={first}>{ui.t('回到首页')}</a>{/if}
    {#if cursor}<a class="button secondary" href={nextPage(page.url, cursor)}>{ui.t('下一页')}<Icon name="chevron" size={16} /></a>{/if}
  </nav>
{/if}
