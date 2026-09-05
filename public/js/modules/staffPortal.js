import { dom } from './dom.js';
import { state, getCurrentEmployee, getCurrentEmployeeTasks, getCurrentEmployeeAttendance, getCurrentEmployeeDailyAttendance, getStaffPresenceToday, getPayrollPayment, getCurrentPayrollPeriodKey, getPayrollPeriodLabel } from '../state.js';
import { formatDate, formatCurrency, updateAvatarElement, getInitials } from '../utils.js';
import { isTaskOverdue, renderStaffTaskCountdowns } from './tasks.js';
import { getTodayAttendanceForEmployee } from './attendance.js';

export function renderStaffPortal(getEmployeeDeductions, getStaffDeductionRows) {
  const employee = getCurrentEmployee();
  const payrollPeriodKey = getCurrentPayrollPeriodKey();
  const payrollPeriodLabel = getPayrollPeriodLabel(payrollPeriodKey);

  if (!employee) {
    if (dom.staffPortalStatus) dom.staffPortalStatus.textContent = 'No staff profile found';
    if (dom.staffAttendanceSummary) dom.staffAttendanceSummary.textContent = '—';
    if (dom.staffSalaryTopMetric) dom.staffSalaryTopMetric.textContent = 'NGN 0';
    if (dom.staffSalaryValue) dom.staffSalaryValue.textContent = 'NGN 0';
    if (dom.staffActualSalaryValue) dom.staffActualSalaryValue.textContent = 'NGN 0';
    if (dom.staffSalaryStatus) dom.staffSalaryStatus.textContent = 'Pending';
    return;
  }

  const isDeactivated = employee.active === false;
  if (dom.staffInactiveState) dom.staffInactiveState.classList.toggle('d-none', !isDeactivated);
  if (dom.staffActiveContent) dom.staffActiveContent.classList.toggle('d-none', isDeactivated);

  if (isDeactivated) {
    if (dom.staffCheckInBtn) dom.staffCheckInBtn.disabled = true;
    if (dom.staffCheckOutBtn) dom.staffCheckOutBtn.disabled = true;
    if (dom.staffPortalStatus) dom.staffPortalStatus.textContent = 'Access Suspended';
    if (dom.staffSalaryStatus) {
      dom.staffSalaryStatus.textContent = 'Suspended';
      dom.staffSalaryStatus.className = 'badge rounded-pill text-bg-secondary px-3 py-2';
    }
    return;
  }

  const todayRecord = getTodayAttendanceForEmployee(employee.id);
  const isAbsentToday = todayRecord?.status === 'Absent';

  // Disable / enable attendance buttons based on today's status
  if (dom.staffCheckInBtn) {
    dom.staffCheckInBtn.disabled = isAbsentToday;
    dom.staffCheckInBtn.title = isAbsentToday ? 'You are recorded as absent today' : '';
  }
  if (dom.staffCheckOutBtn) {
    dom.staffCheckOutBtn.disabled = isAbsentToday;
    dom.staffCheckOutBtn.title = isAbsentToday ? 'You are recorded as absent today' : '';
  }

  const payroll = typeof getEmployeeDeductions === 'function' ? getEmployeeDeductions(employee.id, payrollPeriodKey) : { finalSalary: employee.salary, payableBalance: employee.salary, originalSalary: employee.salary, carryForward: 0 };
  const payrollPayment = getPayrollPayment(employee.id, payrollPeriodKey);
  const tasks = getCurrentEmployeeTasks();
  const attendance = getCurrentEmployeeAttendance();
  const dailyAttendance = getCurrentEmployeeDailyAttendance();
  const colleagues = getStaffPresenceToday();
  const latestAttendance = attendance.slice().sort((left, right) => new Date(right.date) - new Date(left.date))[0] || null;

  if (dom.staffProfileName) dom.staffProfileName.textContent = employee.fullName;
  if (dom.staffProfileBadge) dom.staffProfileBadge.textContent = employee.role === 'admin' ? 'Operations Manager' : (employee.role || 'Staff');
  if (dom.staffProfileSubtitle) {
    dom.staffProfileSubtitle.textContent = `${employee.id} • ${employee.department} • ${employee.position || 'Staff'}`;
  }
  if (dom.staffPortalAvatar) {
    updateAvatarElement(dom.staffPortalAvatar, employee.fullName, employee.avatar);
  }

  if (dom.staffPortalStatus) dom.staffPortalStatus.textContent = `${employee.fullName} · ${employee.position} · ${employee.department}`;
  if (dom.staffAttendanceSummary) dom.staffAttendanceSummary.textContent = latestAttendance ? `${latestAttendance.status} (${formatDate(latestAttendance.date)})` : 'No logs';
  if (dom.staffSalaryTopMetric) dom.staffSalaryTopMetric.textContent = formatCurrency(payroll.payableBalance);

  if (dom.staffAttendanceDetail) {
    if (isAbsentToday) {
      dom.staffAttendanceDetail.textContent = 'You have been recorded as absent today by an administrator. An ₦8,000 deduction has been applied. Sign-in is not available.';
    } else {
      dom.staffAttendanceDetail.textContent = latestAttendance
        ? `Last attendance: ${formatDate(latestAttendance.date)} (${latestAttendance.status}${latestAttendance.timeIn ? `, in ${latestAttendance.timeIn}` : ''}${latestAttendance.timeOut ? `, out ${latestAttendance.timeOut}` : ''})`
        : 'No attendance record has been logged yet.';
    }
  }

  if (dom.staffSalaryValue) dom.staffSalaryValue.textContent = formatCurrency(payroll.payableBalance);
  if (dom.staffActualSalaryValue) dom.staffActualSalaryValue.textContent = formatCurrency(payroll.originalSalary);
  if (dom.staffSalaryPeriodLabel) dom.staffSalaryPeriodLabel.textContent = payrollPeriodLabel;
  if (dom.staffSalaryStatus) {
    dom.staffSalaryStatus.textContent = payrollPayment?.paid
      ? `Paid for ${payrollPeriodLabel}${payrollPayment.paidAt ? ` on ${formatDate(payrollPayment.paidAt)}` : ''}`
      : `Pending for ${payrollPeriodLabel}`;
    dom.staffSalaryStatus.className = `badge rounded-pill px-3 py-2 ${payrollPayment?.paid ? 'text-bg-success' : 'text-bg-danger'}`;
    if (payroll.carryForward > 0 && !payrollPayment?.paid) {
      dom.staffSalaryStatus.textContent += ` · carry forward ${formatCurrency(payroll.carryForward)}`;
    }
  }

  if (dom.staffTasksBody) {
    dom.staffTasksBody.innerHTML = tasks.length
      ? tasks.map((task) => `
        <tr>
          <td>
            <div class="fw-semibold">${task.title}</div>
            <div class="small text-muted">${task.description || '—'}</div>
          </td>
          <td>${formatDate(task.deadline)}</td>
          <td class="text-end"><span class="chip ${Number(task.completion) === 100 ? 'chip-success' : 'chip-warning'}">${Number(task.completion)}%</span></td>
          <td>${Number(task.completion) === 100 ? '<span class="chip chip-success">Complete</span>' : isTaskOverdue(task) ? '<span class="chip chip-danger">Overdue</span>' : '<span class="chip chip-warning">In progress</span>'}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="text-center text-muted py-4">No tasks assigned</td></tr>';
  }

  if (dom.staffDeductionsBody) {
    const staffDeductionRows = typeof getStaffDeductionRows === 'function' ? getStaffDeductionRows(employee.id) : [];
    dom.staffDeductionsBody.innerHTML = staffDeductionRows.length
      ? staffDeductionRows.map((item) => `
        <tr>
          <td><span class="chip ${item.badge || 'chip-danger'}">${item.type}</span></td>
          <td>
            <div class="fw-semibold text-white">${item.reason}</div>
          </td>
          <td><small class="text-muted">${item.date || '—'}</small></td>
          <td class="text-end fw-bold ${item.type.includes('Bonus') ? 'text-success' : 'text-danger'}">
            ${item.type.includes('Bonus') ? '+' : '-'}${formatCurrency(item.amount)}
          </td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="text-center text-muted py-4">No deductions or adjustments recorded for this period.</td></tr>';
  }

  if (dom.staffDailyAttendanceBody) {
    dom.staffDailyAttendanceBody.innerHTML = dailyAttendance.length
      ? dailyAttendance.map((entry) => `
        <tr>
          <td>${formatDate(entry.date)}</td>
          <td>${entry.timeIn || '—'}</td>
          <td>${entry.timeOut || '—'}</td>
          <td><span class="chip ${entry.status === 'Present' ? 'chip-success' : 'chip-danger'}">${entry.status}</span></td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="text-center text-muted py-4">No attendance history available</td></tr>';
  }

  if (dom.staffColleaguesBody) {
    dom.staffColleaguesBody.innerHTML = colleagues.length
      ? colleagues.map((entry) => {
        const colAvatar = entry.employee.avatar
          ? `<img src="${entry.employee.avatar}" class="avatar-img" alt="${entry.employee.fullName}">`
          : `<span>${getInitials(entry.employee.fullName)}</span>`;
        return `
        <tr>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="avatar-circle avatar-sm">${colAvatar}</div>
              <span class="fw-semibold">${entry.employee.fullName}</span>
            </div>
          </td>
          <td><small class="text-muted">${entry.employee.position || 'Staff'}</small></td>
          <td><span class="chip ${entry.present ? 'chip-success' : 'chip-danger'}">${entry.present ? 'Present' : 'Absent'}</span></td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="3" class="text-center text-muted py-4">No staff records available</td></tr>';
  }

  renderStaffTaskCountdowns();
}
