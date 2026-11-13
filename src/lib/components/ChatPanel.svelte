<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte'
  import { invalidate } from '$app/navigation'
  import { page } from '$app/state'
  import { useUi } from '#lib/ui.svelte'
  import { commit, refreshModel, refreshModules, request, RequestError } from '#lib/client'
  import type { ModelSettings } from '#lib/contracts/model'
  import { month } from '#lib/contracts/workspace'
  import type { Chat, Message, RunReceipt, RunSnapshot, SendInput } from '#lib/contracts/ai'
  import Icon from './Icon.svelte'
  import ProposalCard from './ProposalCard.svelte'

  let { close, mobile }: { close: () => void; mobile: boolean } = $props()
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
  let source: EventSource | undefined
  let lastEvent = -1
  let streamRun: string | null = null
  let openCount = 0
  let attempts = new Map<string, { key: string; messageId: string }>()
  let retryAttempt: { id: string; modelRef?: string; key: string } | undefined
  let cancelAttempt: { id: string; key: string } | undefined
  let loadTicket = 0

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
        source?.close()
        nearBottom = true
      }
      void load(id, revision)
    })
  })

  $effect(() => {
    const open = ui.chatOpen
    if (open) {
      const id = ui.chatId
      untrack(() => {
        if (++openCount > 1 && id) void load(id, ui.chatRevision)
        void tick().then(() => textarea?.focus())
      })
    } else {
      source?.close()
      source = undefined
    }
  })

  onDestroy(() => source?.close())

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
      if (header.runId && ui.chatOpen) watch(header.runId)
      if (!header.runId) {
        runtime = null
        source?.close()
        source = undefined
      }
    } catch (failure) {
      if (id !== ui.chatId || ticket !== loadTicket) return
      if (failure instanceof RequestError && failure.status === 404) ui.resetChat()
      else error = ui.error(failure)
    }
  }

  function watch(run: string) {
    if (streamRun === run && source) return
    source?.close()
    streamRun = run
    lastEvent = -1
    const connection = new EventSource('/api/v1/ai/runs/' + run + '/events')
    source = connection
    const listen = (event: Event) => {
      if (source !== connection || !(event instanceof MessageEvent)) return
      const value = JSON.parse(event.data) as RunSnapshot & { sequence: number; delta?: string; offset?: number }
      if (value.sequence <= lastEvent && event.type !== 'snapshot') return
      lastEvent = value.sequence
      if (event.type === 'text_delta') {
        if (runtime && value.offset !== undefined) {
          const received = Math.max(0, runtime.text.length - value.offset)
          runtime.text += (value.delta ?? '').slice(received)
        }
      } else {
        runtime = value
      }
      void stickToBottom()
      if (runtime && !['queued', 'running'].includes(runtime.status)) {
        connection.close()
        source = undefined
        void load(ui.chatId, ui.chatRevision)
        void refreshModules({ chats: 0 })
      }
    }
    for (const event of ['snapshot', 'status', 'text_delta', 'sources', 'proposal', 'done', 'error']) {
      connection.addEventListener(event, listen)
    }
    connection.addEventListener('error', event => {
      if (event instanceof MessageEvent || source !== connection) return
      if (connection.readyState === EventSource.CLOSED) {
        source = undefined
        void load(ui.chatId, ui.chatRevision)
      }
    })
  }

  async function send() {
    const text = draft.trim()
    if ([...text].length > 12000) { error = ui.t('消息最多 12,000 个字符'); return }
    if (pending || switchingModel || generating || !text) return
    const parts = page.url.pathname.split('/').filter(Boolean)
    const name = (parts[0] ?? 'dashboard') as NonNullable<SendInput['pageContext']>['page']
    const selected = month.safeParse(page.url.searchParams.get('month'))
    const context = { page: name, entityId: parts[1], selectedMonth: selected.success ? selected.data : undefined }
    const attachments = ui.attachment ? [{ kind: ui.attachment.kind, id: ui.attachment.id }] : []
    const submittedChat = ui.chatId
    const modelRef = ui.chatModel.activeRef ?? undefined
    const fingerprint = JSON.stringify([submittedChat, text, context, attachments, modelRef])
    let attempt = attempts.get(fingerprint)
    if (!attempt) {
      attempts.clear()
      attempt = { key: crypto.randomUUID(), messageId: crypto.randomUUID() }
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
    if (retryAttempt?.id !== id || retryAttempt.modelRef !== modelRef) retryAttempt = { id, modelRef, key: crypto.randomUUID() }
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
    if (cancelAttempt?.id !== id) cancelAttempt = { id, key: crypto.randomUUID() }
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
    void tick().then(() => textarea?.focus())
  }

  function trapFocus(event: KeyboardEvent) {
    if (!mobile || event.key !== 'Tab') return
    const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea, select:not(:disabled)')].filter(node => node.getClientRects().length)
    const first = items[0]
    const last = items.at(-1)
    if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus() }
    if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus() }
  }

  const errors: Record<string, string> = {
    AI_NOT_CONFIGURED: 'AI 模型尚未配置', AI_CANCELLED: '已停止生成', AI_TIMEOUT: '模型响应超时',
    AI_PERMISSION_CHANGED: 'AI 数据访问权限已变更', AI_RATE_LIMITED: '模型请求过于频繁',
    AI_IMPORTED_FAILED: '原 Demo 中发送失败', AI_PROVIDER_AUTH: '模型鉴权失败', AI_INTERRUPTED: '生成中断，请重试',
    AI_MODEL_NOT_FOUND: '该模型配置已删除或不可用', AI_CONFIG_KEY_FAILED: '无法使用服务端 AI 配置加密密钥'
  }
  const prompts = ['帮我看看有哪些进行中的目标', '总结最近的思考记录', '查看本月的收支情况']
