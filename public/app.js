import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import { doc, getDoc, getFirestore, setDoc } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

const SESSION_KEY = 'hr-management-session-v1';
const LATE_CUTOFF = '07:45';
const CLOSING_TIME = '15:30';
const firebaseConfig = {
  apiKey: 'AIzaSyDMGBOcLA8xf7dpFlQy4jeLTtWFcHIHUf0',
  authDomain: 'hlts-ltd-hr.firebaseapp.com',
  projectId: 'hlts-ltd-hr',
  storageBucket: 'hlts-ltd-hr.firebasestorage.app',
  messagingSenderId: '317869307639',
  appId: '1:317869307639:web:d03eca24021447b1e9c5f2',
  measurementId: 'G-PK4BTRN4B6'
};
const firebaseApp = initializeApp(firebaseConfig);
const firebaseDb = getFirestore(firebaseApp);
const firebaseAppStateRef = doc(firebaseDb, 'appState', 'main');

const defaultSeed = {
  users: [
    { name: 'System Admin', username: 'Admin', email: 'admin@hr.local', role: 'admin', password: 'Chrisella1!', active: true },
    { name: 'Staff User', username: 'staff@hr.local', email: 'staff@hr.local', role: 'staff', password: 'EMP-9001', employeeId: 'EMP-9001', active: true }
  ],
  employees: [
    {
      id: 'EMP-9001',
      fullName: 'Staff User',
      email: 'staff@hr.local',
      username: 'staff@hr.local',
      position: 'Staff Officer',
      department: 'Operations',
      salary: 250000,
      active: true,
      salaryPaid: false,
      salaryPaidAt: null,
      createdAt: new Date().toISOString()
    }
  ],
  attendance: [],
  tasks: [],
  reports: [],
  income: [],
  payrollAdjustments: [],
  payrollPayments: [],
  budget: {
    salary: 0,
    operations: 0
  },
  settings: {
    attendanceLocked: false
  }
};

const state = {
  db: null,
  session: null,
  charts: {},
  credentialCache: {}
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

function generatePassword(length = 10) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (value) => charset[value % charset.length]).join('');
}

function slugifyName(value) {
  return String(value || 'staff')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'staff';
}

function buildEmployeeUsername(fullName, employeeId) {
  return `${slugifyName(fullName)}-${String(employeeId || '').slice(-4).toLowerCase()}`;
}

function buildEmployeeCredentials(employee) {
  const username = String(employee.email || employee.username || buildEmployeeEmail(employee.fullName, employee.id)).toLowerCase();
  const password = String(employee.id || '').toUpperCase();
  return { username, password };
}

function buildEmployeeEmail(fullName, employeeId) {
  return `${slugifyName(fullName || employeeId || 'staff')}@hr.local`;
}

function getCurrentPayrollPeriodKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getPayrollPeriodLabel(periodKey) {
  if (!periodKey) return 'Unknown period';
  const [year, month] = periodKey.split('-').map(Number);
  if (!year || !month) return periodKey;
  return new Date(year, month - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
}

function getSelectedPayrollPeriodKey() {
  return dom.payrollPeriodFilter?.value || getCurrentPayrollPeriodKey();
}

function buildPayrollPeriodOptions() {
  const periodKeys = new Set();

  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - offset, 1);
    periodKeys.add(getCurrentPayrollPeriodKey(date));
  }

  state.db.payrollPayments.forEach((entry) => {
    if (entry?.periodKey) periodKeys.add(entry.periodKey);
  });

  state.db.employees.forEach((employee) => {
    if (employee?.salaryPaidAt) periodKeys.add(new Date(employee.salaryPaidAt).toISOString().slice(0, 7));
  });

  return [...periodKeys].sort().reverse();
}

function populatePayrollPeriodFilter() {
  if (!dom.payrollPeriodFilter) return;

  const selectedPeriod = dom.payrollPeriodFilter.value || getCurrentPayrollPeriodKey();
  const options = buildPayrollPeriodOptions();
  dom.payrollPeriodFilter.innerHTML = options
    .map((periodKey) => `<option value="${periodKey}">${getPayrollPeriodLabel(periodKey)}</option>`)
    .join('');

  if (options.includes(selectedPeriod)) {
    dom.payrollPeriodFilter.value = selectedPeriod;
  } else if (options.length) {
    dom.payrollPeriodFilter.value = options[0];
  }
}

function getPayrollPayment(employeeId, periodKey = getCurrentPayrollPeriodKey()) {
  return state.db.payrollPayments.find((entry) => entry.employeeId === employeeId && entry.periodKey === periodKey) || null;
}

function setPayrollPayment(employeeId, periodKey, paid) {
  const existingIndex = state.db.payrollPayments.findIndex((entry) => entry.employeeId === employeeId && entry.periodKey === periodKey);
  const existing = existingIndex >= 0 ? state.db.payrollPayments[existingIndex] : null;
  const updated = {
    id: existing?.id || crypto.randomUUID(),
    employeeId,
    periodKey,
    paid: Boolean(paid),
    paidAt: paid ? (existing?.paidAt || new Date().toISOString()) : null,
    paidBy: paid ? (state.session?.email || state.session?.name || 'admin') : null
  };

  if (existingIndex >= 0) {
    state.db.payrollPayments[existingIndex] = updated;
  } else {
    state.db.payrollPayments.push(updated);
  }

  return updated;
}

