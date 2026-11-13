<script lang="ts">
  import { untrack } from 'svelte'
  import { invalidate } from '$app/navigation'
  import { deepseekBaseUrl, deepseekModel, deploymentModelRef, type ModelProfile, type ModelProvider, type ModelSettings } from '#lib/contracts/model'
  import { refreshModel, request, RequestError } from '#lib/client'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  let { settings }: { settings: ModelSettings | null } = $props()
  const ui = useUi()
  let baseline = $state(untrack(() => settings))
  let editor = $state<Omit<ModelProfile, 'ref' | 'label'> & { ref?: string; label: string; apiKey: string } | null>(null)
  let deleting = $state<ModelProfile | null>(null)
  let busy = $state<'save' | 'test' | 'activate' | 'delete' | null>(null)
  let status = $state('')
  let failure = $state('')
  let original = $derived(baseline?.models.find(model => model.ref === editor?.ref))
  let stale = $derived(!!(settings && baseline && settings.version > baseline.version))
  let canReuseKey = $derived(!!(editor && original && original.provider === editor.provider &&
    (editor.provider === 'deepseek' || origin(editor.baseUrl) === origin(original.baseUrl))))

  $effect(() => {
    if (settings && !editor && !deleting && !busy && (!baseline || stale)) baseline = settings
  })

  function origin(value: string) {
    try { return new URL(value).origin } catch { return '' }
  }

  function clearFeedback() {
    status = ''
    failure = ''
  }

  function openEditor(profile?: ModelProfile) {
    clearFeedback()
    deleting = null
    editor = profile ? { ...profile, label: profile.label ?? '', apiKey: '' } : { provider: 'deepseek', id: deepseekModel, label: '', baseUrl: deepseekBaseUrl, apiKey: '' }
  }

  function changeProvider(provider: ModelProvider) {
    if (!editor) return
    editor.provider = provider
    editor.id = original?.provider === provider ? original.id : provider === 'deepseek' ? deepseekModel : ''
    editor.baseUrl = original?.provider === provider ? original.baseUrl : provider === 'deepseek' ? deepseekBaseUrl : ''
    editor.apiKey = ''
    clearFeedback()
  }

  function reload() {
    if (settings) baseline = settings
    editor = null
    deleting = null
    clearFeedback()
  }

  const feedback = { save: 'AI 配置已保存', test: '连接成功', activate: '已切换当前模型', delete: 'AI 配置已删除' }

  async function submit(action: keyof typeof feedback, ref?: string) {
    if (!baseline || busy || stale) return
    const { version } = baseline
    const path = action === 'test' ? '/test' : action === 'activate' ? '/active' : action === 'delete' ? '/' + ref : ''
    const body = action === 'activate' ? { ref, version } : action === 'delete' ? { version } : { ...editor, version }
    busy = action
    clearFeedback()
    try {
      const { data } = await request<ModelSettings | null>('/ai/settings' + path, {
        method: action === 'test' ? 'POST' : action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      })
      if (data) {
        baseline = data
        editor = null
        deleting = null
        await refreshModel(data.version)
      }
      status = feedback[action]
    } catch (error) {
      failure = error instanceof RequestError ? error.message : '连接失败，请重试'
      if (error instanceof RequestError && error.code === 'VERSION_CONFLICT') await invalidate('buxu:model')
    } finally {
      busy = null
    }
  }
</script>

