<script lang="ts">
  import { useUi } from '#lib/ui.svelte'
  import { remove } from '#lib/editors'
  import Empty from '#lib/components/Empty.svelte'
  import Icon from '#lib/components/Icon.svelte'
  import Pager from '#lib/components/Pager.svelte'
  let { data } = $props()
  const ui = useUi()
</script>

<header class="page-head">
  <h1>{ui.t('AI 对话历史')}</h1>
  <button class="button primary" type="button" onclick={() => ui.showChat(null)}><Icon name="plus" size={17} />{ui.t('新建会话')}</button>
</header>
<section class="card history-card">
  {#each data.chats.items as chat (chat.id)}
    <div class="history-row">
      <button class="history-entry" type="button" onclick={() => ui.showChat(chat.id)}>
        <span class="section-icon"><Icon name="chats" size={18} /></span>
        <span><strong>{chat.title}</strong><small>{ui.date(chat.updated_at)}</small></span>
        <Icon name="chevron" size={16} />
      </button>
      <button class="button icon-button" type="button" aria-label={ui.t('删除会话')} onclick={() => remove(ui, '/conversations/' + chat.id,
        { version: chat.version }, ui.t('删除「{title}」？', { title: chat.title }), undefined, async () => {
          if (ui.chatId === chat.id) ui.resetChat()
        })}><Icon name="trash" size={17} /></button>
    </div>
  {:else}
    <Empty icon="chats" title="还没有对话" />
  {/each}
</section>
<Pager cursor={data.chats.nextCursor} />
