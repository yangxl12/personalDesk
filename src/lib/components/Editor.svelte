<script lang="ts">
  import { onMount } from 'svelte'
  import { RequestError } from '#lib/client'
  import { useUi, type EditorSpec } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  let { spec }: { spec: EditorSpec } = $props()
  const ui = useUi()
  let dialog: HTMLDialogElement
  let message = $state('')
  let latest = $state<Record<string, unknown> | null>(null)
  let busy = $state(false)
  let attempt: { fingerprint: string; key: string } | undefined
  let currentVersion: number | undefined
  let fields = $state<Record<string, string>>({})

  onMount(() => {
    dialog.showModal()
  })

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>
    const body = {
      ...spec.values, ...(spec.toBody?.(values) ?? values),
      ...(currentVersion === undefined ? {} : { version: currentVersion })
    }
    const fingerprint = JSON.stringify(body)
    if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, key: crypto.randomUUID() }
    busy = true
    message = ''
    latest = null
    fields = {}
    try {
      await ui.save(spec, body, attempt.key)
      ui.close()
    } catch (failure) {
      message = ui.error(failure)
      if (failure instanceof RequestError && failure.code === 'VERSION_CONFLICT') {
        latest = (failure.fields as { current: Record<string, unknown> }).current
      }
      if (failure instanceof RequestError && failure.code === 'INVALID_FIELDS') {
        fields = failure.fields as Record<string, string>
      }
    } finally {
      busy = false
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="dialog-title" oncancel={event => {
  event.preventDefault()
  if (!busy) ui.close()
}}>
  <form onsubmit={submit}>
    <header class="dialog-head">
      <h2 id="dialog-title">{ui.t(spec.title)}</h2>
      <button type="button" class="button icon-button" aria-label={ui.t('关闭')} disabled={busy} onclick={() => ui.close()}><Icon name="close" size={18} /></button>
    </header>
    <div class="dialog-fields">
      {#if spec.description}<p class="delete-copy">{spec.description}</p>{/if}
      {#each spec.fields ?? [] as field (field.name)}
        <label class="field">
          <span>{ui.t(field.label)}</span>
          {#if field.type === 'textarea'}
            <textarea name={field.name} rows={field.name === 'body' ? 8 : 4} value={field.value ?? ''} required={field.required} aria-invalid={!!fields[field.name]}></textarea>
          {:else if field.type === 'select'}
            <select name={field.name} value={field.value ?? field.options?.[0]?.[0]}>
              {#each field.options ?? [] as [value, label]}<option {value}>{ui.t(label)}</option>{/each}
            </select>
          {:else}
            <input name={field.name} type={field.type ?? 'text'} value={field.value ?? ''} required={field.required} inputmode={field.numeric ? 'decimal' : undefined} aria-invalid={!!fields[field.name]}>
          {/if}
          {#if fields[field.name]}<small class="form-error">{ui.t(fields[field.name])}</small>{/if}
        </label>
      {/each}
      {#if ui.remoteChange}<p class="field-hint" role="status">{ui.t('数据已在另一端更新，当前输入已保留。')}</p>{/if}
      {#if message}<p class="form-error" role="alert">{message}</p>{/if}
      {#if latest}
        <details open>
          <summary>{ui.t('当前已保存的内容')}</summary>
          <pre class="conflict-details">{JSON.stringify(latest, null, 2)}</pre>
        </details>
        {#if spec.method === 'PATCH'}
          <button type="button" class="button secondary" onclick={() => {
            currentVersion = Number(latest?.version)
            latest = null
            message = ui.t('已采用最新版本，检查草稿后再保存。')
          }}>{ui.t('保留草稿并采用最新版本')}</button>
        {/if}
      {/if}
    </div>
    <footer>
      <button type="button" class="button secondary" disabled={busy} onclick={() => ui.close()}>{ui.t('取消')}</button>
      <button type="submit" class={'button ' + (spec.method === 'DELETE' ? 'danger' : 'primary')} disabled={busy || !!latest}>
        {ui.t(busy ? '正在保存…' : spec.method === 'DELETE' ? '确认删除' : '保存')}
      </button>
    </footer>
  </form>
</dialog>
