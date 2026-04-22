const STORAGE_KEY = 'hr-management-db-v2';
const SESSION_KEY = 'hr-management-session-v1';
const LATE_CUTOFF = '07:45';
const CLOSING_TIME = '15:30';

const defaultSeed = {
  users: [
    { name: 'System Admin', email: 'admin@hr.local', role: 'admin', password: 'Admin@123' },
    { name: 'Staff User', email: 'staff@hr.local', role: 'staff', password: 'Staff@123' }
  ],
  employees: [],
  attendance: [],
  tasks: [],
  reports: [],
  income: [],
  payrollAdjustments: [],
  budget: {
    salary: 0,
    operations: 0
  }
};

const state = {
  db: null,
  session: null,
  charts: {}
};

const dom = {};

function todayISO(dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function monthDateISO(monthOffset = 0, day = 1) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset, day);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function saturdayLateISOString(isLate) {
  const now = new Date();
  const current = new Date(now);
  const day = current.getDay();
  const diffToSaturday = (6 - day + 7) % 7;
  current.setDate(current.getDate() + diffToSaturday);
  current.setHours(isLate ? 10 : 9, isLate ? 15 : 30, 0, 0);
  return current.toISOString();
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function timeToMinutes(timeValue) {
  if (!timeValue) return null;
  const [hours, minutes] = timeValue.split(':').map(Number);
  return hours * 60 + minutes;
}

async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadDatabase() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = await createSeedDatabase();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.payrollAdjustments)) {
    parsed.payrollAdjustments = [];
  }
  if (parsed.users?.some((user) => !user.passwordHash)) {
    parsed.users = await Promise.all(parsed.users.map(async (user) => ({
      ...user,
      passwordHash: user.passwordHash || await hashPassword(user.password || 'password')
    })));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  }
  return parsed;
}

async function createSeedDatabase() {
  const users = [];
  for (const user of defaultSeed.users) {
    users.push({
      name: user.name,
      email: user.email,
      role: user.role,
      passwordHash: await hashPassword(user.password)
    });
  }

  return {
    users,
    employees: defaultSeed.employees,
    attendance: defaultSeed.attendance,
    tasks: defaultSeed.tasks,
    reports: defaultSeed.reports,
    income: defaultSeed.income,
    payrollAdjustments: defaultSeed.payrollAdjustments || [],
    budget: defaultSeed.budget
  };
}

function saveDatabase() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSession(session) {
  state.session = session;
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function getEmployeeName(employeeId) {
  return state.db.employees.find((employee) => employee.id === employeeId)?.fullName || 'Unknown Employee';
}

function getLatestEmployeeId() {
  const last = state.db.employees[state.db.employees.length - 1];
  if (!last) return 'EMP-1001';
  const numeric = Number(last.id.replace('EMP-', '')) + 1;
  return `EMP-${String(numeric).padStart(4, '0')}`;
}

function getTodayAttendance() {
  const today = todayISO(0);
  return state.db.attendance.filter((entry) => entry.date === today);
}

function getPayrollAdjustmentSummary(employeeId) {
  return state.db.payrollAdjustments
    .filter((entry) => entry.employeeId === employeeId)
    .reduce((accumulator, entry) => {
      const amount = Number(entry.amount || 0);
      if (entry.type === 'Bonus') accumulator.bonus += amount;
      if (entry.type === 'Loan') accumulator.loan += amount;
      if (entry.type === 'Advance') accumulator.advance += amount;
      return accumulator;
    }, { loan: 0, advance: 0, bonus: 0 });
}

function getAttendancePenalty(entry) {
  if (entry.status === 'Absent') return 8000;
  const lateMinutes = timeToMinutes(entry.timeIn) - timeToMinutes(LATE_CUTOFF);
  if (entry.status === 'Present' && lateMinutes > 0 && !entry.permission) return 4000;
  return 0;
}

function isLate(entry) {
  if (entry.status !== 'Present' || entry.permission) return false;
  const timeIn = timeToMinutes(entry.timeIn);
  return timeIn !== null && timeIn > timeToMinutes(LATE_CUTOFF);
}

function isLateReport(report) {
  const submittedAt = new Date(report.submittedAt);
  const saturday = new Date(submittedAt);
  const day = saturday.getDay();
  const diffToSaturday = (6 - day + 7) % 7;
  saturday.setDate(saturday.getDate() - diffToSaturday);
  saturday.setHours(10, 0, 0, 0);
  return submittedAt > saturday;
}

function getReportPenalty(report) {
  return isLateReport(report) ? 2000 : 0;
}

function getTaskPenalty(task) {
  return Number(task.completion) < 100 ? 3000 : 0;
}

function getEmployeeDeductions(employeeId) {
  const payrollAdjustments = getPayrollAdjustmentSummary(employeeId);
  const attendancePenalty = state.db.attendance
    .filter((entry) => entry.employeeId === employeeId)
    .reduce((sum, entry) => sum + getAttendancePenalty(entry), 0);

  const reportPenalty = state.db.reports
    .filter((report) => report.employeeId === employeeId)
    .reduce((sum, report) => sum + getReportPenalty(report), 0);

  const taskPenalty = state.db.tasks
    .filter((task) => task.employeeId === employeeId)
    .reduce((sum, task) => sum + getTaskPenalty(task), 0);

  const originalSalary = Number(state.db.employees.find((employee) => employee.id === employeeId)?.salary || 0);
  const otherDeductions = attendancePenalty + reportPenalty + taskPenalty;
  const loanAndAdvance = payrollAdjustments.loan + payrollAdjustments.advance;
  const grossSalary = originalSalary + payrollAdjustments.bonus;
  const netSalary = Math.max(grossSalary - otherDeductions - loanAndAdvance, 0);

  return {
    loan: payrollAdjustments.loan,
    advance: payrollAdjustments.advance,
    bonus: payrollAdjustments.bonus,
    attendancePenalty,
    reportPenalty,
    taskPenalty,
    loanAndAdvance,
    otherDeductions,
    totalDeductions: otherDeductions + loanAndAdvance,
    originalSalary,
    grossSalary,
    finalSalary: netSalary
  };
}

function getPayrollTotals() {
  return state.db.employees.reduce((accumulator, employee) => {
    const summary = getEmployeeDeductions(employee.id);
    accumulator.original += summary.originalSalary;
    accumulator.deductions += summary.totalDeductions;
    accumulator.bonuses += summary.bonus;
    accumulator.net += summary.finalSalary;
    accumulator.salaryActual += summary.finalSalary;
    return accumulator;
  }, { original: 0, deductions: 0, bonuses: 0, net: 0, salaryActual: 0 });
}

function getOperationsActual() {
  const totalExpense = state.db.income
    .filter((entry) => entry.type === 'Expense' && !isSalaryCategory(entry.category))
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  const penalties = state.db.attendance.reduce((sum, entry) => sum + getAttendancePenalty(entry), 0)
    + state.db.reports.reduce((sum, report) => sum + getReportPenalty(report), 0)
    + state.db.tasks.reduce((sum, task) => sum + getTaskPenalty(task), 0);

  return totalExpense + penalties;
}

function isSalaryCategory(category) {
  const normalized = String(category || '').toLowerCase();
  return normalized.includes('salary') || normalized.includes('payroll') || normalized.includes('staff');
}

function buildSelectOptions() {
  const options = state.db.employees.map((employee) => `<option value="${employee.id}">${employee.fullName} · ${employee.id}</option>`).join('');
  [dom.attendanceEmployee, dom.taskEmployee, dom.reportEmployee, dom.payrollAdjustmentEmployee].forEach((select) => {
    if (select) select.innerHTML = options || '<option value="">No employees available</option>';
  });
}

function setActiveView(viewId) {
  document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('active', panel.id === viewId));
  document.querySelectorAll('#sidebarNav .nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
  dom.pageTitle.textContent = document.querySelector(`#sidebarNav .nav-link[data-view="${viewId}"] span`).textContent;
  if (viewId === 'dashboardView') {
    requestAnimationFrame(() => renderDashboard());
  }
  if (window.innerWidth < 1200) dom.sidebar.classList.remove('open');
}

function showToast(message, variant = 'primary') {
  const toastId = `toast-${crypto.randomUUID()}`;
  const container = dom.toastContainer;
  const toastMarkup = `
    <div class="toast align-items-center text-bg-${variant} border-0 mb-2" id="${toastId}" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>`;
  container.insertAdjacentHTML('beforeend', toastMarkup);
  const toastElement = document.getElementById(toastId);
  const toast = bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 2600 });
  toast.show();
  toastElement.addEventListener('hidden.bs.toast', () => toastElement.remove());
}