</script>

<aside class="ai-panel" hidden={!ui.chatOpen} role={mobile ? 'dialog' : 'complementary'} aria-modal={mobile ? true : undefined} aria-label={ui.t('AI 助手')} onkeydown={trapFocus}>
  <header class="ai-head">
    <span class="section-icon"><Icon name="spark" size={19} /></span>
    <div>
      <strong>{ui.t('AI 助手')}</strong>
      {#if ui.chatModel.models.length > 1}
        <select class="chat-model" aria-label={ui.t('当前模型')} value={ui.chatModel.activeRef ?? ''} disabled={pending || switchingModel || generating}
          onchange={event => switchModel(event.currentTarget)}>
          {#each ui.chatModel.models as profile (profile.ref)}
            <option value={profile.ref}>{profile.label || profile.id} · {profile.provider === 'deepseek' ? 'DeepSeek' : ui.t('自定义兼容接口')}</option>
          {/each}
        </select>
      {:else}
        <small>{ui.chatModel.models[0]?.label || ui.chatModel.models[0]?.id || ui.t('AI 模型尚未配置')}</small>
      {/if}
    </div>
    <a class="button icon-button" href="/settings#ai-settings" aria-label={ui.t('AI 设置')} title={ui.t('AI 设置')} onclick={() => { if (mobile) close() }}><Icon name="settings" size={18} /></a>
    <button class="button icon-button" type="button" aria-label={ui.t('新建会话')} onclick={newChat}><Icon name="plus" size={18} /></button>
    <button class="button icon-button" type="button" aria-label={ui.t('关闭 AI 助手')} onclick={close}><Icon name="close" size={18} /></button>
  </header>
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
        {#if message.role === 'assistant'}<span class="message-avatar"><Icon name="spark" size={15} /></span>{/if}
        <div class="message-content">
          {#if text}<div class="bubble">{text}</div>{/if}
          {#if state === 'running' || state === 'queued'}<small>{ui.t('正在生成…')}</small>{/if}
          {#each content?.sources ?? message.sources as item (item.href)}
            <a class="text-link chat-source" href={item.href} onclick={() => { if (mobile) close() }}>{ui.t(item.label)}<Icon name="chevron" size={14} /></a>
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
        <span class="empty-icon"><Icon name="spark" size={22} /></span>
        <strong>{ui.t('你想聊些什么？')}</strong>
        {#each prompts as prompt}
          <button class="button secondary" type="button" onclick={() => { draft = ui.t(prompt); textarea.focus() }}>{ui.t(prompt)}</button>
        {/each}
      </div>
    {/each}
  </div>
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
</aside>
