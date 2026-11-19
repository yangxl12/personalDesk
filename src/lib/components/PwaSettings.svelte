<script lang="ts">
  import { pwa } from '#lib/pwa.svelte'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  const ui = useUi()
  let busy = $state(false)
  const installState = $derived(pwa.state)

  async function install() {
    if (busy) return
    busy = true
    try {
      const outcome = await pwa.install()
      if (outcome === 'accepted') ui.notify('正在安装…')
    } finally {
      busy = false
    }
  }
</script>

<section class="settings-block">
  <header class="section-head"><h2><span class="section-icon"><Icon name="install" /></span>{ui.t('安装到桌面')}</h2></header>
  <div class="model-form">
    {#if installState === 'installed'}
      <p class="install-status"><Icon name="check" size={16} />{ui.t('已在独立窗口中运行')}</p>
      <p class="field-hint">{ui.t('数据仍保存在这台设备的浏览器里，断网时照样能记。')}</p>
    {:else if installState === 'installable'}
      <p class="field-hint">{ui.t('装到桌面后没有地址栏，像原生应用一样打开，断网也能用。')}</p>
      <button type="button" class="button primary" disabled={busy} onclick={install}>{ui.t('安装步序')}</button>
    {:else if installState === 'ios'}
      <ol class="install-steps">
        <li><span class="step-index">1</span>{ui.t('在 Safari 工具栏点「分享」按钮。')}</li>
        <li><span class="step-index">2</span>{ui.t('在列表里选「添加到主屏幕」，确认即可。')}</li>
      </ol>
      <p class="field-hint">{ui.t('装好后从主屏图标启动，没有地址栏，断网也能用。')}</p>
    {:else}
      <p class="field-hint">{ui.t('当前浏览器不支持安装。用 Chrome、Edge 桌面版，或用手机浏览器打开本页。')}</p>
    {/if}
  </div>
</section>