function renderDashboard() {
  const totals = getPayrollTotals();
  const todayEntries = getTodayAttendance();
  const presentToday = todayEntries.filter((entry) => entry.status === 'Present').length;
  const absentToday = todayEntries.filter((entry) => entry.status === 'Absent').length;

  dom.totalEmployeesCard.textContent = state.db.employees.length;
  dom.presentTodayCard.textContent = presentToday;
  dom.absentTodayCard.textContent = absentToday;
  dom.totalDeductionsCard.textContent = formatCurrency(totals.deductions);
  dom.netSalaryCard.textContent = formatCurrency(totals.net);

  const attendanceTrend = buildAttendanceTrend();
  const taskData = buildTaskSummary();
  const deductionData = buildDeductionSummary();
  const financeData = buildFinanceSeries();

  updateChart('attendanceChart', {
    type: 'line',
    data: {
      labels: attendanceTrend.labels,
      datasets: [
        { label: 'Present', data: attendanceTrend.present, borderColor: '#6ee7d8', backgroundColor: 'rgba(110, 231, 216, 0.18)', tension: 0.35, fill: true },
        { label: 'Absent', data: attendanceTrend.absent, borderColor: '#ff7a7a', backgroundColor: 'rgba(255, 122, 122, 0.18)', tension: 0.35, fill: true }
      ]
    },
    options: chartOptions('line')
  });

  updateChart('tasksChart', {
    type: 'doughnut',
    data: {
      labels: ['Complete', 'Incomplete'],
      datasets: [{ data: [taskData.complete, taskData.incomplete], backgroundColor: ['#7ee787', '#ffd166'], borderWidth: 0 }]
    },
    options: chartOptions('doughnut')
  });

  updateChart('deductionsChart', {
    type: 'bar',
    data: {
      labels: ['Attendance', 'Reports', 'Tasks'],
      datasets: [{ label: 'NGN', data: [deductionData.attendance, deductionData.reports, deductionData.tasks], backgroundColor: ['#6ee7d8', '#ffd166', '#ff7a7a'] }]
    },
    options: chartOptions('bar')
  });

  updateChart('financeChart', {
    type: 'line',
    data: {
      labels: financeData.labels,
      datasets: [
        { label: 'Revenue', data: financeData.revenue, borderColor: '#6ee7d8', tension: 0.35 },
        { label: 'Expenses', data: financeData.expenses, borderColor: '#ff7a7a', tension: 0.35 },
        { label: 'Profit', data: financeData.profit, borderColor: '#ffd166', tension: 0.35 }
      ]
    },
    options: chartOptions('line')
  });
}

