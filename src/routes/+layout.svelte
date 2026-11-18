<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  let { children } = $props()

  // 玻璃卡片的反光跟随指针。集中在一处监听，不侵入各个组件。
  onMount(() => {
    let frame = 0
    let latest: PointerEvent | null = null
    const apply = () => {
      frame = 0
      const event = latest
      latest = null
      if (!event) return
      const node = event.target instanceof Element ? event.target : null
      const card = node?.closest('.card') as HTMLElement | null
      if (!card) return
      const box = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${event.clientX - box.left}px`)
      card.style.setProperty('--my', `${event.clientY - box.top}px`)
    }
    const move = (event: PointerEvent) => {
      latest = event
      if (!frame) frame = requestAnimationFrame(apply)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      if (frame) cancelAnimationFrame(frame)
    }
  })
</script>

<svelte:head>
  <title>步序 · 个人工作台</title>
  <meta name="description" content="管理目标、记录思考、查看收支与存款。">
</svelte:head>
<div class="ambient" aria-hidden="true">
  <span class="orb orb-a"></span>
  <span class="orb orb-b"></span>
  <span class="orb orb-c"></span>
  <span class="grain"></span>
</div>
{@render children()}
