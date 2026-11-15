<script lang="ts">
  import { randomId } from '#lib/random-id'
  import { useUi } from '#lib/ui.svelte'
  import { commit, refreshModules, request } from '#lib/client'
  import type { Proposal } from '#lib/contracts/ai'
  import Icon from './Icon.svelte'
  let { id, ready }: { id: string; ready: boolean } = $props()
  const ui = useUi()
  let proposal = $state<Proposal | null>(null)
  let busy = $state(false)
  let error = $state('')
  let attempt: { decision: string; key: string } | undefined
  const labels = {
    pending: '等待确认', applied: '已执行', rejected: '已拒绝', expired: '已过期', invalidated: '已失效'
  }

  $effect(() => {
    const revision = ui.chatRevision
    const proposalId = id
    const controller = new AbortController()
    void request<Proposal>('/ai/proposals/' + proposalId, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && revision === ui.chatRevision) proposal = result.data
    }).catch(failure => { if (!controller.signal.aborted) error = ui.error(failure) })
    return () => controller.abort()
  })

  async function decide(decision: 'approve' | 'reject') {
    if (busy) return
    if (attempt?.decision !== decision) attempt = { decision, key: randomId() }
    busy = true
    error = ''
    try {
      const result = await commit<Proposal>('POST', '/ai/proposals/' + id + '/decision', { decision }, attempt.key)
      proposal = result.data
      if (result.revisions) await refreshModules(result.revisions)
    } catch (failure) {
      error = ui.error(failure)
    } finally {
      busy = false
    }
  }
</script>

{#if proposal}
  <section class="proposal">
    <small>{ui.t(labels[proposal.status])}</small>
    <strong>{proposal.preview.label}</strong>
    <p>{ui.t(proposal.preview.before)} → {ui.t(proposal.preview.after)}</p>
    {#if proposal.status === 'pending'}
      <div class="row-actions">
        <button class="button secondary" type="button" onclick={() => decide('reject')} disabled={busy || !ready}>{ui.t('拒绝')}</button>
        <button class="button primary" type="button" onclick={() => decide('approve')} disabled={busy}>{ui.t('确认执行')}</button>
      </div>
    {:else if proposal.status === 'applied'}
      <a class="text-link" href={proposal.preview.href}>{ui.t('查看目标')}<Icon name="chevron" size={15} /></a>
    {/if}
  </section>
{/if}
{#if error}<p class="form-error" role="alert">{error}</p>{/if}
