<script lang="ts">
  import { money, type Savings } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { editSavings } from '#lib/editors'
  import Icon from './Icon.svelte'

  let { savings }: { savings: Savings } = $props()
  const ui = useUi()
  let ratio = $derived(savings.current_cents !== null && savings.target_cents !== null
    ? Math.min(savings.current_cents >= savings.target_cents ? 100 : 99, Math.round(savings.current_cents / savings.target_cents * 100)) : null)
</script>

<section class="savings">
  <div class="savings-heading">
    <span><Icon name="finance" size={15} />{ui.t('当前存款')}</span>
    <button class="button icon-button" type="button" aria-label={ui.t('更新存款')} onclick={() => editSavings(ui, savings)}><Icon name="edit" size={15} /></button>
  </div>
  <div class="savings-amount">
    <strong>{savings.current_cents === null ? '—' : money(savings.current_cents)}</strong>
    <span>{ui.t('目标')} {savings.target_cents === null ? '—' : money(savings.target_cents)}</span>
  </div>
  {#if ratio !== null}
    <progress value={ratio} max="100" aria-label={ui.t('存款进度')}></progress>
    <div class="savings-caption"><span>{ui.t('存款进度')}</span><b>{ratio === 100 ? ui.t('已达成') : ratio + '%'}</b></div>
  {:else}
    <button class="button quiet" type="button" onclick={() => editSavings(ui, savings)}>{ui.t('填写存款')}</button>
  {/if}
</section>
