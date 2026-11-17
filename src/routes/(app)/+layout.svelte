<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { provideUi } from '#lib/ui.svelte'
  import { refreshModules, request, RequestError } from '#lib/client'
  import type { Revisions } from '#lib/contracts/workspace'
  import Icon from '#lib/components/Icon.svelte'
  import Brand from '#lib/components/Brand.svelte'
  import Editor from '#lib/components/Editor.svelte'
  import MobileDrawer from '#lib/components/MobileDrawer.svelte'

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
  const pages = [
    ['/', 'home', '工作台'], ['/chats', 'chats', 'AI 对话历史'], ['/settings', 'settings', '设置']
  ]
  let current = $derived(pages.find(([href]) => page.url.pathname === href || (href !== '/' && page.url.pathname.startsWith(href + '/'))) ?? pages[0])
  let menu = $state(false)
  let sidebarCollapsed = $state(false)
  let revisions: Revisions = {}
  let checking = false

  afterNavigate(() => { menu = false })

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

  let menuButton = $state<HTMLButtonElement>()
  async function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (ui.chatOpen && !ui.editor) { closeChat(); return }
    if (!menu) return
    menu = false
    await tick()
    menuButton?.focus()
  }
</script>

<svelte:head><title>{ui.t(current[2])} · {ui.t('步序')}</title></svelte:head>
<svelte:window onkeydown={escape} />

{#snippet nav()}
  {#each pages as [href, icon, label]}
    <a {href} class:selected={current[0] === href} class="nav-link" aria-current={current[0] === href ? 'page' : undefined} aria-label={ui.t(label)}>
      <Icon name={icon} />{ui.t(label)}
    </a>
  {/each}
{/snippet}

<div class="shell">
  <aside id="desktop-menu" hidden={sidebarCollapsed} inert={ui.chatOpen && mobile} class="sidebar" aria-label={ui.t('主菜单')}>
    <div class="brand-area"><Brand label={ui.t('步序')} /></div>
    <nav aria-label={ui.t('页面')}>{@render nav()}</nav>
    <div class="sidebar-foot"><span class="avatar" aria-hidden="true">{data.user.username.slice(0, 1).toUpperCase()}</span><div><strong>{data.user.username}</strong><small>{ui.t('我的空间')}</small></div></div>
  </aside>
  <div class="workspace" inert={mobile && (ui.chatOpen || menu)}>
    <header class="topbar">
      <button bind:this={menuButton} class="button icon-button menu-toggle" type="button"
        aria-label={ui.t((mobile ? menu : !sidebarCollapsed) ? '关闭菜单' : '展开菜单')}
        aria-expanded={mobile ? menu : !sidebarCollapsed} aria-controls={mobile ? 'mobile-menu' : 'desktop-menu'}
        onclick={() => { if (mobile) menu = !menu; else sidebarCollapsed = !sidebarCollapsed }}><Icon name="menu" /></button>
      <button bind:this={aiButton} class="button icon-button ai-toggle" class:active={ui.chatOpen} type="button"
        aria-label={ui.t('AI 助手')} aria-expanded={ui.chatOpen} onclick={openChat}><Icon name="ai" size={21} /></button>
    </header>
    <main id="main" tabindex="-1">{@render children()}</main>
  </div>
  {#if panel}{@const Panel = panel}<Panel close={closeChat} {mobile} />{/if}
  <MobileDrawer bind:open={menu} {mobile} disabled={ui.chatOpen || !!ui.editor} trigger={menuButton} username={data.user.username}>
    {@render nav()}
  </MobileDrawer>
</div>
{#if ui.editor}
  {#key ui.editor}<Editor spec={ui.editor} />{/key}
{/if}
{#if ui.notice}<div class="toast" role="status">{ui.t(ui.notice)}</div>{/if}
