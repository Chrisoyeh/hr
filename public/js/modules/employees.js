import { dom } from './dom.js';
import { state, saveSession, isEmployeeActive, getPayrollPayment, getCurrentPayrollPeriodKey, getPayrollPeriodLabel, getLatestEmployeeId } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { formatCurrency, buildEmployeeEmail, buildEmployeeCredentials, hashPassword, getInitials, updateAvatarElement, showToast } from '../utils.js';

export function renderEmployees(getEmployeeDeductions) {
  const query = dom.employeeSearch ? dom.employeeSearch.value.trim().toLowerCase() : '';
  const payrollPeriodKey = getCurrentPayrollPeriodKey();
  const payrollPeriodLabel = getPayrollPeriodLabel(payrollPeriodKey);
  const roleBadgeMap = {
    admin: '<span class="badge text-bg-danger">Ops Manager</span>',
    ops_manager: '<span class="badge text-bg-danger">Ops Manager</span>',
    supervisor: '<span class="badge text-bg-info">Supervisor</span>',
    developer: '<span class="badge text-bg-primary">Developer</span>',
    welfare_hr: '<span class="badge text-bg-warning text-dark">Welfare/HR</span>',
    staff: '<span class="badge text-bg-secondary">Staff</span>'
  };

  const rows = (state.db?.employees || []).filter((employee) => {
    return [employee.id, employee.fullName, employee.email, employee.role]
      .some((field) => String(field || '').toLowerCase().includes(query));
  }).map((employee) => {
    const payroll = typeof getEmployeeDeductions === 'function' ? getEmployeeDeductions(employee.id, payrollPeriodKey) : { finalSalary: employee.salary };
    const payrollPayment = getPayrollPayment(employee.id, payrollPeriodKey);
    const active = isEmployeeActive(employee);
    const user = (state.db?.users || []).find((u) => u.employeeId === employee.id || u.email === employee.email);
    const roleKey = employee.role || user?.role || 'staff';
    const roleBadge = roleBadgeMap[roleKey] || '<span class="badge text-bg-secondary">Staff</span>';
    const avatarImgHtml = employee.avatar
      ? `<img src="${employee.avatar}" class="avatar-img" alt="${employee.fullName}">`
      : `<span>${getInitials(employee.fullName)}</span>`;

    return `
      <tr>
        <td><strong>${employee.id}</strong></td>
        <td>
          <div class="table-user-cell">
            <div class="avatar-circle avatar-sm">${avatarImgHtml}</div>
            <div>
              <div class="fw-semibold">${employee.fullName}</div>
              <small class="text-muted">${payrollPayment?.paid ? `<span class="chip chip-success py-0 px-1" style="font-size:0.7rem;">Paid ${payrollPeriodLabel}</span>` : `<span class="chip chip-danger py-0 px-1" style="font-size:0.7rem;">Pending ${payrollPeriodLabel}</span>`}</small>
            </div>
          </div>
        </td>
        <td>${roleBadge}</td>
        <td>${employee.email || '—'}</td>
        <td class="text-end">${formatCurrency(employee.salary)}</td>
        <td>
          <div class="small mb-1"><span class="chip ${active ? 'chip-success' : 'chip-danger'}">${active ? 'Active' : 'Deactivated'}</span></div>
          <button class="btn btn-sm btn-soft me-1" data-action="edit-employee" data-id="${employee.id}">Edit</button>
          <button class="btn btn-sm ${active ? 'btn-outline-secondary' : 'btn-primary'} me-1" data-action="toggle-employee-active" data-id="${employee.id}">${active ? 'Deactivate' : 'Reactivate'}</button>
          <button class="btn btn-sm btn-outline-secondary me-1" data-action="delete-employee" data-id="${employee.id}">Delete</button>
          <button class="btn btn-sm btn-outline-secondary" data-action="show-employee-credentials" data-id="${employee.id}">Credentials</button>
          <div class="small text-muted mt-1">Net: ${formatCurrency(payroll.finalSalary)}</div>
        </td>
      </tr>`;
  }).join('');

  if (dom.employeeTableBody) {
    dom.employeeTableBody.innerHTML = rows || '<tr><td colspan="6" class="text-center text-muted py-4">No employees found</td></tr>';
  }
  buildSelectOptions();
}

export function buildSelectOptions() {
  const activeEmployees = (state.db?.employees || []).filter((e) => isEmployeeActive(e));
  const options = activeEmployees
    .map((employee) => `<option value="${employee.id}">${employee.fullName}</option>`)
    .join('');

  if (dom.attendanceEmployee) dom.attendanceEmployee.innerHTML = options;
  if (dom.taskEmployee) dom.taskEmployee.innerHTML = options;
  if (dom.payrollAdjustmentEmployee) dom.payrollAdjustmentEmployee.innerHTML = options;
}

export function resetEmployeeForm() {
  if (dom.employeeForm) dom.employeeForm.reset();
  if (dom.employeeOriginalId) dom.employeeOriginalId.value = '';
  if (dom.employeeId) dom.employeeId.value = getLatestEmployeeId();
  if (dom.employeeEmail) dom.employeeEmail.value = '';
  if (dom.employeeAvatarData) dom.employeeAvatarData.value = '';
  if (dom.employeeFormAvatarPreview) {
    updateAvatarElement(dom.employeeFormAvatarPreview, 'New', null);
  }
  if (dom.employeeRole) dom.employeeRole.value = 'staff';
  if (dom.employeeFormTitle) dom.employeeFormTitle.textContent = 'Add Employee';
  if (dom.employeeSubmitBtn) dom.employeeSubmitBtn.textContent = 'Save Employee';
  if (dom.employeeCredentialBox) {
    dom.employeeCredentialBox.classList.add('d-none');
    dom.employeeCredentialBox.textContent = '';
  }
}

