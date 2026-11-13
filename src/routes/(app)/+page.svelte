<script lang="ts">
  import { progress } from '#lib/contracts/workspace'
  import { useUi } from '#lib/ui.svelte'
  import { editGoal, editNote, editTransaction } from '#lib/editors'
  import Icon from '#lib/components/Icon.svelte'
  import Empty from '#lib/components/Empty.svelte'
  import Savings from '#lib/components/Savings.svelte'
  import FinanceStats from '#lib/components/FinanceStats.svelte'
  import NoteCard from '#lib/components/NoteCard.svelte'
  let { data } = $props()
  const ui = useUi()
  let dashboard = $derived(data.dashboard)
  let focus = $derived(dashboard.goals[0])
</script>

<section class="hero">
  <div class="hero-art" aria-hidden="true">
    <span class="orbit"></span><span class="orbit orbit-b"></span><span class="art-grid"></span><span class="art-light"></span>
    <span class="stair stair-one"></span><span class="stair stair-two"></span><span class="stair stair-three"></span>
    <span class="art-check"><Icon name="check" size={28} /></span><span class="art-dot"></span>
    <span class="art-spark spark-one">✧</span><span class="art-spark spark-two">✦</span>
  </div>
  <a class="hero-body" href={focus ? '/goals/' + focus.id : '/goals'}>
    <h1>{focus ? ui.t('继续推进「{title}」', { title: focus.title }) : ui.t(dashboard.hasGoals ? '目标都已完成' : '从一个目标开始')}</h1>
    {#if focus}<p>{ui.t('已完成 {done}/{total} 项任务', { done: focus.done_tasks, total: focus.total_tasks })}</p>{/if}
  </a>
</section>

<div class="dashboard-grid">
  <section class="card">
    <header class="section-head">
      <h2><span class="section-icon"><Icon name="goals" /></span>{ui.t('目标管理')}</h2>
      <a class="text-link" href="/goals">{ui.t('查看全部')}<Icon name="arrow" size={15} /></a>
    </header>
    {#if dashboard.goals.length}
      <div class="goal-rows">
        {#each dashboard.goals as goal (goal.id)}
          <a class={'goal-row ' + goal.tone} href={'/goals/' + goal.id}>
            <span class="goal-icon"><Icon name="goals" /></span>
            <div class="goal-row-body">
              <div class="goal-row-label"><strong>{goal.title}</strong><b>{progress(goal)}%</b></div>
              <progress value={progress(goal)} max="100" aria-label={goal.title}></progress>
              <small>{goal.total_tasks ? ui.t('已完成 {done}/{total} 项任务', { done: goal.done_tasks, total: goal.total_tasks }) : ui.t('暂无任务')}</small>
            </div>
            <Icon name="chevron" size={16} />
          </a>
        {/each}
      </div>
    {:else}
      <Empty icon="goals" title={dashboard.hasGoals ? '暂无进行中的目标' : '还没有目标'}>
        {#if dashboard.hasGoals}
          <a class="button quiet" href="/goals">{ui.t('目标管理')}</a>
        {:else}
          <button class="button quiet" type="button" onclick={() => editGoal(ui)}><Icon name="plus" size={17} />{ui.t('新建目标')}</button>
        {/if}
      </Empty>
    {/if}
  </section>

  <section class="card finance-card">
    <header class="section-head">
      <h2><span class="section-icon"><Icon name="finance" /></span>{ui.t('本月财务')}</h2>
      <a class="text-link" href="/finance">{ui.t('财务详情')}<Icon name="arrow" size={15} /></a>
    </header>
    <FinanceStats totals={dashboard.totals} compact />
    <Savings savings={dashboard.savings} />
    <button class="button secondary log-button" type="button" onclick={() => editTransaction(ui)}><Icon name="plus" size={17} />{ui.t('记一笔')}</button>
  </section>

  <section class="card notes-card">
    <header class="section-head">
      <h2><span class="section-icon"><Icon name="notes" /></span>{ui.t('思考记录')}</h2>
      <div class="section-actions">
        <a class="text-link" href="/notes">{ui.t('查看全部')}<Icon name="arrow" size={15} /></a>
        <button class="button quiet" type="button" onclick={() => editNote(ui)}><Icon name="plus" size={17} />{ui.t('新建思考')}</button>
      </div>
    </header>
    {#if dashboard.notes.length}
      <div class="note-grid">{#each dashboard.notes as note (note.id)}<NoteCard {note} />{/each}</div>
    {:else}
      <Empty icon="notes" title="还没有思考记录" />
    {/if}
  </section>
</div>
