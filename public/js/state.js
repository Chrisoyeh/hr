import { SESSION_KEY } from './config.js';
import { todayISO, buildEmployeeEmail } from './utils.js';

export const defaultSeed = {
  users: [
    { name: 'Chief Executive Officer', username: 'ch4oyeh@gmail.com', email: 'ch4oyeh@gmail.com', role: 'ceo', password: 'Chrisovie1!', active: true },
    { name: 'Financial Officer', username: 'finance.officer@hlts.local', email: 'finance.officer@hlts.local', role: 'finance_officer', password: 'Chrisella1!', active: true },
    { name: 'Operations Manager', username: 'Admin', email: 'admin@hr.local', role: 'admin', password: 'Chrisella1!', active: true },
    { name: 'Academic Supervisor', username: 'supervisor@hlts.local', email: 'supervisor@hlts.local', role: 'supervisor', password: 'Chrisella1!', active: true },
    { name: 'Lead Developer', username: 'developer@hlts.local', email: 'developer@hlts.local', role: 'developer', password: 'Chrisella1!', active: true },
    { name: 'Welfare / HR Specialist', username: 'welfare.hr@hlts.local', email: 'welfare.hr@hlts.local', role: 'welfare_hr', password: 'Chrisella1!', active: true }
  ],
  employees: [],
  schools: [],
  reportsSupervisor: [],
  reportsDeveloper: [],
  reportsWelfare: [],
  staffAppraisalsQueries: [],
  managementIssues: [],
  executiveDirectives: [],
  approvals: [],
  expenseVouchers: [],
  attendance: [],
  tasks: [],
  reports: [],
  income: [],
  financeTransactions: [],
  departmentBudgets: {},
  clientInvoices: [],
  payrollAdjustments: [],
  payrollPayments: [],
  missingReportPenalties: [],
  budget: {
    salary: 0,
    operations: 0
  },
  settings: {
    attendanceLocked: false,
    clearedDemoData: true
  }
};

export const state = {
  db: null,
  session: null,
  charts: {},
  credentialCache: {}
};