<section id="ai-settings" class="card settings-card" aria-labelledby="ai-settings-heading">
  <header class="section-head">
    <h2 id="ai-settings-heading"><span class="section-icon"><Icon name="spark" /></span>{ui.t('AI 设置')}</h2>
    {#if baseline}
      <button class="button secondary add-model" type="button" disabled={!!busy || !!editor} onclick={() => openEditor()}>
        <Icon name="plus" size={16} />{ui.t('添加模型')}
      </button>
    {/if}
  </header>
  {#if baseline}
    {#if baseline.models.length}
      <ul class="model-list" aria-label={ui.t('已配置模型')}>
        {#each baseline.models as profile (profile.ref)}
          <li class:active={profile.ref === baseline.activeRef}>
            <div class="model-info">
              <div><strong>{profile.label || profile.id}</strong>{#if profile.ref === baseline.activeRef}<span class="model-badge">{ui.t('当前模型')}</span>{/if}</div>
              <small>{profile.provider === 'deepseek' ? 'DeepSeek' : ui.t('自定义兼容接口')}{profile.label ? ' · ' + profile.id : ''}{profile.ref === deploymentModelRef ? ' · ' + ui.t('部署配置') : ''}</small>
              {#if profile.provider === 'openai-compatible'}<small class="endpoint">{profile.baseUrl}</small>{/if}
            </div>
            <div class="row-actions">
              {#if profile.ref !== baseline.activeRef}
                <button class="button secondary" type="button" disabled={!!busy || !!editor || !!deleting} onclick={() => submit('activate', profile.ref)}>{ui.t('设为当前')}</button>
              {/if}
              {#if profile.ref !== deploymentModelRef}
                <button class="button secondary" type="button" disabled={!!busy || !!editor} onclick={() => openEditor(profile)}>{ui.t('编辑')}</button>
                <button class="button secondary remove-model" type="button" disabled={!!busy || !!editor} onclick={() => { clearFeedback(); deleting = profile }}>{ui.t('删除')}</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else if !editor}
      <p class="field-hint">{ui.t('暂无已配置的模型')}</p>
    {/if}
    {#if deleting}
      <div class="model-editor">
        <p class="delete-copy">{ui.t('删除模型「{model}」及其保存的密钥？', { model: deleting.label || deleting.id })}</p>
        <div class="actions">
          <button class="button secondary" type="button" disabled={!!busy} onclick={() => { deleting = null; clearFeedback() }}>{ui.t('取消')}</button>
          <button class="button danger" type="button" disabled={!!busy || stale} onclick={() => submit('delete', deleting?.ref)}>{ui.t('确认删除')}</button>
        </div>
      </div>
    {/if}
    {#if editor}
      <form method="post" class="model-form model-editor" aria-busy={!!busy} oninput={clearFeedback} onsubmit={event => {
        event.preventDefault()
        const action = (event.submitter as HTMLButtonElement | null)?.value === 'test' ? 'test' : 'save'
        void submit(action)
      }}>
        <h3>{ui.t(editor.ref ? '编辑模型' : '添加模型')}</h3>
        <label class="field">{ui.t('模型服务')}
          <select value={editor.provider} disabled={!!busy} onchange={event => changeProvider(event.currentTarget.value as ModelProvider)}>
            <option value="deepseek">DeepSeek</option>
            <option value="openai-compatible">{ui.t('自定义兼容接口')}</option>
          </select>
        </label>
        {#if editor.provider === 'openai-compatible'}
          <label class="field">{ui.t('接口地址')}
            <input type="url" bind:value={editor.baseUrl} disabled={!!busy} required maxlength="2048" placeholder="https://api.example.com/v1" spellcheck="false">
          </label>
        {/if}
        <label class="field">{ui.t('模型名称')}
          <input bind:value={editor.id} disabled={!!busy} required maxlength="200" spellcheck="false">
        </label>
        <label class="field">{ui.t('显示名称（可选）')}
          <input bind:value={editor.label} disabled={!!busy} maxlength="100">
        </label>
        <label class="field">API Key
          <input type="password" bind:value={editor.apiKey} disabled={!!busy} required={!canReuseKey} maxlength="2048" autocomplete="new-password"
            aria-describedby="ai-key-hint" placeholder={canReuseKey ? ui.t('留空以保留当前密钥') : undefined}>
        </label>
        <p id="ai-key-hint" class="field-hint">{ui.t('API Key 在服务端加密保存，保存后仅可更换。')}</p>
        <div class="actions">
          <button class="button secondary" type="button" disabled={!!busy} onclick={() => { editor = null; clearFeedback() }}>{ui.t('取消')}</button>
          <button class="button secondary" type="submit" value="test" disabled={!!busy || stale}>{ui.t(busy === 'test' ? '正在测试…' : '测试连接')}</button>
          <button class="button primary" type="submit" value="save" disabled={!!busy || stale}>{ui.t(busy === 'save' ? '正在保存…' : '保存 AI 配置')}</button>
        </div>
      </form>
    {/if}
    {#if failure}<p class="form-error feedback" role="alert">{ui.t(failure)}</p>{/if}
    {#if status}<p class="result feedback" role="status">{ui.t(status)}</p>{/if}
    {#if stale}
      <button class="button secondary feedback" type="button" disabled={!!busy} onclick={reload}>{ui.t('载入最新配置')}</button>
    {/if}
  {:else}
    <p class="form-error" role="alert">{ui.t('无法读取已保存的 AI 配置')}</p>
  {/if}
</section>

<style>
  #ai-settings { min-width: 0; scroll-margin-top: 82px; }
  .add-model { gap: 5px; white-space: nowrap; }
  .model-list { display: grid; gap: 8px; list-style: none; padding: 0; margin: 0; }
  .model-list li { display: flex; align-items: center; flex-wrap: wrap; gap: 9px 12px; padding: 10px 11px; border: 1px solid var(--border); border-radius: 10px; }
  .model-list li.active { border-color: var(--primary); }
  .model-info { flex: 1 1 140px; min-width: 0; display: grid; gap: 2px; overflow-wrap: anywhere; }
  .model-info > div { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .model-info small { color: var(--muted); }
  .model-info .endpoint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-badge { color: var(--primary); background: var(--primary-soft); border-radius: 999px; padding: 2px 7px; font-size: 11px; white-space: nowrap; }
  .row-actions, .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
  .row-actions { margin-inline-start: auto; }
  .row-actions .button { min-height: 34px; padding: 4px 8px; font-size: 12px; }
  .remove-model { color: var(--negative); }
  .model-editor { margin-top: 14px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--base); }
  .model-editor .button { min-width: auto; }
  .model-editor h3 { font-size: 14px; }
  .delete-copy { margin-bottom: 8px; }
  .feedback { margin-top: 10px; }
  .result { color: var(--positive); font-size: 13px; }
</style>
