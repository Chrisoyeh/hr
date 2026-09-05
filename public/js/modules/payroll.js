import { dom } from './dom.js';
import { state, getCurrentEmployee, getEmployeeName, getPayrollPayment, setPayrollPayment, getCurrentPayrollPeriodKey, getPayrollPeriodLabel, getSelectedPayrollPeriodKey, buildPayrollPeriodOptions } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { todayISO, formatDate, formatCurrency, getInitials, showToast } from '../utils.js';
import { getAttendancePenalty } from './attendance.js';
import { getTaskPenalty } from './tasks.js';

export function getEmployeeDeductions(employeeId, periodKey = getCurrentPayrollPeriodKey()) {
  const employee = (state.db?.employees || []).find((item) => item.id === employeeId);
  const salary = Number(employee?.salary || 0);

  const monthAttendance = (state.db?.attendance || []).filter((entry) => entry.employeeId === employeeId && entry.date.startsWith(periodKey));
  const attendanceDeduction = monthAttendance.reduce((sum, entry) => sum + getAttendancePenalty(entry), 0);

  const monthTasks = (state.db?.tasks || []).filter((task) => task.employeeId === employeeId && String(task.deadline || '').startsWith(periodKey));
  const taskDeduction = monthTasks.reduce((sum, task) => sum + getTaskPenalty(task), 0);

  const adjustments = (state.db?.payrollAdjustments || []).filter((entry) => entry.employeeId === employeeId && String(entry.date || '').startsWith(periodKey));
  const loan = adjustments.filter((entry) => entry.type === 'Loan').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const advance = adjustments.filter((entry) => entry.type === 'Advance').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const bonus = adjustments.filter((entry) => entry.type === 'Bonus').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const managerDeductions = adjustments.filter((entry) => entry.type === 'Deduction').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const previousPeriodKey = getPreviousPayrollPeriodKey(periodKey);
  const previousCarry = previousPeriodKey ? getEmployeeCarryForward(employeeId, previousPeriodKey) : 0;

  const totalDeductions = attendanceDeduction + taskDeduction + managerDeductions;
  const loanAndAdvance = loan + advance;
  const payableBalance = salary + bonus - (totalDeductions + loanAndAdvance + previousCarry);
  const finalSalary = Math.max(0, payableBalance);
  const carryForward = payableBalance < 0 ? Math.abs(payableBalance) : 0;

  return {
    originalSalary: salary,
    attendanceDeduction,
    taskDeduction,
    managerDeductions,
    totalDeductions,
    loan,
    advance,
    loanAndAdvance,
    bonus,
    otherDeductions: totalDeductions,
    carryIn: previousCarry,
    carryForward,
    payableBalance: finalSalary,
    finalSalary
  };
}

