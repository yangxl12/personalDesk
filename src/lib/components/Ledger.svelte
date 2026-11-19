<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { money, type Finance, type Transaction } from '#lib/contracts/workspace'
  import { request } from '#lib/client'
  import { useUi } from '#lib/ui.svelte'
  import { editTransaction, remove } from '#lib/editors'
  import { lockScroll } from '#lib/scroll-lock'
  import Icon from './Icon.svelte'
  import Empty from './Empty.svelte'

  let { month, onclose }: { month: string; onclose: () => void } = $props()
  const ui = useUi()
  let dialog: HTMLDialogElement
  let selected = $state(untrack(() => month))
  let items = $state<Transaction[]>([])
  let cursor = $state<string | null>(null)
  let loading = $state(true)
  let message = $state('')
  let sequence = 0

  onMount(() => {
    dialog.showModal()
    void load(month)
    return lockScroll()
  })

  async function load(target: string) {
    const token = ++sequence
    selected = target
    items = []
    cursor = null
    loading = true
    message = ''
    try {
      const result = (await request<Finance>(`/transactions?month=${target}&limit=100`)).data
      if (token !== sequence) return
      items = result.items
      cursor = result.nextCursor
    } catch (failure) {
      if (token === sequence) message = ui.error(failure)
    } finally {
      if (token === sequence) loading = false
    }
  }

  async function more() {
    if (!cursor || loading) return
    const token = sequence
    loading = true
    try {
      const result = (await request<Finance>(`/transactions?month=${selected}&cursor=${encodeURIComponent(cursor)}&limit=100`)).data
      if (token !== sequence) return
      items = [...items, ...result.items]
      cursor = result.nextCursor
    } catch (failure) {
      if (token === sequence) message = ui.error(failure)
    } finally {
      if (token === sequence) loading = false
    }
  }

  function changeMonth(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    if (!input.validity.valid || !input.value || input.value === selected) return
    void load(input.value)
  }

  // 记账日期落在别的月份时，直接把弹窗切到那个月，避免保存后“看不见”。
  const reload = (data?: Record<string, string>) => {
    const target = data?.occurred_on?.slice(0, 7)
    return load(target && target !== selected ? target : selected)
  }

  function edit(entry?: Transaction) {
    editTransaction(ui, entry, reload)
  }

  function erase(entry: Transaction) {
    remove(ui, '/transactions/' + entry.id, { version: entry.version },
      ui.t('删除 {date} 的这笔 {amount} 记录？', { date: entry.occurred_on, amount: money(entry.amount_cents) }), undefined, reload)
  }

  function close() {
    dialog.close()
    onclose()
  }

  function cancel(event: Event) {
    event.preventDefault()
    close()
  }
</script>

<dialog class="ledger-dialog" bind:this={dialog} aria-labelledby="ledger-title" oncancel={cancel}>
  <header class="dialog-head">
    <h2 id="ledger-title">{ui.t('收支记录')}</h2>
    <div class="ledger-tools">
      <label class="month-field"><span class="sr-only">{ui.t('月份')}</span>
        <input type="month" value={selected} min="1000-01" max="9999-12" onchange={changeMonth}>
      </label>
      <button type="button" class="button icon-button" aria-label={ui.t('关闭弹窗')} onclick={close}><Icon name="close" size={18} /></button>
    </div>
  </header>
  <div class="ledger-body">
    {#if message}<p class="form-error ledger-note" role="alert">{message}</p>{/if}
    {#if loading && !items.length}
      <p class="ledger-note">{ui.t('加载中…')}</p>
    {:else if !items.length}
      <Empty icon="finance" title="这个月暂无收支记录" />
    {:else}
      {#each items as entry (entry.id)}
        <div class="transaction-row">
          <span class={'transaction-icon ' + entry.direction}><Icon name={entry.direction === 'income' ? 'upRight' : 'downRight'} size={17} /></span>
          <div class="transaction-name">
            <strong>{entry.note || ui.t(entry.direction === 'income' ? '收入' : '支出')}</strong>
            <small>{entry.occurred_on} · {ui.t(entry.direction === 'income' ? '收入' : '支出')}</small>
          </div>
          <b class={entry.direction}>{entry.direction === 'income' ? '+' : '−'}{money(entry.amount_cents)}</b>
          <div class="row-actions">
            <button type="button" class="button icon-button" aria-label={ui.t('编辑收支')} onclick={() => edit(entry)}><Icon name="edit" size={17} /></button>
            <button type="button" class="button icon-button" aria-label={ui.t('删除收支')} onclick={() => erase(entry)}><Icon name="trash" size={17} /></button>
          </div>
        </div>
      {/each}
    {/if}
    {#if cursor && !loading}<button type="button" class="button secondary ledger-more" onclick={() => void more()}>{ui.t('加载更多')}</button>{/if}
  </div>
  <footer>
    <button type="button" class="button primary footer-add" onclick={() => edit()}>{ui.t('记一笔')}</button>
    <button type="button" class="button secondary" onclick={close}>{ui.t('关闭')}</button>
  </footer>
</dialog>
