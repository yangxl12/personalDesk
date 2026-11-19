<script lang="ts">
  import { money, today, type Finance, type Totals, type Transaction } from '#lib/contracts/workspace'
  import { request } from '#lib/client'
  import { useUi } from '#lib/ui.svelte'
  import { editTransaction, remove } from '#lib/editors'
  import FinanceStats from './FinanceStats.svelte'
  import Icon from './Icon.svelte'
  import Empty from './Empty.svelte'

  // 工作台财务卡片的下半部分：先按年/月/日筛选，再给出这段时间的收入、支出、结余和每一笔。
  let { revision, jump = null }: { revision: unknown; jump?: { date: string } | null } = $props()
  const ui = useUi()

  type Scope = 'year' | 'month' | 'day'
  const scopes: { key: Scope; label: string }[] = [
    { key: 'year', label: '年' }, { key: 'month', label: '月' }, { key: 'day', label: '日' }
  ]

  const pad = (value: number) => String(value).padStart(2, '0')
  const split = (value: string) => value.split('-').map(Number)
  const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

  let scope = $state<Scope>('month')
  // 默认落在账号时区的今天：切到「日」直接看当天，前后切换也不会跑偏。
  let anchor = $state(today(ui.preferences.timezone))
  let items = $state<Transaction[]>([])
  let totals = $state<Totals>({ income: '0', expense: '0', balance: '0' })
  let cursor = $state<string | null>(null)
  let loading = $state(true)
  let message = $state('')
  let sequence = 0

  function rangeOf(target: Scope, value: string) {
    const [year, month, day] = split(value)
    if (target === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` }
    if (target === 'month') {
      return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay(year, month))}` }
    }
    return { from: value, to: value }
  }

  let range = $derived(rangeOf(scope, anchor))
  let year = $derived(split(anchor)[0])
  let monthValue = $derived(anchor.slice(0, 7))

  // 原生日期控件的文字在窄卡片里会被压掉一半（"2026年11月" 显示成 "2026年1"），
  // 所以时段文字自己排，原生控件只当透明的交互层，点击仍然弹系统选择器。
  let label = $derived.by(() => {
    const [y, m, d] = split(anchor)
    const style: Intl.DateTimeFormatOptions = scope === 'year'
      ? { year: 'numeric' }
      : scope === 'month'
        ? { year: 'numeric', month: 'short' }
        : { year: 'numeric', month: 'short', day: 'numeric' }
    return new Intl.DateTimeFormat(ui.preferences.language === 'en' ? 'en-US' : 'zh-CN', { ...style, timeZone: 'UTC' })
      .format(new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00Z`))
  })

  // 点击透明控件时主动唤起选择器：直接点文字区域浏览器只会聚焦，不会展开日历。
  function openPicker(event: MouseEvent) {
    const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void }
    if (typeof input.showPicker !== 'function') return
    try { input.showPicker() } catch { /* 浏览器拦截或不支持时退回原生聚焦 */ }
  }

  // 年份聚焦即全选，直接键入就把旧年份换掉，不用先删。
  function selectAll(event: FocusEvent) {
    ;(event.currentTarget as HTMLInputElement).select()
  }

  async function load(from: string, to: string) {
    const token = ++sequence
    items = []
    cursor = null
    loading = true
    message = ''
    try {
      const result = (await request<Finance>(`/transactions?from=${from}&to=${to}&limit=100`)).data
      if (token !== sequence) return
      items = result.items
      cursor = result.nextCursor
      totals = result.totals
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
      const result = (await request<Finance>(`/transactions?from=${range.from}&to=${range.to}&cursor=${encodeURIComponent(cursor)}&limit=100`)).data
      if (token !== sequence) return
      items = [...items, ...result.items]
      cursor = result.nextCursor
    } catch (failure) {
      if (token === sequence) message = ui.error(failure)
    } finally {
      if (token === sequence) loading = false
    }
  }

  // revision 是工作台数据本身：任何写入都会让它换新，这里跟着重新取一遍。
  $effect(() => {
    void revision
    void load(range.from, range.to)
  })

  // 记账日期落在筛选范围之外时自动切到那个月，避免刚存下的这笔看不见。
  // 只处理新的 jump：否则用户切到「日」时 range 变成单日，深链留下的 jump 又会把它弹回「月」。
  let applied = ''
  $effect(() => {
    const target = jump?.date
    if (!target || target === applied) return
    applied = target
    if (target >= range.from && target <= range.to) return
    scope = 'month'
    anchor = target
  })

  function shift(step: number) {
    const [currentYear, currentMonth, currentDay] = split(anchor)
    if (scope === 'year') {
      const next = Math.min(9999, Math.max(1000, currentYear + step))
      anchor = `${next}-${pad(currentMonth)}-${pad(currentDay)}`
    } else if (scope === 'month') {
      const index = currentYear * 12 + currentMonth - 1 + step
      const nextYear = Math.floor(index / 12)
      const nextMonth = index % 12 + 1
      anchor = `${nextYear}-${pad(nextMonth)}-${pad(Math.min(currentDay, lastDay(nextYear, nextMonth)))}`
    } else {
      anchor = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay + step)).toISOString().slice(0, 10)
    }
  }

  function setYear(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const value = Number(input.value)
    // 空值或越界就退回当前年份，避免输入框留个空壳
    if (!Number.isInteger(value) || value < 1000 || value > 9999) { input.value = String(year); return }
    anchor = `${value}-${anchor.slice(5)}`
  }

  function setMonth(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value
    if (!/^\d{4}-\d{2}$/.test(value)) return
    const [nextYear, nextMonth] = value.split('-').map(Number)
    anchor = `${value}-${pad(Math.min(split(anchor)[2], lastDay(nextYear, nextMonth)))}`
  }

  function setDay(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) anchor = value
  }

  // 改动后落到别的月份时，直接把筛选切过去；仍在范围内就重新取一次当前区间。
  const reload = (data?: Record<string, string>) => {
    const date = data?.occurred_on
    if (date && (date < range.from || date > range.to)) {
      scope = 'month'
      anchor = date
      return
    }
    return load(range.from, range.to)
  }

  function edit(entry?: Transaction) {
    editTransaction(ui, entry, reload)
  }

  function erase(entry: Transaction) {
    remove(ui, '/transactions/' + entry.id, { version: entry.version },
      ui.t('删除 {date} 的这笔 {amount} 记录？', { date: entry.occurred_on, amount: money(entry.amount_cents) }), undefined, reload)
  }
</script>

<div class="finance-period">
  <div class="period-nav">
    <button type="button" class="button icon-button period-step" aria-label={ui.t('上一段时间')} onclick={() => shift(-1)}><Icon name="chevronLeft" size={16} /></button>
    <span class="period-value">
      {#if scope === 'year'}
        <span class="period-label">{year}</span>
        {#if ui.preferences.language !== 'en'}<span class="period-unit">{ui.t('年')}</span>{/if}
        <!-- 年份同样走「文字自己排 + 透明原生控件」：聚焦时原生控件才显形，接手编辑 -->
        <input class="period-input year" type="number" min="1000" max="9999" step="1" value={year} aria-label={ui.t('年份')} onchange={setYear} onfocus={selectAll}>
      {:else}
        <span class="period-label">{label}</span>
        <input class="period-input picker" type={scope === 'month' ? 'month' : 'date'}
          value={scope === 'month' ? monthValue : anchor}
          aria-label={scope === 'month' ? ui.t('月份') : ui.t('日期')}
          onchange={scope === 'month' ? setMonth : setDay}
          onclick={openPicker}>
      {/if}
    </span>
    <button type="button" class="button icon-button period-step" aria-label={ui.t('下一段时间')} onclick={() => shift(1)}><Icon name="chevron" size={16} /></button>
  </div>
  <div class="period-scopes" role="group" aria-label={ui.t('筛选范围')}>
    {#each scopes as item (item.key)}
      <button type="button" aria-pressed={scope === item.key} onclick={() => { scope = item.key }}>{ui.t(item.label)}</button>
    {/each}
  </div>
</div>

<FinanceStats {totals} />

{#if message}<p class="form-error ledger-note" role="alert">{message}</p>{/if}
{#if loading && !items.length}
  <p class="ledger-note">{ui.t('加载中…')}</p>
{:else if !items.length}
  <Empty icon="finance" title="暂无收支记录" />
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
  {#if cursor}
    <button type="button" class="button secondary ledger-more" onclick={() => void more()}>{ui.t('加载更多')}</button>
  {/if}
{/if}
