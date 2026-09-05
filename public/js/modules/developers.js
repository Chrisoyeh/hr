import { dom } from './dom.js';
import { state } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { todayISO, formatDate, showToast } from '../utils.js';

export function addDevProjectRow(proj = { name: '', type: 'In-House Website', client: '', status: 'Active', completionPct: 50, issues: '' }) {
  const container = dom.devProjectsBuilder;
  if (!container) return;

  const rowId = `proj-row-${crypto.randomUUID()}`;
  const rowHtml = `
    <div class="dev-project-row card bg-dark p-3 mb-2 border border-secondary border-opacity-25 position-relative" id="${rowId}">
      <button type="button" class="btn-close btn-close-white position-absolute top-0 end-0 m-2" onclick="this.closest('.dev-project-row').remove()"></button>
      <div class="row g-2 mb-2">
        <div class="col-md-4">
          <label class="form-label small">Project / App Name</label>
          <input type="text" class="form-control form-control-sm dev-proj-name" placeholder="e.g. School Portal v2" value="${proj.name || ''}" required>
        </div>
        <div class="col-md-4">
          <label class="form-label small">Project Type</label>
          <select class="form-select form-select-sm dev-proj-type">
            <option value="In-House Website" ${proj.type === 'In-House Website' ? 'selected' : ''}>In-House Website</option>
            <option value="School / Client Portal" ${proj.type === 'School / Client Portal' ? 'selected' : ''}>School / Client Portal</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label small">Client / Target</label>
          <input type="text" class="form-control form-control-sm dev-proj-client" placeholder="e.g. Client Name" value="${proj.client || ''}">
        </div>
      </div>
      <div class="row g-2">
        <div class="col-md-3">
          <label class="form-label small">Status</label>
          <select class="form-select form-select-sm dev-proj-status">
            <option value="Active" ${proj.status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Inactive" ${proj.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
            <option value="Completed" ${proj.status === 'Completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">Progress %</label>
          <input type="number" class="form-control form-control-sm dev-proj-pct" min="0" max="100" value="${proj.completionPct || 0}" required>
        </div>
        <div class="col-md-6">
          <label class="form-label small">Blockers / Issues</label>
          <input type="text" class="form-control form-control-sm dev-proj-issues" placeholder="None or describe..." value="${proj.issues || ''}">
        </div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', rowHtml);
}

export function renderDevelopersView() {
  // If builder empty, prefill with a single clean blank project row
  if (dom.devProjectsBuilder && dom.devProjectsBuilder.children.length === 0) {
    addDevProjectRow({ name: '', type: 'In-House Website', client: '', status: 'Active', completionPct: 0, issues: '' });
  }

  const tableBody = dom.devReportsTableBody;
  const directoryBody = dom.devProjectsDirectoryTableBody;

  const query = dom.devReportSearch?.value.trim().toLowerCase() || '';

  let reports = [...(state.db?.reportsDeveloper || [])];
  if (query) {
    reports = reports.filter(r => 
      [r.workCompleted, r.maintDetails, r.supportRequired]
        .some(f => String(f || '').toLowerCase().includes(query))
    );
  }
  reports.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (tableBody) {
    if (reports.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No developer reports found.</td></tr>';
    } else {
      tableBody.innerHTML = reports.map(r => `
        <tr>
          <td>${formatDate(r.date)}</td>
          <td>${r.developerEmail || 'Lead Dev'}</td>
          <td><span class="chip chip-neutral">${(r.projects || []).length} Projects</span></td>
          <td><small class="text-truncate d-inline-block" style="max-width: 220px;">${r.workCompleted}</small></td>
          <td>${r.supportRequired ? '<span class="badge text-bg-warning text-dark">Support Needed</span>' : '<span class="chip chip-success">None</span>'}</td>
          <td>
            <button class="btn btn-sm btn-soft me-1" data-action="view-dev-report" data-id="${r.id}">View Full</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-dev-report" data-id="${r.id}">Delete</button>
          </td>
        </tr>
      `).join('');
    }
  }

  if (directoryBody) {
    const latestRep = (state.db?.reportsDeveloper || []).sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
    const projects = latestRep?.projects || [];
    if (projects.length === 0) {
      directoryBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No active development projects.</td></tr>';
    } else {
      directoryBody.innerHTML = projects.map(p => `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td><span class="chip ${p.type === 'In-House Website' ? 'chip-neutral' : 'chip-warning'}">${p.type}</span></td>
          <td>${p.client || 'HLTS LTD'}</td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="progress flex-grow-1" style="height: 6px;">
                <div class="progress-bar" style="width: ${p.completionPct}%"></div>
              </div>
              <small>${p.completionPct}%</small>
            </div>
          </td>
          <td><span class="chip ${p.status === 'Active' ? 'chip-success' : (p.status === 'Completed' ? 'chip-neutral' : 'chip-danger')}">${p.status}</span></td>
          <td><small class="text-muted">${p.issues || 'None'}</small></td>
        </tr>
      `).join('');
    }
  }
}

export function submitDeveloperReport(event, refreshAll) {
  event.preventDefault();
  const id = dom.devReportId?.value || `drep-${crypto.randomUUID()}`;

  // Harvest dynamic project rows
  const projectRows = document.querySelectorAll('.dev-project-row');
  const projects = Array.from(projectRows).map(row => ({
    name: row.querySelector('.dev-proj-name')?.value.trim() || 'Untitled Project',
    type: row.querySelector('.dev-proj-type')?.value || 'In-House Website',
    client: row.querySelector('.dev-proj-client')?.value.trim() || 'HLTS LTD',
    status: row.querySelector('.dev-proj-status')?.value || 'Active',
    completionPct: Number(row.querySelector('.dev-proj-pct')?.value || 0),
    issues: row.querySelector('.dev-proj-issues')?.value.trim() || ''
  }));

  const supportReq = dom.devSupportRequired?.value.trim() || '';

  const report = {
    id,
    developerEmail: state.session?.email || 'developer@hlts.local',
    date: todayISO(0),
    projects,
    workCompleted: dom.devWorkCompleted.value.trim(),
    maintType: dom.devMaintType.value,
    maintTarget: dom.devMaintTarget.value.trim(),
    maintDetails: dom.devMaintDetails.value.trim(),
    supportRequired: supportReq,
    createdAt: new Date().toISOString()
  };

  if (!state.db.reportsDeveloper) state.db.reportsDeveloper = [];
  const existingIdx = state.db.reportsDeveloper.findIndex(r => r.id === id);
  if (existingIdx >= 0) {
    state.db.reportsDeveloper[existingIdx] = report;
  } else {
    state.db.reportsDeveloper.push(report);
  }

  // If management support requested, auto-route to Operations Manager issues
  if (supportReq) {
    if (!state.db.managementIssues) state.db.managementIssues = [];
    state.db.managementIssues.push({
      id: `missue-${crypto.randomUUID()}`,
      date: todayISO(0),
      dept: 'developer',
      schoolId: '',
      schoolName: `${report.maintTarget || 'Dev Office'}`,
      reporter: state.session?.email || 'developer@hlts.local',
      summary: `Tech Support Request: ${supportReq}`,
      status: 'urgent',
      opsNotes: '',
      updatedAt: new Date().toISOString()
    });
  }

  saveDatabase();
  resetDeveloperReportForm();
  showToast('Developer weekly report submitted successfully.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export function resetDeveloperReportForm() {
  if (dom.devReportForm) dom.devReportForm.reset();
  if (dom.devReportId) dom.devReportId.value = '';
  if (dom.devProjectsBuilder) dom.devProjectsBuilder.innerHTML = '';
  addDevProjectRow();
}
