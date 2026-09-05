import { dom } from './dom.js';
import { state } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { formatDate, showToast } from '../utils.js';

export function renderManagementIssues() {
  const container = dom.managementIssuesList;
  if (!container) return;

  const statusFilter = dom.issueStatusFilter?.value || 'all';
  const deptFilter = dom.issueDeptFilter?.value || 'all';

  let issues = [...(state.db?.managementIssues || [])];

  if (statusFilter !== 'all') {
    if (statusFilter === 'urgent') issues = issues.filter(i => i.status === 'urgent');
    else if (statusFilter === 'in_progress') issues = issues.filter(i => i.status === 'in_progress');
    else if (statusFilter === 'resolved') issues = issues.filter(i => i.status === 'resolved');
  }

  if (deptFilter !== 'all') {
    issues = issues.filter(i => i.dept === deptFilter);
  }

  issues.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (issues.length === 0) {
    container.innerHTML = '<div class="p-4 text-center text-muted">No management issues found for the selected filters.</div>';
    return;
  }

  container.innerHTML = issues.map(issue => {
    const statusBadges = {
      urgent: '<span class="badge text-bg-danger">Urgent / Pending</span>',
      in_progress: '<span class="badge text-bg-warning text-dark">In Progress</span>',
      resolved: '<span class="badge text-bg-success">Resolved</span>'
    };
    const deptBadges = {
      supervisor: '<span class="chip chip-neutral">Academic Supervisor</span>',
      developer: '<span class="chip chip-neutral">Developers Office</span>',
      welfare_hr: '<span class="chip chip-neutral">Welfare & HR</span>'
    };

    return `
      <div class="urgent-issue-card mb-3">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            ${statusBadges[issue.status] || ''}
            ${deptBadges[issue.dept] || ''}
            <strong class="text-white">${issue.schoolName || 'Internal Organization'}</strong>
          </div>
          <small class="text-muted">${formatDate(issue.date)}</small>
        </div>
        <div class="text-light mb-2 fw-medium">${issue.summary}</div>
        ${issue.opsNotes ? `<div class="p-2 rounded bg-black bg-opacity-40 border border-secondary border-opacity-25 small text-info mb-2"><strong>Ops Directive:</strong> ${issue.opsNotes}</div>` : ''}
        <div class="d-flex justify-content-between align-items-center mt-2">
          <span class="small text-muted"><i class="bi bi-person me-1"></i>Reporter: ${issue.reporter}</span>
          <div>
            <button class="btn btn-sm btn-outline-light me-1" data-action="manage-issue" data-id="${issue.id}">Update / Resolve</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="delete-management-issue" data-id="${issue.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function openManagementIssueModal(issueId) {
  const issue = (state.db?.managementIssues || []).find(i => i.id === issueId);
  if (!issue) return;

  if (dom.modalIssueId) dom.modalIssueId.value = issue.id;
  if (dom.modalIssueSummary) dom.modalIssueSummary.textContent = `[${issue.dept.toUpperCase()}] ${issue.schoolName ? `${issue.schoolName}: ` : ''}${issue.summary}`;
  if (dom.modalIssueStatus) dom.modalIssueStatus.value = issue.status;
  if (dom.modalIssueNotes) dom.modalIssueNotes.value = issue.opsNotes || '';

  const modalEl = document.getElementById('managementIssueModal');
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

export function saveManagementIssue(refreshAll) {
  const id = dom.modalIssueId?.value;
  const issue = (state.db?.managementIssues || []).find(i => i.id === id);
  if (!issue) return;

  issue.status = dom.modalIssueStatus?.value || issue.status;
  issue.opsNotes = dom.modalIssueNotes?.value.trim() || '';
  issue.updatedAt = new Date().toISOString();

  saveDatabase();

  const modalEl = document.getElementById('managementIssueModal');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  showToast('Management issue updated successfully.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}
