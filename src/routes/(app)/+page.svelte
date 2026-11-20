<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { useUi } from '#lib/ui.svelte'
  import { request } from '#lib/client'
  import { editTransaction } from '#lib/editors'
  import EmptyArt from '#lib/components/EmptyArt.svelte'
  import Icon from '#lib/components/Icon.svelte'
  import Savings from '#lib/components/Savings.svelte'
  import FinanceLedger from '#lib/components/FinanceLedger.svelte'
  import NoteCard from '#lib/components/NoteCard.svelte'
  import GoalCards from '#lib/components/GoalCards.svelte'

  let { data } = $props()
  const ui = useUi()
  let dashboard = $derived(data.dashboard)
  // 记一笔或 AI 链接指向别的月份时，把财务卡片的筛选一起带过去。
  let jump = $state<{ date: string } | null>(null)
  let backupDue = $state(false)
  // 非响应式游标，避免同一 ?month= 深链反复触发跳转。
  let linked = ''

  // 三个板块只靠底部图标切换；目标内部的轨道仍然可以左右滑动。
  type Section = 'goals' | 'notes' | 'finance'
  const sections: { key: Section; icon: string; label: string }[] = [
    { key: 'goals', icon: 'goals', label: '目标管理' },
    { key: 'notes', icon: 'notes', label: '思考记录' },
    { key: 'finance', icon: 'finance', label: '财务' }
  ]
  let section = $state<Section>('goals')
  let index = $derived(sections.findIndex(item => item.key === section))

  onMount(() => {
    void request<{ due: boolean }>('/backup/status')
      .then(result => { backupDue = result.data.due })
      .catch(() => { backupDue = false })
  })

  async function dismissBackup() {
    backupDue = false
    await request('/backup/dismiss', { method: 'POST', body: '{}' }).catch(() => {})
  }

  // AI 来源链接指向 /?month=YYYY-MM，落地即把财务卡片切到该月。
  $effect(() => {
    const requested = page.url.searchParams.get('month')
    if (!requested) { linked = ''; return }
    if (requested === linked) return
    linked = requested
    if (/^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(requested)) {
      section = 'finance'
      jump = { date: requested + '-01' }
    }
  })

  // 记到别的月份时，财务卡片的筛选跟着落到那个月，避免保存后“看不见”。
  function afterRecord(data?: Record<string, string>) {
    if (data?.occurred_on) jump = { date: data.occurred_on }
  }
</script>

<div class="home-page">
  {#if backupDue}
    <div class="backup-bar" role="status">
      <span><Icon name="cloud" size={15} />{ui.t('超过 7 天没有导出备份。浏览器清理数据后无法恢复，建议先导出。')}</span>
      <button type="button" class="button quiet" onclick={() => void dismissBackup()}>{ui.t('知道了')}</button>
    </div>
  {/if}

  <div class="home-track" style:transform={`translateX(${-index * 100}%)`}>
    <div class="home-slide" inert={section !== 'goals'} aria-hidden={section !== 'goals'}>
      <GoalCards goals={dashboard.goals} />
    </div>

    <div class="home-slide notes-slide" class:current={section === 'notes'} inert={section !== 'notes'} aria-hidden={section !== 'notes'}>
      <section class="card notes-card home-card" aria-label={ui.t('思考记录')}>
        <h2 class="sr-only">{ui.t('思考记录')}</h2>
        <div class="home-scroll">
          {#if dashboard.notes.length}
            <div class="note-grid">{#each dashboard.notes as note (note.id)}<NoteCard {note} />{/each}</div>
          {:else}
            <div class="home-empty"><EmptyArt size={112} label={ui.t('还没有思考记录')} /></div>
          {/if}
        </div>
      </section>
      <button type="button" class="fab note-fab" aria-label={ui.t('新建思考')} title={ui.t('新建思考')} onclick={() => ui.compose()}>
        <Icon name="plus" size={22} />
      </button>
    </div>

    <div class="home-slide finance-slide" class:current={section === 'finance'} inert={section !== 'finance'} aria-hidden={section !== 'finance'}>
      <section class="card finance-card home-card" aria-label={ui.t('财务')}>
        <div class="home-scroll">
          <Savings savings={dashboard.savings} />
          <section class="finance-ledger" aria-label={ui.t('收支记录')}>
            <FinanceLedger revision={dashboard} {jump} />
          </section>
        </div>
      </section>
      <button type="button" class="fab finance-fab" aria-label={ui.t('记一笔')} onclick={() => editTransaction(ui, undefined, afterRecord)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </div>
</div>

<nav class="home-dock" aria-label={ui.t('工作台面板')}>
  {#each sections as item (item.key)}
    <button type="button" class="home-dock-button" aria-label={ui.t(item.label)} title={ui.t(item.label)}
      aria-current={section === item.key ? 'true' : undefined} onclick={() => { section = item.key }}>
      <Icon name={item.icon} size={21} />
    </button>
  {/each}
</nav>

<style>
  .backup-bar {
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px;
    margin-bottom: 12px; padding: 10px 14px;
    border: 1px solid var(--border); border-radius: 16px; background: var(--glass-2);
    box-shadow: inset 0 1px 0 var(--glass-edge);
    color: var(--muted); font-size: 13px;
  }
  .backup-bar span { display: flex; align-items: center; gap: 7px; flex: 1 1 260px; }
  .backup-bar .button { min-height: 30px; padding: 3px 10px; font-size: 12px; }
  /* 空状态在整屏卡片里居中，别缩在顶部 */
  .home-empty { display: grid; place-items: center; min-height: 100%; padding: 12px 0; }

  @media (max-width: 760px) {
    .backup-bar { font-size: 12px; padding: 9px 12px; margin-bottom: 10px; }
    .backup-bar .button { min-height: 28px; padding: 2px 9px; font-size: 11.5px; }
  }
</style>
