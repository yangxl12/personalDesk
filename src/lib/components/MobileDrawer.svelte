<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from 'svelte'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'
  import Brand from './Brand.svelte'

  let { open = $bindable(false), mobile, disabled = false, trigger, username, children }: {
    open?: boolean
    mobile: boolean
    disabled?: boolean
    trigger: HTMLButtonElement | undefined
    username: string
    children: Snippet
  } = $props()
  const ui = useUi()
  let drawer: HTMLElement
  let progress = $state(0)
  let dragging = $state(false)
  let active = $derived(mobile && (open || dragging))
  let gesture: {
    id: number; x: number; y: number; width: number; start: number; wasOpen: boolean
    lastX: number; lastTime: number; velocity: number; moved: boolean
  } | null = null
  let suppressClickUntil = 0
  // Browsers do not expose Android's configurable system-gesture insets. Reserve
  // both edges on every platform and start drawer swipes inside the page instead.
  const systemEdge = 64
  const openingBand = 48
  const systemBottom = 32

  function close() {
    open = false
  }

  $effect(() => {
    if (!mobile || disabled) {
      gesture = null
      dragging = false
      progress = 0
      open = false
    }
  })

  $effect(() => {
    const isOpen = open
    untrack(() => {
      if (!dragging) progress = isOpen ? 1 : 0
      if (isOpen) {
        void tick().then(() => {
          if (open) drawer.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true })
        })
      } else if (drawer?.contains(document.activeElement)) {
        trigger?.focus({ preventScroll: true })
      }
    })
  })

  // Fixed positioning also locks the page on iOS, and restores its exact scroll position.
  $effect(() => {
    if (!active) return
    const { scrollX, scrollY } = window
    const body = document.body
    const saved = { position: body.style.position, top: body.style.top, left: body.style.left,
      right: body.style.right, width: body.style.width, overflow: body.style.overflow }
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, left: `-${scrollX}px`,
      right: '0', width: '100%', overflow: 'hidden' })
    return () => {
      Object.assign(body.style, saved)
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
    }
  })

  onMount(() => {
    function start(event: TouchEvent) {
      suppressClickUntil = 0
      if (event.touches.length !== 1) { cancel(); return }
      if (!mobile || disabled) return
      const touch = event.touches[0]
      const target = event.target instanceof Element ? event.target : null
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = window.innerHeight
      if (touch.clientX < systemEdge || touch.clientX > viewportWidth - systemEdge ||
        touch.clientY > viewportHeight - systemBottom || (window.visualViewport?.scale ?? 1) > 1.01) return
      // A right swipe beginning 64–112 CSS pixels from the left opens the drawer.
      // Gestures that start at either screen edge always belong to the browser/OS.
      if (!open && (touch.clientX > systemEdge + openingBand ||
        target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [data-sort-handle]'))) return
      const width = drawer.getBoundingClientRect().width
      const translate = new DOMMatrixReadOnly(getComputedStyle(drawer).transform).m41
      const visible = Math.max(0, Math.min(1, 1 + translate / width))
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, width, start: visible,
        wasOpen: open, lastX: touch.clientX, lastTime: event.timeStamp, velocity: 0, moved: false }
    }

    function move(event: TouchEvent) {
      if (!gesture) return
      if (event.touches.length !== 1 || !event.cancelable) { cancel(); return }
      const touch = Array.from(event.touches).find(item => item.identifier === gesture?.id)
      if (!touch) return
      const dx = touch.clientX - gesture.x
      const dy = touch.clientY - gesture.y
      if (!gesture.moved) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return
        if (Math.abs(dx) < Math.abs(dy) * 1.25 || (!gesture.wasOpen && dx < 0)) { gesture = null; return }
        gesture.moved = true
        dragging = true
      }
      event.preventDefault()
      const elapsed = event.timeStamp - gesture.lastTime
      if (elapsed > 0) gesture.velocity = (touch.clientX - gesture.lastX) / elapsed
      gesture.lastX = touch.clientX
      gesture.lastTime = event.timeStamp
      progress = Math.max(0, Math.min(1, gesture.start + dx / gesture.width))
    }

    function finish(event: TouchEvent) {
      if (!gesture || !Array.from(event.changedTouches).some(item => item.identifier === gesture?.id)) return
      const completed = gesture
      gesture = null
      if (!completed.moved) return
      suppressClickUntil = performance.now() + 400
      const velocity = event.timeStamp - completed.lastTime < 100 ? completed.velocity : 0
      // A quick flick commits immediately; slower drags settle according to distance.
      const next = Math.abs(velocity) > 0.45 ? velocity > 0 : progress > (completed.wasOpen ? 0.65 : 0.35)
      dragging = false
      progress = next ? 1 : 0
      open = next
    }

    function cancel() {
      if (!gesture) return
      const moved = gesture.moved
      gesture = null
      dragging = false
      progress = open ? 1 : 0
      if (moved) suppressClickUntil = performance.now() + 400
    }

    function click(event: MouseEvent) {
      if (performance.now() < suppressClickUntil && event.detail > 0) {
        suppressClickUntil = 0
        event.preventDefault()
        event.stopImmediatePropagation()
      } else if (open && event.target instanceof Element && drawer.contains(event.target) &&
        event.target.closest('a[href]') && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        close()
      }
    }

    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', finish, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    document.addEventListener('click', click, true)
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', finish)
      document.removeEventListener('touchcancel', cancel)
      document.removeEventListener('click', click, true)
    }
  })

  function keydown(event: KeyboardEvent) {
    if (!open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    } else if (event.key === 'Tab') {
      const items = Array.from(drawer.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'))
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
        event.preventDefault()
        first?.focus()
      }
    }
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="drawer-layer" class:active class:dragging style:--drawer-progress={progress}>
  <button class="drawer-backdrop" type="button" aria-label={ui.t('关闭菜单')} tabindex="-1" onclick={close}></button>
  <div bind:this={drawer} id="mobile-menu" class="mobile-drawer" role="dialog"
    aria-modal={open ? 'true' : undefined} aria-label={ui.t('主菜单')} aria-hidden={!open} inert={!open} tabindex="-1">
    <header class="drawer-head">
      <Brand label={ui.t('步序')} />
      <button class="button icon-button" type="button" aria-label={ui.t('关闭菜单')} onclick={close}><Icon name="close" /></button>
    </header>
    <div class="drawer-caption">{ui.t('我的空间')}</div>
    <nav class="drawer-nav" aria-label={ui.t('移动端页面')}>{@render children()}</nav>
    <div class="sidebar-foot drawer-foot">
      <span class="avatar" aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>
      <div><strong>{username}</strong><small>{ui.t('我的空间')}</small></div>
    </div>
  </div>
</div>

<style>
  .drawer-layer { display: none; }
  @media (max-width: 760px) {
    .drawer-layer {
      --drawer-duration: 320ms;
      --drawer-ease: cubic-bezier(.22, 1, .36, 1);
      display: block; position: fixed; inset: 0; z-index: 20; isolation: isolate;
      visibility: hidden; pointer-events: none;
      transition: visibility 0s linear var(--drawer-duration);
    }
    .drawer-layer.active { visibility: visible; pointer-events: auto; transition-delay: 0s; }
    .drawer-backdrop {
      position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0;
      background: #15102566; opacity: var(--drawer-progress); cursor: default;
      transition: opacity var(--drawer-duration) var(--drawer-ease);
    }
    .mobile-drawer {
      position: absolute; inset: 0 auto 0 0; width: min(304px, calc(100vw - 56px)); height: 100dvh;
      display: flex; flex-direction: column; padding: 18px 16px max(16px, env(safe-area-inset-bottom));
      padding-top: max(18px, env(safe-area-inset-top)); padding-left: max(16px, env(safe-area-inset-left));
      background: var(--paper); border-right: 1px solid var(--border); border-radius: 0 22px 22px 0;
      box-shadow: 12px 0 48px #1510251f; overflow: hidden; outline: none;
      transform: translate3d(calc((var(--drawer-progress) - 1) * 100%), 0, 0);
      transition: transform var(--drawer-duration) var(--drawer-ease);
    }
    .active .mobile-drawer { will-change: transform; }
    .dragging .mobile-drawer, .dragging .drawer-backdrop { transition: none; }
    .dragging .mobile-drawer { user-select: none; }
    .drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding-left: 10px; }
    .drawer-head .icon-button { width: 44px; min-height: 44px; }
    .drawer-caption { color: var(--muted); font-size: 12px; padding: 28px 13px 12px; }
    .drawer-nav { display: grid; align-content: start; gap: 6px; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; padding: 3px; margin: -3px; }
    .drawer-nav :global(.nav-link) { min-height: 50px; }
    .drawer-foot { flex-shrink: 0; padding-top: 18px; }
    .drawer-foot > div { min-width: 0; }
    .drawer-foot strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
</style>
