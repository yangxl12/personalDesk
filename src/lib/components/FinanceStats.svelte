<script lang="ts">
  import { money, type Totals } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  let { totals }: { totals: Totals } = $props()
  const ui = useUi()
</script>

<div class="finance-stats">
  <div class="stat"><span>{ui.t('收入')}</span><strong class="income">{money(totals.income)}</strong></div>
  <div class="stat"><span>{ui.t('支出')}</span><strong class="expense">{money(totals.expense)}</strong></div>
  <div class="stat"><span>{ui.t('结余')}</span><strong>{money(totals.balance)}</strong></div>
</div>
