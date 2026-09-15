import { dom } from './dom.js';
import { state, getCurrentEmployee, getEmployeeName } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { formatDate, formatCurrency, showToast } from '../utils.js';

export function isTaskOverdue(task) {
  if (!task || !task.deadline) return false;
  const [y, m, d] = task.deadline.split('-').map(Number);
  const deadlineEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
  return Date.now() > deadlineEnd.getTime() && Number(task.completion) < 100 && !task.permission;
}

export function getTaskPenalty(task) {
  return isTaskOverdue(task) ? 4000 : 0;
}

export function renderTasks() {
  const query = dom.taskSearch ? dom.taskSearch.value.trim().toLowerCase() : '';
  const showAll = dom.taskStatusFilter?.value === 'all';
  const rows = [...(state.db?.tasks || [])]
    .sort((left, right) => new Date(left.deadline) - new Date(right.deadline))
    .filter((task) => {
      const textMatch = !query || [task.title, task.description, task.deadline, getEmployeeName(task.employeeId)]
        .some((field) => String(field).toLowerCase().includes(query));
      const statusMatch = showAll || query || Number(task.completion) < 100;
      return textMatch && statusMatch;
    })
    .map((task) => {
      const penalty = getTaskPenalty(task);
      const overdue = isTaskOverdue(task);
      const progressClass = Number(task.completion) === 100 ? 'chip-success' : overdue ? 'chip-danger' : 'chip-warning';
      return `
        <tr>
          <td>
            <div class="fw-semibold">${task.title}</div>
            <div class="small text-muted">${task.description}</div>
          </td>
          <td>${getEmployeeName(task.employeeId)}</td>
          <td>${formatDate(task.deadline)}</td>
          <td class="text-end"><span class="chip ${progressClass}">${Number(task.completion)}%</span></td>
          <td>${Number(task.completion) === 100 ? '<span class="chip chip-success">Complete</span>' : overdue ? '<span class="chip chip-danger">Overdue</span>' : '<span class="chip chip-warning">Incomplete</span>'}</td>
          <td>${task.permission ? '<span class="chip chip-success">Granted</span>' : '<span class="chip chip-neutral">No</span>'}</td>
          <td class="text-end fw-bold">${formatCurrency(penalty)}</td>
          <td>
            <button class="btn btn-sm btn-soft me-1" data-action="edit-task" data-id="${task.id}">Edit</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-task" data-id="${task.id}">Delete</button>
          </td>
        </tr>`;
    }).join('');

  const taskTable = document.getElementById('taskTableBody') || dom.taskTableBody;
  if (taskTable) {
    taskTable.innerHTML = rows || `<tr><td colspan="8" class="text-center text-muted py-4">${showAll || query ? 'No tasks found.' : 'No active tasks. Switch to "All tasks" to view completed ones.'}</td></tr>`;
  }
}

export function resetTaskForm() {
  if (dom.taskForm) dom.taskForm.reset();
  if (dom.taskId) dom.taskId.value = '';
  if (dom.taskProgress) dom.taskProgress.value = 10;
  if (dom.taskPermission) dom.taskPermission.value = 'No';
  if (dom.taskFormTitle) dom.taskFormTitle.textContent = 'Assign Task';
}

export async function upsertTask(event, refreshAll) {
  event.preventDefault();
  const empId = dom.taskEmployee?.value;
  if (!empId) {
    showToast('Please create or select an active employee first.', 'warning');
    return;
  }
  const task = {
    id: dom.taskId.value || crypto.randomUUID(),
    employeeId: empId,
    title: dom.taskTitle.value.trim(),
    description: dom.taskDescription.value.trim(),
    deadline: dom.taskDeadline.value,
    completion: Number(dom.taskProgress.value),
    permission: dom.taskPermission.value === 'Yes',
    createdAt: new Date().toISOString()
  };

  if (!state.db.tasks) state.db.tasks = [];
  const index = state.db.tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) {
    state.db.tasks[index] = { ...state.db.tasks[index], ...task };
    showToast('Task updated.', 'success');
  } else {
    state.db.tasks.push(task);
    showToast('Task assigned.', 'success');
  }

  await saveDatabase();
  resetTaskForm();
  if (typeof refreshAll === 'function') refreshAll();
}

export function renderTaskCountdowns() {
  const el = dom.taskCountdownGrid;
  if (!el) return;
  const tasks = (state.db?.tasks || [])
    .filter((t) => Number(t.completion) < 100)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));

  if (tasks.length === 0) {
    el.innerHTML = '<p class="text-muted text-center py-3">No active tasks.</p>';
    return;
  }

  el.innerHTML = tasks.map((task) => {
    const overdue = isTaskOverdue(task);
    const employee = (state.db?.employees || []).find((e) => e.id === task.employeeId);
    const pct = Math.min(100, Math.max(0, Number(task.completion) || 0));
    return `
      <div class="countdown-tile${overdue ? '  countdown-overdue' : ''} interactive-3d-card">
        <div class="countdown-employee">${employee?.fullName || 'Unknown'}</div>
        <div class="countdown-task" title="${task.title}">${task.title}</div>
        <div class="countdown-deadline">Due: ${formatDate(task.deadline)}</div>
        <div class="countdown-timer" data-countdown="${task.deadline}">—</div>
        <div class="countdown-bar-wrap"><div class="countdown-bar" style="width:${pct}%"></div></div>
        <div class="countdown-completion">${pct}% complete</div>
      </div>`;
  }).join('');

  updateCountdownDisplays();
}

export function renderStaffTaskCountdowns() {
  const el = dom.staffTaskCountdownGrid;
  if (!el) return;
  const employee = getCurrentEmployee();
  if (!employee) {
    el.innerHTML = '<p class="text-muted text-center py-3">No active tasks.</p>';
    return;
  }
  const tasks = (state.db?.tasks || [])
    .filter((t) => t.employeeId === employee.id && Number(t.completion) < 100)
    .sort((a, b) => String(a.deadline).localeCompare(String(a.deadline)));
  if (tasks.length === 0) {
    el.innerHTML = '<p class="text-muted text-center py-3">No active tasks.</p>';
    return;
  }
  el.innerHTML = tasks.map((task) => {
    const overdue = isTaskOverdue(task);
    const pct = Math.min(100, Math.max(0, Number(task.completion) || 0));
    return `
      <div class="countdown-tile${overdue ? '  countdown-overdue' : ''} interactive-3d-card">
        <div class="countdown-task" title="${task.title}">${task.title}</div>
        <div class="countdown-deadline">Due: ${formatDate(task.deadline)}</div>
        <div class="countdown-timer" data-countdown="${task.deadline}">—</div>
        <div class="countdown-bar-wrap"><div class="countdown-bar" style="width:${pct}%"></div></div>
        <div class="countdown-completion">${pct}% complete</div>
      </div>`;
  }).join('');
  updateCountdownDisplays();
}

export function updateCountdownDisplays() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const deadline = el.dataset.countdown;
    if (!deadline) return;
    const [y, m, d] = deadline.split('-').map(Number);
    const target = new Date(y, m - 1, d, 23, 59, 59, 999);
    const diff = target - Date.now();

    if (diff <= 0) {
      el.textContent = 'OVERDUE';
      el.className = 'countdown-timer time-overdue';
      return;
    }

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const pad = (n) => String(n).padStart(2, '0');

    el.textContent = days > 0
      ? `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`
      : `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;

    if (diff < 86400000)           el.className = 'countdown-timer time-urgent';
    else if (diff < 3 * 86400000) el.className = 'countdown-timer time-soon';
    else                           el.className = 'countdown-timer time-ok';
  });
}
