<script lang="ts">
  import { randomId } from '#lib/random-id'
  import { invalidate } from '$app/navigation'
  import { useUi } from '#lib/ui.svelte'
  import { commit, refreshModules, RequestError } from '#lib/client'
  import type { Preferences } from '#lib/contracts/workspace'
  import DataSettings from '#lib/components/DataSettings.svelte'
  import ModelSettings from '#lib/components/ModelSettings.svelte'
  import Icon from '#lib/components/Icon.svelte'

  let { data } = $props()
  const ui = useUi()
  let busy = $state(false)
  let dirty = $state(false)
  let failure = $state('')
  let baseVersion = $state(0)
  type Appearance = Pick<Preferences, 'theme' | 'language'>
  const themes = [['system', 'monitor', '跟随系统'], ['light', 'sun', '明亮'], ['dark', 'moon', '暗黑']] as const
  let pendingAppearance = $state<Appearance | null>(null)
  let appearanceFailure = $state('')
  let timezone = $state('')
  const access = [['ai_goals', '目标管理'], ['ai_notes', '思考记录'], ['ai_finance', '财务概览']] as const
  let selectedAccess = $state({ ai_goals: 0, ai_notes: 0, ai_finance: 0 })
  let current = $state<Preferences | null>(null)
  let attempt: { fingerprint: string; key: string } | undefined

  $effect(() => {
    if (dirty) return
    timezone = ui.preferences.timezone
    selectedAccess = { ai_goals: ui.preferences.ai_goals, ai_notes: ui.preferences.ai_notes, ai_finance: ui.preferences.ai_finance }
  })

  function markDirty() {
    if (!dirty) baseVersion = ui.preferences.version
    dirty = true
  }

  async function persist(body: Omit<Preferences, 'ai_version'>) {
    const fingerprint = JSON.stringify(body)
    if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, key: randomId() }
    const response = await commit<Preferences>('PATCH', '/preferences', body, attempt.key)
    if (response.revisions) await refreshModules(response.revisions)
    ui.notify('已保存')
    return response.data
  }

  async function saveAppearance(changes: Partial<Appearance>) {
    if (busy || pendingAppearance) return
    const { theme, language, timezone, ai_goals, ai_notes, ai_finance, version } = ui.preferences
    pendingAppearance = { theme, language, ...changes }
    appearanceFailure = ''
    try {
      const saved = await persist({ ...pendingAppearance, timezone, ai_goals, ai_notes, ai_finance, version })
      if (dirty && baseVersion === version) baseVersion = saved.version
      if (current) current = ui.preferences
    } catch (error) {
      appearanceFailure = ui.error(error)
      if (error instanceof RequestError && error.code === 'VERSION_CONFLICT') await invalidate('buxu:preferences')
    } finally {
      pendingAppearance = null
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (busy || pendingAppearance || current) return
    const values = new FormData(event.currentTarget as HTMLFormElement)
    const { theme, language } = ui.preferences
    const body = { theme, language, timezone: String(values.get('timezone') ?? ''),
      ai_goals: Number(values.has('ai_goals')), ai_notes: Number(values.has('ai_notes')), ai_finance: Number(values.has('ai_finance')),
      version: baseVersion || ui.preferences.version }
    busy = true
    failure = ''
    try {
      await persist(body)
      dirty = false
      baseVersion = 0
    } catch (error) {
      failure = ui.error(error)
      if (error instanceof RequestError && error.code === 'VERSION_CONFLICT') {
        current = (error.fields as { current: Preferences }).current
        await invalidate('buxu:preferences')
      }
    } finally {
      busy = false
    }
  }
</script>

<header class="page-head"><h1>{ui.t('设置')}</h1></header>
<div class="settings-grid">
  <ModelSettings settings={data.modelSettings} />
  <section class="card settings-card">
    <header class="section-head"><h2><span class="section-icon"><Icon name="settings" /></span>{ui.t('个人偏好')}</h2></header>
      <form class="model-form" onsubmit={save}>
        <fieldset class="theme-picker" disabled={busy || !!pendingAppearance}>
          <legend>{ui.t('主题')}</legend>
          <div class="theme-options">
            {#each themes as [value, icon, label]}
              <label><input type="radio" name="theme" {value} checked={(pendingAppearance ?? ui.preferences).theme === value}
                onchange={() => saveAppearance({ theme: value })}><span><Icon name={icon} size={18} />{ui.t(label)}</span></label>
            {/each}
          </div>
        </fieldset>
        <label class="field">{ui.t('语言')}
          <select name="language" value={(pendingAppearance ?? ui.preferences).language} disabled={busy || !!pendingAppearance}
            onchange={event => saveAppearance({ language: event.currentTarget.value as Preferences['language'] })}><option value="zh-CN" lang="zh-CN">简体中文</option><option value="en" lang="en">English</option></select>
        </label>
        {#if pendingAppearance}<p class="field-hint" role="status">{ui.t('正在保存…')}</p>{/if}
        {#if appearanceFailure}<p class="form-error" role="alert">{appearanceFailure}</p>{/if}
        <label class="field">{ui.t('账号时区')}
          <input name="timezone" value={dirty ? timezone : ui.preferences.timezone} oninput={event => {
            timezone = event.currentTarget.value
            markDirty()
          }} disabled={busy} required placeholder="Asia/Shanghai" list="timezones">
        </label>
        <datalist id="timezones"><option value="Asia/Shanghai"></option><option value="Asia/Tokyo"></option><option value="Europe/London"></option><option value="America/New_York"></option><option value="UTC"></option></datalist>
        {#if dirty && baseVersion !== ui.preferences.version}<p class="field-hint" role="status">{ui.t('数据已在另一端更新，当前输入已保留。')}</p>{/if}
        {#if failure}<p class="form-error" role="alert">{failure}</p>{/if}
        {#if current}
          <p class="field-hint">{ui.t('当前已保存的内容')} · {ui.t({ system: '跟随系统', light: '明亮', dark: '暗黑' }[current.theme])} · {current.language} · {current.timezone}</p>
          <button class="button secondary" type="button" disabled={busy || !!pendingAppearance} onclick={() => {
            baseVersion = current?.version ?? baseVersion
            current = null
            failure = ''
          }}>{ui.t('保留草稿并采用最新版本')}</button>
        {/if}
        <fieldset class="access-options" disabled={busy}>
          <legend>{ui.t('AI 数据访问')}</legend>
          <p class="field-hint">{ui.t('启用后，相关记录可能随对话发送给当前模型供应商。')}</p>
          {#each access as [name, label]}
            <label><input type="checkbox" {name} checked={!!(dirty ? selectedAccess[name] : ui.preferences[name])}
              onchange={event => {
                selectedAccess[name] = Number(event.currentTarget.checked)
                markDirty()
              }}>{ui.t(label)}</label>
          {/each}
        </fieldset>
        <button class="button primary" type="submit" disabled={busy || !!pendingAppearance || !!current}>{ui.t('保存')}</button>
      </form>
  </section>
  <section class="card settings-card">
    <header class="section-head"><h2><span class="section-icon"><Icon name="settings" /></span>{ui.t('账号')}</h2></header>
    <form method="POST" action="/logout" data-sveltekit-reload><button class="button secondary" type="submit">{ui.t('退出登录')}</button></form>
  </section>
  <DataSettings />
</div>