function normalizeDatabase(database) {
  return {
    users: Array.isArray(database?.users) ? database.users : [],
    employees: Array.isArray(database?.employees) ? database.employees : [],
    attendance: Array.isArray(database?.attendance) ? database.attendance : [],
    tasks: Array.isArray(database?.tasks) ? database.tasks : [],
    reports: Array.isArray(database?.reports) ? database.reports : [],
    income: Array.isArray(database?.income) ? database.income : [],
    payrollAdjustments: Array.isArray(database?.payrollAdjustments) ? database.payrollAdjustments : [],
    payrollPayments: Array.isArray(database?.payrollPayments) ? database.payrollPayments : [],
    budget: {
      ...defaultSeed.budget,
      ...(database?.budget || {})
    },
    settings: {
      ...defaultSeed.settings,
      ...(database?.settings || {})
    }
  };
}

async function prepareDatabase(database) {
  const normalized = normalizeDatabase(database);

  if (normalized.users.some((user) => !user.passwordHash)) {
    normalized.users = await Promise.all(normalized.users.map(async (user) => ({
      ...user,
      passwordHash: user.passwordHash || await hashPassword(user.password || 'password')
    })));
  }

  normalized.users = await Promise.all(normalized.users.map(async (user) => {
    if (user.role === 'admin') {
      return {
        ...user,
        username: 'Admin',
        email: user.email || 'admin@hr.local',
        active: user.active !== false,
        passwordHash: await hashPassword('Chrisella1!')
      };
    }

    return {
      ...user,
      active: user.active !== false
    };
  }));

  const nonStaffUsers = normalized.users.filter((user) => user.role !== 'staff' || !user.employeeId);
  const syncedEmployees = [];
  const syncedStaffUsers = [];
  const syncedPayrollPayments = Array.isArray(normalized.payrollPayments) ? [...normalized.payrollPayments] : [];
  const payrollPaymentKeys = new Set(syncedPayrollPayments.map((entry) => `${entry.employeeId}|${entry.periodKey}`));

  for (const employee of normalized.employees) {
    const email = String(employee.email || employee.username || buildEmployeeEmail(employee.fullName, employee.id)).toLowerCase();
    const salaryPaid = Boolean(employee.salaryPaid);
    const salaryPaidAt = salaryPaid ? (employee.salaryPaidAt || new Date().toISOString()) : null;
    const legacyPeriodKey = employee.salaryPaidAt ? new Date(employee.salaryPaidAt).toISOString().slice(0, 7) : getCurrentPayrollPeriodKey();

    if (salaryPaid && !payrollPaymentKeys.has(`${employee.id}|${legacyPeriodKey}`)) {
      syncedPayrollPayments.push({
        id: crypto.randomUUID(),
        employeeId: employee.id,
        periodKey: legacyPeriodKey,
        paid: true,
        paidAt: salaryPaidAt || new Date().toISOString(),
        paidBy: 'migration'
      });
      payrollPaymentKeys.add(`${employee.id}|${legacyPeriodKey}`);
    }

    syncedEmployees.push({
      ...employee,
      email,
      username: email,
      active: employee.active !== false,
      salaryPaid,
      salaryPaidAt
    });

    syncedStaffUsers.push({
      name: employee.fullName,
      username: email,
      email,
      role: 'staff',
      employeeId: employee.id,
      active: employee.active !== false,
      passwordHash: await hashPassword(employee.id)
    });
  }

  normalized.employees = syncedEmployees;
  normalized.users = [...nonStaffUsers, ...syncedStaffUsers];
  normalized.payrollPayments = syncedPayrollPayments.map((entry) => ({
    ...entry,
    paid: Boolean(entry.paid),
    paidAt: entry.paid ? (entry.paidAt || new Date().toISOString()) : null,
    paidBy: entry.paid ? (entry.paidBy || null) : null
  }));

  return normalized;
}

async function loadDatabase() {
  const snapshot = await getDoc(firebaseAppStateRef);

  if (!snapshot.exists()) {
    const seeded = await createSeedDatabase();
    await setDoc(firebaseAppStateRef, seeded);
    return seeded;
  }

  const prepared = await prepareDatabase(snapshot.data());
  await setDoc(firebaseAppStateRef, prepared);
  return prepared;
}

async function createSeedDatabase() {
  const users = [];
  for (const user of defaultSeed.users) {
    users.push({
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId || null,
      active: user.active !== false,
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
    payrollPayments: defaultSeed.payrollPayments || [],
    budget: defaultSeed.budget,
    settings: defaultSeed.settings
  };
}

function saveDatabase() {
  void setDoc(firebaseAppStateRef, state.db).catch((error) => {
    console.error('Failed to sync Firestore state:', error);
    showToast('Unable to sync data to Firebase.', 'danger');
  });
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

function getCurrentEmployee() {
  if (!state.session) return null;
  if (state.session.employeeId) {
    const byId = state.db.employees.find((employee) => employee.id === state.session.employeeId);
    if (byId) return byId;
  }

  return state.db.employees.find((employee) => String(employee.email || '').toLowerCase() === String(state.session.email || '').toLowerCase()) || null;
}

function isEmployeeActive(employee) {
  return employee?.active !== false;
}

function isStaffSession() {
  return state.session?.role === 'staff';
}

function getCurrentEmployeeId() {
  return getCurrentEmployee()?.id || state.session?.employeeId || null;
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

function getCurrentEmployeeAttendance() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId) return [];
  return state.db.attendance.filter((entry) => entry.employeeId === employeeId);
}

function getCurrentEmployeeTasks() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId) return [];
  return state.db.tasks.filter((task) => task.employeeId === employeeId);
}

function getCurrentEmployeeReports() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId) return [];
  return state.db.reports.filter((report) => report.employeeId === employeeId);
}

