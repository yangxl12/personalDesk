<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import EmptyArt from '#lib/components/EmptyArt.svelte'
  import Savings from '#lib/components/Savings.svelte'
  import FinanceStats from '#lib/components/FinanceStats.svelte'
  import NoteCard from '#lib/components/NoteCard.svelte'
  import GoalCards from '#lib/components/GoalCards.svelte'
  let { data } = $props()
  const ui = useUi()
  let dashboard = $derived(data.dashboard)
</script>

<div class="dashboard-grid">
  <GoalCards goals={dashboard.goals} />

  <section class="card finance-card">
    <FinanceStats totals={dashboard.totals} compact />
    <Savings savings={dashboard.savings} readonly />
  </section>

  <section class="card notes-card">
    {#if dashboard.notes.length}
      <div class="note-grid">{#each dashboard.notes as note (note.id)}<NoteCard {note} />{/each}</div>
    {:else}
      <EmptyArt size={104} label={ui.t('还没有思考记录')} />
    {/if}
  </section>
</div>
