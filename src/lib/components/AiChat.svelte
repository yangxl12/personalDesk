<script lang="ts">
  import { randomId } from '#lib/random-id'
  import { tick, untrack } from 'svelte'
  import { invalidate } from '$app/navigation'
  import { page } from '$app/state'
  import { useUi } from '#lib/ui.svelte'
  import { commit, refreshModel, refreshModules, request, RequestError } from '#lib/client'
  import { subscribeRun } from '#lib/local/ai/run'
  import type { EventPayload, RunEvent } from '#lib/local/ai/runtime'
  import { remove } from '#lib/editors'
  import type { ModelSettings } from '#lib/contracts/model'
  import { month } from '#lib/contracts/workspace'
  import type { List } from '#lib/contracts/workspace'
  import type { Chat, Message, RunReceipt, RunSnapshot, SendInput } from '#lib/contracts/ai'
  import Icon from './Icon.svelte'
  import Markdown from './Markdown.svelte'
  import ProposalCard from './ProposalCard.svelte'

  const ui = useUi()
  let messages = $state<Message[]>([])
  let header = $state<Chat | null>(null)
  let draft = $state('')
  const drafts = new Map<string | null, string>()
  let draftChat: string | null = null
  let error = $state('')
  let pending = $state(false)
  let switchingModel = $state(false)
  let before = $state<number | null>(null)
  let runtime = $state<RunSnapshot | null>(null)
  let generating = $derived(!!header?.runId || runtime?.status === 'queued' || runtime?.status === 'running')
  let textarea: HTMLTextAreaElement
  let timeline: HTMLDivElement
  let nearBottom = true
  let subscription: { close: () => void } | undefined
  let lastEvent = -1
  let streamRun: string | null = null
  let attempts = new Map<string, { key: string; messageId: string }>()
  let retryAttempt: { id: string; modelRef?: string; key: string } | undefined
  let cancelAttempt: { id: string; key: string } | undefined
  let loadTicket = 0
  let view = $state<'chat' | 'history'>('chat')
  let chats = $state<Chat[]>([])
  let nextCursor = $state<string | null>(null)
  let loadingChats = $state(false)

  $effect(() => {
    const id = ui.chatId
    const revision = ui.chatRevision
    untrack(() => {
      if (draftChat !== id) {
        drafts.set(draftChat, draft)
        draft = drafts.get(id) ?? ''
        draftChat = id
        messages = []
        before = null
        header = null
        runtime = null
        streamRun = null
        subscription?.close()
        nearBottom = true
      }
      void load(id, revision)
    })
  })

  $effect(() => {
    void tick().then(() => textarea?.focus())
  })

  // 生成中的运行态在模块级注册表里跑，离开页面不会中断；回到页面时重新订阅即可接着看。
  $effect(() => () => {
    subscription?.close()
  })

  async function stickToBottom() {
    if (!nearBottom) return
    await tick()
    if (timeline) timeline.scrollTop = timeline.scrollHeight
  }

  async function load(id: string | null, _revision: number, older = false) {
    const ticket = ++loadTicket
    if (!id) return
    try {
      const { data } = await request<{ chat: Chat; items: Message[]; before: number | null }>('/conversations/' + id + '/messages' + (older && before ? '?before=' + before : ''))
      if (id !== ui.chatId || ticket !== loadTicket) return
      header = data.chat
      if (older) {
        const height = timeline.scrollHeight
        const top = timeline.scrollTop
        messages = [...data.items, ...messages]
        before = data.before
        await tick()
        timeline.scrollTop = top + timeline.scrollHeight - height
      } else {
        const current = new Set(data.items.map(item => item.id))
        const retained = data.items[0] && messages.some(item => item.id === data.items[0].id) ?
          messages.slice(0, messages.findIndex(item => item.id === data.items[0].id)).filter(item => !current.has(item.id)) : []
        messages = [...retained, ...data.items]
        if (!retained.length) before = data.before
        await stickToBottom()
      }
      if (header.runId) watch(header.runId)
      if (!header.runId) {
        runtime = null
        subscription?.close()
        subscription = undefined
      }
    } catch (failure) {
      if (id !== ui.chatId || ticket !== loadTicket) return
      if (failure instanceof RequestError && failure.status === 404) ui.resetChat()
      else error = ui.error(failure)
    }
  }

  function watch(run: string) {
    if (streamRun === run && subscription) return
    subscription?.close()
    streamRun = run
    lastEvent = -1
    const connection = subscribeRun(run, (event: RunEvent, value: EventPayload) => {
      if (value.sequence <= lastEvent && event !== 'snapshot') return
      lastEvent = value.sequence
      if (event === 'text_delta') {
        if (runtime && value.offset !== undefined) {
          const received = Math.max(0, runtime.text.length - value.offset)
          runtime.text += (value.delta ?? '').slice(received)
        }
      } else {
        runtime = { ...value }
      }
      void stickToBottom()
      if (runtime && !['queued', 'running'].includes(runtime.status)) {
        connection.close()
        subscription = undefined
        void load(ui.chatId, ui.chatRevision)
        void refreshModules({ chats: 0 })
      }
    })
    subscription = connection
  }

  async function send() {
    const text = draft.trim()
    if ([...text].length > 12000) { error = ui.t('消息最多 12,000 个字符'); return }
    if (pending || switchingModel || generating || !text) return
    // 路由在 (app) 分组下，用 route.id 取站内路径，不受部署 base 影响。
    const parts = (page.route.id ?? '').replace(/^\/\(app\)/, '').split('/').filter(Boolean)
    const name = parts[0] ?? 'dashboard'
    // AI 自己是独立页面，不把它的路径当成上下文来源。
    const selected = month.safeParse(page.url.searchParams.get('month'))
    const context = ['dashboard', 'chats', 'settings'].includes(name)
      ? { page: name as NonNullable<SendInput['pageContext']>['page'], entityId: parts[1], selectedMonth: selected.success ? selected.data : undefined }
      : undefined
    const attachments = ui.attachment ? [{ kind: ui.attachment.kind, id: ui.attachment.id }] : []
    const submittedChat = ui.chatId
    const modelRef = ui.chatModel.activeRef ?? undefined
    const fingerprint = JSON.stringify([submittedChat, text, context, attachments, modelRef])
    let attempt = attempts.get(fingerprint)
    if (!attempt) {
      attempts.clear()
      attempt = { key: randomId(), messageId: randomId() }
      attempts.set(fingerprint, attempt)
    }
    pending = true
    error = ''
    try {
      const result = await commit<RunReceipt>('POST', '/ai/runs', {
        clientMessageId: attempt.messageId, conversationId: submittedChat ?? undefined, text, pageContext: context, attachments, modelRef
      }, attempt.key)
      attempts.clear()
      if (ui.chatId === submittedChat) {
        draft = ''
        ui.attachment = null
        ui.chatId = result.data.conversationId
        nearBottom = true
        await load(ui.chatId, ui.chatRevision)
      }
      if (result.revisions) await refreshModules(result.revisions)
    } catch (failure) {
      error = ui.error(failure)
    } finally {
      pending = false
    }
  }

  async function retry(id: string) {
    if (pending || switchingModel) return
    const modelRef = ui.chatModel.activeRef ?? undefined
    if (retryAttempt?.id !== id || retryAttempt.modelRef !== modelRef) retryAttempt = { id, modelRef, key: randomId() }
    pending = true
    error = ''
    try {
      const result = await commit<RunReceipt>('POST', '/ai/runs/' + id + '/retry', { modelRef }, retryAttempt.key)
      retryAttempt = undefined
      if (ui.chatId === result.data.conversationId) await load(ui.chatId, ui.chatRevision)
      if (result.revisions) await refreshModules(result.revisions)
    } catch (failure) {
      error = ui.error(failure)
    } finally {
      pending = false
    }
  }

  async function switchModel(select: HTMLSelectElement) {
    const ref = select.value
    if (switchingModel || pending || generating || ref === ui.chatModel.activeRef) return
    switchingModel = true
    error = ''
    try {
      const { data } = await request<ModelSettings>('/ai/settings/active', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref, version: ui.chatModel.version })
      })
      await refreshModel(data.version)
    } catch (failure) {
      error = ui.error(failure)
      if (failure instanceof RequestError && failure.code === 'VERSION_CONFLICT') await invalidate('buxu:model')
    } finally {
      switchingModel = false
      select.value = ui.chatModel.activeRef ?? ''
    }
  }

  async function cancel(id: string) {
    if (pending) return
    if (cancelAttempt?.id !== id) cancelAttempt = { id, key: randomId() }
    pending = true
    try {
      await commit('POST', '/ai/runs/' + id + '/cancel', {}, cancelAttempt.key)
      cancelAttempt = undefined
      await load(ui.chatId, ui.chatRevision)
      await refreshModules({ chats: 0 })
    } catch (failure) {
      error = ui.error(failure)
    } finally {
      pending = false
    }
  }

  function newChat() {
    drafts.delete(null)
    ui.resetChat()
    if (draftChat === null) draft = ''
    error = ''
    view = 'chat'
    void tick().then(() => textarea?.focus())
  }

  async function loadChats(cursor?: string) {
    loadingChats = true
    try {
      const { data } = await request<List<Chat>>('/conversations' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''))
      chats = cursor ? [...chats, ...data.items] : data.items
      nextCursor = data.nextCursor
    } catch (failure) {
      error = ui.error(failure)
    } finally {
      loadingChats = false
    }
  }

  function toggleHistory() {
    if (view === 'history') { view = 'chat'; return }
    view = 'history'
    void loadChats()
  }

  async function selectChat(id: string) {
    ui.chatId = id
    view = 'chat'
    nearBottom = true
    await tick()
    textarea?.focus()
  }

  function deleteChat(chat: Chat) {
    remove(ui, '/conversations/' + chat.id, { version: chat.version }, ui.t('删除「{title}」？', { title: chat.title }), undefined, () => {
      chats = chats.filter(item => item.id !== chat.id)
      if (ui.chatId === chat.id) { ui.resetChat(); view = 'chat' }
    })
  }

  const errors: Record<string, string> = {
    AI_NOT_CONFIGURED: 'AI 模型尚未配置', AI_CANCELLED: '已停止生成', AI_TIMEOUT: '模型响应超时',
    AI_PERMISSION_CHANGED: 'AI 数据访问权限已变更', AI_RATE_LIMITED: '模型请求过于频繁',
    AI_IMPORTED_FAILED: '原 Demo 中发送失败', AI_PROVIDER_AUTH: '模型鉴权失败', AI_INTERRUPTED: '生成中断，请重试',
    AI_MODEL_NOT_FOUND: '该模型配置已删除或不可用',
    AI_PROVIDER_ERROR: '连接失败，请检查接口地址、模型名称和 API Key',
    AI_TOOL_LIMIT: '工具调用次数已用尽，请换个问法',
    AI_INPUT_BUDGET: '对话内容过长，请新建会话'
  }
  const prompts = ['帮我看看有哪些进行中的目标', '总结最近的思考记录', '查看本月的收支情况']
