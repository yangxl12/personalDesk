<script lang="ts">
  import { money, type Finance, type Transaction } from '#lib/contracts/workspace'
  import { request } from '#lib/client'
  import { useUi } from '#lib/ui.svelte'
  import { editTransaction, remove } from '#lib/editors'
  import Icon from './Icon.svelte'
  import Empty from './Empty.svelte'

  // 工作台财务卡片内嵌的收支列表：只取本月最近几笔，完整的月份记录走 Ledger 弹窗。
  let { month, revision, limit = 8 }: { month: string; revision: unknown; limit?: number } = $props()
  const ui = useUi()
  let items = $state<Transaction[]>([])
  let more = $state(false)
  let loading = $state(true)
  let message = $state('')
  let sequence = 0

  async function load() {
    const token = ++sequence
    loading = true
    message = ''
    try {
      const result = (await request<Finance>(`/transactions?month=${month}&limit=${limit}`)).data
      if (token !== sequence) return
      items = result.items
      more = Boolean(result.nextCursor)
    } catch (failure) {
      if (token === sequence) message = ui.error(failure)
    } finally {
      if (token === sequence) loading = false
    }
  }

  // revision 是工作台数据本身：任何写入都会让它换新，这里跟着重新取一遍。
  $effect(() => {
    void revision
    void month
    void load()
  })

  const reload = () => load()

  function edit(entry?: Transaction) {
    editTransaction(ui, entry, reload)
  }

  function erase(entry: Transaction) {
    remove(ui, '/transactions/' + entry.id, { version: entry.version },
      ui.t('删除 {date} 的这笔 {amount} 记录？', { date: entry.occurred_on, amount: money(entry.amount_cents) }), undefined, reload)
  }
</script>

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
        <small>{entry.occurred_on}</small>
      </div>
      <b class={entry.direction}>{entry.direction === 'income' ? '+' : '−'}{money(entry.amount_cents)}</b>
      <div class="row-actions">
        <button type="button" class="button icon-button" aria-label={ui.t('编辑收支')} onclick={() => edit(entry)}><Icon name="edit" size={17} /></button>
        <button type="button" class="button icon-button" aria-label={ui.t('删除收支')} onclick={() => erase(entry)}><Icon name="trash" size={17} /></button>
      </div>
    </div>
  {/each}
  {#if more}<p class="finance-ledger-more">{ui.t('还有更多记录，点上方查看全部。')}</p>{/if}
{/if}