export function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveSession(session) {
  state.session = session;
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function normalizeDatabase(database) {
  // Legacy migration for financeTransactions from income
  let legacyTransactions = Array.isArray(database?.financeTransactions) ? [...database.financeTransactions] : [];
  if (legacyTransactions.length === 0 && Array.isArray(database?.income) && database.income.length > 0) {
    legacyTransactions = database.income.map((inc, index) => ({
      id: inc.id || crypto.randomUUID(),
      txnRef: `TXN-${String(inc.date || todayISO(0)).replace(/-/g, '').slice(2, 6)}-${String(index + 1).padStart(3, '0')}`,
      type: inc.type || 'Revenue',
      category: inc.category || 'General',
      department: 'General',
      amount: Number(inc.amount || 0),
      date: inc.date || todayISO(0),
      paymentMethod: 'Bank Transfer',
      status: 'Completed',
      referenceNo: '',
      payeePayer: '',
      description: inc.description || '',
      createdAt: new Date().toISOString()
    }));
  }

  return {
    users: Array.isArray(database?.users) && database.users.length ? database.users : [...defaultSeed.users],
    employees: Array.isArray(database?.employees) ? database.employees : [],
    schools: Array.isArray(database?.schools) ? database.schools : [],
    reportsSupervisor: Array.isArray(database?.reportsSupervisor) ? database.reportsSupervisor : [],
    reportsDeveloper: Array.isArray(database?.reportsDeveloper) ? database.reportsDeveloper : [],
    reportsWelfare: Array.isArray(database?.reportsWelfare) ? database.reportsWelfare : [],
    staffAppraisalsQueries: Array.isArray(database?.staffAppraisalsQueries) ? database.staffAppraisalsQueries : [],
    managementIssues: Array.isArray(database?.managementIssues) ? database.managementIssues : [],
    executiveDirectives: Array.isArray(database?.executiveDirectives) ? database.executiveDirectives : [],
    approvals: Array.isArray(database?.approvals) ? database.approvals : [],
    expenseVouchers: Array.isArray(database?.expenseVouchers) ? database.expenseVouchers : [],
    attendance: Array.isArray(database?.attendance) ? database.attendance : [],
    tasks: Array.isArray(database?.tasks) ? database.tasks : [],
    reports: Array.isArray(database?.reports) ? database.reports : [],
    income: Array.isArray(database?.income) ? database.income : [],
    financeTransactions: legacyTransactions,
    departmentBudgets: database?.departmentBudgets && typeof database.departmentBudgets === 'object' ? database.departmentBudgets : {},
    clientInvoices: Array.isArray(database?.clientInvoices) ? database.clientInvoices : [],
    payrollAdjustments: Array.isArray(database?.payrollAdjustments) ? database.payrollAdjustments : [],
    payrollPayments: Array.isArray(database?.payrollPayments) ? database.payrollPayments : [],
    missingReportPenalties: Array.isArray(database?.missingReportPenalties) ? database.missingReportPenalties : [],
    offices: Array.isArray(database?.offices) ? database.offices : [],
    budget: {
      salary: 0,
      operations: 0,
      ...(database?.budget || {})
    },
    settings: {
      attendanceLocked: false,
      clearedDemoData: true,
      lastWriteTimestamp: Date.now(),
      ...(database?.settings || {})
    }
  };
}

export function getEmployeeName(employeeId) {
  return state.db?.employees?.find((employee) => employee.id === employeeId)?.fullName || 'Unknown Employee';
}

export function getCurrentEmployee() {
  if (!state.session || !state.db?.employees) return null;
  if (state.session.employeeId) {
    const byId = state.db.employees.find((employee) => employee.id === state.session.employeeId);
    if (byId) return byId;
  }
  return state.db.employees.find((employee) => String(employee.email || '').toLowerCase() === String(state.session.email || '').toLowerCase()) || null;
}

export function isEmployeeActive(employee) {
  return employee?.active !== false;
}

export function isStaffSession() {
  return state.session?.role === 'staff';
}

export function getCurrentEmployeeId() {
  return getCurrentEmployee()?.id || state.session?.employeeId || null;
}

export function getLatestEmployeeId() {
  if (!state.db?.employees || !Array.isArray(state.db.employees) || state.db.employees.length === 0) {
    return 'EMP-1001';
  }
  let maxId = 1000;
  for (const emp of state.db.employees) {
    if (!emp || !emp.id) continue;
    const match = String(emp.id).match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num) && num > maxId) {
        maxId = num;
      }
    }
  }
  return `EMP-${String(maxId + 1).padStart(4, '0')}`;
}

export function getTodayAttendance() {
  const today = todayISO(0);
  return (state.db?.attendance || []).filter((entry) => entry.date === today);
}

export function getCurrentEmployeeAttendance() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId || !state.db?.attendance) return [];
  return state.db.attendance.filter((entry) => entry.employeeId === employeeId);
}

export function getCurrentEmployeeTasks() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId || !state.db?.tasks) return [];
  return state.db.tasks.filter((task) => task.employeeId === employeeId);
}

export function getCurrentEmployeeReports() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId || !state.db?.reports) return [];
  return state.db.reports.filter((report) => report.employeeId === employeeId);
}

export function getCurrentEmployeeDailyAttendance() {
  const employeeId = getCurrentEmployeeId();
  if (!employeeId || !state.db?.attendance) return [];
  return [...state.db.attendance]
    .filter((entry) => entry.employeeId === employeeId)
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 7);
}

export function getStaffPresenceToday() {
  const today = todayISO(0);
  if (!state.db?.employees) return [];
  return state.db.employees
    .filter((employee) => isEmployeeActive(employee))
    .filter((employee) => employee.id !== getCurrentEmployeeId())
    .map((employee) => {
      const attendance = (state.db?.attendance || []).find((entry) => entry.employeeId === employee.id && entry.date === today);
      return {
        employee,
        present: attendance?.status === 'Present',
        status: attendance?.status || 'Absent'
      };
    });
}

