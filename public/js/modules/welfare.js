import { dom } from './dom.js';
import { state, isEmployeeActive } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { todayISO, formatDate, showToast } from '../utils.js';

export function renderWelfareHrView() {
  const isWelfareSession = state.session?.role === 'welfare_hr';

  // Populate staff dropdown for QA
  if (dom.qaEmployee) {
    const currentVal = dom.qaEmployee.value;
    const activeStaff = (state.db?.employees || []).filter(e => isEmployeeActive(e));
    dom.qaEmployee.innerHTML = activeStaff.map(e => `<option value="${e.id}">${e.fullName}</option>`).join('');
    if (currentVal) dom.qaEmployee.value = currentVal;
  }

  // Populate dynamic staff roster builder in the report form
  if (dom.welfareStaffRosterBuilder && dom.welfareStaffRosterBuilder.children.length === 0) {
    const activeStaff = (state.db?.employees || []).filter(e => isEmployeeActive(e));
    dom.welfareStaffRosterBuilder.innerHTML = activeStaff.map(emp => `
      <div class="card bg-dark p-3 mb-2 border border-secondary border-opacity-25" data-emp-id="${emp.id}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong class="text-white">${emp.fullName}</strong>
          <small class="text-muted">${emp.position}</small>
        </div>
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label small">Performance %</label>
            <input type="number" class="form-control form-control-sm welfare-perf-val" min="0" max="100" value="85">
          </div>
          <div class="col-md-4">
            <label class="form-label small">Conduct Assessment</label>
            <select class="form-select form-select-sm welfare-conduct-val">
              <option value="Excellent">Excellent</option>
              <option value="Good" selected>Good</option>
              <option value="Satisfactory">Satisfactory</option>
              <option value="Requires Attention">Requires Attention</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label small">Remarks / Notes</label>
            <input type="text" class="form-control form-control-sm welfare-remarks-val" placeholder="Punctuality, conduct, output...">
          </div>
        </div>
      </div>
    `).join('');
  }

  // Render QA Registry Table
  const qaBody = dom.qaTableBody;
  if (qaBody) {
    const filter = dom.qaFilter?.value || 'all';
    let list = [...(state.db?.staffAppraisalsQueries || [])];
    if (filter !== 'all') {
      list = list.filter(item => item.type === filter);
    }
    list.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (list.length === 0) {
      qaBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No staff queries or appraisals logged.</td></tr>';
    } else {
      qaBody.innerHTML = list.map(item => `
        <tr>
          <td>${formatDate(item.date)}</td>
          <td><span class="badge ${item.type === 'Query' ? 'text-bg-warning' : 'text-bg-success'}">${item.type}</span></td>
          <td><div class="fw-semibold">${item.employeeName}</div></td>
          <td><small class="text-truncate d-inline-block" style="max-width: 200px;">${item.subject}</small></td>
          <td><span class="chip ${item.status === 'Resolved' ? 'chip-success' : 'chip-warning'}">${item.status || 'Pending'}</span></td>
          <td>
            <button class="btn btn-sm btn-outline-light me-1" data-action="toggle-qa-status" data-id="${item.id}">
              ${item.status === 'Resolved' ? 'Reopen' : 'Resolve'}
            </button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-qa" data-id="${item.id}">
              Delete
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  // Render Welfare Weekly Reports History
  const wrepBody = dom.welfareReportsTableBody;
  if (wrepBody) {
    const reports = [...(state.db?.reportsWelfare || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (reports.length === 0) {
      wrepBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No Welfare / HR reports logged.</td></tr>';
    } else {
      wrepBody.innerHTML = reports.map(r => `
        <tr>
          <td>${formatDate(r.date)}</td>
          <td>${r.officerEmail || 'HR Officer'}</td>
          <td><span class="chip chip-neutral">${(r.staffPerformances || []).length} Staff</span></td>
          <td><span class="chip chip-neutral">${(r.staffPerformances || []).filter(p => p.conductScore === 'Requires Attention').length} Flagged</span></td>
          <td>
            <button class="btn btn-sm btn-soft me-1" data-action="view-welfare-report" data-id="${r.id}">View Full</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-welfare-report" data-id="${r.id}">Delete</button>
          </td>
        </tr>
      `).join('');
    }
  }
}

export function submitWelfareReport(event, refreshAll) {
  event.preventDefault();
  const id = dom.welfareReportId?.value || `wrep-${crypto.randomUUID()}`;

  // Harvest staff roster inputs
  const rosterItems = document.querySelectorAll('#welfareStaffRosterBuilder [data-emp-id]');
  const staffPerformances = Array.from(rosterItems).map(item => {
    const empId = item.dataset.empId;
    const employee = (state.db?.employees || []).find(e => e.id === empId);
    return {
      employeeId: empId,
      name: employee?.fullName || 'Staff',
      performancePct: Number(item.querySelector('.welfare-perf-val')?.value || 80),
      conductScore: item.querySelector('.welfare-conduct-val')?.value || 'Good',
      conductRemarks: item.querySelector('.welfare-remarks-val')?.value.trim() || ''
    };
  });

  // If new QA fields are filled in form, also create appraisal / query record
  const qaSubject = dom.qaSubject?.value.trim();
  if (qaSubject) {
    const qaEmpId = dom.qaEmployee.value;
    const qaEmp = (state.db?.employees || []).find(e => e.id === qaEmpId);
    if (!state.db.staffAppraisalsQueries) state.db.staffAppraisalsQueries = [];
    state.db.staffAppraisalsQueries.push({
      id: `qa-${crypto.randomUUID()}`,
      date: todayISO(0),
      type: dom.qaType.value,
      employeeId: qaEmpId,
      employeeName: qaEmp?.fullName || 'Staff',
      subject: qaSubject,
      details: dom.qaDetails.value.trim(),
      status: 'Open',
      resolutionNotes: ''
    });
  }

  const report = {
    id,
    officerEmail: state.session?.email || 'welfare.hr@hlts.local',
    date: todayISO(0),
    staffPerformances,
    generalNotes: dom.welfareGeneralNotes.value.trim(),
    createdAt: new Date().toISOString()
  };

  if (!state.db.reportsWelfare) state.db.reportsWelfare = [];
  const existingIdx = state.db.reportsWelfare.findIndex(r => r.id === id);
  if (existingIdx >= 0) {
    state.db.reportsWelfare[existingIdx] = report;
  } else {
    state.db.reportsWelfare.push(report);
  }

  saveDatabase();
  resetWelfareReportForm();
  showToast('Welfare & HR weekly report submitted successfully.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export function resetWelfareReportForm() {
  if (dom.welfareReportForm) dom.welfareReportForm.reset();
  if (dom.welfareReportId) dom.welfareReportId.value = '';
  if (dom.qaSubject) dom.qaSubject.value = '';
  if (dom.qaDetails) dom.qaDetails.value = '';
  if (dom.welfareGeneralNotes) dom.welfareGeneralNotes.value = '';
}

export function toggleQAStatus(id, refreshAll) {
  const item = (state.db?.staffAppraisalsQueries || []).find(q => q.id === id);
  if (!item) return;
  item.status = item.status === 'Resolved' ? 'Open' : 'Resolved';
  saveDatabase();
  showToast(`Record status marked as ${item.status}.`, 'info');
  if (typeof refreshAll === 'function') refreshAll();
}
