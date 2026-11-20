<script lang="ts">
  import { randomId } from '#lib/random-id'
  import { goto, invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { useUi } from '#lib/ui.svelte'
  import { commit, refreshModules, RequestError } from '#lib/client'
  import type { Preferences } from '#lib/contracts/workspace'
  import DataSettings from '#lib/components/DataSettings.svelte'
  import PwaSettings from '#lib/components/PwaSettings.svelte'
  import UpdateSettings from '#lib/components/UpdateSettings.svelte'
  import ModelSettings from '#lib/components/ModelSettings.svelte'
  import Icon from '#lib/components/Icon.svelte'

  let { data } = $props()
  const ui = useUi()
  type Appearance = Pick<Preferences, 'theme' | 'language'>
  const themes = [['system', 'monitor', '跟随系统'], ['light', 'sun', '明亮'], ['dark', 'moon', '暗黑']] as const
  let pendingAppearance = $state<Appearance | null>(null)
  let appearanceFailure = $state('')
  // AI 数据访问开关已取消，一律放开；写回时固定带上，旧数据里的 0 也能被覆盖掉。
  const access = { ai_goals: 1, ai_notes: 1, ai_finance: 1 } as const

  function back() {
    // 从别处进来就退回去；直接打开设置页（PWA / 刷新）时退回工作台。
    if (history.length > 1) history.back()
    else void goto(resolve(''))
  }

  // 主题和语言改一下就存，没有提交按钮；时区沿用已有值，界面上不再暴露。
  async function saveAppearance(changes: Partial<Appearance>) {
    if (pendingAppearance) return
    const { theme, language, timezone, version } = ui.preferences
    pendingAppearance = { theme, language, ...changes }
    appearanceFailure = ''
    try {
      const body = { ...pendingAppearance, timezone, ...access, version }
      const response = await commit<Preferences>('PATCH', '/preferences', body, randomId())
      if (response.revisions) await refreshModules(response.revisions)
      ui.notify('已保存')
    } catch (error) {
      appearanceFailure = ui.error(error)
      if (error instanceof RequestError && error.code === 'VERSION_CONFLICT') await invalidate('buxu:preferences')
    } finally {
      pendingAppearance = null
    }
  }
</script>

<header class="page-bar">
  <button class="button icon-button" type="button" aria-label={ui.t('返回')} title={ui.t('返回')} onclick={back}>
    <Icon name="chevronLeft" size={20} />
  </button>
  <h1>{ui.t('设置')}</h1>
</header>
<div class="card settings-panel">
  <ModelSettings settings={data.modelSettings} />
  <section class="settings-block">
    <header class="section-head"><h2><span class="section-icon"><Icon name="settings" /></span>{ui.t('个人偏好')}</h2></header>
    <div class="model-form">
      <fieldset class="theme-picker" disabled={!!pendingAppearance}>
        <legend>{ui.t('主题')}</legend>
        <div class="theme-options">
          {#each themes as [value, icon, label]}
            <label title={ui.t(label)}><input type="radio" name="theme" {value} aria-label={ui.t(label)}
              checked={(pendingAppearance ?? ui.preferences).theme === value}
              onchange={() => saveAppearance({ theme: value })}><span><Icon name={icon} size={18} /></span></label>
          {/each}
        </div>
      </fieldset>
      <label class="field">{ui.t('语言')}
        <select name="language" value={(pendingAppearance ?? ui.preferences).language} disabled={!!pendingAppearance}
          onchange={event => saveAppearance({ language: event.currentTarget.value as Preferences['language'] })}><option value="zh-CN" lang="zh-CN">简体中文</option><option value="en" lang="en">English</option></select>
      </label>
      {#if pendingAppearance}<p class="field-hint" role="status">{ui.t('正在保存…')}</p>{/if}
      {#if appearanceFailure}<p class="form-error" role="alert">{appearanceFailure}</p>{/if}
    </div>
  </section>
  <UpdateSettings />
  <PwaSettings />
  <DataSettings />
</div>
