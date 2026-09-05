import { dom, cacheDom } from './js/modules/dom.js';
import { state, normalizeDatabase, loadSession, saveSession, getPayrollPayment, setPayrollPayment, getPayrollPeriodLabel, getSelectedPayrollPeriodKey, getCurrentPayrollPeriodKey } from './js/state.js';
import { loadDatabase, saveDatabase, startRealtimeListener, purgeHistoricalDataBeforeToday } from './js/services/firestore.js';
import { exportFullSystemJson, exportPayrollCsv, exportAttendanceCsv, exportSupervisorsCsv, exportFinanceLedgerCsv, exportInvoicesCsv } from './js/services/export.js';
import { renderUserAvatars, compressImage, updateAvatarElement, debounce, showToast, todayISO, showAppLoading, updateAppLoading, hideAppLoading } from './js/utils.js';

import { handleLogin, logout, configureRoleUi, switchDemoRole, setupLiveClock } from './js/modules/auth.js';
import { renderDashboard, init3DTilt } from './js/modules/dashboard.js';
import { renderManagementIssues, openManagementIssueModal, saveManagementIssue } from './js/modules/managementIssues.js';
import { renderSupervisorsView, submitSupervisorReport, resetSupervisorReportForm, saveSupervisorDraft, restoreSupervisorDraft, getSupDraftKey, openReportDetailModal } from './js/modules/supervisors.js';
import { renderDevelopersView, submitDeveloperReport, resetDeveloperReportForm, addDevProjectRow } from './js/modules/developers.js';
import { renderWelfareHrView, submitWelfareReport, resetWelfareReportForm, toggleQAStatus } from './js/modules/welfare.js';
import { renderSchoolsView, upsertSchool, resetSchoolForm, deleteSchool } from './js/modules/schools.js';
import { renderEmployees, upsertEmployee, resetEmployeeForm, buildSelectOptions } from './js/modules/employees.js';
import { renderAttendance, upsertAttendance, resetAttendanceForm, submitStaffAttendance, toggleAttendanceLock, handleAttendanceFormQuickSign, isLate, getAttendancePenalty } from './js/modules/attendance.js';
import { renderTasks, upsertTask, resetTaskForm, renderTaskCountdowns, updateCountdownDisplays } from './js/modules/tasks.js';
import { renderPayrollAdjustments, submitPayrollAdjustment, resetPayrollAdjustmentForm, getEmployeeDeductions, getStaffDeductionRows, getPayrollTotals, batchMarkAllPayrollPaid, openStaffPaySlipModal, populatePayrollPeriodFilter, reconcilePayrollWithFinance } from './js/modules/payroll.js';
import { renderFinance, submitIncome, resetIncomeForm, openTransactionDetailModal } from './js/modules/finance.js';
import { renderBudget, submitBudget } from './js/modules/budget.js';
import { renderInvoices, submitInvoice, resetInvoiceForm, settleInvoice, openPrintInvoiceModal } from './js/modules/invoicing.js';
import { renderStaffPortal } from './js/modules/staffPortal.js';

export function setActiveView(viewId) {
  const panel = document.getElementById(viewId);
  if (!panel) return;

  document.querySelectorAll('.view-panel').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('#sidebarNav .nav-link').forEach((el) => el.classList.remove('active'));

  panel.classList.add('active');
  const button = document.querySelector(`#sidebarNav [data-view="${viewId}"]`);
  if (button) button.classList.add('active');

  const titles = {
    dashboardView: 'Executive Dashboard',
    managementIssuesView: 'Management Issues & Urgent Hub',
    supervisorsView: 'Academic Supervisors Office',
    developersView: 'Developers & Web Office',
    welfareHrView: 'Welfare & HR Operations',
    schoolsView: 'Schools & Client Institutions',
    employeesView: 'Employee Management',
    attendanceView: 'Daily Attendance & Time Tracking',
    tasksView: 'Task Assignment & Deadlines',
    financeView: 'Financial Records & General Ledger',
    payrollView: 'Payroll Adjustments & Manager Deductions',
    budgetView: 'Budget Planner & Spending Limits',
    staffView: 'Staff Self-Service Portal'
  };

  if (dom.pageTitle) dom.pageTitle.textContent = titles[viewId] || 'HR Management Suite';
  if (dom.sidebar) dom.sidebar.classList.remove('open');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.classList.remove('show');
}

