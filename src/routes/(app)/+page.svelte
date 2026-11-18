<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { useUi } from '#lib/ui.svelte'
  import { request } from '#lib/client'
  import { createNote, editTransaction } from '#lib/editors'
  import EmptyArt from '#lib/components/EmptyArt.svelte'
  import Icon from '#lib/components/Icon.svelte'
  import Savings from '#lib/components/Savings.svelte'
  import FinanceStats from '#lib/components/FinanceStats.svelte'
  import NoteCard from '#lib/components/NoteCard.svelte'
  import GoalCards from '#lib/components/GoalCards.svelte'
  import Ledger from '#lib/components/Ledger.svelte'
  let { data } = $props()
  const ui = useUi()
  let dashboard = $derived(data.dashboard)
  let ledger = $state<string | null>(null)
  let backupDue = $state(false)
  // 非响应式游标，避免同一 ?month= 深链关闭弹窗后被反复打开。
  let linked = ''

  onMount(() => {
    void request<{ due: boolean }>('/backup/status')
      .then(result => { backupDue = result.data.due })
      .catch(() => { backupDue = false })
  })

  async function dismissBackup() {
    backupDue = false
    await request('/backup/dismiss', { method: 'POST', body: '{}' }).catch(() => {})
  }

  // AI 来源链接指向 /?month=YYYY-MM，落地即打开该月收支记录。
  $effect(() => {
    const requested = page.url.searchParams.get('month')
    if (!requested) { linked = ''; return }
    if (requested === linked) return
    linked = requested
    if (/^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(requested)) ledger = requested
  })

  function closeLedger() {
    ledger = null
    if (page.url.searchParams.has('month')) void goto(resolve(''), { replace: true, reset: false })
  }

  // 工作台固定展示本月；记到其他月份时打开那个月的收支记录，给出可核对的落点。
  function afterRecord(data?: Record<string, string>) {
    const month = data?.occurred_on?.slice(0, 7)
    if (month && month !== dashboard.month) ledger = month
  }
</script>

<div class="dashboard-grid">
  <GoalCards goals={dashboard.goals} />

  <section class="card finance-card">
    <header class="section-head">
      <h2 class="sr-only">{ui.t('财务')}</h2>
      <div class="section-actions">
        <button type="button" class="button secondary ledger-button" onclick={() => { ledger = dashboard.month }}>
          <Icon name="list" size={16} />{ui.t('收支记录')}
        </button>
        <button type="button" class="button icon-button" aria-label={ui.t('记一笔')} onclick={() => editTransaction(ui, undefined, afterRecord)}><Icon name="plus" size={18} /></button>
      </div>
    </header>
    <div class="finance-body">
      <FinanceStats totals={dashboard.totals} />
      <Savings savings={dashboard.savings} />
    </div>
  </section>

  <section class="card notes-card" aria-label={ui.t('思考记录')}>
    <header class="section-head">
      <h2 class="sr-only">{ui.t('思考记录')}</h2>
      <div class="section-actions">
        <button type="button" class="button icon-button" aria-label={ui.t('新建思考')} onclick={() => createNote(ui)}><Icon name="plus" size={18} /></button>
      </div>
    </header>
    {#if dashboard.notes.length}
      <div class="note-grid">{#each dashboard.notes as note (note.id)}<NoteCard {note} />{/each}</div>
      <p class="notes-footnote"><Icon name="notes" size={14} />{ui.t('记录一个想法，留给之后的自己。')}</p>
    {:else}
      <EmptyArt size={112} label={ui.t('还没有思考记录')} />
    {/if}
  </section>
</div>

{#if backupDue}
  <div class="backup-bar" role="status">
    <span><Icon name="cloud" size={15} />{ui.t('超过 7 天没有导出备份。浏览器清理数据后无法恢复，建议先导出。')}</span>
    <button type="button" class="button quiet" onclick={() => void dismissBackup()}>{ui.t('知道了')}</button>
  </div>
{/if}

{#if ledger}<Ledger month={ledger} onclose={closeLedger} />{/if}

<style>
  .backup-bar {
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px;
    margin-top: 14px; padding: 10px 14px;
    border: 1px solid var(--border); border-radius: 16px; background: var(--glass-2);
    box-shadow: inset 0 1px 0 var(--glass-edge);
    color: var(--muted); font-size: 13px;
  }
  .backup-bar span { display: flex; align-items: center; gap: 7px; flex: 1 1 260px; }
  .backup-bar .button { min-height: 30px; padding: 3px 10px; font-size: 12px; }
</style>
