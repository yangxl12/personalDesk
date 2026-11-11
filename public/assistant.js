import { activeTasks, byId, day, escape as e, focus, isUrgent, projectStats } from './model.js';
import { icon } from './icons.js';
import { area, select } from './dialogs.js';
import { button } from './views.js';

export const modes = {
  action: '行动建议', goal: '目标拆解', task: '任务拆解', note: '思路整理', review: '每日总结'
};
const sources = { goal: '目标', task: '任务', note: '记录', review: '复盘' };

export function assistantPanel(data, mode, id, configured) {
  const lists = { goal: data.goals, task: activeTasks(data), note: data.notes };
  const list = lists[mode];
  const choices = list?.map(item => [item.id, item.title]) ?? [];
  const supported = configured || mode === 'action';
  const context = mode === 'action' ? '主方向、进行中的项目与待办' : mode === 'review'
    ? '当天完成的任务与复盘' : mode === 'note' ? '所选记录与补充想法' : `所选${sources[mode]}`;
  return `<form class="edit-form" data-form="assistant" data-mode="${mode}">
    ${select('mode', '能力', Object.entries(modes), mode)}
    ${list ? select('source', sources[mode], [['', '选择一项'], ...choices], id || (mode === 'note' ? '' : choices[0]?.[0]), mode !== 'note') : ''}
    ${mode === 'note' ? area('prompt', '补充想法', '', false, '也可以直接写下想法。') : ''}
    ${configured ? `<div class="context-box">${icon('link', 18)}<p>生成时将发送${context}给已连接的模型。</p></div>` :
      `<div class="context-box">${icon('spark', 18)}<p>${mode === 'action' ? '本地建议根据待办和项目下一步生成。' : '连接模型后可使用这项能力。'}</p></div>`}
    <p class="form-error" role="alert" hidden></p>
    <footer class="modal-footer"><div class="spacer"></div>${button('取消', 'close')}${supported
      ? '<button type="submit" class="button primary">生成建议</button>'
      : button('连接模型', 'edit:ai-config', 'spark', 'primary')}</footer>
  </form>`;
}

export function localCandidates(data) {
  const nextIds = new Set(data.projects.filter(project => project.status === 'active')
    .map(project => projectStats(data, project.id).next?.id));
  const full = focus(data).length >= 3;
  const score = task => Number(task.status === 'doing') * 8 + Number(nextIds.has(task.id)) * 4 +
    Number(task.important) * 2 + Number(isUrgent(task));
  return activeTasks(data).filter(task => full ? task.focusDate === day() :
    task.focusDate !== day() && (!task.project || byId(data.projects, task.project)?.status === 'active'))
    .sort((a, b) => score(b) - score(a) || (a.minutes || 60) - (b.minutes || 60))
    .slice(0, 3).map(task => ({
      id: task.id, title: task.title, status: task.status, focused: task.focusDate === day(),
      reason: [task.status === 'doing' ? '继续已开始的任务' : nextIds.has(task.id) ? '项目的下一步' : '待办任务',
        task.minutes ? `${task.minutes} 分钟` : ''].filter(Boolean).join(' · ')
    }));
}

export function assistantContext(data, mode, source, prompt) {
  if (mode === 'action') {
    const direction = byId(data.directions, data.mainDirection);
    return {
      direction: direction?.title,
      projects: data.projects.filter(item => item.status === 'active').slice(0, 20)
        .map(item => ({ title: item.title, next: projectStats(data, item.id).next?.title })),
      candidates: localCandidates(data)
    };
  }
  if (mode === 'goal') {
    const goal = byId(data.goals, source);
    if (!goal) throw new Error('请先选择目标。');
    return { title: goal.title, description: goal.description, criteria: goal.criteria };
  }
  if (mode === 'task') {
    const task = byId(data.tasks, source);
    if (!task) throw new Error('请先选择任务。');
    return { title: task.title, description: task.description, project: byId(data.projects, task.project)?.title, minutes: task.minutes };
  }
  if (mode === 'note') {
    const note = byId(data.notes, source);
    if (!note && !prompt) throw new Error('请选择一条记录或填写想法。');
    return { title: note?.title, body: note?.body, prompt };
  }
  return {
    completed: data.tasks.filter(task => task.completed === day() && task.status === 'done').map(task => task.title),
    review: data.reviews.find(review => review.date === day())
  };
}

export function assistantResult(mode, result, data) {
  if (mode === 'action') {
    const full = focus(data).length >= 3;
    return result.length ? `<div class="suggestion-list">${result.map(item =>
      `<div class="suggestion-row"><div><strong>${e(item.title)}</strong><p>${e(item.reason)}</p></div>${item.focused ?
        item.status === 'doing' ? button('继续', `task:${item.id}`, 'right') : button('开始', `start:${item.id}`, 'play') :
        button('加入今日', `suggest-focus:${item.id}`, 'plus')}</div>`).join('')}</div>`
      : `<div class="empty"><p>${full ? '今日重点已完成。' : '没有可选的待办任务。'}</p>${full ? button('写今日复盘', 'edit:review', 'edit') : button('新建任务', 'edit:task', 'plus')}</div>`;
  }
  return `<div class="ai-result"><p>${e(result.summary)}</p>${result.project ? `<div class="context-box">${icon('box', 19)}<div><strong>${e(result.project)}</strong><p>${e(result.milestone)}</p></div></div>` : ''}
    ${result.tasks.length ? `<ul>${result.tasks.map(task => `<li>${e(task.title)}${task.minutes ? ` <small>· ${task.minutes} 分钟</small>` : ''}</li>`).join('')}</ul>` : ''}</div>
    <div class="modal-footer"><div class="spacer"></div>${button('关闭', 'close')}${result.tasks.length || result.project ? button(mode === 'goal' ? '创建项目与任务' : '加入任务池', 'accept-ai', 'plus', 'primary') : ''}</div>`;
}