export function refreshAll() {
  renderEmployees(getEmployeeDeductions);
  renderAttendance();
  renderTasks();
  renderTaskCountdowns();
  renderFinance();
  renderInvoices();
  renderPayrollAdjustments();
  renderBudget(getPayrollTotals);
  renderManagementIssues();
  renderSupervisorsView();
  renderDevelopersView();
  renderWelfareHrView();
  renderSchoolsView();
  renderDashboard();
  renderStaffPortal(getEmployeeDeductions, getStaffDeductionRows);
  
  const currentEmp = (state.db?.employees || []).find(e => 
    (state.session?.employeeId && e.id === state.session.employeeId) || 
    (state.session?.email && (e.email || '').toLowerCase() === String(state.session?.email || '').toLowerCase())
  );
  const currentAvatar = currentEmp?.avatar || state.session?.avatar || null;
  const currentName = state.session?.name || currentEmp?.fullName || 'User';
  renderUserAvatars(currentAvatar, currentName);
  
  requestAnimationFrame(init3DTilt);
}

async function handleTableActions(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;

  if (action === 'edit-employee') {
    const employee = (state.db?.employees || []).find((item) => item.id === id);
    if (!employee) return;
    const user = (state.db?.users || []).find((u) => u.employeeId === employee.id || u.email === employee.email);
    if (dom.employeeOriginalId) dom.employeeOriginalId.value = employee.id;
    if (dom.employeeId) dom.employeeId.value = employee.id;
    if (dom.employeeName) dom.employeeName.value = employee.fullName;
    if (dom.employeeEmail) dom.employeeEmail.value = employee.email || '';
    if (dom.employeeRole) dom.employeeRole.value = employee.role || user?.role || 'staff';
    if (dom.employeeAvatarData) dom.employeeAvatarData.value = employee.avatar || '';
    if (dom.employeeFormAvatarPreview) updateAvatarElement(dom.employeeFormAvatarPreview, employee.fullName, employee.avatar);
    if (dom.employeeSalary) dom.employeeSalary.value = employee.salary;
    if (dom.employeeFormTitle) dom.employeeFormTitle.textContent = `Edit Employee (${employee.id})`;
    if (dom.employeeSubmitBtn) dom.employeeSubmitBtn.textContent = 'Update Employee';
    setActiveView('employeesView');
  }

  if (action === 'show-employee-credentials') {
    const employee = (state.db?.employees || []).find((item) => item.id === id);
    if (!employee) return;
    const linkedUser = (state.db?.users || []).find((item) => item.employeeId === employee.id);
    if (!linkedUser) return;
    if (dom.employeeCredentialBox) {
      dom.employeeCredentialBox.classList.remove('d-none');
      dom.employeeCredentialBox.innerHTML = `Username: <strong>${linkedUser.username || '—'}</strong> | Password: <strong>${employee.id}</strong>`;
    }
    return;
  }

  if (action === 'toggle-employee-active') {
    const employee = (state.db?.employees || []).find((item) => item.id === id);
    if (!employee) return;
    const nextActive = employee.active === false;
    if (!confirm(nextActive ? 'Reactivate this employee account?' : 'Deactivate this employee account?')) return;

    state.db.employees = state.db.employees.map((item) => (item.id === id ? { ...item, active: nextActive } : item));
    state.db.users = state.db.users.map((item) => (item.employeeId === id ? { ...item, active: nextActive } : item));
    await saveDatabase();
    showToast(nextActive ? 'Employee reactivated.' : 'Employee deactivated.', 'success');
    refreshAll();
    return;
  }

  if (action === 'delete-employee') {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    state.db.employees = (state.db?.employees || []).filter((item) => item.id !== id);
    state.db.users = (state.db?.users || []).filter((item) => item.employeeId !== id);
    await saveDatabase();
    showToast('Employee deleted.', 'success');
    refreshAll();
  }

  if (action === 'edit-attendance') {
    const entry = (state.db?.attendance || []).find((item) => item.id === id);
    if (!entry) return;
    if (dom.attendanceId) dom.attendanceId.value = entry.id;
    if (dom.attendanceEmployee) dom.attendanceEmployee.value = entry.employeeId;
    if (dom.attendanceDate) dom.attendanceDate.value = entry.date;
    if (dom.attendanceStatus) dom.attendanceStatus.value = entry.status;
    if (dom.attendancePermission) dom.attendancePermission.value = entry.permission ? 'Yes' : 'No';
    if (dom.attendanceTimeIn) dom.attendanceTimeIn.value = entry.timeIn || '';
    if (dom.attendanceTimeOut) dom.attendanceTimeOut.value = entry.timeOut || '';
    if (dom.attendanceFormTitle) dom.attendanceFormTitle.textContent = 'Edit Attendance';
    if (dom.attendanceSubmitBtn) dom.attendanceSubmitBtn.textContent = 'Update Attendance';
    setActiveView('attendanceView');
  }

  if (action === 'delete-attendance') {
    state.db.attendance = (state.db?.attendance || []).filter((item) => item.id !== id);
    await saveDatabase();
    showToast('Attendance entry removed.', 'success');
    refreshAll();
  }

  if (action === 'edit-task') {
    const task = (state.db?.tasks || []).find((item) => item.id === id);
    if (!task) return;
    if (dom.taskId) dom.taskId.value = task.id;
    if (dom.taskEmployee) dom.taskEmployee.value = task.employeeId;
    if (dom.taskTitle) dom.taskTitle.value = task.title;
    if (dom.taskDescription) dom.taskDescription.value = task.description;
    if (dom.taskDeadline) dom.taskDeadline.value = task.deadline;
    if (dom.taskProgress) dom.taskProgress.value = task.completion;
    if (dom.taskPermission) dom.taskPermission.value = task.permission ? 'Yes' : 'No';
    if (dom.taskFormTitle) dom.taskFormTitle.textContent = 'Edit Task';
    setActiveView('tasksView');
  }

  if (action === 'delete-task') {
    if (!confirm('Are you sure you want to delete this task?')) return;
    state.db.tasks = (state.db?.tasks || []).filter((item) => item.id !== id);
    await saveDatabase();
    showToast('Task deleted.', 'success');
    refreshAll();
  }

  if (action === 'view-txn-detail') {
    openTransactionDetailModal(id);
  }

  if (action === 'edit-income') {
    const txn = (state.db?.financeTransactions || []).find((item) => item.id === id);
    if (!txn) return;
    if (dom.incomeId) dom.incomeId.value = txn.id;
    if (dom.incomeType) dom.incomeType.value = txn.type || 'Expense';
    if (dom.incomeCategory) dom.incomeCategory.value = txn.category || '';
    if (dom.incomeDepartment) dom.incomeDepartment.value = txn.department || 'General';
    if (dom.incomeAmount) dom.incomeAmount.value = txn.amount || 0;
    if (dom.incomeDate) dom.incomeDate.value = txn.date || todayISO(0);
    if (dom.incomePaymentMethod) dom.incomePaymentMethod.value = txn.paymentMethod || 'Bank Transfer';
    if (dom.incomeStatus) dom.incomeStatus.value = txn.status || 'Completed';
    if (dom.incomePayeePayer) dom.incomePayeePayer.value = txn.payeePayer || '';
    if (dom.incomeReferenceNo) dom.incomeReferenceNo.value = txn.referenceNo || '';
    if (dom.incomeDescription) dom.incomeDescription.value = txn.description || '';
    if (dom.incomeFormTitle) dom.incomeFormTitle.textContent = `Edit Transaction ${txn.txnRef || ''}`;
    if (dom.incomeSubmitBtn) dom.incomeSubmitBtn.textContent = 'Update Transaction';
    setActiveView('financeView');
  }

  if (action === 'delete-income') {
    if (!confirm('Delete this finance transaction record?')) return;
    state.db.financeTransactions = (state.db?.financeTransactions || []).filter((item) => item.id !== id);
    state.db.income = (state.db?.income || []).filter((item) => item.id !== id);
    saveDatabase();
    showToast('Finance entry removed.', 'success');
    refreshAll();
  }

  if (action === 'view-invoice') {
    openPrintInvoiceModal(id);
  }

  if (action === 'settle-invoice') {
    settleInvoice(id, refreshAll);
  }

  if (action === 'edit-invoice') {
    const inv = (state.db?.clientInvoices || []).find((item) => item.id === id);
    if (!inv) return;
    if (dom.invoiceId) dom.invoiceId.value = inv.id;
    if (dom.invoiceSchoolSelect) dom.invoiceSchoolSelect.value = inv.schoolId || '';
    if (dom.invoiceAmount) dom.invoiceAmount.value = inv.amount || 0;
    if (dom.invoiceIssueDate) dom.invoiceIssueDate.value = inv.issueDate || todayISO(0);
    if (dom.invoiceDueDate) dom.invoiceDueDate.value = inv.dueDate || '';
    if (dom.invoiceStatus) dom.invoiceStatus.value = inv.status || 'Sent';
    if (dom.invoiceDescription) dom.invoiceDescription.value = inv.description || '';
    if (dom.invoiceFormTitle) dom.invoiceFormTitle.textContent = `Edit Invoice ${inv.invoiceNumber}`;
    if (dom.invoiceSubmitBtn) dom.invoiceSubmitBtn.textContent = 'Update Invoice';
    setActiveView('financeView');
  }

  if (action === 'delete-invoice') {
    if (!confirm('Delete this client invoice?')) return;
    state.db.clientInvoices = (state.db?.clientInvoices || []).filter((item) => item.id !== id);
    saveDatabase();
    showToast('Invoice deleted.', 'success');
    refreshAll();
  }

  if (action === 'view-employee-payslip') {
    openStaffPaySlipModal(button.dataset.employeeId, button.dataset.periodKey);
  }

  if (action === 'edit-payroll-adjustment') {
    const adjustment = (state.db?.payrollAdjustments || []).find((item) => item.id === id);
    if (!adjustment) return;
    if (dom.payrollAdjustmentId) dom.payrollAdjustmentId.value = adjustment.id;
    if (dom.payrollAdjustmentEmployee) dom.payrollAdjustmentEmployee.value = adjustment.employeeId;
    if (dom.payrollAdjustmentType) dom.payrollAdjustmentType.value = adjustment.type;
    if (dom.payrollAdjustmentAmount) dom.payrollAdjustmentAmount.value = adjustment.amount;
    if (dom.payrollAdjustmentDate) dom.payrollAdjustmentDate.value = adjustment.date;
    if (dom.payrollAdjustmentNotes) dom.payrollAdjustmentNotes.value = adjustment.notes || '';
    if (dom.payrollAdjustmentFormTitle) dom.payrollAdjustmentFormTitle.textContent = 'Edit Payroll Adjustment';
    if (dom.payrollAdjustmentSubmitBtn) dom.payrollAdjustmentSubmitBtn.textContent = 'Update Adjustment';
    setActiveView('payrollView');
  }

  if (action === 'delete-payroll-adjustment') {
    if (!confirm('Delete this payroll adjustment?')) return;
    state.db.payrollAdjustments = (state.db?.payrollAdjustments || []).filter((item) => item.id !== id);
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

  if (action === 'manage-issue') {
    openManagementIssueModal(id);
  }

  if (action === 'view-sup-report') {
    openReportDetailModal('supervisor', id);
  }

  if (action === 'view-dev-report') {
    const rep = (state.db?.reportsDeveloper || []).find(r => r.id === id);
    if (!rep) return;
    const modalEl = document.getElementById('reportDetailModal');
    const titleEl = document.getElementById('reportDetailModalTitle');
    const bodyEl = document.getElementById('reportDetailModalBody');
    if (modalEl && titleEl && bodyEl) {
      titleEl.textContent = `Developer Operations Report`;
      bodyEl.innerHTML = `
        <div class="report-detail-section">
          <h5>In-Progress Projects</h5>
          <div class="table-responsive">
            <table class="table table-sm table-dark">
              <thead><tr><th>Project</th><th>Type</th><th>Client</th><th>Status</th><th>Progress</th><th>Issues</th></tr></thead>
              <tbody>
                ${(rep.projects || []).map(p => `
                  <tr>
                    <td>${p.name}</td><td>${p.type}</td><td>${p.client}</td><td>${p.status}</td><td>${p.completionPct}%</td><td>${p.issues || 'None'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="report-detail-section">
          <h5>Work Completed & Maintenance</h5>
          <div class="mb-2"><strong>Completed:</strong> ${rep.workCompleted}</div>
          <div><strong>Maintenance:</strong> [${rep.maintType}] ${rep.maintTarget} - ${rep.maintDetails}</div>
        </div>
        <div class="report-detail-section">
          <h5>Management Support Request</h5>
          <div class="text-warning">${rep.supportRequired || 'No management support required this week.'}</div>
        </div>
      `;
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  }

  if (action === 'view-welfare-report') {
    const rep = (state.db?.reportsWelfare || []).find(r => r.id === id);
    if (!rep) return;
    const modalEl = document.getElementById('reportDetailModal');
    const titleEl = document.getElementById('reportDetailModalTitle');
    const bodyEl = document.getElementById('reportDetailModalBody');
    if (modalEl && titleEl && bodyEl) {
      titleEl.textContent = `Welfare & HR Weekly Report`;
      bodyEl.innerHTML = `
        <div class="report-detail-section">
          <h5>Staff Performance & Conduct Roster</h5>
          <div class="table-responsive">
            <table class="table table-sm table-dark">
              <thead><tr><th>Staff Member</th><th>Performance %</th><th>Conduct Score</th><th>Remarks</th></tr></thead>
              <tbody>
                ${(rep.staffPerformances || []).map(p => `
                  <tr>
                    <td>${p.name}</td><td>${p.performancePct}%</td><td>${p.conductScore}</td><td>${p.conductRemarks || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="report-detail-section">
          <h5>General Welfare Notes</h5>
          <div>${rep.generalNotes || 'None'}</div>
        </div>
      `;
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  }

  if (action === 'toggle-qa-status') {
    toggleQAStatus(id, refreshAll);
  }

  if (action === 'delete-qa') {
    if (!confirm('Are you sure you want to delete this appraisal/query record?')) return;
    state.db.staffAppraisalsQueries = (state.db?.staffAppraisalsQueries || []).filter(q => q.id !== id);
    await saveDatabase();
    showToast('Record deleted.', 'success');
    refreshAll();
  }

  if (action === 'delete-management-issue') {
    if (!confirm('Delete this management issue record?')) return;
    state.db.managementIssues = (state.db?.managementIssues || []).filter(i => i.id !== id);
    await saveDatabase();
    showToast('Management issue deleted.', 'success');
    refreshAll();
  }

  if (action === 'delete-sup-report') {
    if (!confirm('Delete this supervisor academic report?')) return;
    state.db.reportsSupervisor = (state.db?.reportsSupervisor || []).filter(r => r.id !== id);
    await saveDatabase();
    showToast('Supervisor report deleted.', 'success');
    refreshAll();
  }

  if (action === 'delete-dev-report') {
    if (!confirm('Delete this developer operations report?')) return;
    state.db.reportsDeveloper = (state.db?.reportsDeveloper || []).filter(r => r.id !== id);
    await saveDatabase();
    showToast('Developer report deleted.', 'success');
    refreshAll();
  }

  if (action === 'delete-welfare-report') {
    if (!confirm('Delete this welfare weekly report?')) return;
    state.db.reportsWelfare = (state.db?.reportsWelfare || []).filter(r => r.id !== id);
    await saveDatabase();
    showToast('Welfare report deleted.', 'success');
    refreshAll();
  }

  if (action === 'edit-school') {
    const sch = (state.db?.schools || []).find(s => s.id === id);
    if (!sch) return;
    if (dom.schoolId) dom.schoolId.value = sch.id;
    if (dom.schoolName) dom.schoolName.value = sch.name;
    if (dom.schoolCode) dom.schoolCode.value = sch.code || '';
    if (dom.schoolLocation) dom.schoolLocation.value = sch.location || '';
    if (dom.schoolContactPerson) dom.schoolContactPerson.value = sch.contactPerson || '';
    if (dom.schoolContactPhone) dom.schoolContactPhone.value = sch.contactPhone || '';
    if (dom.schoolSupervisor) dom.schoolSupervisor.value = sch.supervisorId || '';
    if (dom.schoolFormTitle) dom.schoolFormTitle.textContent = 'Edit School';
    if (dom.schoolSubmitBtn) dom.schoolSubmitBtn.textContent = 'Update School';
    setActiveView('schoolsView');
  }

  if (action === 'report-school') {
    const sch = (state.db?.schools || []).find(s => s.id === id);
    if (!sch) return;
    setActiveView('supervisorsView');
    if (dom.supReportSchool) {
      dom.supReportSchool.value = sch.id;
      restoreSupervisorDraft(sch.id);
    }
    showToast(`Ready to report for ${sch.name}.`, 'info');
  }

  if (action === 'delete-school') {
    deleteSchool(id, refreshAll);
  }
}

function bindEvents() {
  const onLogin = (e) => handleLogin(e, () => { configureRoleUi(setActiveView); bootApp(); });
  if (dom.loginForm) dom.loginForm.addEventListener('submit', onLogin);
  const loginBtn = document.querySelector('#loginForm button[type="submit"]');
  if (loginBtn) loginBtn.addEventListener('click', onLogin);
  if (dom.logoutBtn) dom.logoutBtn.addEventListener('click', logout);
  
  const backdrop = document.getElementById('sidebarBackdrop');
  if (dom.mobileMenuBtn) {
    dom.mobileMenuBtn.addEventListener('click', () => {
      const isOpen = dom.sidebar?.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('show', isOpen);
    });
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      dom.sidebar?.classList.remove('open');
      backdrop.classList.remove('show');
    });
  }
  if (dom.employeeForm) dom.employeeForm.addEventListener('submit', (e) => upsertEmployee(e, refreshAll));
  if (dom.employeeResetBtn) dom.employeeResetBtn.addEventListener('click', resetEmployeeForm);
  if (dom.attendanceForm) dom.attendanceForm.addEventListener('submit', (e) => upsertAttendance(e, refreshAll));
  if (dom.taskForm) dom.taskForm.addEventListener('submit', (e) => upsertTask(e, refreshAll));
  if (dom.taskResetBtn) dom.taskResetBtn.addEventListener('click', resetTaskForm);
  if (dom.attendanceResetBtn) dom.attendanceResetBtn.addEventListener('click', resetAttendanceForm);
  if (dom.incomeForm) dom.incomeForm.addEventListener('submit', (e) => submitIncome(e, refreshAll));
  if (dom.incomeResetBtn) dom.incomeResetBtn.addEventListener('click', resetIncomeForm);
  if (dom.financeRangeFilter) dom.financeRangeFilter.addEventListener('change', renderFinance);
  if (dom.financeDeptFilter) dom.financeDeptFilter.addEventListener('change', renderFinance);
  if (dom.financeTypeFilter) dom.financeTypeFilter.addEventListener('change', renderFinance);
  if (dom.financeSearch) dom.financeSearch.addEventListener('input', debounce(renderFinance, 150));
  if (dom.exportFinanceCsvBtn) dom.exportFinanceCsvBtn.addEventListener('click', exportFinanceLedgerCsv);

  // Invoicing Event Listeners
  if (dom.invoiceForm) dom.invoiceForm.addEventListener('submit', (e) => submitInvoice(e, refreshAll));
  if (dom.invoiceResetBtn) dom.invoiceResetBtn.addEventListener('click', resetInvoiceForm);
  if (dom.invoiceStatusFilter) dom.invoiceStatusFilter.addEventListener('change', renderInvoices);
  if (dom.invoiceSearch) dom.invoiceSearch.addEventListener('input', debounce(renderInvoices, 150));
  if (dom.exportInvoicesCsvBtn) dom.exportInvoicesCsvBtn.addEventListener('click', exportInvoicesCsv);

  // Payroll Reconciliation Listener
  if (dom.reconcilePayrollBtn) dom.reconcilePayrollBtn.addEventListener('click', () => reconcilePayrollWithFinance(refreshAll));

  if (dom.payrollAdjustmentForm) dom.payrollAdjustmentForm.addEventListener('submit', (e) => submitPayrollAdjustment(e, refreshAll));
  if (dom.payrollAdjustmentResetBtn) dom.payrollAdjustmentResetBtn.addEventListener('click', resetPayrollAdjustmentForm);
  if (dom.budgetForm) dom.budgetForm.addEventListener('submit', (e) => submitBudget(e, refreshAll));
  
  // Debounced search filters
  if (dom.payrollAdjustmentSearch) dom.payrollAdjustmentSearch.addEventListener('input', debounce(renderPayrollAdjustments, 150));
  if (dom.payrollPeriodFilter) dom.payrollPeriodFilter.addEventListener('change', renderPayrollAdjustments);
  if (dom.employeeSearch) dom.employeeSearch.addEventListener('input', debounce(() => renderEmployees(getEmployeeDeductions), 150));
  if (dom.attendanceSearch) dom.attendanceSearch.addEventListener('input', debounce(renderAttendance, 150));
  if (dom.taskSearch) dom.taskSearch.addEventListener('input', debounce(renderTasks, 150));
  if (dom.attendanceDateFilter) dom.attendanceDateFilter.addEventListener('change', renderAttendance);
  if (dom.taskStatusFilter) dom.taskStatusFilter.addEventListener('change', renderTasks);
  if (dom.payrollAdjDateFilter) dom.payrollAdjDateFilter.addEventListener('change', renderPayrollAdjustments);
  if (dom.staffCheckInBtn) dom.staffCheckInBtn.addEventListener('click', () => submitStaffAttendance('check-in', refreshAll));
  if (dom.staffCheckOutBtn) dom.staffCheckOutBtn.addEventListener('click', () => submitStaffAttendance('check-out', refreshAll));
  if (dom.attendanceFormSignInBtn) dom.attendanceFormSignInBtn.addEventListener('click', () => handleAttendanceFormQuickSign('check-in', refreshAll));
  if (dom.attendanceFormSignOutBtn) dom.attendanceFormSignOutBtn.addEventListener('click', () => handleAttendanceFormQuickSign('check-out', refreshAll));
  if (dom.attendanceLockBtn) dom.attendanceLockBtn.addEventListener('click', () => toggleAttendanceLock(refreshAll));

  // Departmental Event Listeners
  if (dom.modalSaveIssueBtn) dom.modalSaveIssueBtn.addEventListener('click', () => saveManagementIssue(refreshAll));
  if (dom.issueStatusFilter) dom.issueStatusFilter.addEventListener('change', renderManagementIssues);
  if (dom.issueDeptFilter) dom.issueDeptFilter.addEventListener('change', renderManagementIssues);

  if (dom.supervisorReportForm) {
    dom.supervisorReportForm.addEventListener('submit', (e) => {
      submitSupervisorReport(e, refreshAll);
      const schId = dom.supReportSchool?.value;
      if (schId) localStorage.removeItem(getSupDraftKey(schId));
    });
    dom.supervisorReportForm.addEventListener('input', debounce(saveSupervisorDraft, 300));
  }
  if (dom.supResetBtn) dom.supResetBtn.addEventListener('click', resetSupervisorReportForm);
  if (dom.supReportSchool) {
    dom.supReportSchool.addEventListener('change', (e) => {
      restoreSupervisorDraft(e.target.value);
    });
  }
  if (dom.supSchoolFilter) dom.supSchoolFilter.addEventListener('change', renderSupervisorsView);
  if (dom.supReportSearch) dom.supReportSearch.addEventListener('input', debounce(renderSupervisorsView, 150));

  if (dom.devReportForm) dom.devReportForm.addEventListener('submit', (e) => submitDeveloperReport(e, refreshAll));
  if (dom.devResetBtn) dom.devResetBtn.addEventListener('click', resetDeveloperReportForm);
  if (dom.devAddProjectBtn) dom.devAddProjectBtn.addEventListener('click', () => addDevProjectRow());
  if (dom.devReportSearch) dom.devReportSearch.addEventListener('input', debounce(renderDevelopersView, 150));

  if (dom.welfareReportForm) dom.welfareReportForm.addEventListener('submit', (e) => submitWelfareReport(e, refreshAll));
  if (dom.welfareResetBtn) dom.welfareResetBtn.addEventListener('click', resetWelfareReportForm);
  if (dom.qaFilter) dom.qaFilter.addEventListener('change', renderWelfareHrView);

  if (dom.schoolForm) dom.schoolForm.addEventListener('submit', (e) => upsertSchool(e, refreshAll));
  if (dom.schoolResetBtn) dom.schoolResetBtn.addEventListener('click', resetSchoolForm);
  if (dom.schoolSearch) dom.schoolSearch.addEventListener('input', debounce(renderSchoolsView, 150));

  // Profile Picture Upload Listeners
  if (dom.employeeAvatarFile) {
    dom.employeeAvatarFile.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image file too large. Please select a photo under 2MB.', 'warning');
        return;
      }
      try {
        const compressed = await compressImage(file);
        if (dom.employeeAvatarData) dom.employeeAvatarData.value = compressed;
        if (dom.employeeFormAvatarPreview) {
          updateAvatarElement(dom.employeeFormAvatarPreview, dom.employeeName?.value || 'Emp', compressed);
        }
        showToast('Profile photo compressed & attached.', 'info');
      } catch (err) {
        console.error(err);
        showToast('Failed to process selected image.', 'danger');
      }
    });
  }

  if (dom.staffAvatarInput) {
    dom.staffAvatarInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const employee = (state.db?.employees || []).find(emp => emp.id === state.session?.employeeId || emp.email === state.session?.email);
      if (!employee) {
        showToast('No active staff profile found.', 'danger');
        return;
      }
      try {
        const compressed = await compressImage(file);
        employee.avatar = compressed;
        const user = (state.db?.users || []).find(u => u.employeeId === employee.id || u.email === employee.email);
        if (user) user.avatar = compressed;
        if (state.session) state.session.avatar = compressed;
        saveSession(state.session);
        saveDatabase();
        if (dom.staffPortalAvatar) updateAvatarElement(dom.staffPortalAvatar, employee.fullName, compressed);
        renderUserAvatars();
        showToast('Profile photo updated successfully.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Failed to update profile photo.', 'danger');
      }
    });
  }

  // Batch Payroll Action Listener
  if (dom.batchPayrollPaidBtn) {
    dom.batchPayrollPaidBtn.addEventListener('click', () => batchMarkAllPayrollPaid(refreshAll));
  }

  // Printable Pay Slip Listener
  if (dom.staffPrintPaySlipBtn) {
    dom.staffPrintPaySlipBtn.addEventListener('click', openStaffPaySlipModal);
  }

  // Data Export Action Listeners
  if (dom.exportFullJsonBtn) dom.exportFullJsonBtn.addEventListener('click', exportFullSystemJson);
  if (dom.exportPayrollCsvBtn) dom.exportPayrollCsvBtn.addEventListener('click', () => exportPayrollCsv(getEmployeeDeductions, getPayrollPayment));
  if (dom.exportAttendanceCsvBtn) dom.exportAttendanceCsvBtn.addEventListener('click', () => exportAttendanceCsv(isLate, getAttendancePenalty));
  if (dom.exportSupervisorsCsvBtn) dom.exportSupervisorsCsvBtn.addEventListener('click', exportSupervisorsCsv);

  if (dom.purgeHistoricalDataBtn) {
    dom.purgeHistoricalDataBtn.addEventListener('click', async () => {
      const isOpsManager = state.session?.role === 'admin' || state.session?.role === 'ops_manager';
      if (!isOpsManager) {
        showToast('Permission denied: Only the Operations Manager can purge historical data.', 'danger');
        return;
      }
      if (!confirm('PERMANENT ACTION: Are you sure you want to delete all historical attendance, task, report, and financial records before today from both Firestore and local database?')) {
        return;
      }
      showAppLoading('Purging historical records before today...', 'Updating Firestore cloud...');
      try {
        state.db = purgeHistoricalDataBeforeToday(state.db);
        await saveDatabase(state.db);
        refreshAll();
        showToast('All records prior to today have been permanently deleted from Firestore and local storage.', 'success');
      } catch (err) {
        console.error('Failed to purge historical data:', err);
        showToast('Error purging data from cloud.', 'danger');
      } finally {
        hideAppLoading(300);
      }
    });
  }

  // Role Switcher Click Handling
  const roleSwitcher = document.getElementById('demoRoleSwitcher');
  if (roleSwitcher) {
    roleSwitcher.addEventListener('click', (e) => {
      const btn = e.target.closest('.role-badge-btn');
      if (btn && btn.dataset.role) {
        switchDemoRole(btn.dataset.role, refreshAll, setActiveView);
      }
    });
  }

  const sidebarNav = document.getElementById('sidebarNav');
  if (sidebarNav) {
    sidebarNav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      setActiveView(button.dataset.view);
    });
  }

  document.body.addEventListener('click', handleTableActions);
}