function buildAttendanceTrend() {
  const labels = [];
  const present = [];
  const absent = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const iso = date.toISOString().slice(0, 10);
    labels.push(date.toLocaleDateString('en-NG', { weekday: 'short' }));
    const entries = state.db.attendance.filter((entry) => entry.date === iso);
    present.push(entries.filter((entry) => entry.status === 'Present').length);
    absent.push(entries.filter((entry) => entry.status === 'Absent').length);
  }

  return { labels, present, absent };
}

function buildTaskSummary() {
  return state.db.tasks.reduce((accumulator, task) => {
    if (Number(task.completion) >= 100) accumulator.complete += 1;
    else accumulator.incomplete += 1;
    return accumulator;
  }, { complete: 0, incomplete: 0 });
}

function buildDeductionSummary() {
  return {
    attendance: state.db.attendance.reduce((sum, entry) => sum + getAttendancePenalty(entry), 0),
    reports: state.db.reports.reduce((sum, report) => sum + getReportPenalty(report), 0),
    tasks: state.db.tasks.reduce((sum, task) => sum + getTaskPenalty(task), 0)
  };
}

function buildFinanceSeries() {
  const months = [];
  const revenue = [];
  const expenses = [];
  const profit = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - offset, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push(date.toLocaleDateString('en-NG', { month: 'short' }));
    const entries = state.db.income.filter((entry) => entry.date.startsWith(monthKey));
    const revenueTotal = entries.filter((entry) => entry.type === 'Revenue').reduce((sum, entry) => sum + Number(entry.amount), 0);
    const expenseTotal = entries.filter((entry) => entry.type === 'Expense').reduce((sum, entry) => sum + Number(entry.amount), 0);
    revenue.push(revenueTotal);
    expenses.push(expenseTotal);
    profit.push(revenueTotal - expenseTotal);
  }

  return { labels: months, revenue, expenses, profit };
}

function updateChart(chartKey, config) {
  const canvas = document.getElementById(chartKey);
  if (!canvas) return;

  if (state.charts[chartKey]) {
    state.charts[chartKey].destroy();
  }

  state.charts[chartKey] = new Chart(canvas, config);
}

function chartOptions(type) {
  const common = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#ecf2ff' }
      }
    }
  };

  if (type === 'doughnut') {
    return {
      ...common,
      cutout: '68%'
    };
  }

  return {
    ...common,
    scales: {
      x: { ticks: { color: '#c7d2fe' }, grid: { color: 'rgba(255,255,255,0.06)' } },
      y: { ticks: { color: '#c7d2fe' }, grid: { color: 'rgba(255,255,255,0.06)' } }
    }
  };
}

function renderEmployees() {
  const query = dom.employeeSearch.value.trim().toLowerCase();
  const rows = state.db.employees.filter((employee) => {
    return [employee.id, employee.fullName, employee.position, employee.department]
      .some((field) => String(field).toLowerCase().includes(query));
  }).map((employee) => {
    const payroll = getEmployeeDeductions(employee.id);
    return `
      <tr>
        <td><strong>${employee.id}</strong></td>
        <td>${employee.fullName}</td>
        <td>${employee.position}</td>
        <td>${employee.department}</td>
        <td class="text-end">${formatCurrency(employee.salary)}</td>
        <td>
          <button class="btn btn-sm btn-soft me-1" data-action="edit-employee" data-id="${employee.id}">Edit</button>
          <button class="btn btn-sm btn-outline-secondary" data-action="delete-employee" data-id="${employee.id}">Delete</button>
          <div class="small text-muted mt-2">Net salary: ${formatCurrency(payroll.finalSalary)}</div>
        </td>
      </tr>`;
  }).join('');

  dom.employeeTableBody.innerHTML = rows || '<tr><td colspan="6" class="text-center text-muted py-4">No employees found</td></tr>';
  buildSelectOptions();
}

function renderAttendance() {
  const query = dom.attendanceSearch.value.trim().toLowerCase();
  const rows = [...state.db.attendance]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .filter((entry) => {
      return [entry.date, getEmployeeName(entry.employeeId), entry.status, entry.timeIn, entry.timeOut]
        .some((field) => String(field).toLowerCase().includes(query));
    })
    .map((entry) => {
      const late = isLate(entry);
      const penalty = getAttendancePenalty(entry);
      return `
        <tr>
          <td>${formatDate(entry.date)}</td>
          <td>${getEmployeeName(entry.employeeId)}</td>
          <td><span class="chip ${entry.status === 'Present' ? 'chip-success' : 'chip-danger'}">${entry.status}</span></td>
          <td>${entry.timeIn || '—'} ${entry.status === 'Present' ? `<div class="small text-muted">Close: ${CLOSING_TIME}</div>` : ''}</td>
          <td>${late ? '<span class="chip chip-warning">Late</span>' : '<span class="chip chip-neutral">On time</span>'}</td>
          <td>${entry.permission ? '<span class="chip chip-success">Granted</span>' : '<span class="chip chip-neutral">No</span>'}</td>
          <td class="text-end fw-bold">${formatCurrency(penalty)}</td>
          <td><button class="btn btn-sm btn-outline-secondary" data-action="delete-attendance" data-id="${entry.id}">Remove</button></td>
        </tr>`;
    }).join('');

  dom.attendanceTableBody.innerHTML = rows || '<tr><td colspan="8" class="text-center text-muted py-4">No attendance logs found</td></tr>';
}