// ── Payroll Period Helpers ──
export function getCurrentPayrollPeriodKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getPayrollPeriodLabel(periodKey) {
  if (!periodKey) return 'Unknown period';
  const [year, month] = periodKey.split('-').map(Number);
  if (!year || !month) return periodKey;
  return new Date(year, month - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
}

export function getSelectedPayrollPeriodKey() {
  const filter = document.getElementById('payrollPeriodFilter');
  return filter?.value || getCurrentPayrollPeriodKey();
}

export function buildPayrollPeriodOptions() {
  const periodKeys = new Set();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - offset, 1);
    periodKeys.add(getCurrentPayrollPeriodKey(date));
  }
  (state.db?.payrollPayments || []).forEach((entry) => {
    if (entry?.periodKey) periodKeys.add(entry.periodKey);
  });
  (state.db?.employees || []).forEach((employee) => {
    if (employee?.salaryPaidAt) periodKeys.add(new Date(employee.salaryPaidAt).toISOString().slice(0, 7));
  });
  return [...periodKeys].sort().reverse();
}

export function getPayrollPayment(employeeId, periodKey = getCurrentPayrollPeriodKey()) {
  return (state.db?.payrollPayments || []).find((entry) => entry.employeeId === employeeId && entry.periodKey === periodKey) || null;
}

