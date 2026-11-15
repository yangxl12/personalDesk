<script lang="ts">
  import { randomId } from '#lib/random-id'
  import { commit, refreshModules, request, RequestError } from '#lib/client'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  const ui = useUi()
  type Preview = { counts: Record<string, number>; fingerprint: string; duplicate: boolean; populated: boolean }
  let preview = $state<Preview | null>(null)
  let busy = $state(false)
  let error = $state('')
  let errors = $state<{ path: string; message: string }[]>([])
  let fileText: string | null = null
  let requestKey: string | null = null
  const labels: Record<string, string> = {
    goals: '目标', items: '事项', tasks: '任务', notes: '思考记录', transactions: '收支记录',
    chats: '会话', messages: '消息', savings: '存款'
  }

  async function load(file: File | undefined) {
    preview = null
    fileText = null
    error = ''
    errors = []
    if (!file) return
    if (file.size > 7 * 1024 * 1024) {
      error = '请选择小于 7 MiB 的 Demo 导出文件'
      return
    }
    busy = true
    try {
      fileText = await file.text()
      const result = await request<Preview>('/imports/demo/preview', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: fileText })
      })
      preview = result.data
      requestKey = randomId()
    } catch (failure) {
      error = ui.error(failure)
      if (failure instanceof RequestError && Array.isArray(failure.fields)) errors = failure.fields
    } finally {
      busy = false
    }
  }

  async function apply() {
    if (!preview || !requestKey || !fileText || busy) return
    busy = true
    error = ''
    try {
      const response = await commit<{ duplicate: boolean }>('POST', '/imports/demo', { file: fileText, fingerprint: preview.fingerprint }, requestKey)
      preview = null
      fileText = null
      if (response.revisions) await refreshModules(response.revisions)
      ui.notify(response.data.duplicate ? '此文件已导入' : 'Demo 数据已导入')
    } catch (failure) {
      error = ui.error(failure)
    } finally {
      busy = false
    }
  }
</script>

<section class="card settings-card">
  <header class="section-head"><h2><span class="section-icon"><Icon name="book" /></span>{ui.t('数据管理')}</h2></header>
  <div class="model-form">
    <a href="/api/v1/data/export" class="button secondary download-link" download>{ui.t('导出数据')}</a>
    <label class="field">{ui.t('导入 Demo 数据')}
      <input type="file" accept="application/json,.json" disabled={busy} onchange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        void load(file)
      }}>
    </label>
    {#if preview}
      <dl class="import-counts">
        {#each Object.entries(preview.counts) as [name, count]}
          <div><dt>{ui.t(labels[name])}</dt><dd>{count}</dd></div>
        {/each}
      </dl>
      {#if preview.duplicate}
        <p class="field-hint">{ui.t('此文件已导入')}</p>
      {:else if preview.populated}
        <p class="field-hint">{ui.t('Demo 数据只能导入到空账号')}</p>
      {:else}
        <button type="button" class="button primary" disabled={busy} onclick={apply}>{ui.t('确认导入')}</button>
      {/if}
    {/if}
    {#if error}<p class="form-error" role="alert">{ui.t(error)}</p>{/if}
    {#if errors.length}
      <ul class="form-error">
        {#each errors as detail}<li>{detail.path} · {ui.t(detail.message)}</li>{/each}
      </ul>
    {/if}
  </div>
</section>