function renderTasks() {
  const query = dom.taskSearch.value.trim().toLowerCase();
  const rows = [...state.db.tasks]
    .sort((left, right) => new Date(left.deadline) - new Date(right.deadline))
    .filter((task) => {
      return [task.title, task.description, task.deadline, getEmployeeName(task.employeeId)]
        .some((field) => String(field).toLowerCase().includes(query));
    })
    .map((task) => {
      const penalty = getTaskPenalty(task);
      const progressClass = Number(task.completion) === 100 ? 'chip-success' : 'chip-warning';
      return `
        <tr>
          <td>
            <div class="fw-semibold">${task.title}</div>
            <div class="small text-muted">${task.description}</div>
          </td>
          <td>${getEmployeeName(task.employeeId)}</td>
          <td>${formatDate(task.deadline)}</td>
          <td class="text-end"><span class="chip ${progressClass}">${Number(task.completion)}%</span></td>
          <td>${Number(task.completion) === 100 ? '<span class="chip chip-success">Complete</span>' : '<span class="chip chip-warning">Incomplete</span>'}</td>
          <td class="text-end fw-bold">${formatCurrency(penalty)}</td>
          <td>
            <button class="btn btn-sm btn-soft me-1" data-action="edit-task" data-id="${task.id}">Edit</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-task" data-id="${task.id}">Delete</button>
          </td>
        </tr>`;
    }).join('');

  dom.taskTableBody.innerHTML = rows || '<tr><td colspan="7" class="text-center text-muted py-4">No tasks found</td></tr>';
}

function renderReports() {
  const query = dom.reportSearch.value.trim().toLowerCase();
  const rows = [...state.db.reports]
    .sort((left, right) => new Date(right.submittedAt) - new Date(left.submittedAt))
    .filter((report) => {
      return [report.title, report.content, report.submittedAt, getEmployeeName(report.employeeId)]
        .some((field) => String(field).toLowerCase().includes(query));
    })
    .map((report) => {
      const late = isLateReport(report);
      const penalty = getReportPenalty(report);
      return `
        <tr>
          <td>${formatDateTime(report.submittedAt)}</td>
          <td>${getEmployeeName(report.employeeId)}</td>
          <td>
            <div class="fw-semibold">${report.title}</div>
            <div class="small text-muted">${report.content.slice(0, 80)}${report.content.length > 80 ? '...' : ''}</div>
          </td>
          <td>${late ? '<span class="chip chip-danger">Late</span>' : '<span class="chip chip-success">On time</span>'}</td>
          <td class="text-end fw-bold">${formatCurrency(penalty)}</td>
          <td><button class="btn btn-sm btn-outline-secondary" data-action="delete-report" data-id="${report.id}">Delete</button></td>
        </tr>`;
    }).join('');

  dom.reportTableBody.innerHTML = rows || '<tr><td colspan="6" class="text-center text-muted py-4">No reports found</td></tr>';
}

function renderFinance() {
  const range = dom.financeRangeFilter.value;
  const selected = buildFinanceSummary(range);
  dom.incomeTableBody.innerHTML = selected.rows || '<tr><td colspan="6" class="text-center text-muted py-4">No finance entries found</td></tr>';
  dom.revenueMetric.textContent = formatCurrency(selected.revenue);
  dom.expensesMetric.textContent = formatCurrency(selected.expenses);
  dom.profitMetric.textContent = formatCurrency(selected.revenue - selected.expenses);
}

function buildFinanceSummary(range) {
  const now = new Date();
  let filtered = [...state.db.income];

  if (range === 'monthly') {
    const key = now.toISOString().slice(0, 7);
    filtered = filtered.filter((entry) => entry.date.startsWith(key));
  } else if (range === 'fourMonths') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 3, 1);
    filtered = filtered.filter((entry) => new Date(entry.date) >= start);
  } else if (range === 'yearly') {
    const year = now.getFullYear();
    filtered = filtered.filter((entry) => new Date(entry.date).getFullYear() === year);
  }

  const revenue = filtered.filter((entry) => entry.type === 'Revenue').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expenses = filtered.filter((entry) => entry.type === 'Expense').reduce((sum, entry) => sum + Number(entry.amount), 0);

  const rows = filtered
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .map((entry) => `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td><span class="chip ${entry.type === 'Revenue' ? 'chip-success' : 'chip-danger'}">${entry.type}</span></td>
        <td>${entry.category}</td>
        <td>${entry.description || '—'}</td>
        <td class="text-end fw-bold">${formatCurrency(entry.amount)}</td>
        <td><button class="btn btn-sm btn-outline-secondary" data-action="delete-income" data-id="${entry.id}">Delete</button></td>
      </tr>`).join('');

  return { rows, revenue, expenses };
}

function getPayrollAdjustmentTotals() {
  return state.db.payrollAdjustments.reduce((accumulator, entry) => {
    const amount = Number(entry.amount || 0);
    if (entry.type === 'Bonus') accumulator.bonus += amount;
    if (entry.type === 'Loan') accumulator.loan += amount;
    if (entry.type === 'Advance') accumulator.advance += amount;
    return accumulator;
  }, { loan: 0, advance: 0, bonus: 0 });
}

