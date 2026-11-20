<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { useUi } from '#lib/ui.svelte'
  import Icon from '#lib/components/Icon.svelte'
  import AiChat from '#lib/components/AiChat.svelte'

  const ui = useUi()
  // 一个模型都没有时，整页只留说明和去设置的入口，不摆一个用不了的输入框。
  let configured = $derived(ui.chatModel.models.length > 0)

  function back() {
    // 从别处进来就退回去；直接打开本页（PWA / 刷新）时退回工作台。
    if (history.length > 1) history.back()
    else void goto(resolve(''))
  }
</script>

<header class="page-bar">
  <button class="button icon-button" type="button" aria-label={ui.t('返回')} title={ui.t('返回')} onclick={back}>
    <Icon name="chevronLeft" size={20} />
  </button>
  <h1>{ui.t('AI 助手')}</h1>
</header>
{#if configured}
  <AiChat />
{:else}
  <div class="ai-page ai-unconfigured">
    <div class="ai-unconfigured-inner">
      <span class="welcome-mark"><Icon name="spark" size={24} /></span>
      <strong>{ui.t('还没有配置 AI 模型')}</strong>
      <p>{ui.t('到设置里填一个 DeepSeek 或兼容接口的模型和 API Key，就能开始对话。')}</p>
      <a class="button primary" href={resolve('settings')}><Icon name="settings" size={17} />{ui.t('去设置')}</a>
    </div>
  </div>
{/if}
