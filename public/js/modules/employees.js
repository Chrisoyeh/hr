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

  const tableBody = document.getElementById('employeeTableBody') || dom.employeeTableBody;
  if (tableBody) {
    tableBody.innerHTML = rows || '<tr><td colspan="6" class="text-center text-muted py-4">No employees found</td></tr>';
  }
  buildSelectOptions();
}

export function buildSelectOptions() {
  const activeEmployees = (state.db?.employees || []).filter((e) => isEmployeeActive(e));
  const options = activeEmployees
    .map((employee) => `<option value="${employee.id}">${employee.fullName}</option>`)
    .join('');

  const attSelect = document.getElementById('attendanceEmployee') || dom.attendanceEmployee;
  const taskSelect = document.getElementById('taskEmployee') || dom.taskEmployee;
  const paySelect = document.getElementById('payrollAdjustmentEmployee') || dom.payrollAdjustmentEmployee;
  if (attSelect) attSelect.innerHTML = options;
  if (taskSelect) taskSelect.innerHTML = options;
  if (paySelect) paySelect.innerHTML = options;
}

export function resetEmployeeForm() {
  const form = document.getElementById('employeeForm') || dom.employeeForm;
  if (form) form.reset();
  const origIdEl = document.getElementById('employeeOriginalId') || dom.employeeOriginalId;
  const idEl = document.getElementById('employeeId') || dom.employeeId;
  const emailEl = document.getElementById('employeeEmail') || dom.employeeEmail;
  const avatarDataEl = document.getElementById('employeeAvatarData') || dom.employeeAvatarData;
  const avatarPreview = document.getElementById('employeeFormAvatarPreview') || dom.employeeFormAvatarPreview;
  const roleEl = document.getElementById('employeeRole') || dom.employeeRole;
  const titleEl = document.getElementById('employeeFormTitle') || dom.employeeFormTitle;
  const submitBtn = document.getElementById('employeeSubmitBtn') || dom.employeeSubmitBtn;
  const credBox = document.getElementById('employeeCredentialBox') || dom.employeeCredentialBox;

  if (origIdEl) origIdEl.value = '';
  if (idEl) idEl.value = getLatestEmployeeId();
  if (emailEl) emailEl.value = '';
  if (avatarDataEl) avatarDataEl.value = '';
  if (avatarPreview) updateAvatarElement(avatarPreview, 'New', null);
  if (roleEl) roleEl.value = 'staff';
  if (titleEl) titleEl.textContent = 'Add Employee';
  if (submitBtn) submitBtn.textContent = 'Save Employee';
  if (credBox) {
    credBox.classList.add('d-none');
    credBox.textContent = '';
  }
}

export async function upsertEmployee(event, refreshAll) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  try {
    const form = document.getElementById('employeeForm') || dom.employeeForm;
    const nameEl = document.getElementById('employeeName') || form?.querySelector('#employeeName') || dom.employeeName;
    const idEl = document.getElementById('employeeId') || form?.querySelector('#employeeId') || dom.employeeId;
    const origIdEl = document.getElementById('employeeOriginalId') || form?.querySelector('#employeeOriginalId') || dom.employeeOriginalId;
    const emailEl = document.getElementById('employeeEmail') || form?.querySelector('#employeeEmail') || dom.employeeEmail;
    const roleEl = document.getElementById('employeeRole') || form?.querySelector('#employeeRole') || dom.employeeRole;
    const salaryEl = document.getElementById('employeeSalary') || form?.querySelector('#employeeSalary') || dom.employeeSalary;
    const avatarDataEl = document.getElementById('employeeAvatarData') || form?.querySelector('#employeeAvatarData') || dom.employeeAvatarData;

    const originalId = (origIdEl?.value || '').trim();
    const id = (idEl?.value || '').trim() || originalId || getLatestEmployeeId();
    const fullName = (nameEl?.value || '').trim();

    if (!fullName) {
      showToast('Please enter the employee full name.', 'warning');
      nameEl?.focus();
      return;
    }

    if (!id) {
      showToast('Employee ID is required.', 'warning');
      idEl?.focus();
      return;
    }

    if (!state.db) state.db = normalizeDatabase({});
    if (!state.db.employees) state.db.employees = [];
    if (!state.db.users) state.db.users = [];

    // Safe check for duplicate ID
    const isDuplicate = state.db.employees.some(item => 
      item && String(item.id || '').trim().toLowerCase() === String(id).trim().toLowerCase() && 
      String(item.id || '').trim() !== originalId
    );
    if (isDuplicate) {
      showToast(`Employee ID "${id}" is already assigned to another staff member.`, 'danger');
      idEl?.focus();
      return;
    }

    const existingEmployee = originalId
      ? state.db.employees.find((item) => String(item.id || '').trim() === originalId)
      : (state.db.employees.find((item) => String(item.id || '').trim().toLowerCase() === String(id).trim().toLowerCase()) || null);

    const emailInput = (emailEl?.value || '').trim().toLowerCase();
    const email = emailInput || existingEmployee?.email || buildEmployeeEmail(fullName, id);
    const role = roleEl?.value || existingEmployee?.role || 'staff';
    const avatar = avatarDataEl?.value || existingEmployee?.avatar || null;
    const salary = Math.max(0, Number(salaryEl?.value || 0));

    const credentials = buildEmployeeCredentials({
      id,
      fullName,
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
      fullName,
      email,
      username: credentials.username,
      position: existingEmployee?.position || roleTitleMap[role] || 'Staff',
      department: existingEmployee?.department || roleDeptMap[role] || 'Operations',
      role,
      avatar,
      salary,
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
      passwordHash: await hashPassword(String(employee.id))
    };

    if (originalId) {
      state.db.employees = state.db.employees.map((item) => String(item.id || '').trim() === originalId ? employee : item);
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
  } catch (err) {
    console.error('Error saving employee:', err);
    showToast(`Failed to save employee: ${err.message || 'Unknown error'}`, 'danger');
  }
}