function getCurrentEmployeeDailyAttendance() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId) return [];
  return [...state.db.attendance]
    .filter((entry) => entry.employeeId === employeeId)
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 7);
}

function getMonthlyReportCounts(employeeId) {
  const results = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - offset, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = date.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });
    const count = state.db.reports.filter((report) => report.employeeId === employeeId && String(report.submittedAt || '').startsWith(monthKey)).length;
    results.push({ month: monthLabel, count });
  }
  return results;
}

function getStaffPresenceToday() {
  const today = todayISO(0);
  return state.db.employees
    .filter((employee) => isEmployeeActive(employee))
    .filter((employee) => employee.id !== getCurrentEmployeeId())
    .map((employee) => {
      const attendance = state.db.attendance.find((entry) => entry.employeeId === employee.id && entry.date === today);
      return {
        employee,
        present: attendance?.status === 'Present',
        status: attendance?.status || 'Absent'
      };
    });
}

function getCurrentWeekStartISO() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day + 6) % 7;
  now.setDate(now.getDate() - diff);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function hasSubmittedCurrentWeekReport() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId) return false;
  const weekStart = new Date(getCurrentWeekStartISO());
  return state.db.reports.some((report) => report.employeeId === employeeId && new Date(report.submittedAt) >= weekStart);
}

function getCurrentMonthReportCount() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId) return 0;
  const monthKey = todayISO(0).slice(0, 7);
  return state.db.reports.filter((report) => report.employeeId === employeeId && String(report.submittedAt || '').startsWith(monthKey)).length;
}

function getAttendanceLockState() {
  return Boolean(state.db.settings?.attendanceLocked);
}