export async function upsertEmployee(event, refreshAll) {
  event.preventDefault();
  const originalId = (dom.employeeOriginalId?.value || '').trim();
  const id = (dom.employeeId?.value || '').trim() || originalId || getLatestEmployeeId();

  if (!id) {
    showToast('Employee ID is required.', 'warning');
    return;
  }

  // Check duplicate ID
  const isDuplicate = (state.db?.employees || []).some(item => item.id.toLowerCase() === id.toLowerCase() && item.id !== originalId);
  if (isDuplicate) {
    showToast(`Employee ID "${id}" is already assigned to another staff member.`, 'danger');
    return;
  }

  const existingEmployee = originalId
    ? (state.db?.employees || []).find((item) => item.id === originalId)
    : ((state.db?.employees || []).find((item) => item.id === id) || null);

  const email = dom.employeeEmail.value.trim().toLowerCase() || existingEmployee?.email || buildEmployeeEmail(dom.employeeName.value.trim(), id);
  const role = dom.employeeRole ? dom.employeeRole.value : (existingEmployee?.role || 'staff');
  const avatar = dom.employeeAvatarData?.value || existingEmployee?.avatar || null;
  const credentials = buildEmployeeCredentials({
    id,
    fullName: dom.employeeName.value.trim(),
    email
  });

  const roleDeptMap = {
    admin: 'Executive Command',
    ops_manager: 'Operations Management',
    supervisor: 'Academics & Schools',
    developer: 'Technology & Web',
    welfare_hr: 'Human Resources & Welfare',
    staff: 'Academics'
  };
  const roleTitleMap = {
    admin: 'Operations Manager',
    ops_manager: 'Operations Manager',
    supervisor: 'Academic Supervisor',
    developer: 'Fullstack Developer',
    welfare_hr: 'Welfare & HR Specialist',
    staff: 'Teaching / General Staff'
  };

  const employee = {
    id,
    fullName: dom.employeeName.value.trim(),
    email,
    username: credentials.username,
    position: existingEmployee?.position || roleTitleMap[role] || 'Staff',
    department: existingEmployee?.department || roleDeptMap[role] || 'Operations',
    role,
    avatar,
    salary: Number(dom.employeeSalary.value),
    active: existingEmployee ? existingEmployee.active !== false : true
  };

  const userRecord = {
    name: employee.fullName,
    username: employee.email,
    email: employee.email,
    role,
    avatar,
    employeeId: employee.id,
    active: employee.active,
    passwordHash: await hashPassword(employee.id)
  };

  if (!state.db.employees) state.db.employees = [];
  if (!state.db.users) state.db.users = [];

  if (originalId) {
    state.db.employees = state.db.employees.map((item) => item.id === originalId ? employee : item);
    state.db.users = state.db.users.map((item) => {
      if (item.employeeId === originalId || item.email === (existingEmployee?.email || employee.email)) {
        return { ...item, ...userRecord, employeeId: id };
      }
      return item;
    });

    // Cascade update if ID was modified
    if (originalId !== id) {
      if (state.db.attendance) {
        state.db.attendance = state.db.attendance.map(a => a.employeeId === originalId ? { ...a, employeeId: id } : a);
      }
      if (state.db.tasks) {
        state.db.tasks = state.db.tasks.map(t => ({
          ...t,
          employeeId: t.employeeId === originalId ? id : t.employeeId,
          createdBy: t.createdBy === originalId ? id : t.createdBy
        }));
      }
      if (state.db.payrollAdjustments) {
        state.db.payrollAdjustments = state.db.payrollAdjustments.map(p => p.employeeId === originalId ? { ...p, employeeId: id } : p);
      }
      if (state.db.staffAppraisalsQueries) {
        state.db.staffAppraisalsQueries = state.db.staffAppraisalsQueries.map(q => q.employeeId === originalId ? { ...q, employeeId: id } : q);
      }
      if (state.db.missingReportPenalties) {
        state.db.missingReportPenalties = state.db.missingReportPenalties.map(m => m.employeeId === originalId ? { ...m, employeeId: id } : m);
      }
      if (state.db.schools) {
        state.db.schools = state.db.schools.map(s => s.supervisorId === originalId ? { ...s, supervisorId: id } : s);
      }
      if (state.session?.employeeId === originalId) {
        state.session.employeeId = id;
        saveSession(state.session);
      }
    }

    showToast('Employee updated successfully.', 'success');
  } else {
    state.db.employees.push({ ...employee, createdAt: new Date().toISOString() });
    const existingUserIdx = state.db.users.findIndex(u => u.email === employee.email || u.employeeId === employee.id);
    if (existingUserIdx >= 0) {
      state.db.users[existingUserIdx] = { ...state.db.users[existingUserIdx], ...userRecord };
    } else {
      state.db.users.push(userRecord);
    }
    showToast('Employee added successfully.', 'success');
  }

  await saveDatabase();
  resetEmployeeForm();
  if (dom.employeeCredentialBox) {
    dom.employeeCredentialBox.classList.remove('d-none');
    dom.employeeCredentialBox.innerHTML = `Login created. Username: <strong>${credentials.username}</strong> · Password: <strong>${credentials.password}</strong> · Office Role: <strong>${role}</strong>`;
  }
  if (typeof refreshAll === 'function') refreshAll();
}
