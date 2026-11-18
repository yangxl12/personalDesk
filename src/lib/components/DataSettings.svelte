<script lang="ts">
  import { commit, refreshModules, request, RequestError } from '#lib/client'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  const ui = useUi()
  type Preview = { counts: Record<string, number> }
  let preview = $state<Preview | null>(null)
  let busy = $state(false)
  let error = $state('')
  let errors = $state<{ path: string; message: string }[]>([])
  let fileText: string | null = null
  let mode = $state<'replace' | 'merge'>('replace')
  const labels: Record<string, string> = {
    goals: '目标', tasks: '任务', notes: '思考记录', transactions: '收支记录', chats: '会话', messages: '消息'
  }

  async function load(file: File | undefined) {
    preview = null
    fileText = null
    error = ''
    errors = []
    if (!file) return
    if (file.size > 32 * 1024 * 1024) {
      error = '请选择小于 32 MiB 的备份文件'
      return
    }
    busy = true
    try {
      fileText = await file.text()
      const result = await request<Preview>('/data/import', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: fileText })
      })
      preview = result.data
    } catch (failure) {
      error = ui.error(failure)
      if (failure instanceof RequestError && Array.isArray(failure.fields)) errors = failure.fields
    } finally {
      busy = false
    }
  }

  async function apply() {
    if (!preview || !fileText || busy) return
    busy = true
    error = ''
    try {
      const response = await commit<{ counts: Record<string, number> }>('POST', '/data/import/apply',
        { file: fileText, mode }, 'import')
      preview = null
      fileText = null
      if (response.revisions) await refreshModules(response.revisions)
      ui.notify('备份已导入')
    } catch (failure) {
      error = ui.error(failure)
    } finally {
      busy = false
    }
  }

  async function download() {
    if (busy) return
    busy = true
    error = ''
    try {
      const { data } = await request<unknown>('/data/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'buxu-backup-' + new Date().toISOString().slice(0, 10) + '.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      ui.notify('备份已导出')
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
    <button type="button" class="button secondary download-link" disabled={busy} onclick={download}>{ui.t('导出备份')}</button>
    <label class="field">{ui.t('导入备份')}
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
      <fieldset class="access-options" disabled={busy}>
        <legend>{ui.t('导入方式')}</legend>
        <label><input type="radio" name="import-mode" value="replace" checked={mode === 'replace'} onchange={() => { mode = 'replace' }}>{ui.t('替换：清空现有数据后写入')}</label>
        <label><input type="radio" name="import-mode" value="merge" checked={mode === 'merge'} onchange={() => { mode = 'merge' }}>{ui.t('合并：保留现有数据，同标识记录覆盖')}</label>
      </fieldset>
      <button type="button" class={'button ' + (mode === 'replace' ? 'danger' : 'primary')} disabled={busy} onclick={apply}>
        {ui.t(mode === 'replace' ? '确认替换导入' : '确认合并导入')}
      </button>
      <p class="field-hint">{ui.t('备份不含 AI 模型配置，导入后需要重新填写 API Key。')}</p>
    {/if}
    {#if error}<p class="form-error" role="alert">{ui.t(error)}</p>{/if}
    {#if errors.length}
      <ul class="form-error">
        {#each errors as detail}<li>{detail.path} · {ui.t(detail.message)}</li>{/each}
      </ul>
    {/if}
  </div>
</section>
