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

  function reset() {
    preview = null
    fileText = null
    error = ''
    errors = []
  }

  async function load(file: File | undefined) {
    reset()
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

<section class="settings-block">
  <header class="section-head"><h2><span class="section-icon"><Icon name="book" /></span>{ui.t('数据管理')}</h2></header>
  <div class="data-actions">
    <div class="data-action">
      <span class="data-mark" aria-hidden="true"><Icon name="upRight" size={17} /></span>
      <span class="data-copy">
        <strong>{ui.t('导出备份')}</strong>
        <small>{ui.t('打包全部记录为 JSON 文件。')}</small>
      </span>
      <button type="button" class="button secondary" disabled={busy} onclick={download}>{ui.t('导出')}</button>
    </div>
    <label class="data-action pick" class:disabled={busy}>
      <span class="data-mark" aria-hidden="true"><Icon name="install" size={17} /></span>
      <span class="data-copy">
        <strong>{ui.t('导入备份')}</strong>
        <small>{ui.t('可替换或合并现有记录。')}</small>
      </span>
      <span class="button secondary" aria-hidden="true">{ui.t('选择文件')}</span>
      <input type="file" accept="application/json,.json" disabled={busy} onchange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        void load(file)
      }}>
    </label>
  </div>

  {#if preview}
    <div class="import-panel">
      <strong>{ui.t('确认导入')}</strong>
      <dl class="import-counts">
        {#each Object.entries(preview.counts) as [name, count]}
          <div><dt>{ui.t(labels[name])}</dt><dd>{count}</dd></div>
        {/each}
      </dl>
      <fieldset class="import-modes" disabled={busy}>
        <legend>{ui.t('导入方式')}</legend>
        <label class:on={mode === 'replace'}>
          <input type="radio" name="import-mode" value="replace" checked={mode === 'replace'} onchange={() => { mode = 'replace' }}>
          <span>{ui.t('替换：清空现有数据后写入')}</span>
        </label>
        <label class:on={mode === 'merge'}>
          <input type="radio" name="import-mode" value="merge" checked={mode === 'merge'} onchange={() => { mode = 'merge' }}>
          <span>{ui.t('合并：保留现有数据，同标识记录覆盖')}</span>
        </label>
      </fieldset>
      <div class="import-actions">
        <button type="button" class="button secondary" disabled={busy} onclick={reset}>{ui.t('取消')}</button>
        <button type="button" class={'button ' + (mode === 'replace' ? 'danger' : 'primary')} disabled={busy} onclick={apply}>
          {ui.t(mode === 'replace' ? '确认替换导入' : '确认合并导入')}
        </button>
      </div>
    </div>
  {/if}

  {#if error}<p class="form-error data-feedback" role="alert">{ui.t(error)}</p>{/if}
  {#if errors.length}
    <ul class="form-error data-feedback">
      {#each errors as detail}<li>{detail.path} · {ui.t(detail.message)}</li>{/each}
    </ul>
  {/if}
  <p class="field-hint data-feedback">{ui.t('备份不含 AI 模型配置，导入后需要重新填写 API Key。')}</p>
</section>

<style>
  .data-actions { display: grid; gap: 10px; }
  .data-action {
    display: flex; align-items: center; gap: 12px; min-width: 0; padding: 14px;
    border: 1px solid var(--line); border-radius: 16px; background: var(--glass-2);
    box-shadow: inset 0 1px 0 var(--glass-edge);
    transition: border-color .25s, background-color .25s;
  }
  .data-mark {
    display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 11px;
    color: var(--primary); background: var(--primary-soft); border: 1px solid var(--line);
  }
  .data-copy { flex: 1; min-width: 0; display: grid; gap: 3px; }
  .data-copy strong { font-size: 13.5px; font-weight: 650; }
  .data-copy small { font-size: 11.5px; line-height: 1.5; }
  .data-action .button { min-height: 34px; padding: 4px 12px; font-size: 12px; }
  .pick { position: relative; cursor: pointer; }
  .pick:hover { border-color: var(--line-strong); background: var(--glass); }
  .pick.disabled { opacity: .55; pointer-events: none; }
  /* 输入框留 1px 仍可聚焦，键盘用户也能用 Tab 选中文件 */
  .pick input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .pick:focus-within { outline: 2px solid var(--primary); outline-offset: 3px; }

  .import-panel {
    display: grid; gap: 13px; margin-top: 12px; padding: 16px;
    border: 1px solid var(--line-strong); border-radius: 18px; background: var(--glass);
  }
  .import-panel > strong { font-size: 13.5px; font-weight: 650; }
  .import-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 8px; margin: 0; }
  .import-counts div {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    padding: 9px 11px; border: 1px solid var(--line); border-radius: 12px; background: var(--glass-2);
  }
  .import-counts dt { color: var(--muted); font-size: 12px; }
  .import-counts dd { margin: 0; font-weight: 650; font-variant-numeric: tabular-nums; }
  .import-modes { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
  .import-modes legend { margin-bottom: 7px; padding: 0; font-weight: 600; font-size: 13px; }
  .import-modes label {
    display: flex; align-items: center; gap: 10px; padding: 11px 13px;
    border: 1px solid var(--line); border-radius: 13px; background: var(--glass-2);
    color: var(--ink-soft); font-size: 12.5px; line-height: 1.5; cursor: pointer;
    transition: border-color .25s, background-color .25s, color .25s;
  }
  .import-modes label:hover { border-color: var(--line-strong); }
  .import-modes label.on { border-color: var(--primary-tint); background: var(--primary-soft); color: var(--ink); box-shadow: inset 0 0 0 1px var(--primary-tint); }
  .import-modes input { flex: none; width: 15px; height: 15px; margin: 0; accent-color: var(--primary-fill); }
  .import-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .data-feedback { margin-top: 10px; }
</style>