function bootApp() {
  const authShell = dom.authShell || document.getElementById('authShell');
  const appShell = dom.appShell || document.getElementById('appShell');
  if (authShell) authShell.classList.add('d-none');
  if (appShell) appShell.classList.remove('d-none');
  if (dom.attendanceDate) dom.attendanceDate.value = todayISO(0);
  if (dom.incomeDate) dom.incomeDate.value = todayISO(0);
  if (dom.payrollAdjustmentDate) dom.payrollAdjustmentDate.value = todayISO(0);
  if (dom.payrollAdjustmentType) dom.payrollAdjustmentType.value = 'Deduction';
  if (dom.payrollAdjustmentId) dom.payrollAdjustmentId.value = '';
  if (dom.payrollAdjustmentFormTitle) dom.payrollAdjustmentFormTitle.textContent = 'Payroll Adjustments & Manager Deductions';
  if (dom.payrollAdjustmentSubmitBtn) dom.payrollAdjustmentSubmitBtn.textContent = 'Save Adjustment';
  populatePayrollPeriodFilter();
  if (dom.taskDeadline) dom.taskDeadline.value = todayISO(7);
  configureRoleUi(setActiveView);
  refreshAll();
}

async function init() {
  cacheDom();
  try {
    bindEvents();
    populatePayrollPeriodFilter();
  } catch (evtErr) {
    console.warn('Event binding warning:', evtErr);
  }

  try {
    setupLiveClock(updateCountdownDisplays);
  } catch (clockErr) {
    console.warn('Clock initialization non-critical warning:', clockErr);
  }

  state.session = loadSession();
  if (state.session) {
    showAppLoading('Restoring active session...', 'Connecting to Firebase Firestore...');
  }

  try {
    state.db = await loadDatabase();
  } catch (dbErr) {
    console.error('Failed to load database from cloud, creating local seed:', dbErr);
    state.db = normalizeDatabase({});
  }

  // One-time migrations
  try {
    if (state.db && !state.db.settings?.absentRecordsCleared) {
      state.db.attendance = (state.db?.attendance || []).filter((r) => r.status !== 'Absent');
      if (!state.db.settings) state.db.settings = {};
      state.db.settings.absentRecordsCleared = true;
      saveDatabase();
    }

    if (state.db && !state.db.settings?.weekendRecordsCleared) {
      state.db.attendance = (state.db?.attendance || []).filter((r) => {
        const day = new Date(r.date).getDay();
        return day !== 0 && day !== 6;
      });
      if (!state.db.settings) state.db.settings = {};
      state.db.settings.weekendRecordsCleared = true;
      saveDatabase();
    }
  } catch (migErr) {
    console.warn('Migration non-critical warning:', migErr);
  }

  if (state.session) {
    try {
      updateAppLoading('Loading workspace...', 85, 'Rendering role interface...');
      configureRoleUi(setActiveView);
      bootApp();
    } catch (bootErr) {
      console.error('Boot app error:', bootErr);
    }
    hideAppLoading(300);
  } else {
    if (dom.authShell) dom.authShell.classList.remove('d-none');
    if (dom.appShell) dom.appShell.classList.add('d-none');
    hideAppLoading(0);
  }

  try {
    startRealtimeListener(() => {
      refreshAll();
    });
  } catch (rtErr) {
    console.warn('Realtime listener non-critical warning:', rtErr);
  }
}

init().catch((error) => {
  console.error('Initialization error:', error);
  hideAppLoading(0);
  if (dom.authShell) dom.authShell.classList.remove('d-none');
  if (dom.appShell) dom.appShell.classList.add('d-none');
});