</script>

<div class="card ai-page">
  <div class="ai-toolbar">
    {#if ui.chatModel.models.length > 1}
      <select class="chat-model" aria-label={ui.t('当前模型')} value={ui.chatModel.activeRef ?? ''} disabled={pending || switchingModel || generating}
        onchange={event => switchModel(event.currentTarget)}>
        {#each ui.chatModel.models as profile (profile.ref)}
          <option value={profile.ref}>{profile.label || profile.id} · {profile.provider === 'deepseek' ? 'DeepSeek' : ui.t('自定义兼容接口')}</option>
        {/each}
      </select>
    {:else}
      <small class="ai-model-name">{ui.chatModel.models[0]?.label || ui.chatModel.models[0]?.id}</small>
    {/if}
    <div class="ai-tools">
      <button class="button secondary" class:active={view === 'history'} type="button" aria-pressed={view === 'history'}
        title={ui.t('AI 对话历史')} onclick={toggleHistory}><Icon name="chats" size={16} />{ui.t('历史')}</button>
      <button class="button secondary" type="button" title={ui.t('新建会话')} onclick={newChat}><Icon name="plus" size={16} />{ui.t('新建')}</button>
    </div>
  </div>
  <div class="ai-body">
    {#if view === 'history'}
      <div class="chat-history">
        {#each chats as chat (chat.id)}
          <div class="history-row">
            <button class="history-entry" type="button" aria-current={ui.chatId === chat.id ? 'true' : undefined} onclick={() => selectChat(chat.id)}>
              <span class="section-icon"><Icon name="chats" size={18} /></span>
              <span><strong>{chat.title}</strong><small>{ui.date(chat.updated_at)}</small></span>
              {#if ui.chatId === chat.id}<Icon name="check" size={16} />{/if}
            </button>
            <button class="button icon-button" type="button" aria-label={ui.t('删除会话')} onclick={() => deleteChat(chat)}><Icon name="trash" size={16} /></button>
          </div>
        {:else}
          <p class="chat-history-empty">{ui.t(loadingChats ? '加载中…' : '还没有对话')}</p>
        {/each}
        {#if nextCursor}
          <button class="button secondary chat-history-more" type="button" disabled={loadingChats} onclick={() => loadChats(nextCursor ?? undefined)}>{ui.t('加载更多')}</button>
        {/if}
      </div>
    {:else}
      {#if header}<div class="conversation-title">{header.title}</div>{/if}
      <div class="message-list" bind:this={timeline} onscroll={event => {
        const node = event.currentTarget
        nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 55
      }}>
      {#if before}<button class="button secondary" type="button" onclick={() => load(ui.chatId, ui.chatRevision, true)}>{ui.t('查看更早消息')}</button>{/if}
      {#each messages as message (message.id)}
        {@const content = runtime?.runId === message.runId && message.role === 'assistant' ? runtime : null}
        {@const state = content?.status ?? message.state}
        {@const text = content?.text ?? message.text}
        {@const errorCode = content?.errorCode ?? message.errorCode}
        {@const proposal = content?.proposalId ?? message.proposalId}
        <article class={'message ' + message.role}>
          <div class="message-content">
            {#if message.role === 'user'}
              {#if text}<div class="user-bubble">{text}</div>{/if}
            {:else if text}
              <Markdown {text} />
            {:else if state === 'running' || state === 'queued'}
              <div class="typing" aria-label={ui.t('正在生成…')}><i></i><i></i><i></i></div>
            {/if}
            {#each content?.sources ?? message.sources as item (item.href)}
              <a class="text-link chat-source" href={item.href}>{ui.t(item.label)}<Icon name="chevron" size={14} /></a>
            {/each}
            {#if proposal}<ProposalCard id={proposal} ready={state === 'completed'} />{/if}
            {#if errorCode}
              <p class="form-error">{ui.t(errors[errorCode] ?? '生成失败，请重试')}</p>
              {#if message.runId && message.id === messages.at(-1)?.id}
                <button class="button secondary" type="button" onclick={() => retry(message.runId!)} disabled={pending || switchingModel}>{ui.t('重试')}</button>
              {/if}
            {/if}
          </div>
        </article>
      {:else}
        <div class="chat-welcome">
          <span class="welcome-mark"><Icon name="spark" size={20} /></span>
          <strong>{ui.t('你想聊些什么？')}</strong>
          <div class="prompt-chips">
            {#each prompts as prompt}
              <button class="prompt-chip" type="button" onclick={() => { draft = ui.t(prompt); textarea.focus() }}>{ui.t(prompt)}</button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    {/if}
  </div>
  {#if view === 'chat'}
    <form class="composer" onsubmit={event => { event.preventDefault(); void send() }}>
      {#if ui.attachment}
        <div class="attachment"><Icon name={ui.attachment.kind === 'goal' ? 'goals' : 'notes'} size={16} /><span>{ui.attachment.label}</span>
          <button class="button icon-button" type="button" aria-label={ui.t('移除附件')} onclick={() => { ui.attachment = null }}><Icon name="close" size={15} /></button>
        </div>
      {/if}
      {#if error}<p class="form-error" role="alert">{error}</p>{/if}
      <div class="composer-field">
        <textarea bind:this={textarea} bind:value={draft} rows="2" maxlength="24000" aria-label={ui.t('消息')} placeholder={ui.t('输入消息…')}
          onkeydown={event => {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
            event.preventDefault()
            void send()
          }}></textarea>
        {#if header?.runId}
          <button class="button secondary" type="button" disabled={pending} onclick={() => cancel(header!.runId!)}>{ui.t('停止')}</button>
        {:else}
          <button class="button primary send-button" type="submit" aria-label={ui.t('发送')} disabled={pending || switchingModel || !draft.trim()}><Icon name="send" size={17} /></button>
        {/if}
      </div>
    </form>
  {/if}
</div>
