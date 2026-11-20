<script lang="ts">
  import { onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { provideUi } from '#lib/ui.svelte'
  import { pwa, syncThemeColor } from '#lib/pwa.svelte'
  import { updater } from '#lib/update.svelte'
  import Icon from '#lib/components/Icon.svelte'
  import Editor from '#lib/components/Editor.svelte'

  let { data, children } = $props()
  const ui = provideUi(() => data.preferences, () => data.model)
  const titles: Record<string, string> = { '': '工作台', '/ai': 'AI 助手', '/chats': 'AI 对话历史', '/settings': '设置' }
  const path = $derived((page.route.id ?? '').replace(/^\/\(app\)/, ''))
  let title = $derived(titles[path] ?? '工作台')

  $effect(() => {
    document.documentElement.dataset.theme = data.preferences.theme
    document.documentElement.lang = data.preferences.language
    // 主题定下来之后再同步状态栏颜色，读到的才是最终底色。
    syncThemeColor()
  })

  onMount(() => {
    pwa.init()
    updater.init()
    window.addEventListener('buxu:revisions', localUpdate)
    return () => window.removeEventListener('buxu:revisions', localUpdate)
  })

  // 本地写入完成后 commit() 会广播模块修订号，AI 页面据此重载消息。
  function localUpdate(event: Event) {
    const updated = (event as CustomEvent<Record<string, number>>).detail
    if (updated.chats || updated.preferences) ui.chatRevision++
  }
</script>

<svelte:head><title>{ui.t(title)} · {ui.t('步序')}</title></svelte:head>

<div class="shell">
  <div class="workspace">
    <!-- 顶栏去掉后只留右上角两个悬浮按钮；当前页自己的入口不再重复给。 -->
    <div class="float-actions">
      {#if path !== '/settings'}
        <a class="button icon-button" href={resolve('settings')} aria-label={ui.t('设置')} title={ui.t('设置')}><Icon name="settings" size={19} /></a>
      {/if}
      {#if path !== '/ai'}
        <a class="button icon-button ai-toggle" href={resolve('ai')} aria-label={ui.t('AI 助手')} title={ui.t('AI 助手')}><Icon name="ai" size={21} /></a>
      {/if}
    </div>
    <main id="main" tabindex="-1">{@render children()}</main>
  </div>
</div>
{#if ui.editor}
  {#key ui.editor}<Editor spec={ui.editor} />{/key}
{/if}
{#if ui.notice}<div class="toast" role="status">{ui.t(ui.notice)}</div>{/if}
