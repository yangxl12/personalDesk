<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { provideUi } from '#lib/ui.svelte'
  import Icon from '#lib/components/Icon.svelte'
  import Brand from '#lib/components/Brand.svelte'
  import Editor from '#lib/components/Editor.svelte'

  let { data, children } = $props()
  const ui = provideUi(() => data.preferences, () => data.model)
  let panel = $state<typeof import('#lib/components/ChatPanel.svelte').default>()
  let aiButton: HTMLButtonElement
  let mobile = $state(false)
  let previouslyFocused: HTMLElement | null = null
  // 移动端用 #ai 这条历史记录承载面板开关，安卓侧滑返回才会关面板而不是退出页面。
  const AI_HASH = '#ai'
  let pushed = false
  $effect(() => {
    if (ui.chatOpen && !panel) void import('#lib/components/ChatPanel.svelte').then(module => { panel = module.default })
    if (ui.chatOpen && mobile) document.body.classList.add('chat-fullscreen')
    return () => document.body.classList.remove('chat-fullscreen')
  })
  // 面板无论从哪打开，移动端都压一条 #ai 历史，侧滑返回才是关面板而不是退出页面。
  $effect(() => {
    if (!ui.chatOpen || !mobile || location.hash === AI_HASH) return
    pushed = true
    void goto(hashUrl(AI_HASH), { shallow: true })
  })
  // page.url 在 shallow 返回时不刷新，直接听原生事件读 location。
  function syncHash() {
    if (!mobile) return
    if (location.hash === AI_HASH) {
      if (!ui.chatOpen) ui.showChat()
    } else if (ui.chatOpen) {
      pushed = false
      ui.chatOpen = false
      focusBack()
    }
  }
  function hashUrl(hash: string) {
    const url = new URL(location.href)
    url.hash = hash
    return url
  }
  function focusBack() {
    void tick().then(() => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
      else aiButton?.focus()
    })
  }
  function openChat() {
    if (ui.chatOpen) { closeChat(); return }
    ui.notice = ''
    ui.showChat()
  }
  function closeChat() {
    if (mobile && location.hash === AI_HASH) {
      // 我们压入的记录用返回消费掉；直接带 #ai 进入的则替换掉，不留多余历史。
      if (pushed) { pushed = false; history.back(); return }
      ui.chatOpen = false
      void goto(hashUrl(''), { shallow: true, replace: true })
      focusBack()
      return
    }
    ui.chatOpen = false
    focusBack()
  }
  $effect(() => {
    if (ui.chatOpen) previouslyFocused = document.activeElement as HTMLElement | null
  })
  const titles: Record<string, string> = { '': '工作台', '/chats': 'AI 对话历史', '/settings': '设置' }
  let title = $derived(titles[(page.route.id ?? '').replace(/^\/\(app\)/, '')] ?? '工作台')

  $effect(() => {
    document.documentElement.dataset.theme = data.preferences.theme
    document.documentElement.lang = data.preferences.language
  })

  onMount(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const resize = () => { mobile = query.matches }
    resize()
    query.addEventListener('change', resize)
    window.addEventListener('buxu:revisions', localUpdate)
    window.addEventListener('popstate', syncHash)
    window.addEventListener('hashchange', syncHash)
    syncHash()
    return () => {
      query.removeEventListener('change', resize)
      window.removeEventListener('buxu:revisions', localUpdate)
      window.removeEventListener('popstate', syncHash)
      window.removeEventListener('hashchange', syncHash)
    }
  })

  // 本地写入完成后 commit() 会广播模块修订号，AI 面板据此重载消息。
  function localUpdate(event: Event) {
    const updated = (event as CustomEvent<Record<string, number>>).detail
    if (updated.chats || updated.preferences) ui.chatRevision++
  }

  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (ui.chatOpen && !ui.editor) closeChat()
  }
</script>

<svelte:head><title>{ui.t(title)} · {ui.t('步序')}</title></svelte:head>
<svelte:window onkeydown={escape} />

<div class="shell">
  <div class="workspace" inert={mobile && ui.chatOpen}>
    <header class="topbar">
      <Brand label={ui.t('步序')} />
      <div class="topbar-actions">
        <a class="button icon-button" href={resolve('settings')} aria-label={ui.t('设置')} title={ui.t('设置')}><Icon name="settings" size={19} /></a>
        <button bind:this={aiButton} class="button icon-button ai-toggle" class:active={ui.chatOpen} type="button"
          aria-label={ui.t(ui.aiRunning ? 'AI 正在生成' : 'AI 助手')} aria-expanded={ui.chatOpen} onclick={openChat}>
          <Icon name="ai" size={21} />
          {#if ui.aiRunning}<span class="ai-dot" aria-hidden="true"></span>{/if}
        </button>
      </div>
    </header>
    <main id="main" tabindex="-1">{@render children()}</main>
  </div>
  {#if panel}{@const Panel = panel}<Panel close={closeChat} {mobile} />{/if}
</div>
{#if ui.editor}
  {#key ui.editor}<Editor spec={ui.editor} />{/key}
{/if}
{#if ui.notice}<div class="toast" role="status">{ui.t(ui.notice)}</div>{/if}
