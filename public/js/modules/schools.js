import { dom } from './dom.js';
import { state } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { showToast, isSchoolAssignedToSupervisor } from '../utils.js';

export function renderSchoolsView() {
  const isOpsManager = state.session?.role === 'admin' || state.session?.role === 'ops_manager';

  const formCol = dom.schoolFormCol || document.getElementById('schoolFormCol');
  const tableCol = dom.schoolsTableCol || document.getElementById('schoolsTableCol');
  const title = dom.schoolsRegistryTitle || document.getElementById('schoolsRegistryTitle');
  const subtitle = dom.schoolsRegistrySubtitle || document.getElementById('schoolsRegistrySubtitle');

  if (formCol && tableCol) {
    if (isOpsManager) {
      formCol.classList.remove('d-none');
      tableCol.className = 'col-12 col-xl-8';
      if (title) title.textContent = 'Schools & Clients Registry';
      if (subtitle) subtitle.textContent = 'Partner institutions, assigned supervisors, and overall health status.';
    } else {
      // Supervisors are not permitted to add schools: hide form and expand table
      formCol.classList.add('d-none');
      tableCol.className = 'col-12 col-xl-12';
      if (title) title.textContent = 'My Assigned Schools & Partner Institutions';
      if (subtitle) subtitle.textContent = 'Partner schools currently assigned to your academic supervisory portfolio.';
    }
  }

  // Populate supervisors dropdown only for Operations Manager
  if (dom.schoolSupervisor && isOpsManager) {
    const currentVal = dom.schoolSupervisor.value;
    const supMap = new Map();
    (state.db?.users || []).forEach(u => {
      if (['supervisor', 'admin', 'ops_manager'].includes(u.role) && u.email) {
        supMap.set(u.email.toLowerCase(), { name: u.name, email: u.email, role: u.role });
      }
    });
    (state.db?.employees || []).forEach(e => {
      if (['supervisor', 'admin', 'ops_manager'].includes(e.role) && e.email && !supMap.has(e.email.toLowerCase())) {
        supMap.set(e.email.toLowerCase(), { name: e.fullName, email: e.email, role: e.role });
      }
    });
    const supervisors = Array.from(supMap.values());
    dom.schoolSupervisor.innerHTML = '<option value="">Select Assigned Supervisor...</option>' + 
      supervisors.map(s => `<option value="${s.email}">${s.name}</option>`).join('');
    if (currentVal) dom.schoolSupervisor.value = currentVal;
  }

  const tableBody = dom.schoolsTableBody;
  if (!tableBody) return;

  const search = dom.schoolSearch?.value.trim().toLowerCase() || '';
  let schools = [...(state.db?.schools || [])];

  if (!isOpsManager) {
    // Only display schools assigned to this supervisor
    schools = schools.filter(s => isSchoolAssignedToSupervisor(s, state.session, state.db?.employees, state.db?.users));
  }

  if (search) {
    schools = schools.filter(s => 
      [s.name, s.code, s.location, s.contactPerson, s.supervisorId]
        .some(f => String(f || '').toLowerCase().includes(search))
    );
  }

  schools.sort((a, b) => a.name.localeCompare(b.name));

  if (schools.length === 0) {
    const emptyMsg = isOpsManager
      ? 'No partner schools registered yet. Use the form on the left to add one.'
      : 'No partner schools are currently assigned to you. Contact the Operations Manager to be assigned a school.';
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4"><i class="bi bi-buildings fs-3 d-block mb-2 text-white-50"></i>${emptyMsg}</td></tr>`;
    return;
  }

  const supReports = state.db?.reportsSupervisor || [];

  tableBody.innerHTML = schools.map(sch => {
    const latestRep = supReports.filter(r => r.schoolId === sch.id).sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
    const healthBadge = !latestRep ? '<span class="chip chip-neutral">No Reports</span>'
      : (latestRep.urgentAttention || latestRep.needManagementIntervention === 'Yes' ? '<span class="chip chip-danger">Attention Needed</span>'
      : (latestRep.curriculumActual >= latestRep.curriculumExpected ? '<span class="chip chip-success">Healthy (On Pace)</span>' : '<span class="chip chip-warning">Pace Lag</span>'));

    let actionButtons = '';
    if (isOpsManager) {
      actionButtons = `
        <button class="btn btn-sm btn-soft me-1" data-action="edit-school" data-id="${sch.id}">Edit</button>
        <button class="btn btn-sm btn-outline-secondary" data-action="delete-school" data-id="${sch.id}">Delete</button>
      `;
    } else {
      actionButtons = `
        <button class="btn btn-sm btn-primary" data-action="report-school" data-id="${sch.id}"><i class="bi bi-file-earmark-text me-1"></i>Submit Report</button>
      `;
    }

    return `
      <tr>
        <td>
          <div class="fw-semibold text-white">${sch.name}</div>
          <small class="text-muted"><i class="bi bi-geo-alt me-1"></i>${sch.location || 'Lagos'}</small>
        </td>
        <td><span class="badge text-bg-light">${sch.code || '—'}</span></td>
        <td>
          <div>${sch.supervisorId || '<span class="text-warning">Unassigned</span>'}</div>
          ${sch.contactPerson ? `<small class="text-muted">Contact: ${sch.contactPerson} (${sch.contactPhone || ''})</small>` : ''}
        </td>
        <td>${healthBadge}</td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

export async function upsertSchool(event, refreshAll) {
  event.preventDefault();
  const isOpsManager = state.session?.role === 'admin' || state.session?.role === 'ops_manager' || state.session?.actualRole === 'admin' || state.session?.actualRole === 'ops_manager';
  if (!isOpsManager) {
    showToast('Permission denied: Only the Operations Manager can add or update partner schools.', 'danger');
    return;
  }

  const id = dom.schoolId?.value || `sch-${crypto.randomUUID()}`;
  const school = {
    id,
    name: dom.schoolName.value.trim(),
    code: dom.schoolCode.value.trim().toUpperCase(),
    location: dom.schoolLocation.value.trim(),
    contactPerson: dom.schoolContactPerson.value.trim(),
    contactPhone: dom.schoolContactPhone.value.trim(),
    supervisorId: dom.schoolSupervisor.value.trim()
  };

  if (!state.db.schools) state.db.schools = [];
  const existingIdx = state.db.schools.findIndex(s => s.id === id);
  if (existingIdx >= 0) {
    state.db.schools[existingIdx] = school;
    showToast('School updated successfully.', 'success');
  } else {
    state.db.schools.push(school);
    showToast('School added successfully.', 'success');
  }

  await saveDatabase();
  resetSchoolForm();
  if (typeof refreshAll === 'function') refreshAll();
}

export function resetSchoolForm() {
  if (dom.schoolForm) dom.schoolForm.reset();
  if (dom.schoolId) dom.schoolId.value = '';
  if (dom.schoolFormTitle) dom.schoolFormTitle.textContent = 'Add School / Client';
  if (dom.schoolSubmitBtn) dom.schoolSubmitBtn.textContent = 'Save School';
}

export async function deleteSchool(id, refreshAll) {
  const isOpsManager = state.session?.role === 'admin' || state.session?.role === 'ops_manager' || state.session?.actualRole === 'admin' || state.session?.actualRole === 'ops_manager';
  if (!isOpsManager) {
    showToast('Permission denied: Only the Operations Manager can delete schools.', 'danger');
    return;
  }

  if (!confirm('Are you sure you want to delete this school registry entry?')) return;
  state.db.schools = (state.db?.schools || []).filter(s => s.id !== id);
  await saveDatabase();
  showToast('School deleted.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}