function renderPayrollAdjustments() {
  const query = dom.payrollAdjustmentSearch.value.trim().toLowerCase();
  const rows = [...state.db.payrollAdjustments]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .filter((entry) => {
      return [entry.date, getEmployeeName(entry.employeeId), entry.type, entry.notes]
        .some((field) => String(field).toLowerCase().includes(query));
    })
    .map((entry) => `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${getEmployeeName(entry.employeeId)}</td>
        <td><span class="chip ${entry.type === 'Bonus' ? 'chip-success' : 'chip-warning'}">${entry.type}</span></td>
        <td class="text-end fw-bold">${formatCurrency(entry.amount)}</td>
        <td>${entry.notes || '—'}</td>
        <td>
          <button class="btn btn-sm btn-soft me-1" data-action="edit-payroll-adjustment" data-id="${entry.id}">Edit</button>
          <button class="btn btn-sm btn-outline-secondary" data-action="delete-payroll-adjustment" data-id="${entry.id}">Delete</button>
        </td>
      </tr>`).join('');

  const totals = getPayrollAdjustmentTotals();
  dom.payrollAdjustmentTableBody.innerHTML = rows || '<tr><td colspan="6" class="text-center text-muted py-4">No payroll adjustments found</td></tr>';
  dom.payrollLoansMetric.textContent = formatCurrency(totals.loan);
  dom.payrollAdvancesMetric.textContent = formatCurrency(totals.advance);
  dom.payrollBonusesMetric.textContent = formatCurrency(totals.bonus);
  dom.payrollNetMetric.textContent = formatCurrency(getPayrollTotals().net);

  const summaryRows = state.db.employees.map((employee) => {
    const summary = getEmployeeDeductions(employee.id);
    return `
      <tr>
        <td>${employee.fullName}</td>
        <td class="text-end">${formatCurrency(summary.originalSalary)}</td>
        <td class="text-end">${formatCurrency(summary.bonus)}</td>
        <td class="text-end">${formatCurrency(summary.loanAndAdvance)}</td>
        <td class="text-end">${formatCurrency(summary.otherDeductions)}</td>
        <td class="text-end fw-bold">${formatCurrency(summary.finalSalary)}</td>
      </tr>`;
  }).join('');

  dom.payrollSummaryTableBody.innerHTML = summaryRows || '<tr><td colspan="6" class="text-center text-muted py-4">No employees found</td></tr>';
}

function renderBudget() {
  const payroll = getPayrollTotals();
  const operations = getOperationsActual();
  const salaryBudget = Number(state.db.budget.salary || 0);
  const operationsBudget = Number(state.db.budget.operations || 0);

  dom.salaryBudget.value = salaryBudget;
  dom.operationsBudget.value = operationsBudget;
  dom.budgetSalaryValue.textContent = formatCurrency(salaryBudget);
  dom.budgetOperationsValue.textContent = formatCurrency(operationsBudget);
  dom.budgetSalaryActual.textContent = formatCurrency(payroll.salaryActual);
  dom.budgetOperationsActual.textContent = formatCurrency(operations);

  dom.budgetSalaryStatus.textContent = payroll.salaryActual > salaryBudget ? `Exceeded by ${formatCurrency(payroll.salaryActual - salaryBudget)}` : `Remaining ${formatCurrency(salaryBudget - payroll.salaryActual)}`;
  dom.budgetOperationsStatus.textContent = operations > operationsBudget ? `Exceeded by ${formatCurrency(operations - operationsBudget)}` : `Remaining ${formatCurrency(operationsBudget - operations)}`;

  const alerts = [];
  if (payroll.salaryActual > salaryBudget) {
    alerts.push(`Salary budget exceeded by ${formatCurrency(payroll.salaryActual - salaryBudget)}.`);
  }
  if (operations > operationsBudget) {
    alerts.push(`Operations budget exceeded by ${formatCurrency(operations - operationsBudget)}.`);
  }
  if (!alerts.length) {
    alerts.push('Both budget categories are within target for the selected data set.');
  }

  dom.budgetAlerts.innerHTML = alerts.map((message) => `<div class="alert-item">${message}</div>`).join('');
}

function renderDerivedViews() {
  renderAttendance();
  renderTasks();
  renderReports();
  renderFinance();
  renderPayrollAdjustments();
  renderBudget();
  renderDashboard();
}

function resetEmployeeForm() {
  dom.employeeForm.reset();
  dom.employeeId.value = '';
  dom.employeeFormTitle.textContent = 'Add Employee';
  dom.employeeSubmitBtn.textContent = 'Save Employee';
}

function resetTaskForm() {
  dom.taskForm.reset();
  dom.taskId.value = '';
  dom.taskProgress.value = 10;
  dom.taskFormTitle.textContent = 'Assign Task';
}

function upsertEmployee(event) {
  event.preventDefault();
  const id = dom.employeeId.value || getLatestEmployeeId();
  const employee = {
    id,
    fullName: dom.employeeName.value.trim(),
    position: dom.employeePosition.value.trim(),
    department: dom.employeeDepartment.value.trim(),
    salary: Number(dom.employeeSalary.value)
  };

  if (dom.employeeId.value) {
    state.db.employees = state.db.employees.map((item) => item.id === id ? employee : item);
    showToast('Employee updated successfully.', 'success');
  } else {
    state.db.employees.push({ ...employee, createdAt: new Date().toISOString() });
    showToast('Employee added successfully.', 'success');
  }

  saveDatabase();
  resetEmployeeForm();
  refreshAll();
}

