<script lang="ts">
  import { onMount } from 'svelte'
  import { updater } from '#lib/update.svelte'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  const ui = useUi()
  const status = $derived(updater.status)
  const busy = $derived(status === 'checking' || updater.applying)
  // 线上版本的构建时间：判断「推送了但没更新」时，先看它比自己的版本新还是旧。
  const built = $derived(updater.remote?.builtAt
    ? new Date(updater.remote.builtAt).toLocaleString(ui.preferences.language, { dateStyle: 'medium', timeStyle: 'short' })
    : '')

  onMount(() => updater.autoCheck())
</script>

<section class="settings-block">
  <header class="section-head"><h2><span class="section-icon"><Icon name="refresh" /></span>{ui.t('代码更新')}</h2></header>
  <div class="model-form">
    <p class="field-hint">{ui.t('拉取线上版本号，发现新版本后点一下就能换成最新代码，不用清缓存。')}</p>
    <p class="update-version">{ui.t('当前版本')}<code>{updater.version}</code></p>
    {#if status === 'available'}
      <p class="update-status is-new" role="status">
        <Icon name="spark" size={16} />{ui.t('发现新版本 {version}', { version: updater.remote?.id ?? '' })}{built ? ` · ${built}` : ''}
      </p>
    {:else if status === 'latest'}
      <p class="update-status" role="status"><Icon name="check" size={16} />{ui.t('已是最新版本')}</p>
    {:else if status === 'failed'}
      <p class="form-error" role="alert">{ui.t('检查失败：确认网络正常，或等构建跑完再试。')}</p>
    {:else if status === 'checking'}
      <p class="field-hint" role="status">{ui.t('正在检查…')}</p>
    {:else if status === 'dev'}
      <p class="field-hint">{ui.t('开发模式不检查更新，构建产物里才有版本号。')}</p>
    {/if}
    {#if updater.applying}
      <p class="field-hint" role="status">{ui.t('更新中，页面即将刷新…')}</p>
    {/if}
    <div class="update-actions">
      {#if status === 'available'}
        <button type="button" class="button primary" disabled={updater.applying} onclick={() => updater.apply()}>{ui.t('更新到最新版本')}</button>
        <button type="button" class="button secondary" disabled={busy} onclick={() => updater.check()}>{ui.t('再查一次')}</button>
      {:else}
        <button type="button" class="button secondary" disabled={busy || status === 'dev'} onclick={() => updater.check()}>{ui.t('检查更新')}</button>
      {/if}
    </div>
  </div>
</section>
