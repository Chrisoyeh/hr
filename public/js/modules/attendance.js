import { dom } from './dom.js';
import { LATE_CUTOFF, CLOSING_TIME } from '../config.js';
import { state, getCurrentEmployee, getEmployeeName, getAttendanceLockState, setAttendanceLockState } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { todayISO, formatDate, formatCurrency, timeToMinutes, showToast } from '../utils.js';

export function isLate(entry) {
  if (!entry || entry.status !== 'Present' || !entry.timeIn) return false;
  const timeInMinutes = timeToMinutes(entry.timeIn);
  const cutoffMinutes = timeToMinutes(LATE_CUTOFF);
  return timeInMinutes !== null && cutoffMinutes !== null && timeInMinutes > cutoffMinutes && !entry.permission;
}

export function getAttendancePenalty(entry) {
  if (!entry) return 0;
  if (entry.status === 'Absent' && !entry.permission) return 8000;
  if (isLate(entry)) return 4000;
  return 0;
}

export function getTodayAttendanceForEmployee(employeeId) {
  const today = todayISO(0);
  return (state.db?.attendance || []).find((entry) => entry.employeeId === employeeId && entry.date === today) || null;
}

export function renderAttendance() {
  const currentRole = state.session?.role || 'admin';
  const isOpsManager = currentRole === 'admin' || currentRole === 'ops_manager';
  const isWelfare = currentRole === 'welfare_hr';
  const isSupervisor = currentRole === 'supervisor';

  // 1. Time In & Time Out vs Quick Sign In/Out buttons
  if (dom.attendanceTimeRow && dom.attendanceQuickSignRow) {
    if (isOpsManager) {
      dom.attendanceTimeRow.classList.remove('d-none');
      dom.attendanceQuickSignRow.classList.add('d-none');
      if (dom.attendanceLockControlGroup) dom.attendanceLockControlGroup.classList.remove('d-none');
    } else {
      // Supervisor and Welfare get quick Sign-in and Sign-out action buttons instead of manual time inputs
      dom.attendanceTimeRow.classList.add('d-none');
      dom.attendanceQuickSignRow.classList.remove('d-none');
      if (dom.attendanceLockControlGroup) dom.attendanceLockControlGroup.classList.add('d-none');
    }
  }

  // 2. Permission Dropdown (Only for Operations Manager and Welfare / HR)
  if (dom.attendancePermissionCol && dom.attendanceStatusCol) {
    if (isOpsManager || isWelfare) {
      dom.attendancePermissionCol.classList.remove('d-none');
      dom.attendanceStatusCol.className = 'col-6';
    } else {
      // Supervisor does not have permission feature
      dom.attendancePermissionCol.classList.add('d-none');
      dom.attendanceStatusCol.className = 'col-12';
      if (dom.attendancePermission) dom.attendancePermission.value = 'No';
    }
  }

  // 3. Save Attendance & Reset Buttons (Removed for Supervisor interface; visible for Ops Manager and Welfare)
  if (dom.attendanceSaveResetRow) {
    if (isSupervisor) {
      dom.attendanceSaveResetRow.classList.add('d-none');
    } else {
      dom.attendanceSaveResetRow.classList.remove('d-none');
    }
  }

  // 4. Attendance Log Table Visibility (Hidden for Supervisor, visible for Ops Manager and Welfare)
  if (dom.attendanceTableCol && dom.attendanceFormCol) {
    if (isSupervisor) {
      dom.attendanceTableCol.classList.add('d-none');
      dom.attendanceFormCol.className = 'col-12 col-md-8 col-xl-6 mx-auto';
    } else {
      dom.attendanceTableCol.classList.remove('d-none');
      dom.attendanceFormCol.className = 'col-12 col-xl-4';
    }
  }

  const query = dom.attendanceSearch ? dom.attendanceSearch.value.trim().toLowerCase() : '';
  const dateFilter = dom.attendanceDateFilter?.value || '';
  const today = todayISO(0);

  const rows = [...(state.db?.attendance || [])]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .filter((entry) => {
      if (query) {
        return [entry.date, getEmployeeName(entry.employeeId), entry.status, entry.timeIn, entry.timeOut]
          .some((field) => String(field).toLowerCase().includes(query));
      }
      return entry.date === (dateFilter || today);
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
          <td>${entry.timeOut || '—'}</td>
          <td>${late ? '<span class="chip chip-warning">Late</span>' : '<span class="chip chip-neutral">On time</span>'}</td>
          <td>${entry.permission ? '<span class="chip chip-success">Granted</span>' : '<span class="chip chip-neutral">No</span>'}</td>
          <td class="text-end fw-bold">${formatCurrency(penalty)}</td>
          <td>
            <button class="btn btn-sm btn-soft me-1" data-action="edit-attendance" data-id="${entry.id}">Edit</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-attendance" data-id="${entry.id}">Remove</button>
          </td>
        </tr>`;
    }).join('');

  if (dom.attendanceTableBody) {
    dom.attendanceTableBody.innerHTML = rows || `<tr><td colspan="9" class="text-center text-muted py-4">${query ? 'No attendance logs found.' : 'No attendance records for today. Use the date filter or search to view other dates.'}</td></tr>`;
  }
  if (dom.adminAttendanceLockStatus) {
    dom.adminAttendanceLockStatus.textContent = getAttendanceLockState() ? 'Locked' : 'Open';
    dom.adminAttendanceLockStatus.className = `badge rounded-pill ${getAttendanceLockState() ? 'text-bg-danger' : 'text-bg-success'} px-3 py-2`;
  }
  if (dom.attendanceLockBtn) {
    dom.attendanceLockBtn.textContent = getAttendanceLockState() ? 'Unlock Attendance' : 'Lock Attendance';
  }
}

export function resetAttendanceForm() {
  if (dom.attendanceForm) dom.attendanceForm.reset();
  if (dom.attendanceId) dom.attendanceId.value = '';
  if (dom.attendanceDate) dom.attendanceDate.value = todayISO(0);
  if (dom.attendanceStatus) dom.attendanceStatus.value = 'Present';
  if (dom.attendancePermission) dom.attendancePermission.value = 'No';
  if (dom.attendanceFormTitle) dom.attendanceFormTitle.textContent = 'Log Attendance';
  if (dom.attendanceSubmitBtn) dom.attendanceSubmitBtn.textContent = 'Save Attendance';
}

export async function handleAttendanceFormQuickSign(action, refreshAll) {
  const currentRole = state.session?.role || 'admin';
  const isOpsManager = currentRole === 'admin' || currentRole === 'ops_manager';
  const isWelfare = currentRole === 'welfare_hr';

  const empId = dom.attendanceEmployee?.value || getCurrentEmployee()?.id;
  if (!empId) {
    showToast('Please select an employee first.', 'warning');
    return;
  }
  const employee = (state.db?.employees || []).find(e => e.id === empId);
  const employeeName = employee?.fullName || getEmployeeName(empId);

  const today = dom.attendanceDate?.value || todayISO(0);
  const now = new Date().toTimeString().slice(0, 5);
  if (!state.db.attendance) state.db.attendance = [];

  const existingIndex = state.db.attendance.findIndex((item) => item.employeeId === empId && item.date === today);

  if (action === 'check-in') {
    if (getAttendanceLockState() && today === todayISO(0)) {
      showToast('Attendance is currently locked by the Operations Manager.', 'danger');
      return;
    }
  }

  // Permission can only be granted by Ops Manager and Welfare
  const canGrantPermission = isOpsManager || isWelfare;
  const permissionVal = (canGrantPermission && dom.attendancePermission) ? (dom.attendancePermission.value === 'Yes') : false;

  if (existingIndex >= 0) {
    const existing = state.db.attendance[existingIndex];
    state.db.attendance[existingIndex] = {
      ...existing,
      employeeId: empId,
      date: today,
      status: 'Present',
      permission: permissionVal || existing.permission || false,
      timeIn: action === 'check-in' ? (existing.timeIn || now) : existing.timeIn,
      timeOut: action === 'check-out' ? now : existing.timeOut
    };
  } else {
    state.db.attendance.push({
      id: crypto.randomUUID(),
      employeeId: empId,
      date: today,
      status: 'Present',
      permission: permissionVal,
      timeIn: action === 'check-in' ? now : '',
      timeOut: action === 'check-out' ? now : ''
    });
  }

  await saveDatabase();
  resetAttendanceForm();
  showToast(`${action === 'check-in' ? 'Sign-in' : 'Sign-out'} recorded for ${employeeName} at ${now}.`, 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export async function upsertAttendance(event, refreshAll) {
  event.preventDefault();
  const currentRole = state.session?.role || 'admin';
  const isOpsManager = currentRole === 'admin' || currentRole === 'ops_manager';
  const isWelfare = currentRole === 'welfare_hr';

  const empId = dom.attendanceEmployee?.value;
  if (!empId) {
    showToast('Please create or select an active employee first.', 'warning');
    return;
  }
  const editId = dom.attendanceId?.value;
  const now = new Date().toTimeString().slice(0, 5);

  const canGrantPermission = isOpsManager || isWelfare;
  const permission = canGrantPermission && dom.attendancePermission ? (dom.attendancePermission.value === 'Yes') : false;

  let timeIn = isOpsManager ? (dom.attendanceTimeIn?.value || '') : '';
  let timeOut = isOpsManager ? (dom.attendanceTimeOut?.value || '') : '';

  if (!state.db.attendance) state.db.attendance = [];

  if (editId) {
    const index = state.db.attendance.findIndex((item) => item.id === editId);
    if (index >= 0) {
      const existing = state.db.attendance[index];
      state.db.attendance[index] = {
        ...existing,
        employeeId: empId,
        date: dom.attendanceDate.value,
        status: dom.attendanceStatus.value,
        permission: canGrantPermission ? permission : existing.permission,
        timeIn: isOpsManager ? timeIn : (existing.timeIn || (dom.attendanceStatus.value === 'Present' ? now : '')),
        timeOut: isOpsManager ? timeOut : existing.timeOut
      };
      showToast('Attendance updated.', 'success');
    }
  } else {
    const existingIndex = state.db.attendance.findIndex((item) => item.employeeId === empId && item.date === dom.attendanceDate.value);
    if (existingIndex >= 0) {
      const existing = state.db.attendance[existingIndex];
      state.db.attendance[existingIndex] = {
        ...existing,
        employeeId: empId,
        date: dom.attendanceDate.value,
        status: dom.attendanceStatus.value,
        permission: canGrantPermission ? permission : existing.permission,
        timeIn: isOpsManager ? timeIn : (existing.timeIn || (dom.attendanceStatus.value === 'Present' ? now : '')),
        timeOut: isOpsManager ? timeOut : existing.timeOut
      };
      showToast('Attendance updated.', 'success');
    } else {
      state.db.attendance.push({
        id: crypto.randomUUID(),
        employeeId: empId,
        date: dom.attendanceDate.value,
        status: dom.attendanceStatus.value,
        permission,
        timeIn: isOpsManager ? timeIn : (dom.attendanceStatus.value === 'Present' ? now : ''),
        timeOut: isOpsManager ? timeOut : ''
      });
      showToast('Attendance logged.', 'success');
    }
  }

  await saveDatabase();
  resetAttendanceForm();
  if (typeof refreshAll === 'function') refreshAll();
}

export async function submitStaffAttendance(action, refreshAll) {
  const employee = getCurrentEmployee();
  if (!employee) {
    showToast('No staff profile is linked to this account.', 'danger');
    return;
  }

  const todayRecord = getTodayAttendanceForEmployee(employee.id);
  if (todayRecord && todayRecord.status === 'Absent') {
    showToast('You are recorded as absent today. Sign-in and sign-out are not available.', 'danger');
    return;
  }

  if (action === 'check-in') {
    if (getAttendanceLockState()) {
      showToast('Attendance locked. You are late.', 'danger');
      return;
    }
  }

  const today = todayISO(0);
  const now = new Date().toTimeString().slice(0, 5);
  if (!state.db.attendance) state.db.attendance = [];
  const existingIndex = state.db.attendance.findIndex((item) => item.employeeId === employee.id && item.date === today);

  const telemetry = state.lastCheckInLocation || {};
  delete state.lastCheckInLocation;

  if (existingIndex >= 0) {
    const existing = state.db.attendance[existingIndex];
    state.db.attendance[existingIndex] = {
      ...existing,
      employeeId: employee.id,
      date: today,
      status: 'Present',
      permission: existing.permission || false,
      timeIn: action === 'check-in' ? (existing.timeIn || now) : existing.timeIn,
      timeOut: action === 'check-out' ? now : existing.timeOut,
      latitude: action === 'check-in' ? (telemetry.latitude || existing.latitude || null) : (existing.latitude || null),
      longitude: action === 'check-in' ? (telemetry.longitude || existing.longitude || null) : (existing.longitude || null),
      accuracy: action === 'check-in' ? (telemetry.accuracy || existing.accuracy || null) : (existing.accuracy || null)
    };
  } else {
    state.db.attendance.push({
      id: crypto.randomUUID(),
      employeeId: employee.id,
      date: today,
      status: 'Present',
      permission: false,
      timeIn: action === 'check-in' ? now : '',
      timeOut: action === 'check-out' ? now : '',
      latitude: telemetry.latitude || null,
      longitude: telemetry.longitude || null,
      accuracy: telemetry.accuracy || null
    });
  }

  await saveDatabase();
  showToast(action === 'check-in' ? 'Check-in recorded.' : 'Check-out recorded.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export async function toggleAttendanceLock(refreshAll) {
  setAttendanceLockState(!getAttendanceLockState());
  await saveDatabase();
  showToast(getAttendanceLockState() ? 'Attendance locked.' : 'Attendance unlocked.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}