export function setPayrollPayment(employeeId, periodKey, paid) {
  if (!state.db.payrollPayments) state.db.payrollPayments = [];
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

export function getAttendanceLockState() {
  return Boolean(state.db?.settings?.attendanceLocked);
}

export function setAttendanceLockState(locked) {
  if (!state.db.settings) state.db.settings = {};
  state.db.settings.attendanceLocked = Boolean(locked);
}

// ── Finance & Invoice Generators ──
export function generateTransactionRef() {
  const count = (state.db?.financeTransactions?.length || 0) + 1;
  const yearMonth = todayISO(0).slice(2, 7).replace('-', '');
  return `TXN-${yearMonth}-${String(count).padStart(4, '0')}`;
}

export function generateInvoiceNumber() {
  const count = (state.db?.clientInvoices?.length || 0) + 1;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count).padStart(4, '0')}`;
}

// ── Executive & CEO Command Center Helpers ──
export function getPendingApprovalsCount() {
  return (state.db?.approvals || []).filter((appr) => appr.status === 'Pending').length;
}

export function getExecutiveDirectives() {
  return [...(state.db?.executiveDirectives || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function getExecutiveApprovals(filter = 'all') {
  const list = [...(state.db?.approvals || [])].sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
  if (filter === 'pending') return list.filter((a) => a.status === 'Pending');
  if (filter === 'approved') return list.filter((a) => a.status === 'Approved');
  if (filter === 'rejected') return list.filter((a) => a.status === 'Rejected');
  return list;
}

export function saveExecutiveApproval(approvalId, decisionStatus, executiveNotes = '') {
  if (!state.db.approvals) state.db.approvals = [];
  const item = state.db.approvals.find((a) => a.id === approvalId);
  if (item) {
    item.status = decisionStatus;
    item.decidedAt = new Date().toISOString();
    item.decidedBy = state.session?.name || 'Chief Executive Officer';
    item.executiveNotes = executiveNotes;
    if (state.db.settings) state.db.settings.lastWriteTimestamp = Date.now();
  }
  return item;
}

export function submitExecutiveDirective(directiveData) {
  if (!state.db.executiveDirectives) state.db.executiveDirectives = [];
  const directive = {
    id: `DIR-${Date.now().toString().slice(-6)}`,
    title: directiveData.title || 'Untitled Directive',
    department: directiveData.department || 'All Departments',
    targetAudience: directiveData.targetAudience || 'All Staff',
    priority: directiveData.priority || 'High',
    deadline: directiveData.deadline || todayISO(7),
    instructions: directiveData.instructions || '',
    status: 'Active',
    createdBy: state.session?.name || 'Chief Executive Officer',
    createdAt: new Date().toISOString()
  };
  state.db.executiveDirectives.unshift(directive);
  if (state.db.settings) state.db.settings.lastWriteTimestamp = Date.now();
  return directive;
}

export function getSchoolPerformanceSummary() {
  const schools = state.db?.schools || [];
  const supervisorReports = state.db?.reportsSupervisor || [];
  const invoices = state.db?.clientInvoices || [];

  return schools.map((school) => {
    // Filter reports for this school
    const schoolReports = supervisorReports.filter((r) => r.schoolId === school.id || r.schoolName === school.name);
    const latestReport = schoolReports.length > 0 ? schoolReports[schoolReports.length - 1] : null;

    // Pacing calculations
    const syllabusPace = Number(school.syllabusCoveragePace || latestReport?.syllabusCoverage || latestReport?.overallSyllabusPace || 0);
    const expectedPace = Number(school.expectedCurriculumPace || 80);
    const lessonNotesCompliance = Number(latestReport?.lessonNotesCompliance || latestReport?.lessonNoteCompliance || 85);
    const cbtStatus = latestReport?.cbtReadiness || latestReport?.cbtStatus || 'Completed';

    // Financial check
    const schoolInvoices = invoices.filter((inv) => (inv.clientName && school.name && inv.clientName.toLowerCase().includes(school.name.toLowerCase())) || inv.schoolId === school.id);
    const totalBilled = schoolInvoices.reduce((sum, inv) => sum + Number(inv.total || inv.amount || 0), 0);
    const totalPaid = schoolInvoices.filter((inv) => inv.status === 'Paid').reduce((sum, inv) => sum + Number(inv.total || inv.amount || 0), 0);
    const outstanding = totalBilled - totalPaid;

    // Health Determination
    let health = 'Good';
    let healthBadgeClass = 'text-bg-success';
    if (syllabusPace < expectedPace - 15 || lessonNotesCompliance < 70) {
      health = 'Attention Needed';
      healthBadgeClass = 'text-bg-danger';
    } else if (syllabusPace < expectedPace - 5) {
      health = 'Pace Lag';
      healthBadgeClass = 'text-bg-warning';
    }

    return {
      id: school.id,
      name: school.name,
      code: school.code || `SCH-${school.id.slice(0, 4).toUpperCase()}`,
      location: school.location || 'Lagos',
      supervisorName: school.supervisorName || school.assignedSupervisor || 'Unassigned',
      syllabusPace,
      expectedPace,
      lessonNotesCompliance,
      cbtStatus,
      outstandingBalance: outstanding,
      health,
      healthBadgeClass,
      latestReportDate: latestReport?.date || null
    };
  });
}

export function getExpenseVouchers() {
  return [...(state.db?.expenseVouchers || [])];
}

export function submitExpenseVoucher(voucherData) {
  if (!state.db.expenseVouchers) state.db.expenseVouchers = [];
  const voucher = {
    id: `VOUCH-${Date.now().toString().slice(-6)}`,
    applicantName: voucherData.applicantName || state.session?.name || 'Staff Member',
    applicantEmail: voucherData.applicantEmail || state.session?.email || '',
    department: voucherData.department || 'general',
    category: voucherData.category || 'School Supplies',
    amount: Number(voucherData.amount || 0),
    date: voucherData.date || todayISO(0),
    description: voucherData.description || '',
    receiptAttachmentUrl: voucherData.receiptAttachmentUrl || null,
    status: 'Pending Review',
    createdAt: new Date().toISOString()
  };
  state.db.expenseVouchers.unshift(voucher);
  if (state.db.settings) state.db.settings.lastWriteTimestamp = Date.now();
  return voucher;
}

export function processExpenseVoucher(voucherId, decision, notes = '') {
  if (!state.db.expenseVouchers) state.db.expenseVouchers = [];
  const v = state.db.expenseVouchers.find((item) => item.id === voucherId);
  if (v) {
    v.status = decision; // 'Approved', 'Disbursed', 'Rejected'
    v.reviewedAt = new Date().toISOString();
    v.reviewedBy = state.session?.name || 'Financial Officer';
    v.rejectionReason = notes;
    
    // If disbursed, create linked transaction in general ledger
    if (decision === 'Disbursed') {
      if (!state.db.financeTransactions) state.db.financeTransactions = [];
      const txnRef = generateTransactionRef();
      const newTxn = {
        id: crypto.randomUUID(),
        txnRef,
        type: 'Expense',
        category: v.category || 'Operations',
        department: v.department || 'General',
        amount: Number(v.amount || 0),
        date: todayISO(0),
        paymentMethod: 'Bank Transfer',
        status: 'Completed',
        referenceNo: v.id,
        payeePayer: v.applicantName,
        description: `Disbursed expense voucher: ${v.description} (${v.id})`,
        createdAt: new Date().toISOString(),
        createdBy: state.session?.email || 'finance.officer@hlts.local'
      };
      state.db.financeTransactions.push(newTxn);
      v.disbursementTxnRef = txnRef;
    }
    
    if (state.db.settings) state.db.settings.lastWriteTimestamp = Date.now();
  }
  return v;
}



