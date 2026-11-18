<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { provideUi } from '#lib/ui.svelte'
  import { refreshModules, request, RequestError } from '#lib/client'
  import type { Revisions } from '#lib/contracts/workspace'
  import Icon from '#lib/components/Icon.svelte'
  import Brand from '#lib/components/Brand.svelte'
  import Editor from '#lib/components/Editor.svelte'

  let { data, children } = $props()
  const ui = provideUi(() => data.preferences, () => data.model)
  let panel = $state<typeof import('#lib/components/ChatPanel.svelte').default>()
  let aiButton: HTMLButtonElement
  let mobile = $state(false)
  let previouslyFocused: HTMLElement | null = null
  $effect(() => {
    if (ui.chatOpen && !panel) void import('#lib/components/ChatPanel.svelte').then(module => { panel = module.default })
    if (ui.chatOpen && mobile) document.body.classList.add('chat-fullscreen')
    return () => document.body.classList.remove('chat-fullscreen')
  })
  function openChat() {
    if (ui.chatOpen) closeChat()
    else ui.showChat()
  }
  function closeChat() {
    ui.chatOpen = false
    void tick().then(() => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
      else aiButton?.focus()
    })
  }
  $effect(() => {
    if (ui.chatOpen) previouslyFocused = document.activeElement as HTMLElement | null
  })
  const titles: Record<string, string> = { '/': '工作台', '/chats': 'AI 对话历史', '/settings': '设置' }
  let title = $derived(titles[page.url.pathname] ?? '工作台')
  let revisions: Revisions = {}
  let checking = false

  $effect(() => {
    document.documentElement.dataset.theme = data.preferences.theme
    document.documentElement.lang = data.preferences.language
  })

  onMount(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const resize = () => { mobile = query.matches }
    resize()
    query.addEventListener('change', resize)
    revisions = { ...data.revisions }
    const sync = setInterval(check, 15_000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    window.addEventListener('buxu:revisions', localUpdate)
    return () => {
      query.removeEventListener('change', resize)
      clearInterval(sync)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', check)
      window.removeEventListener('buxu:revisions', localUpdate)
    }
  })

  async function check() {
    if (document.hidden || checking) return
    checking = true
    try {
      const { data: latest } = await request<Revisions>('/revisions')
      const changed = Object.fromEntries(Object.entries(latest).filter(([module, revision]) => revision > (revisions[module] ?? 0)))
      if (Object.keys(changed).length === 0) return
      if (ui.editor) ui.remoteChange = true
      if (changed.chats || changed.preferences) ui.chatRevision++
      await refreshModules(changed)
      for (const [module, revision] of Object.entries(latest)) revisions[module] = Math.max(revision, revisions[module] ?? 0)
    } catch (failure) {
      if (failure instanceof RequestError && failure.status === 401 && !ui.editor) await goto('/login')
    } finally {
      checking = false
    }
  }

  function localUpdate(event: Event) {
    const updated = (event as CustomEvent<Revisions>).detail
    if (updated.chats || updated.preferences) ui.chatRevision++
    for (const [module, revision] of Object.entries(updated)) revisions[module] = Math.max(revision, revisions[module] ?? 0)
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
        <a class="button icon-button" href="/settings" aria-label={ui.t('设置')} title={ui.t('设置')}><Icon name="settings" size={19} /></a>
        <div class="account" title={data.user.username}>
          <span class="avatar" aria-hidden="true">{data.user.username.slice(0, 1).toUpperCase()}</span>
          <span class="account-name">{data.user.username}</span>
        </div>
        <button bind:this={aiButton} class="button icon-button ai-toggle" class:active={ui.chatOpen} type="button"
          aria-label={ui.t('AI 助手')} aria-expanded={ui.chatOpen} onclick={openChat}><Icon name="ai" size={21} /></button>
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
