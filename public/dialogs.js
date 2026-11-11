import { icon } from './icons.js';
import { byId, day, escape as e, phaseLabels, taskLabels } from './model.js';
import { button, iconButton } from './views.js';

export const input = (name, label, value = '', options = {}) => {
  const { type = 'text', required = false, placeholder = '', min, step, max, length = 160 } = options;
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${e(value)}"
    ${required ? 'required' : ''} ${placeholder ? `placeholder="${e(placeholder)}"` : ''} ${min === undefined ? '' : `min="${min}"`}
    ${step === undefined ? '' : `step="${step}"`} ${max === undefined ? '' : `max="${max}"`}
    maxlength="${length}" ${type === 'password' ? 'autocomplete="off"' : ''}></label>`;
};
export const area = (name, label, value = '', required = false, placeholder = '') =>
  `<label class="field"><span>${label}</span><textarea name="${name}" rows="3" maxlength="5000" ${required ? 'required' : ''} placeholder="${e(placeholder)}">${e(value)}</textarea></label>`;
export const select = (name, label, options, value = '', required = false) =>
  `<label class="field"><span>${label}</span><select name="${name}" ${required ? 'required' : ''}>${options.map(([key, text]) =>
    `<option value="${e(key)}" ${key === value ? 'selected' : ''}>${e(text)}</option>`).join('')}</select></label>`;
const check = (name, label, checked) => `<label class="checkbox"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>${label}</label>`;
const pair = (...fields) => `<div class="field-pair">${fields.join('')}</div>`;
const options = (items, empty) => [['', empty], ...items.map(item => [item.id, item.title])];
const nameField = (label, value, placeholder = '') => input('title', label, value, { required: true, placeholder, length: 120 });
const statusField = value => select('status', '状态', Object.entries(phaseLabels), value ?? 'active');

export function form(type, id, parent, data, aiConfig) {
  const lists = { direction: 'directions', goal: 'goals', project: 'projects', task: 'tasks', note: 'notes', habit: 'habits' };
  const item = type === 'transaction' ? byId(data.finance.transactions, id) || {} : byId(data[lists[type]] || [], id) || {};
  const fieldsets = {
    profile: () => ['编辑称呼', input('name', '称呼', data.name, { length: 20 })],
    direction: () => [id ? '编辑方向' : '新建方向',
      nameField('方向名称', item.title, '例如：做出有价值的产品') +
      area('description', '愿景', item.description, false, '为什么值得长期投入？') +
      area('outcome', '期望成果', item.outcome) + statusField(item.status) +
      check('primary', '设为主方向', data.mainDirection === id || !data.mainDirection)],
    goal: () => [id ? '编辑阶段目标' : '新建阶段目标',
      nameField('目标名称', item.title) +
      select('direction', '所属方向', options(data.directions, '选择方向'), item.direction ?? parent, true) +
      area('description', '说明', item.description) + area('criteria', '完成标准', item.criteria, true, '怎样才算达成？') +
      pair(input('start', '开始日期', item.start, { type: 'date' }), input('end', '目标日期', item.end, { type: 'date' })) + statusField(item.status)],
    project: () => [id ? '编辑项目' : '新建项目',
      nameField('项目名称', item.title) +
      select('goal', '所属目标', options(data.goals, '独立项目'), item.goal ?? parent) +
      area('description', '项目说明', item.description) + input('milestone', '里程碑', item.milestone, { placeholder: '项目要交付什么？' }) +
      statusField(item.status)],
    task: () => [id ? '编辑任务' : '新建任务',
      nameField('任务名称', item.title, '用一个具体动作开头') +
      select('project', '所属项目', options(data.projects, '独立任务'), item.project ?? parent) +
      area('description', '行动说明', item.description) +
      pair(input('minutes', '预计耗时（分钟）', item.minutes || '', { type: 'number', min: 1, max: 1440 }),
        input('due', '计划日期', item.due, { type: 'date' })) +
      select('status', '状态', Object.entries(taskLabels), item.status ?? 'todo') +
      `<div class="checkboxes">${check('important', '重要', item.important ?? true)}${check('urgent', '紧急', item.urgent)}
        ${check('focus', '加入今日重点', item.focusDate === day())}</div>`],
    note: () => [id ? '编辑记录' : '快速记录',
      area('body', '内容', item.body, true, '此刻想记下什么？') +
      input('title', '标题', item.title, { placeholder: '留空则使用首行', length: 120 }) +
      pair(select('kind', '保存到', [['inbox', '收集箱'], ['note', '笔记']], item.kind ?? (parent === 'note' ? 'note' : 'inbox')),
        select('project', '关联项目', options(data.projects, '无'), item.project))],
    review: () => {
      const date = id || day();
      const review = data.reviews.find(review => review.date === date) || {};
      const completed = data.tasks.filter(task => task.completed === date && task.status === 'done');
      return [date === day() ? '今日复盘' : `${date} 复盘`,
        `<div class="context-box">${icon('check', 17)}<div><strong>${completed.length ? `已完成 ${completed.length} 项` : '当天没有完成的任务'}</strong>
          ${completed.length ? `<p>${completed.map(task => e(task.title)).join('、')}</p>` : ''}</div></div>` +
        area('done', '今天完成了什么？', review.done) + area('gain', '有什么收获？', review.gain) +
        area('block', '遇到什么阻碍？', review.block) + area('next', '下一步是什么？', review.next) +
        (!review.task ? check('createTask', '保存时将下一步加入任务池', false) : '<p class="quiet-copy">下一步已加入任务池。</p>')];
    },
    budget: () => ['调整余额与目标',
      input('balance', '校准当前余额（元）', ((data.finance.opening + data.finance.transactions.reduce((sum, item) => sum + (item.type === 'income' ? item.amount : -item.amount), 0)) / 100).toFixed(2), { type: 'number', step: '0.01', required: true }) +
      input('target', '储蓄目标（元）', (data.finance.target / 100).toFixed(2), { type: 'number', min: 0, step: '0.01', required: true })],
    transaction: () => [id ? '编辑收支' : '记一笔',
      pair(select('type', '类型', [['expense', '支出'], ['income', '收入']], item.type || 'expense'),
        input('amount', '金额（元）', item.amount ? (item.amount / 100).toFixed(2) : '', { type: 'number', required: true, min: '0.01', max: 100000000, step: '0.01' })) +
      nameField('事项', item.title, '例如：午餐') + input('date', '日期', item.date ?? day(), { type: 'date', required: true })],
    health: () => {
      const today = data.health.find(record => record.date === day()) ?? {};
      const choices = labels => labels.map(label => [label, label]);
      return ['记录今日状态',
        select('energy', '精力', choices(['充足', '一般', '疲惫']), today.energy || '一般') +
        select('mood', '心情', choices(['愉快', '平稳', '低落']), today.mood || '平稳') +
        select('sleep', '睡眠', choices(['不错', '一般', '不足']), today.sleep || '一般')];
    },
    habit: () => [id ? '编辑习惯' : '添加习惯', nameField('习惯名称', item.title, '例如：出门走 20 分钟')],
    'ai-config': () => ['连接模型',
      select('provider', '服务商', [['custom', '自定义'], ['deepseek', 'DeepSeek'], ['openai', 'OpenAI']], aiConfig?.provider || 'custom') +
      input('base', 'Base URL', aiConfig?.base, { type: 'url', required: true, placeholder: 'https://api.example.com/v1', length: 400 }) +
      input('model', '模型名称', aiConfig?.model, { required: true, placeholder: '服务商提供的模型 ID' }) +
      input('key', 'API Key', '', { type: 'password', required: true, length: 512 }) +
      '<p class="quiet-copy">密钥仅保存在本地服务内存中，重启后需重新连接。</p>']
  };
  const [title, fields] = fieldsets[type]();
  const remove = id && ['task', 'note', 'habit', 'transaction'].includes(type)
    ? iconButton('删除', `remove:${type}:${id}`, 'trash', 'danger-icon') : '';
  return {
    title,
    content: `<form data-form="${type}" data-id="${e(id)}" class="edit-form">${fields}<p class="form-error" role="alert" hidden></p>
      <footer class="modal-footer">${remove}<div class="spacer"></div>${button('取消', 'close')}
        <button class="button primary" type="submit">${type === 'ai-config' ? '测试并连接' : '保存'}</button></footer></form>`
  };
}