export function getPreviousPayrollPeriodKey(periodKey) {
  const [year, month] = periodKey.split('-').map(Number);
  const prevDate = new Date(year, month - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

export function getEmployeeCarryForward(employeeId, periodKey) {
  const employee = (state.db?.employees || []).find((item) => item.id === employeeId);
  const salary = Number(employee?.salary || 0);
  const monthAttendance = (state.db?.attendance || []).filter((entry) => entry.employeeId === employeeId && entry.date.startsWith(periodKey));
  const attendanceDeduction = monthAttendance.reduce((sum, entry) => sum + getAttendancePenalty(entry), 0);
  const monthTasks = (state.db?.tasks || []).filter((task) => task.employeeId === employeeId && String(task.deadline || '').startsWith(periodKey));
  const taskDeduction = monthTasks.reduce((sum, task) => sum + getTaskPenalty(task), 0);
  const adjustments = (state.db?.payrollAdjustments || []).filter((entry) => entry.employeeId === employeeId && String(entry.date || '').startsWith(periodKey));
  const loan = adjustments.filter((entry) => entry.type === 'Loan').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const advance = adjustments.filter((entry) => entry.type === 'Advance').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const bonus = adjustments.filter((entry) => entry.type === 'Bonus').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const managerDeductions = adjustments.filter((entry) => entry.type === 'Deduction').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalDeductions = attendanceDeduction + taskDeduction + managerDeductions;
  const balance = salary + bonus - (totalDeductions + loan + advance);
  return balance < 0 ? Math.abs(balance) : 0;
}

export function getStaffDeductionRows(employeeId) {
  const periodKey = getCurrentPayrollPeriodKey();
  const rows = [];

  const monthAttendance = (state.db?.attendance || []).filter((entry) => entry.employeeId === employeeId && entry.date.startsWith(periodKey));
  monthAttendance.forEach((entry) => {
    const penalty = getAttendancePenalty(entry);
    if (penalty > 0) {
      rows.push({
        type: entry.status === 'Absent' ? 'Absence Penalty' : 'Late Arrival Penalty',
        amount: penalty,
        date: formatDate(entry.date),
        reason: entry.status === 'Absent' ? 'Recorded absent without approved leave' : `Clock-in at ${entry.timeIn || 'late'} (after 7:45 AM cutoff)`,
        badge: 'chip-danger'
      });
    }
  });

  const monthTasks = (state.db?.tasks || []).filter((task) => task.employeeId === employeeId && String(task.deadline || '').startsWith(periodKey));
  monthTasks.forEach((task) => {
    const penalty = getTaskPenalty(task);
    if (penalty > 0) {
      rows.push({
        type: 'Overdue Task Penalty',
        amount: penalty,
        date: formatDate(task.deadline),
        reason: `Task "${task.title}" past deadline with completion at ${task.completion}%`,
        badge: 'chip-danger'
      });
    }
  });

  const adjustments = (state.db?.payrollAdjustments || []).filter((entry) => entry.employeeId === employeeId && String(entry.date || '').startsWith(periodKey));
  adjustments.forEach((entry) => {
    rows.push({
      type: entry.type === 'Deduction' ? 'Manager Salary Deduction' : entry.type,
      amount: Number(entry.amount || 0),
      date: formatDate(entry.date),
      reason: entry.notes || (entry.type === 'Deduction' ? 'Manager disciplinary deduction' : 'Payroll adjustment'),
      badge: entry.type === 'Bonus' ? 'chip-success' : entry.type === 'Deduction' ? 'chip-danger' : 'chip-warning'
    });
  });

  return rows;
}

export function getPayrollAdjustmentTotals() {
  return (state.db?.payrollAdjustments || []).reduce((accumulator, entry) => {
    const amount = Number(entry.amount || 0);
    if (entry.type === 'Bonus') accumulator.bonus += amount;
    if (entry.type === 'Loan') accumulator.loan += amount;
    if (entry.type === 'Advance') accumulator.advance += amount;
    if (entry.type === 'Deduction') accumulator.deduction += amount;
    return accumulator;
  }, { loan: 0, advance: 0, bonus: 0, deduction: 0 });
}

export function getPayrollTotals(periodKey = getSelectedPayrollPeriodKey()) {
  const totals = (state.db?.employees || []).reduce((acc, employee) => {
    const p = getEmployeeDeductions(employee.id, periodKey);
    acc.gross += p.originalSalary;
    acc.net += p.finalSalary;
    acc.deductions += p.totalDeductions;
    acc.loanAndAdvance += p.loanAndAdvance;
    acc.bonus += p.bonus;
    return acc;
  }, { gross: 0, net: 0, deductions: 0, loanAndAdvance: 0, bonus: 0 });

  return {
    ...totals,
    salaryActual: totals.net
  };
}

export function populatePayrollPeriodFilter() {
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

export function renderPayrollAdjustments() {
  const query = dom.payrollAdjustmentSearch ? dom.payrollAdjustmentSearch.value.trim().toLowerCase() : '';
  const dateFilter = dom.payrollAdjDateFilter?.value || '';
  const today = todayISO(0);
  const payrollPeriodKey = getSelectedPayrollPeriodKey();
  const payrollPeriodLabel = getPayrollPeriodLabel(payrollPeriodKey);
  populatePayrollPeriodFilter();

  const rows = [...(state.db?.payrollAdjustments || [])]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .filter((entry) => {
      if (query) {
        return [entry.date, getEmployeeName(entry.employeeId), entry.type, entry.notes]
          .some((field) => String(field).toLowerCase().includes(query));
      }
      return entry.date === (dateFilter || today);
    })
    .map((entry) => {
      const typeBadge = entry.type === 'Deduction' ? '<span class="chip chip-danger">Manager Deduction</span>'
        : entry.type === 'Bonus' ? '<span class="chip chip-success">Bonus</span>'
        : entry.type === 'Loan' ? '<span class="chip chip-warning">Loan</span>'
        : '<span class="chip chip-neutral">Advance</span>';

      return `
        <tr>
          <td>${formatDate(entry.date)}</td>
          <td>${getEmployeeName(entry.employeeId)}</td>
          <td>${typeBadge}</td>
          <td class="text-end fw-bold ${entry.type === 'Deduction' ? 'text-danger' : entry.type === 'Bonus' ? 'text-success' : ''}">${formatCurrency(entry.amount)}</td>
          <td>${entry.notes || '—'}</td>
          <td>
            <button class="btn btn-sm btn-soft me-1" data-action="edit-payroll-adjustment" data-id="${entry.id}">Edit</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-payroll-adjustment" data-id="${entry.id}">Delete</button>
          </td>
        </tr>`;
    }).join('');

  const totals = getPayrollAdjustmentTotals();
  if (dom.payrollAdjustmentTableBody) {
    dom.payrollAdjustmentTableBody.innerHTML = rows || `<tr><td colspan="6" class="text-center text-muted py-4">${query ? 'No payroll adjustments found.' : 'No payroll adjustments for today. Use the date filter or search to view other dates.'}</td></tr>`;
  }
  if (dom.payrollDeductionsMetric) dom.payrollDeductionsMetric.textContent = formatCurrency(totals.deduction);
  if (dom.payrollLoansMetric) dom.payrollLoansMetric.textContent = formatCurrency(totals.loan);
  if (dom.payrollAdvancesMetric) dom.payrollAdvancesMetric.textContent = formatCurrency(totals.advance);
  if (dom.payrollBonusesMetric) dom.payrollBonusesMetric.textContent = formatCurrency(totals.bonus);
  if (dom.payrollNetMetric) dom.payrollNetMetric.textContent = formatCurrency(getPayrollTotals(payrollPeriodKey).net);
  if (dom.payrollPeriodLabel) dom.payrollPeriodLabel.textContent = payrollPeriodLabel;
  if (dom.payrollPeriodFilter && !dom.payrollPeriodFilter.value) dom.payrollPeriodFilter.value = payrollPeriodKey;

  const summaryRows = (state.db?.employees || []).map((employee) => {
    const summary = getEmployeeDeductions(employee.id, payrollPeriodKey);
    const payment = getPayrollPayment(employee.id, payrollPeriodKey);
    return `
      <tr>
        <td>${employee.fullName}</td>
        <td>${payrollPeriodLabel}</td>
        <td class="text-end">${formatCurrency(summary.originalSalary)}</td>
        <td class="text-end">${formatCurrency(summary.bonus)}</td>
        <td class="text-end">${formatCurrency(summary.loanAndAdvance)}</td>
        <td class="text-end">${formatCurrency(summary.otherDeductions)}${summary.carryIn > 0 ? `<div class="small text-muted">+ carry ${formatCurrency(summary.carryIn)}</div>` : ''}</td>
        <td class="text-end fw-bold">${formatCurrency(summary.finalSalary)}</td>
        <td class="text-end">${formatCurrency(summary.carryForward)}</td>
        <td>${payment?.paid ? `<span class="chip chip-success">Paid</span><div class="small text-muted mt-1">${formatDate(payment.paidAt)}</div>` : '<span class="chip chip-danger">Pending</span>'}${summary.carryForward > 0 ? `<div class="small text-muted mt-1">Carry forward: ${formatCurrency(summary.carryForward)}</div>` : ''}</td>
        <td>
          <button class="btn btn-sm ${payment?.paid ? 'btn-soft' : 'btn-primary'}" data-action="toggle-payroll-payment" data-employee-id="${employee.id}" data-period-key="${payrollPeriodKey}" data-paid="${payment?.paid ? 'true' : 'false'}">
            ${payment?.paid ? `Mark ${payrollPeriodLabel} Unpaid` : `Mark ${payrollPeriodLabel} Paid`}
          </button>
        </td>
      </tr>`;
  }).join('');

  if (dom.payrollSummaryTableBody) {
    dom.payrollSummaryTableBody.innerHTML = summaryRows || '<tr><td colspan="10" class="text-center text-muted py-4">No employees found</td></tr>';
  }
}

export function resetPayrollAdjustmentForm() {
  if (dom.payrollAdjustmentForm) dom.payrollAdjustmentForm.reset();
  if (dom.payrollAdjustmentId) dom.payrollAdjustmentId.value = '';
  if (dom.payrollAdjustmentDate) dom.payrollAdjustmentDate.value = todayISO(0);
  if (dom.payrollAdjustmentType) dom.payrollAdjustmentType.value = 'Deduction';
  if (dom.payrollAdjustmentFormTitle) dom.payrollAdjustmentFormTitle.textContent = 'Payroll Adjustments & Manager Deductions';
  if (dom.payrollAdjustmentSubmitBtn) dom.payrollAdjustmentSubmitBtn.textContent = 'Save Adjustment';
}

export function submitPayrollAdjustment(event, refreshAll) {
  event.preventDefault();
  const empId = dom.payrollAdjustmentEmployee?.value;
  if (!empId) {
    showToast('Please create or select an active employee first.', 'warning');
    return;
  }
  const adjustmentId = dom.payrollAdjustmentId.value || crypto.randomUUID();
  const entry = {
    id: adjustmentId,
    employeeId: empId,
    type: dom.payrollAdjustmentType.value,
    amount: Number(dom.payrollAdjustmentAmount.value),
    date: dom.payrollAdjustmentDate.value,
    notes: dom.payrollAdjustmentNotes.value.trim()
  };

  if (!state.db.payrollAdjustments) state.db.payrollAdjustments = [];
  const existingIndex = state.db.payrollAdjustments.findIndex((item) => item.id === adjustmentId);
  if (existingIndex >= 0) {
    state.db.payrollAdjustments[existingIndex] = entry;
    showToast('Payroll adjustment updated.', 'success');
  } else {
    state.db.payrollAdjustments.push(entry);
    showToast('Payroll adjustment saved.', 'success');
  }

  saveDatabase();
  resetPayrollAdjustmentForm();
  if (typeof refreshAll === 'function') refreshAll();
}

export function batchMarkAllPayrollPaid(refreshAll) {
  const periodKey = getSelectedPayrollPeriodKey();
  const periodLabel = getPayrollPeriodLabel(periodKey);
  const activeEmps = (state.db?.employees || []).filter((e) => e.active !== false);
  const unpaid = activeEmps.filter((e) => !getPayrollPayment(e.id, periodKey)?.paid);

  if (unpaid.length === 0) {
    showToast(`All active staff are already marked paid for ${periodLabel}.`, 'info');
    return;
  }

  if (!confirm(`Mark ${unpaid.length} active employee(s) as PAID for ${periodLabel}?`)) return;

  unpaid.forEach((emp) => {
    setPayrollPayment(emp.id, periodKey, true);
  });

  saveDatabase();
  showToast(`Successfully marked ${unpaid.length} staff paid for ${periodLabel}.`, 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export function openStaffPaySlipModal() {
  const employee = getCurrentEmployee();
  if (!employee) {
    showToast('No staff profile found.', 'danger');
    return;
  }

  const periodKey = getCurrentPayrollPeriodKey();
  const periodLabel = getPayrollPeriodLabel(periodKey);
  const payroll = getEmployeeDeductions(employee.id, periodKey);
  const payment = getPayrollPayment(employee.id, periodKey);
  const deductions = getStaffDeductionRows(employee.id);
  const office = (state.db?.offices || []).find((o) => o.id === employee.officeId) || { name: 'Headquarters' };

  const avatarHtml = employee.avatar 
    ? `<img src="${employee.avatar}" style="width:68px;height:68px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.2);">`
    : `<div style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:bold;">${getInitials(employee.fullName)}</div>`;

  const bodyHtml = `
    <div class="payslip-print-sheet">
      <div class="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 pb-3 mb-3">
        <div class="d-flex align-items-center gap-3">
          <img src="logo.jpg" alt="Logo" style="width:48px;height:48px;border-radius:8px;">
          <div>
            <h4 class="mb-0 fw-bold">HLTS LIMITED</h4>
            <div class="small text-muted">Staff Salary Voucher & Statement of Earnings</div>
          </div>
        </div>
        <div class="text-end">
          <div class="badge bg-secondary px-3 py-2 fs-6">${periodLabel}</div>
          <div class="small text-muted mt-1">Generated: ${new Date().toLocaleDateString('en-NG')}</div>
        </div>
      </div>

      <div class="row g-3 mb-4 p-3 rounded bg-dark border border-secondary border-opacity-25 align-items-center">
        <div class="col-auto">
          ${avatarHtml}
        </div>
        <div class="col">
          <h4 class="mb-1 fw-bold text-white">${employee.fullName}</h4>
          <div class="small text-white-50"><strong>Employee ID:</strong> ${employee.id} · <strong>Position:</strong> ${employee.position}</div>
          <div class="small text-white-50"><strong>Department:</strong> ${employee.department} · <strong>Office:</strong> ${office.name}</div>
        </div>
        <div class="col-12 col-md-auto text-md-end">
          <span class="badge ${payment?.paid ? 'bg-success' : 'bg-warning text-dark'} px-3 py-2 fs-6">${payment?.paid ? 'SALARY PAID' : 'PAYMENT PENDING'}</span>
          ${payment?.paidAt ? `<div class="small text-muted mt-1">Disbursed: ${formatDate(payment.paidAt)}</div>` : ''}
        </div>
      </div>

      <div class="table-responsive mb-3">
        <table class="table table-bordered align-middle">
          <thead>
            <tr><th>Description / Earnings</th><th class="text-end" style="width:180px;">Amount (NGN)</th></tr>
          </thead>
          <tbody>
            <tr><td>Basic Contract Salary</td><td class="text-end fw-bold">${formatCurrency(payroll.originalSalary)}</td></tr>
            ${payroll.bonus > 0 ? `<tr><td class="text-success">Performance / Special Bonus</td><td class="text-end text-success fw-bold">+${formatCurrency(payroll.bonus)}</td></tr>` : ''}
          </tbody>
        </table>
      </div>

      <h6 class="fw-bold mb-2 text-white">Itemized Deductions & Manager Adjustments</h6>
      <div class="table-responsive mb-3">
        <table class="table table-bordered align-middle table-sm">
          <thead>
            <tr><th>Type</th><th>Official Reason / Justification</th><th>Date</th><th class="text-end" style="width:180px;">Amount (NGN)</th></tr>
          </thead>
          <tbody>
            ${deductions.length ? deductions.map(d => `
              <tr>
                <td><strong>${d.type}</strong></td>
                <td>${d.reason}</td>
                <td><small>${d.date || '—'}</small></td>
                <td class="text-end fw-bold ${d.type.includes('Bonus') ? 'text-success' : 'text-danger'}">
                  ${d.type.includes('Bonus') ? '+' : '-'}${formatCurrency(d.amount)}
                </td>
              </tr>
            `).join('') : '<tr><td colspan="4" class="text-center text-muted py-2">No deductions applied for this period.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="p-3 rounded bg-dark border border-secondary border-opacity-25 mb-4">
        <div class="d-flex justify-content-between align-items-center mb-1 text-white-50">
          <span>Gross Payable (Base + Bonuses):</span>
          <span class="text-white">${formatCurrency(payroll.originalSalary + payroll.bonus)}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center mb-2 text-white-50">
          <span>Total Deductions & Advances:</span>
          <span class="text-danger">-${formatCurrency(payroll.totalDeductions + payroll.loanAndAdvance)}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center border-top border-secondary border-opacity-25 pt-2 fs-5 fw-bold text-white">
          <span>NET TAKE-HOME SALARY:</span>
          <span class="text-success">${formatCurrency(payroll.payableBalance)}</span>
        </div>
      </div>

      <div class="row text-center pt-4 border-top border-secondary border-opacity-25">
        <div class="col-6">
          <div class="border-bottom border-secondary border-opacity-50 pb-4 mb-2"></div>
          <div class="small fw-semibold text-white-50">Staff Signature</div>
        </div>
        <div class="col-6">
          <div class="border-bottom border-secondary border-opacity-50 pb-4 mb-2"></div>
          <div class="small fw-semibold text-white-50">Operations Manager Authorization</div>
        </div>
      </div>
    </div>
  `;

  if (dom.staffPaySlipModalBody) {
    dom.staffPaySlipModalBody.innerHTML = bodyHtml;
  }

  const modalEl = document.getElementById('staffPaySlipModal');
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}