function upsertAttendance(event) {
  event.preventDefault();
  const entry = {
    id: crypto.randomUUID(),
    employeeId: dom.attendanceEmployee.value,
    date: dom.attendanceDate.value,
    status: dom.attendanceStatus.value,
    permission: dom.attendancePermission.value === 'Yes',
    timeIn: dom.attendanceTimeIn.value,
    timeOut: dom.attendanceTimeOut.value
  };

  const existingIndex = state.db.attendance.findIndex((item) => item.employeeId === entry.employeeId && item.date === entry.date);
  if (existingIndex >= 0) {
    state.db.attendance[existingIndex] = { ...state.db.attendance[existingIndex], ...entry, id: state.db.attendance[existingIndex].id };
    showToast('Attendance updated.', 'success');
  } else {
    state.db.attendance.push(entry);
    showToast('Attendance logged.', 'success');
  }

  saveDatabase();
  dom.attendanceForm.reset();
  dom.attendanceDate.value = todayISO(0);
  dom.attendanceStatus.value = 'Present';
  refreshAll();
}

function upsertTask(event) {
  event.preventDefault();
  const task = {
    id: dom.taskId.value || crypto.randomUUID(),
    employeeId: dom.taskEmployee.value,
    title: dom.taskTitle.value.trim(),
    description: dom.taskDescription.value.trim(),
    deadline: dom.taskDeadline.value,
    completion: Number(dom.taskProgress.value),
    createdAt: new Date().toISOString()
  };

  const index = state.db.tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) {
    state.db.tasks[index] = { ...state.db.tasks[index], ...task };
    showToast('Task updated.', 'success');
  } else {
    state.db.tasks.push(task);
    showToast('Task assigned.', 'success');
  }

  saveDatabase();
  resetTaskForm();
  refreshAll();
}

function submitReport(event) {
  event.preventDefault();
  state.db.reports.push({
    id: crypto.randomUUID(),
    employeeId: dom.reportEmployee.value,
    title: dom.reportTitle.value.trim(),
    content: dom.reportContent.value.trim(),
    submittedAt: new Date().toISOString()
  });
  saveDatabase();
  dom.reportForm.reset();
  showToast('Report submitted.', 'success');
  refreshAll();
}

function submitIncome(event) {
  event.preventDefault();
  state.db.income.push({
    id: crypto.randomUUID(),
    type: dom.incomeType.value,
    category: dom.incomeCategory.value.trim(),
    amount: Number(dom.incomeAmount.value),
    date: dom.incomeDate.value,
    description: dom.incomeDescription.value.trim()
  });
  saveDatabase();
  dom.incomeForm.reset();
  dom.incomeType.value = 'Revenue';
  dom.incomeDate.value = todayISO(0);
  showToast('Finance entry saved.', 'success');
  refreshAll();
}

function submitPayrollAdjustment(event) {
  event.preventDefault();
  const adjustmentId = dom.payrollAdjustmentId.value || crypto.randomUUID();
  const entry = {
    id: adjustmentId,
    employeeId: dom.payrollAdjustmentEmployee.value,
    type: dom.payrollAdjustmentType.value,
    amount: Number(dom.payrollAdjustmentAmount.value),
    date: dom.payrollAdjustmentDate.value,
    notes: dom.payrollAdjustmentNotes.value.trim()
  };

  const existingIndex = state.db.payrollAdjustments.findIndex((item) => item.id === adjustmentId);
  if (existingIndex >= 0) {
    state.db.payrollAdjustments[existingIndex] = entry;
    showToast('Payroll adjustment updated.', 'success');
  } else {
    state.db.payrollAdjustments.push(entry);
    showToast('Payroll adjustment saved.', 'success');
  }

  saveDatabase();
  dom.payrollAdjustmentForm.reset();
  dom.payrollAdjustmentId.value = '';
  dom.payrollAdjustmentDate.value = todayISO(0);
  dom.payrollAdjustmentType.value = 'Loan';
  dom.payrollAdjustmentFormTitle.textContent = 'Payroll Adjustments';
  dom.payrollAdjustmentSubmitBtn.textContent = 'Save Adjustment';
  refreshAll();
}

function resetPayrollAdjustmentForm() {
  dom.payrollAdjustmentForm.reset();
  dom.payrollAdjustmentId.value = '';
  dom.payrollAdjustmentDate.value = todayISO(0);
  dom.payrollAdjustmentType.value = 'Loan';
  dom.payrollAdjustmentFormTitle.textContent = 'Payroll Adjustments';
  dom.payrollAdjustmentSubmitBtn.textContent = 'Save Adjustment';
}

function submitBudget(event) {
  event.preventDefault();
  state.db.budget.salary = Number(dom.salaryBudget.value);
  state.db.budget.operations = Number(dom.operationsBudget.value);
  saveDatabase();
  showToast('Budget updated.', 'success');
  refreshAll();
}

