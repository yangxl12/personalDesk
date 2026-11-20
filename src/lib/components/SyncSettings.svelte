<script lang="ts">
  import { readConfig } from '#lib/sync/engine'
  import { sync } from '#lib/sync/sync.svelte'
  import { useUi } from '#lib/ui.svelte'
  import Icon from './Icon.svelte'

  const ui = useUi()
  let token = $state('')
  let repo = $state('')
  let path = $state('sync.json')
  let editing = $state(false)
  let error = $state('')

  const shown = $derived(editing || !sync.configured)

  function edit() {
    const current = readConfig()
    repo = current ? current.owner + '/' + current.repo : ''
    path = current?.path ?? 'sync.json'
    token = ''
    error = ''
    editing = true
  }

  function connect() {
    error = ''
    const text = repo.trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '')
    const [owner, name] = text.split('/').filter(Boolean)
    if (!token.trim()) {
      error = '请填写访问令牌'
      return
    }
    if (!owner || !name) {
      error = '仓库要写成 owner/repo 的形式'
      return
    }
    sync.connect({ token, owner, repo: name, path })
    token = ''
    editing = false
  }

  function when(at: number) {
    if (!at) return ui.t('还没有同步过')
    const gap = Date.now() - at
    if (gap < 60_000) return ui.t('刚刚同步')
    if (gap < 3_600_000) return ui.t('{count} 分钟前同步', { count: Math.floor(gap / 60_000) })
    if (gap < 86_400_000) return ui.t('{count} 小时前同步', { count: Math.floor(gap / 3_600_000) })
    return ui.t('{date} 同步', { date: new Date(at).toLocaleDateString() })
  }
</script>

<section class="settings-block">
  <header class="section-head">
    <h2><span class="section-icon"><Icon name="cloud" /></span>{ui.t('多设备同步')}</h2>
  </header>

  {#if !shown}
    <div class="sync-state">
      <p class="sync-line">
        <span class="dot" class:live={sync.busy} class:bad={!!sync.error} aria-hidden="true"></span>
        <span>
          {#if sync.busy}{ui.t('正在同步…')}
          {:else if sync.error}{ui.t(sync.error)}
          {:else if sync.notice}{ui.t(sync.notice)}
          {:else}{when(sync.lastAt)}{/if}
        </span>
      </p>
      <p class="sync-meta">
        {ui.t('云端 rev {rev}', { rev: sync.rev })}
        {#if sync.conflicts}· {ui.t('上次合并 {count} 条冲突，以较新的修改为准', { count: sync.conflicts })}{/if}
      </p>
    </div>
    <div class="sync-actions">
      <button type="button" class="button secondary" disabled={sync.busy} onclick={() => sync.sync('manual')}>
        {ui.t('立即同步')}
      </button>
      <button type="button" class="button secondary" disabled={sync.busy} onclick={edit}>{ui.t('修改配置')}</button>
      <button type="button" class="button danger" disabled={sync.busy} onclick={() => sync.disconnect()}>
        {ui.t('断开')}
      </button>
    </div>
  {:else}
    <p class="field-hint sync-intro">
      {ui.t('数据存进你自己的 GitHub 私有仓库，手机和电脑各连一次即可互通。同步不含 AI 模型配置和对话记录。')}
    </p>
    <form class="sync-form" onsubmit={event => { event.preventDefault(); connect() }}>
      <label class="sync-field">
        <span>{ui.t('访问令牌')}</span>
        <input bind:value={token} type="password" autocomplete="off" spellcheck="false"
          placeholder="github_pat_… 或 ghp_…" />
      </label>
      <label class="sync-field">
        <span>{ui.t('仓库')}</span>
        <input bind:value={repo} type="text" autocomplete="off" spellcheck="false" placeholder="用户名/仓库名" />
      </label>
      <label class="sync-field">
        <span>{ui.t('文件路径')}</span>
        <input bind:value={path} type="text" autocomplete="off" spellcheck="false" placeholder="sync.json" />
      </label>
      {#if error}<p class="form-error" role="alert">{ui.t(error)}</p>{/if}
      <div class="sync-actions">
        {#if sync.configured}
          <button type="button" class="button secondary" onclick={() => { editing = false; error = '' }}>
            {ui.t('取消')}
          </button>
        {/if}
        <button type="submit" class="button primary" disabled={sync.busy}>{ui.t('连接并同步')}</button>
      </div>
    </form>
    <p class="field-hint">
      {ui.t('仓库要私有，建的时候勾上 Add a README，空仓库写不进去。')}
    </p>
    <p class="field-hint sync-links">
      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer noopener">
        {ui.t('新建细粒度令牌')}
      </a>
      <span aria-hidden="true">·</span>
      <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer noopener">
        {ui.t('新建 classic 令牌')}
      </a>
    </p>
    <p class="field-hint">
      {ui.t('细粒度令牌选好仓库后把 Contents 设为 Read and write；classic 令牌勾选 repo 就行。手机网页版要切到「桌面版网站」才看得到这些页面。')}
    </p>
  {/if}
</section>

<style>
  .sync-state {
    display: grid; gap: 6px; padding: 14px;
    border: 1px solid var(--line); border-radius: 16px; background: var(--glass-2);
    box-shadow: inset 0 1px 0 var(--glass-edge);
  }
  .sync-line { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 13px; }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .dot.live { background: var(--primary-fill); animation: sync-pulse 1.4s ease-in-out infinite; }
  .dot.bad { background: #e24b4a; }
  .sync-meta { margin: 0; padding-left: 16px; color: var(--muted); font-size: 11.5px; line-height: 1.5; }
  .sync-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .sync-actions .button { min-height: 34px; padding: 4px 12px; font-size: 12px; }
  .sync-intro { margin-bottom: 12px; }
  .sync-links { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: -6px; }
  .sync-links a {
    color: var(--primary); text-decoration: none;
    border-bottom: 1px solid var(--primary-tint);
    transition: border-color .2s, color .2s;
  }
  .sync-links a:hover { border-bottom-color: var(--primary); }
  .sync-form { display: grid; gap: 12px; }
  .sync-field { display: grid; gap: 6px; }
  .sync-field > span { font-size: 12.5px; font-weight: 600; }
  .sync-field input {
    width: 100%; min-height: 40px; padding: 8px 12px; border-radius: 12px;
    border: 1px solid var(--line); background: var(--glass-2); color: var(--ink);
    font-family: inherit; font-size: 13px;
    transition: border-color .2s, box-shadow .2s;
  }
  .sync-field input:focus {
    outline: none; border-color: var(--primary-tint); box-shadow: 0 0 0 3px var(--primary-soft);
  }
  .sync-form .sync-actions { margin-top: 2px; justify-content: flex-end; }
  @keyframes sync-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
  @media (prefers-reduced-motion: reduce) { .dot.live { animation: none; } }
</style>