function setAttendanceLockState(locked) {
  state.db.settings = {
    ...state.db.settings,
    attendanceLocked: Boolean(locked),
    attendanceLockedAt: new Date().toISOString(),
    attendanceLockedBy: state.session?.email || state.session?.name || 'admin'
  };
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
  const day = submittedAt.getDay();
  const minutes = submittedAt.getHours() * 60 + submittedAt.getMinutes();

  if (day === 5) {
    return minutes < (12 * 60);
  }

  if (day === 6) {
    return minutes > (10 * 60);
  }

  return true;
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

function getStaffDeductionRows(employeeId) {
  const summary = getEmployeeDeductions(employeeId);
  return [
    { label: 'Attendance penalty', purpose: 'Late arrival or absence', amount: summary.attendancePenalty },
    { label: 'Report penalty', purpose: 'Weekly report submitted late', amount: summary.reportPenalty },
    { label: 'Task penalty', purpose: 'Incomplete or overdue task', amount: summary.taskPenalty },
    { label: 'Loan deduction', purpose: 'Loan collected from salary', amount: summary.loan },
    { label: 'Advance deduction', purpose: 'Salary advance collected from salary', amount: summary.advance },
    { label: 'Bonus adjustment', purpose: 'Added to salary before deductions', amount: summary.bonus }
  ];
}

function isSalaryCategory(category) {
  const normalized = String(category || '').toLowerCase();
  return normalized.includes('salary') || normalized.includes('payroll') || normalized.includes('staff');
}

function buildSelectOptions() {
  const options = state.db.employees
    .filter((employee) => isEmployeeActive(employee))
    .map((employee) => `<option value="${employee.id}">${employee.fullName} · ${employee.id}</option>`)
    .join('');
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
  const payrollPeriodKey = getCurrentPayrollPeriodKey();
  const payrollPeriodLabel = getPayrollPeriodLabel(payrollPeriodKey);
  const rows = state.db.employees.filter((employee) => {
      return [employee.id, employee.fullName, employee.email, employee.position, employee.department]
      .some((field) => String(field).toLowerCase().includes(query));
  }).map((employee) => {
    const payroll = getEmployeeDeductions(employee.id);
    const payrollPayment = getPayrollPayment(employee.id, payrollPeriodKey);
    const active = isEmployeeActive(employee);
    return `
      <tr>
        <td><strong>${employee.id}</strong></td>
        <td>${employee.fullName}</td>
        <td>${employee.email || '—'}</td>
        <td>${employee.username || '—'}</td>
        <td>${employee.position}</td>
        <td>${employee.department}</td>
        <td>${payrollPayment?.paid ? `<span class="chip chip-success">Paid ${payrollPeriodLabel}</span>` : `<span class="chip chip-danger">Pending ${payrollPeriodLabel}</span>`}</td>
        <td class="text-end">${formatCurrency(employee.salary)}</td>
        <td>
          <div class="small mb-2"><span class="chip ${active ? 'chip-success' : 'chip-danger'}">${active ? 'Active' : 'Deactivated'}</span></div>
          <button class="btn btn-sm btn-soft me-1" data-action="edit-employee" data-id="${employee.id}">Edit</button>
          <button class="btn btn-sm ${active ? 'btn-outline-secondary' : 'btn-primary'} me-1" data-action="toggle-employee-active" data-id="${employee.id}">${active ? 'Deactivate' : 'Reactivate'}</button>
          <button class="btn btn-sm btn-outline-secondary" data-action="delete-employee" data-id="${employee.id}">Delete</button>
          <button class="btn btn-sm btn-outline-secondary mt-1" data-action="show-employee-credentials" data-id="${employee.id}">Credentials</button>
          <div class="small text-muted mt-2">Net salary: ${formatCurrency(payroll.finalSalary)}</div>
        </td>
      </tr>`;
  }).join('');

  dom.employeeTableBody.innerHTML = rows || '<tr><td colspan="9" class="text-center text-muted py-4">No employees found</td></tr>';
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
  if (dom.attendanceLockStatus) {
    dom.attendanceLockStatus.textContent = getAttendanceLockState() ? 'Locked' : 'Open';
    dom.attendanceLockStatus.className = `badge rounded-pill ${getAttendanceLockState() ? 'text-bg-danger' : 'text-bg-success'} px-3 py-2`;
  }
  if (dom.attendanceLockBtn) {
    dom.attendanceLockBtn.textContent = getAttendanceLockState() ? 'Unlock Attendance' : 'Lock Attendance';
  }
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
          <td>
            <button class="btn btn-sm btn-soft me-1" data-action="edit-report" data-id="${report.id}">Edit</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-report" data-id="${report.id}">Delete</button>
          </td>
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
  const payrollPeriodKey = getSelectedPayrollPeriodKey();
  const payrollPeriodLabel = getPayrollPeriodLabel(payrollPeriodKey);
  populatePayrollPeriodFilter();
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
  if (dom.payrollPeriodLabel) dom.payrollPeriodLabel.textContent = payrollPeriodLabel;
  if (dom.payrollPeriodFilter && !dom.payrollPeriodFilter.value) dom.payrollPeriodFilter.value = payrollPeriodKey;

  const summaryRows = state.db.employees.map((employee) => {
    const summary = getEmployeeDeductions(employee.id);
    const payment = getPayrollPayment(employee.id, payrollPeriodKey);
    return `
      <tr>
        <td>${employee.fullName}</td>
        <td>${payrollPeriodLabel}</td>
        <td class="text-end">${formatCurrency(summary.originalSalary)}</td>
        <td class="text-end">${formatCurrency(summary.bonus)}</td>
        <td class="text-end">${formatCurrency(summary.loanAndAdvance)}</td>
        <td class="text-end">${formatCurrency(summary.otherDeductions)}</td>
        <td class="text-end fw-bold">${formatCurrency(summary.finalSalary)}</td>
        <td>${payment?.paid ? `<span class="chip chip-success">Paid</span><div class="small text-muted mt-1">${formatDate(payment.paidAt)}</div>` : '<span class="chip chip-danger">Pending</span>'}</td>
        <td>
          <button class="btn btn-sm ${payment?.paid ? 'btn-soft' : 'btn-primary'}" data-action="toggle-payroll-payment" data-employee-id="${employee.id}" data-period-key="${payrollPeriodKey}" data-paid="${payment?.paid ? 'true' : 'false'}">
            ${payment?.paid ? `Mark ${payrollPeriodLabel} Unpaid` : `Mark ${payrollPeriodLabel} Paid`}
          </button>
        </td>
      </tr>`;
  }).join('');

  dom.payrollSummaryTableBody.innerHTML = summaryRows || '<tr><td colspan="9" class="text-center text-muted py-4">No employees found</td></tr>';
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

function renderStaffPortal() {
  const employee = getCurrentEmployee();
  const payrollPeriodKey = getSelectedPayrollPeriodKey();
  const payrollPeriodLabel = getPayrollPeriodLabel(payrollPeriodKey);
  const inactive = Boolean(employee && !isEmployeeActive(employee));

  if (dom.staffInactiveState) dom.staffInactiveState.classList.toggle('d-none', !inactive);
  if (dom.staffActiveContent) dom.staffActiveContent.classList.toggle('d-none', inactive);

  if (inactive) {
    return;
  }

  if (!employee) {
    dom.staffPortalStatus.textContent = 'No employee profile is linked to this account yet.';
    dom.staffTasksBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No linked employee profile found</td></tr>';
    dom.staffReportsSummary.textContent = 'Unavailable';
    dom.staffReportsDetail.textContent = 'Weekly report status unavailable until an employee profile is linked.';
    dom.staffAttendanceSummary.textContent = 'Unavailable';
    dom.staffAttendanceDetail.textContent = 'Attendance actions are unavailable until an employee profile is linked.';
    dom.staffDeductionsBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4">No linked employee profile found</td></tr>';
    dom.staffDailyAttendanceBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No attendance history available</td></tr>';
    dom.staffMonthlyReportsBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-4">No report history available</td></tr>';
    dom.staffColleaguesBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-4">No staff records available</td></tr>';
    dom.staffSalaryValue.textContent = formatCurrency(0);
    dom.staffActualSalaryValue.textContent = formatCurrency(0);
    if (dom.staffSalaryPeriodLabel) dom.staffSalaryPeriodLabel.textContent = payrollPeriodLabel;
    dom.staffSalaryStatus.textContent = 'Unavailable';
    dom.staffSalaryStatus.className = 'badge rounded-pill text-bg-secondary px-3 py-2';
    return;
  }

  const payroll = getEmployeeDeductions(employee.id);
  const payrollPayment = getPayrollPayment(employee.id, payrollPeriodKey);
  const tasks = getCurrentEmployeeTasks();
  const reports = getCurrentEmployeeReports();
  const attendance = getCurrentEmployeeAttendance();
  const dailyAttendance = getCurrentEmployeeDailyAttendance();
  const monthlyReports = getMonthlyReportCounts(employee.id);
  const colleagues = getStaffPresenceToday();
  const latestAttendance = attendance.slice().sort((left, right) => new Date(right.date) - new Date(left.date))[0] || null;

  dom.staffPortalStatus.textContent = `${employee.fullName} · ${employee.position} · ${employee.department}`;
  dom.staffAttendanceSummary.textContent = latestAttendance ? formatDate(latestAttendance.date) : 'No logs';
  dom.staffAttendanceDetail.textContent = latestAttendance
    ? `Last attendance: ${formatDate(latestAttendance.date)} (${latestAttendance.status}${latestAttendance.timeIn ? `, in ${latestAttendance.timeIn}` : ''}${latestAttendance.timeOut ? `, out ${latestAttendance.timeOut}` : ''})`
    : 'No attendance record has been logged yet.';
  dom.staffReportsSummary.textContent = `${getCurrentMonthReportCount()} this month`;
  dom.staffReportsDetail.textContent = hasSubmittedCurrentWeekReport()
    ? 'Weekly report submitted for the current month.'
    : 'Weekly report not yet submitted for the current month.';
  dom.staffSalaryValue.textContent = formatCurrency(payroll.finalSalary);
  dom.staffActualSalaryValue.textContent = formatCurrency(payroll.originalSalary);
  if (dom.staffSalaryPeriodLabel) dom.staffSalaryPeriodLabel.textContent = payrollPeriodLabel;
  dom.staffSalaryStatus.textContent = payrollPayment?.paid
    ? `Paid for ${payrollPeriodLabel}${payrollPayment.paidAt ? ` on ${formatDate(payrollPayment.paidAt)}` : ''}`
    : `Pending for ${payrollPeriodLabel}`;
  dom.staffSalaryStatus.className = `badge rounded-pill px-3 py-2 ${payrollPayment?.paid ? 'text-bg-success' : 'text-bg-danger'}`;

  dom.staffTasksBody.innerHTML = tasks.length
    ? tasks.map((task) => `
      <tr>
        <td>
          <div class="fw-semibold">${task.title}</div>
          <div class="small text-muted">${task.description || '—'}</div>
        </td>
        <td>${formatDate(task.deadline)}</td>
        <td class="text-end"><span class="chip ${Number(task.completion) === 100 ? 'chip-success' : 'chip-warning'}">${Number(task.completion)}%</span></td>
        <td>${Number(task.completion) === 100 ? '<span class="chip chip-success">Complete</span>' : '<span class="chip chip-warning">In progress</span>'}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="text-center text-muted py-4">No tasks assigned</td></tr>';

  dom.staffReportsBody.innerHTML = reports.length
    ? reports.map((report) => `
      <tr>
        <td>${formatDateTime(report.submittedAt)}</td>
        <td>${report.title}</td>
        <td>${report.content.slice(0, 80)}${report.content.length > 80 ? '...' : ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="text-center text-muted py-4">No weekly reports submitted</td></tr>';

  const staffDeductionRows = getStaffDeductionRows(employee.id).filter((item) => item.amount > 0 || item.label === 'Bonus adjustment');
  dom.staffDeductionsBody.innerHTML = staffDeductionRows.length
    ? staffDeductionRows.map((item) => `
      <tr>
        <td>${item.label}</td>
        <td>${item.purpose}</td>
        <td class="text-end fw-bold">${formatCurrency(item.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="text-center text-muted py-4">No deductions recorded</td></tr>';

  dom.staffDailyAttendanceBody.innerHTML = dailyAttendance.length
    ? dailyAttendance.map((entry) => `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${entry.timeIn || '—'}</td>
        <td>${entry.timeOut || '—'}</td>
        <td><span class="chip ${entry.status === 'Present' ? 'chip-success' : 'chip-danger'}">${entry.status}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="text-center text-muted py-4">No attendance history available</td></tr>';

  dom.staffMonthlyReportsBody.innerHTML = monthlyReports.length
    ? monthlyReports.map((entry) => `
      <tr>
        <td>${entry.month}</td>
        <td class="text-end fw-bold">${entry.count}</td>
      </tr>`).join('')
    : '<tr><td colspan="2" class="text-center text-muted py-4">No report history available</td></tr>';

  dom.staffColleaguesBody.innerHTML = colleagues.length
    ? colleagues.map((entry) => `
      <tr>
        <td>${entry.employee.fullName}</td>
        <td><span class="chip ${entry.present ? 'chip-success' : 'chip-danger'}">${entry.present ? 'Present' : 'Absent'}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="2" class="text-center text-muted py-4">No staff records available</td></tr>';
}

function renderDerivedViews() {
  renderAttendance();
  renderTasks();
  renderReports();
  renderFinance();
  renderPayrollAdjustments();
  renderBudget();
  renderDashboard();
  renderStaffPortal();
}

function configureRoleUi() {
  const staffMode = isStaffSession();
  const adminOnlyViews = ['dashboardView', 'employeesView', 'attendanceView', 'tasksView', 'reportsView', 'financeView', 'payrollView', 'budgetView'];
  const staffViews = ['staffView'];

  document.querySelectorAll('#sidebarNav [data-view]').forEach((button) => {
    const isStaffButton = button.dataset.view === 'staffView';
    button.classList.toggle('d-none', staffMode ? !isStaffButton : isStaffButton);
  });

  adminOnlyViews.forEach((viewId) => {
    const panel = document.getElementById(viewId);
    if (panel) panel.classList.toggle('d-none', staffMode);
  });

  staffViews.forEach((viewId) => {
    const panel = document.getElementById(viewId);
    if (panel) panel.classList.toggle('d-none', !staffMode);
  });

  if (staffMode) {
    dom.pageTitle.textContent = 'Staff Portal';
    setActiveView('staffView');
  }
}

function resetEmployeeForm() {
  dom.employeeForm.reset();
  dom.employeeId.value = '';
  dom.employeeEmail.value = '';
  dom.employeeFormTitle.textContent = 'Add Employee';
  dom.employeeSubmitBtn.textContent = 'Save Employee';
  if (dom.employeeCredentialBox) {
    dom.employeeCredentialBox.classList.add('d-none');
    dom.employeeCredentialBox.textContent = '';
  }
}

function resetTaskForm() {
  dom.taskForm.reset();
  dom.taskId.value = '';
  dom.taskProgress.value = 10;
  dom.taskFormTitle.textContent = 'Assign Task';
}

async function upsertEmployee(event) {
  event.preventDefault();
  const id = dom.employeeId.value || getLatestEmployeeId();
  const existingEmployee = state.db.employees.find((item) => item.id === id) || null;
  const email = dom.employeeEmail.value.trim().toLowerCase() || existingEmployee?.email || buildEmployeeEmail(dom.employeeName.value.trim(), id);
  const credentials = buildEmployeeCredentials({
    id,
    fullName: dom.employeeName.value.trim(),
    email
  });
  const employee = {
    id,
    fullName: dom.employeeName.value.trim(),
    email,
    username: credentials.username,
    position: dom.employeePosition.value.trim(),
    department: dom.employeeDepartment.value.trim(),
    salary: Number(dom.employeeSalary.value),
    active: existingEmployee ? existingEmployee.active !== false : true
  };

  const userRecord = {
    name: employee.fullName,
    username: employee.email,
    email: employee.email,
    role: 'staff',
    employeeId: employee.id,
    active: employee.active,
    passwordHash: await hashPassword(employee.id)
  };

  if (dom.employeeId.value) {
    state.db.employees = state.db.employees.map((item) => item.id === id ? employee : item);
    state.db.users = state.db.users.map((item) => item.employeeId === id ? { ...item, ...userRecord } : item);
    showToast('Employee updated successfully.', 'success');
  } else {
    state.db.employees.push({ ...employee, createdAt: new Date().toISOString() });
    state.db.users.push(userRecord);
    showToast('Employee added successfully.', 'success');
  }

  saveDatabase();
  resetEmployeeForm();
  if (dom.employeeCredentialBox) {
    dom.employeeCredentialBox.classList.remove('d-none');
    dom.employeeCredentialBox.innerHTML = `Login created. Username: <strong>${credentials.username}</strong>. Password: <strong>${credentials.password}</strong>.`;
  }
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

function resetReportForm() {
  if (dom.reportForm) dom.reportForm.reset();
  if (dom.staffReportForm) dom.staffReportForm.reset();
  if (dom.reportId) dom.reportId.value = '';
  if (dom.reportFormTitle) dom.reportFormTitle.textContent = 'Weekly Report Submission';
  if (dom.reportSubmitBtn) dom.reportSubmitBtn.textContent = 'Submit Report';
  if (dom.staffReportSubmitBtn) dom.staffReportSubmitBtn.textContent = 'Submit Report';
}

function submitReport(event) {
  event.preventDefault();
  const isStaffForm = event.currentTarget.id === 'staffReportForm';
  const reportId = isStaffForm ? crypto.randomUUID() : (dom.reportId.value || crypto.randomUUID());
  const employeeId = isStaffForm ? getCurrentEmployeeId() : dom.reportEmployee.value;
  const title = isStaffForm ? dom.staffReportTitle.value.trim() : dom.reportTitle.value.trim();
  const content = isStaffForm ? dom.staffReportContent.value.trim() : dom.reportContent.value.trim();
  const existingIndex = state.db.reports.findIndex((item) => item.id === reportId);
  const existing = existingIndex >= 0 ? state.db.reports[existingIndex] : null;

  if (!employeeId) {
    showToast('No staff profile is linked to this account.', 'danger');
    return;
  }

  const report = {
    id: reportId,
    employeeId,
    title,
    content,
    submittedAt: existing?.submittedAt || new Date().toISOString(),
    updatedAt: existing ? new Date().toISOString() : null,
    updatedBy: state.session?.email || state.session?.name || null
  };

  if (existingIndex >= 0) {
    state.db.reports[existingIndex] = { ...state.db.reports[existingIndex], ...report };
    showToast('Report updated.', 'success');
  } else {
    state.db.reports.push(report);
    showToast('Report submitted.', 'success');
  }

  saveDatabase();
  resetReportForm();
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

function submitStaffAttendance(action) {
  const employee = getCurrentEmployee();
  if (!employee) {
    showToast('No staff profile is linked to this account.', 'danger');
    return;
  }

  if (action === 'check-in' && getAttendanceLockState()) {
    showToast('attendace Locked you are late', 'danger');
    return;
  }

  const today = todayISO(0);
  const now = new Date().toTimeString().slice(0, 5);
  const existingIndex = state.db.attendance.findIndex((item) => item.employeeId === employee.id && item.date === today);

  if (existingIndex >= 0) {
    const existing = state.db.attendance[existingIndex];
    state.db.attendance[existingIndex] = {
      ...existing,
      employeeId: employee.id,
      date: today,
      status: 'Present',
      permission: existing.permission || false,
      timeIn: action === 'check-in' ? (existing.timeIn || now) : existing.timeIn,
      timeOut: action === 'check-out' ? now : existing.timeOut
    };
  } else {
    state.db.attendance.push({
      id: crypto.randomUUID(),
      employeeId: employee.id,
      date: today,
      status: 'Present',
      permission: false,
      timeIn: action === 'check-in' ? now : '',
      timeOut: action === 'check-out' ? now : ''
    });
  }

  saveDatabase();
  showToast(action === 'check-in' ? 'Check-in recorded.' : 'Check-out recorded.', 'success');
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

function toggleAttendanceLock() {
  setAttendanceLockState(!getAttendanceLockState());
  saveDatabase();
  showToast(getAttendanceLockState() ? 'Attendance locked.' : 'Attendance unlocked.', 'success');
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
    dom.employeeEmail.value = employee.email || '';
    dom.employeePosition.value = employee.position;
    dom.employeeDepartment.value = employee.department;
    dom.employeeSalary.value = employee.salary;
    dom.employeeFormTitle.textContent = `Edit ${employee.id}`;
    dom.employeeSubmitBtn.textContent = 'Update Employee';
    setActiveView('employeesView');
  }

  if (action === 'show-employee-credentials') {
    const employee = state.db.employees.find((item) => item.id === id);
    if (!employee) return;
    const linkedUser = state.db.users.find((item) => item.employeeId === employee.id);
    if (!linkedUser) return;
    dom.employeeCredentialBox.classList.remove('d-none');
    dom.employeeCredentialBox.innerHTML = `Username: <strong>${linkedUser.username || '—'}</strong> | Password: <strong>${employee.id}</strong>`;
    return;
  }

  if (action === 'toggle-employee-active') {
    const employee = state.db.employees.find((item) => item.id === id);
    if (!employee) return;
    const nextActive = !isEmployeeActive(employee);
    if (!confirm(nextActive ? 'Reactivate this employee account?' : 'Deactivate this employee account?')) return;

    state.db.employees = state.db.employees.map((item) => (item.id === id ? { ...item, active: nextActive } : item));
    state.db.users = state.db.users.map((item) => (item.employeeId === id ? { ...item, active: nextActive } : item));
    saveDatabase();
    showToast(nextActive ? 'Employee reactivated.' : 'Employee deactivated.', 'success');
    refreshAll();
    return;
  }

  if (action === 'delete-employee') {
    if (!confirm('Delete this employee and related records?')) return;
    state.db.employees = state.db.employees.filter((item) => item.id !== id);
    state.db.attendance = state.db.attendance.filter((item) => item.employeeId !== id);
    state.db.tasks = state.db.tasks.filter((item) => item.employeeId !== id);
    state.db.reports = state.db.reports.filter((item) => item.employeeId !== id);
    state.db.payrollPayments = state.db.payrollPayments.filter((item) => item.employeeId !== id);
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

  if (action === 'edit-report') {
    const report = state.db.reports.find((item) => item.id === id);
    if (!report || !dom.reportForm || !dom.reportId) return;
    dom.reportId.value = report.id;
    dom.reportEmployee.value = report.employeeId;
    dom.reportTitle.value = report.title;
    dom.reportContent.value = report.content;
    if (dom.reportFormTitle) dom.reportFormTitle.textContent = 'Edit Weekly Report';
    if (dom.reportSubmitBtn) dom.reportSubmitBtn.textContent = 'Update Report';
    setActiveView('reportsView');
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

  if (action === 'toggle-payroll-payment') {
    const employeeId = button.dataset.employeeId;
    const periodKey = button.dataset.periodKey || getCurrentPayrollPeriodKey();
    const paid = button.dataset.paid === 'true';
    setPayrollPayment(employeeId, periodKey, !paid);
    saveDatabase();
    showToast(`${getPayrollPeriodLabel(periodKey)} salary ${!paid ? 'marked paid.' : 'marked unpaid.'}`, 'success');
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
  renderStaffPortal();
}

async function handleLogin(event) {
  event.preventDefault();
  const loginValue = dom.email.value.trim().toLowerCase();
  const passwordHash = await hashPassword(dom.password.value);
  const user = state.db.users.find((item) => {
    const emailMatch = String(item.email || '').toLowerCase() === loginValue;
    const usernameMatch = String(item.username || '').toLowerCase() === loginValue;
    return (emailMatch || usernameMatch) && item.passwordHash === passwordHash;
  });
  if (!user) {
    showToast('Invalid credentials.', 'danger');
    return;
  }

  if (user.role === 'staff' && user.active === false) {
    showToast('This staff account has been deactivated.', 'danger');
    return;
  }

  saveSession({ email: user.email, role: user.role, name: user.name, employeeId: user.employeeId || null });
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
  populatePayrollPeriodFilter();
  resetReportForm();
  dom.taskDeadline.value = todayISO(7);
  configureRoleUi();
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
    employeeName: 'employeeName', employeeEmail: 'employeeEmail', employeePosition: 'employeePosition', employeeDepartment: 'employeeDepartment', employeeSalary: 'employeeSalary',
    employeeFormTitle: 'employeeFormTitle', employeeSubmitBtn: 'employeeSubmitBtn', employeeResetBtn: 'employeeResetBtn',
    employeeSearch: 'employeeSearch', employeeTableBody: 'employeeTableBody', attendanceForm: 'attendanceForm', attendanceEmployee: 'attendanceEmployee',
    attendanceDate: 'attendanceDate', attendanceStatus: 'attendanceStatus', attendancePermission: 'attendancePermission', attendanceTimeIn: 'attendanceTimeIn',
    attendanceTimeOut: 'attendanceTimeOut', attendanceSearch: 'attendanceSearch', attendanceTableBody: 'attendanceTableBody', taskForm: 'taskForm',
    taskId: 'taskId', taskEmployee: 'taskEmployee', taskTitle: 'taskTitle', taskDescription: 'taskDescription', taskDeadline: 'taskDeadline',
    taskProgress: 'taskProgress', taskFormTitle: 'taskFormTitle', taskSearch: 'taskSearch', taskTableBody: 'taskTableBody', taskResetBtn: 'taskResetBtn',
    reportForm: 'reportForm', reportFormTitle: 'reportFormTitle', reportSubmitBtn: 'reportSubmitBtn', reportId: 'reportId', reportEmployee: 'reportEmployee', reportTitle: 'reportTitle', reportContent: 'reportContent', reportSearch: 'reportSearch', staffReportForm: 'staffReportForm', staffReportTitle: 'staffReportTitle', staffReportContent: 'staffReportContent', staffReportSubmitBtn: 'staffReportSubmitBtn',
    reportTableBody: 'reportTableBody', incomeForm: 'incomeForm', incomeType: 'incomeType', incomeCategory: 'incomeCategory', incomeAmount: 'incomeAmount',
    incomeDate: 'incomeDate', incomeDescription: 'incomeDescription', incomeTableBody: 'incomeTableBody', revenueMetric: 'revenueMetric', expensesMetric: 'expensesMetric',
    profitMetric: 'profitMetric', financeRangeFilter: 'financeRangeFilter',
    payrollAdjustmentForm: 'payrollAdjustmentForm', payrollAdjustmentId: 'payrollAdjustmentId', payrollAdjustmentFormTitle: 'payrollAdjustmentFormTitle', payrollAdjustmentSubmitBtn: 'payrollAdjustmentSubmitBtn', payrollAdjustmentEmployee: 'payrollAdjustmentEmployee', payrollAdjustmentType: 'payrollAdjustmentType', payrollAdjustmentAmount: 'payrollAdjustmentAmount', payrollAdjustmentDate: 'payrollAdjustmentDate', payrollAdjustmentNotes: 'payrollAdjustmentNotes', payrollAdjustmentResetBtn: 'payrollAdjustmentResetBtn', payrollAdjustmentSearch: 'payrollAdjustmentSearch', payrollAdjustmentTableBody: 'payrollAdjustmentTableBody', payrollLoansMetric: 'payrollLoansMetric', payrollAdvancesMetric: 'payrollAdvancesMetric', payrollBonusesMetric: 'payrollBonusesMetric', payrollNetMetric: 'payrollNetMetric', payrollPeriodFilter: 'payrollPeriodFilter', payrollPeriodLabel: 'payrollPeriodLabel', payrollSummaryTableBody: 'payrollSummaryTableBody', budgetForm: 'budgetForm', salaryBudget: 'salaryBudget',
    operationsBudget: 'operationsBudget', budgetSalaryValue: 'budgetSalaryValue', budgetOperationsValue: 'budgetOperationsValue', budgetSalaryActual: 'budgetSalaryActual',
    budgetOperationsActual: 'budgetOperationsActual', budgetSalaryStatus: 'budgetSalaryStatus', budgetOperationsStatus: 'budgetOperationsStatus', budgetAlerts: 'budgetAlerts',
    staffPortalStatus: 'staffPortalStatus', staffAttendanceSummary: 'staffAttendanceSummary', staffAttendanceDetail: 'staffAttendanceDetail', staffReportsSummary: 'staffReportsSummary', staffReportsDetail: 'staffReportsDetail', staffSalaryValue: 'staffSalaryValue', staffActualSalaryValue: 'staffActualSalaryValue', staffSalaryPeriodLabel: 'staffSalaryPeriodLabel', staffSalaryStatus: 'staffSalaryStatus', staffTasksBody: 'staffTasksBody', staffReportsBody: 'staffReportsBody', staffDeductionsBody: 'staffDeductionsBody', staffDailyAttendanceBody: 'staffDailyAttendanceBody', staffMonthlyReportsBody: 'staffMonthlyReportsBody', staffColleaguesBody: 'staffColleaguesBody', staffCheckInBtn: 'staffCheckInBtn', staffCheckOutBtn: 'staffCheckOutBtn', staffInactiveState: 'staffInactiveState', staffActiveContent: 'staffActiveContent', attendanceLockStatus: 'attendanceLockStatus', attendanceLockBtn: 'attendanceLockBtn', employeeCredentialBox: 'employeeCredentialBox',
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
  if (dom.staffReportForm) dom.staffReportForm.addEventListener('submit', submitReport);
  dom.incomeForm.addEventListener('submit', submitIncome);
  dom.payrollAdjustmentForm.addEventListener('submit', submitPayrollAdjustment);
  dom.payrollAdjustmentResetBtn.addEventListener('click', resetPayrollAdjustmentForm);
  dom.budgetForm.addEventListener('submit', submitBudget);
  dom.financeRangeFilter.addEventListener('change', renderFinance);
  dom.payrollAdjustmentSearch.addEventListener('input', renderPayrollAdjustments);
  if (dom.payrollPeriodFilter) dom.payrollPeriodFilter.addEventListener('change', renderPayrollAdjustments);
  dom.employeeSearch.addEventListener('input', renderEmployees);
  dom.attendanceSearch.addEventListener('input', renderAttendance);
  dom.taskSearch.addEventListener('input', renderTasks);
  dom.reportSearch.addEventListener('input', renderReports);
  if (dom.staffCheckInBtn) dom.staffCheckInBtn.addEventListener('click', () => submitStaffAttendance('check-in'));
  if (dom.staffCheckOutBtn) dom.staffCheckOutBtn.addEventListener('click', () => submitStaffAttendance('check-out'));
  if (dom.attendanceLockBtn) dom.attendanceLockBtn.addEventListener('click', toggleAttendanceLock);
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
  populatePayrollPeriodFilter();

  if (state.session) {
    configureRoleUi();
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