function handleTableActions(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;

  if (action === 'edit-employee') {
    const employee = state.db.employees.find((item) => item.id === id);
    if (!employee) return;
    dom.employeeId.value = employee.id;
    dom.employeeName.value = employee.fullName;
    dom.employeePosition.value = employee.position;
    dom.employeeDepartment.value = employee.department;
    dom.employeeSalary.value = employee.salary;
    dom.employeeFormTitle.textContent = `Edit ${employee.id}`;
    dom.employeeSubmitBtn.textContent = 'Update Employee';
    setActiveView('employeesView');
  }

  if (action === 'delete-employee') {
    if (!confirm('Delete this employee and related records?')) return;
    state.db.employees = state.db.employees.filter((item) => item.id !== id);
    state.db.attendance = state.db.attendance.filter((item) => item.employeeId !== id);
    state.db.tasks = state.db.tasks.filter((item) => item.employeeId !== id);
    state.db.reports = state.db.reports.filter((item) => item.employeeId !== id);
    saveDatabase();
    showToast('Employee deleted.', 'success');
    refreshAll();
  }

  if (action === 'edit-task') {
    const task = state.db.tasks.find((item) => item.id === id);
    if (!task) return;
    dom.taskId.value = task.id;
    dom.taskEmployee.value = task.employeeId;
    dom.taskTitle.value = task.title;
    dom.taskDescription.value = task.description;
    dom.taskDeadline.value = task.deadline;
    dom.taskProgress.value = task.completion;
    dom.taskFormTitle.textContent = 'Edit Task';
    setActiveView('tasksView');
  }

  if (action === 'delete-task') {
    state.db.tasks = state.db.tasks.filter((item) => item.id !== id);
    saveDatabase();
    showToast('Task removed.', 'success');
    refreshAll();
  }

  if (action === 'delete-attendance') {
    state.db.attendance = state.db.attendance.filter((item) => item.id !== id);
    saveDatabase();
    showToast('Attendance entry removed.', 'success');
    refreshAll();
  }

  if (action === 'delete-report') {
    state.db.reports = state.db.reports.filter((item) => item.id !== id);
    saveDatabase();
    showToast('Report removed.', 'success');
    refreshAll();
  }

  if (action === 'delete-income') {
    if (!confirm('Delete this finance entry?')) return;
    state.db.income = state.db.income.filter((item) => item.id !== id);
    saveDatabase();
    showToast('Finance entry removed.', 'success');
    refreshAll();
  }

  if (action === 'edit-payroll-adjustment') {
    const adjustment = state.db.payrollAdjustments.find((item) => item.id === id);
    if (!adjustment) return;
    dom.payrollAdjustmentId.value = adjustment.id;
    dom.payrollAdjustmentEmployee.value = adjustment.employeeId;
    dom.payrollAdjustmentType.value = adjustment.type;
    dom.payrollAdjustmentAmount.value = adjustment.amount;
    dom.payrollAdjustmentDate.value = adjustment.date;
    dom.payrollAdjustmentNotes.value = adjustment.notes || '';
    dom.payrollAdjustmentFormTitle.textContent = 'Edit Payroll Adjustment';
    dom.payrollAdjustmentSubmitBtn.textContent = 'Update Adjustment';
    setActiveView('payrollView');
  }

  if (action === 'delete-payroll-adjustment') {
    if (!confirm('Delete this payroll adjustment?')) return;
    state.db.payrollAdjustments = state.db.payrollAdjustments.filter((item) => item.id !== id);
    saveDatabase();
    showToast('Payroll adjustment removed.', 'success');
    refreshAll();
  }
}

function refreshAll() {
  renderEmployees();
  renderAttendance();
  renderTasks();
  renderReports();
  renderFinance();
  renderPayrollAdjustments();
  renderBudget();
  renderDashboard();
}

async function handleLogin(event) {
  event.preventDefault();
  const email = dom.email.value.trim().toLowerCase();
  const passwordHash = await hashPassword(dom.password.value);
  const user = state.db.users.find((item) => item.email.toLowerCase() === email && item.passwordHash === passwordHash);
  if (!user) {
    showToast('Invalid credentials.', 'danger');
    return;
  }

  saveSession({ email: user.email, role: user.role, name: user.name });
  bootApp();
  showToast(`Welcome, ${user.name}.`, 'success');
}

function logout() {
  saveSession(null);
  dom.appShell.classList.add('d-none');
  dom.authShell.classList.remove('d-none');
}

function bootApp() {
  dom.authShell.classList.add('d-none');
  dom.appShell.classList.remove('d-none');
  dom.sessionUserName.textContent = state.session?.name || 'Admin';
  dom.sessionUserRole.textContent = state.session?.role || 'admin';
  dom.attendanceDate.value = todayISO(0);
  dom.incomeDate.value = todayISO(0);
  dom.payrollAdjustmentDate.value = todayISO(0);
  dom.payrollAdjustmentType.value = 'Loan';
  dom.payrollAdjustmentId.value = '';
  dom.payrollAdjustmentFormTitle.textContent = 'Payroll Adjustments';
  dom.payrollAdjustmentSubmitBtn.textContent = 'Save Adjustment';
  dom.taskDeadline.value = todayISO(7);
  refreshAll();
}

