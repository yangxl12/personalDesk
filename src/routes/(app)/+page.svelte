<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import Icon from '#lib/components/Icon.svelte'
  import Empty from '#lib/components/Empty.svelte'
  import Savings from '#lib/components/Savings.svelte'
  import FinanceStats from '#lib/components/FinanceStats.svelte'
  import NoteCard from '#lib/components/NoteCard.svelte'
  import DirectionTabs from '#lib/components/DirectionTabs.svelte'
  let { data } = $props()
  const ui = useUi()
  let dashboard = $derived(data.dashboard)
</script>

<div class="dashboard-grid">
  <DirectionTabs goals={dashboard.goals} userId={data.user.id} />

  <section class="card finance-card">
    <header class="section-head">
      <h2><span class="section-icon"><Icon name="finance" /></span>{ui.t('本月财务')}</h2>
      <a class="text-link" href="/finance">{ui.t('财务详情')}<Icon name="arrow" size={15} /></a>
    </header>
    <FinanceStats totals={dashboard.totals} compact />
    <Savings savings={dashboard.savings} readonly />
  </section>

  <section class="card notes-card">
    <header class="section-head">
      <h2><span class="section-icon"><Icon name="notes" /></span>{ui.t('思考记录')}</h2>
      <a class="text-link" href="/notes">{ui.t('全部记录')}<Icon name="arrow" size={15} /></a>
    </header>
    {#if dashboard.notes.length}
      <div class="note-grid">{#each dashboard.notes as note (note.id)}<NoteCard {note} />{/each}</div>
    {:else}
      <Empty icon="notes" title="还没有思考记录" />
    {/if}
  </section>
</div>
