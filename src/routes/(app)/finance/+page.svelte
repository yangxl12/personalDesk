<script lang="ts">
  import { goto } from '$app/navigation'
  import { money } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { editTransaction, remove } from '#lib/editors'
  import Icon from '#lib/components/Icon.svelte'
  import Empty from '#lib/components/Empty.svelte'
  import Savings from '#lib/components/Savings.svelte'
  import FinanceStats from '#lib/components/FinanceStats.svelte'
  import Pager from '#lib/components/Pager.svelte'
  let { data } = $props()
  const ui = useUi()
  let finance = $derived(data.finance)
</script>

<header class="page-head">
  <h1>{ui.t('财务概览')}</h1>
  <div class="page-actions">
    <label class="month-field"><span class="sr-only">{ui.t('月份')}</span><input type="month" value={finance.month} min="1000-01" max="9999-12"
      onchange={event => { if (event.currentTarget.validity.valid && event.currentTarget.value) void goto('/finance?month=' + event.currentTarget.value) }}></label>
    <button class="button primary" type="button" onclick={() => editTransaction(ui)}><Icon name="plus" size={17} />{ui.t('记一笔')}</button>
  </div>
</header>
<div class="finance-grid">
  <section class="card">
    <header class="section-head"><h2><span class="section-icon"><Icon name="finance" /></span>{ui.t('月度概况')}</h2><small>{finance.month}</small></header>
    <FinanceStats totals={finance.totals} />
  </section>
  <Savings savings={finance.savings} />
</div>
<section class="card ledger">
  <header class="section-head"><h2>{ui.t('收支记录')}</h2></header>
  {#each finance.items as entry (entry.id)}
    <div class="transaction-row">
      <span class={'transaction-icon ' + entry.direction}><Icon name={entry.direction === 'income' ? 'upRight' : 'downRight'} size={17} /></span>
      <div class="transaction-name">
        <strong>{entry.note || ui.t(entry.direction === 'income' ? '收入' : '支出')}</strong>
        <small>{entry.occurred_on} · {ui.t(entry.direction === 'income' ? '收入' : '支出')}</small>
      </div>
      <b class={entry.direction}>{entry.direction === 'income' ? '+' : '−'}{money(entry.amount_cents)}</b>
      <div class="row-actions">
        <button type="button" class="button icon-button" aria-label={ui.t('编辑收支')} onclick={() => editTransaction(ui, entry)}><Icon name="edit" size={17} /></button>
        <button type="button" class="button icon-button" aria-label={ui.t('删除收支')} onclick={() => remove(ui, '/transactions/' + entry.id,
          { version: entry.version }, ui.t('删除 {date} 的这笔 {amount} 记录？', { date: entry.occurred_on, amount: money(entry.amount_cents) }))}><Icon name="trash" size={17} /></button>
      </div>
    </div>
  {:else}
    <Empty icon="finance" title="这个月还没有收支记录" />
  {/each}
  <Pager cursor={finance.nextCursor} />
</section>