function setupLiveClock() {
  const updateClock = () => {
    dom.liveClock.textContent = new Date().toLocaleString('en-NG', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  updateClock();
  setInterval(updateClock, 1000 * 30);
}

function cacheDom() {
  const ids = {
    authShell: 'authShell', appShell: 'appShell', loginForm: 'loginForm', email: 'email', password: 'password',
    sidebar: 'sidebarPanel', mobileMenuBtn: 'mobileMenuBtn', logoutBtn: 'logoutBtn',
    liveClock: 'liveClock', sessionUserName: 'sessionUserName', sessionUserRole: 'sessionUserRole', pageTitle: 'pageTitle',
    totalEmployeesCard: 'totalEmployeesCard', presentTodayCard: 'presentTodayCard', absentTodayCard: 'absentTodayCard',
    totalDeductionsCard: 'totalDeductionsCard', netSalaryCard: 'netSalaryCard', employeeForm: 'employeeForm', employeeId: 'employeeId',
    employeeName: 'employeeName', employeePosition: 'employeePosition', employeeDepartment: 'employeeDepartment', employeeSalary: 'employeeSalary',
    employeeFormTitle: 'employeeFormTitle', employeeSubmitBtn: 'employeeSubmitBtn', employeeResetBtn: 'employeeResetBtn',
    employeeSearch: 'employeeSearch', employeeTableBody: 'employeeTableBody', attendanceForm: 'attendanceForm', attendanceEmployee: 'attendanceEmployee',
    attendanceDate: 'attendanceDate', attendanceStatus: 'attendanceStatus', attendancePermission: 'attendancePermission', attendanceTimeIn: 'attendanceTimeIn',
    attendanceTimeOut: 'attendanceTimeOut', attendanceSearch: 'attendanceSearch', attendanceTableBody: 'attendanceTableBody', taskForm: 'taskForm',
    taskId: 'taskId', taskEmployee: 'taskEmployee', taskTitle: 'taskTitle', taskDescription: 'taskDescription', taskDeadline: 'taskDeadline',
    taskProgress: 'taskProgress', taskFormTitle: 'taskFormTitle', taskSearch: 'taskSearch', taskTableBody: 'taskTableBody', taskResetBtn: 'taskResetBtn',
    reportForm: 'reportForm', reportEmployee: 'reportEmployee', reportTitle: 'reportTitle', reportContent: 'reportContent', reportSearch: 'reportSearch',
    reportTableBody: 'reportTableBody', incomeForm: 'incomeForm', incomeType: 'incomeType', incomeCategory: 'incomeCategory', incomeAmount: 'incomeAmount',
    incomeDate: 'incomeDate', incomeDescription: 'incomeDescription', incomeTableBody: 'incomeTableBody', revenueMetric: 'revenueMetric', expensesMetric: 'expensesMetric',
    profitMetric: 'profitMetric', financeRangeFilter: 'financeRangeFilter',
    payrollAdjustmentForm: 'payrollAdjustmentForm', payrollAdjustmentId: 'payrollAdjustmentId', payrollAdjustmentFormTitle: 'payrollAdjustmentFormTitle', payrollAdjustmentSubmitBtn: 'payrollAdjustmentSubmitBtn', payrollAdjustmentEmployee: 'payrollAdjustmentEmployee', payrollAdjustmentType: 'payrollAdjustmentType', payrollAdjustmentAmount: 'payrollAdjustmentAmount', payrollAdjustmentDate: 'payrollAdjustmentDate', payrollAdjustmentNotes: 'payrollAdjustmentNotes', payrollAdjustmentResetBtn: 'payrollAdjustmentResetBtn', payrollAdjustmentSearch: 'payrollAdjustmentSearch', payrollAdjustmentTableBody: 'payrollAdjustmentTableBody', payrollLoansMetric: 'payrollLoansMetric', payrollAdvancesMetric: 'payrollAdvancesMetric', payrollBonusesMetric: 'payrollBonusesMetric', payrollNetMetric: 'payrollNetMetric', payrollSummaryTableBody: 'payrollSummaryTableBody', budgetForm: 'budgetForm', salaryBudget: 'salaryBudget',
    operationsBudget: 'operationsBudget', budgetSalaryValue: 'budgetSalaryValue', budgetOperationsValue: 'budgetOperationsValue', budgetSalaryActual: 'budgetSalaryActual',
    budgetOperationsActual: 'budgetOperationsActual', budgetSalaryStatus: 'budgetSalaryStatus', budgetOperationsStatus: 'budgetOperationsStatus', budgetAlerts: 'budgetAlerts',
    toastContainer: 'toastContainer'
  };

  Object.entries(ids).forEach(([key, id]) => {
    dom[key] = document.getElementById(id);
  });
}

function bindEvents() {
  dom.loginForm.addEventListener('submit', handleLogin);
  dom.logoutBtn.addEventListener('click', logout);
  dom.mobileMenuBtn.addEventListener('click', () => dom.sidebar.classList.toggle('open'));
  dom.employeeForm.addEventListener('submit', upsertEmployee);
  dom.employeeResetBtn.addEventListener('click', resetEmployeeForm);
  dom.attendanceForm.addEventListener('submit', upsertAttendance);
  dom.taskForm.addEventListener('submit', upsertTask);
  dom.taskResetBtn.addEventListener('click', resetTaskForm);
  dom.reportForm.addEventListener('submit', submitReport);
  dom.incomeForm.addEventListener('submit', submitIncome);
  dom.payrollAdjustmentForm.addEventListener('submit', submitPayrollAdjustment);
  dom.payrollAdjustmentResetBtn.addEventListener('click', resetPayrollAdjustmentForm);
  dom.budgetForm.addEventListener('submit', submitBudget);
  dom.financeRangeFilter.addEventListener('change', renderFinance);
  dom.payrollAdjustmentSearch.addEventListener('input', renderPayrollAdjustments);
  dom.employeeSearch.addEventListener('input', renderEmployees);
  dom.attendanceSearch.addEventListener('input', renderAttendance);
  dom.taskSearch.addEventListener('input', renderTasks);
  dom.reportSearch.addEventListener('input', renderReports);
  document.getElementById('sidebarNav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    setActiveView(button.dataset.view);
  });
  document.body.addEventListener('click', handleTableActions);
}

async function init() {
  cacheDom();
  setupLiveClock();
  state.db = await loadDatabase();
  state.session = loadSession();
  bindEvents();

  if (state.session) {
    bootApp();
  } else {
    dom.authShell.classList.remove('d-none');
    dom.appShell.classList.add('d-none');
  }

  dom.attendanceDate.value = todayISO(0);
  dom.incomeDate.value = todayISO(0);
  dom.payrollAdjustmentDate.value = todayISO(0);
  dom.payrollAdjustmentType.value = 'Loan';
  dom.taskDeadline.value = todayISO(7);

  if (!state.session) {
    dom.authShell.classList.remove('d-none');
  }
}

init().catch((error) => {
  console.error(error);
  alert('The application could not initialize. Check the browser console for details.');
});