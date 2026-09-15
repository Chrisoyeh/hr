import { dom } from './dom.js';
import {
  state,
  getSchoolPerformanceSummary,
  getExecutiveApprovals,
  getExecutiveDirectives,
  saveExecutiveApproval,
  submitExecutiveDirective,
  getPendingApprovalsCount
} from '../state.js';
import { formatCurrency, showToast, todayISO } from '../utils.js';
import { saveDatabase } from '../services/firestore.js';

let currentApprovalFilter = 'all';

export function renderCeoCommandCenter() {
  if (!state.db) return;

  // 1. Calculate & Render Executive KPI Metrics
  const summary = getSchoolPerformanceSummary();
  const totalSchools = summary.length;
  const onPaceSchools = summary.filter((s) => s.health === 'Good').length;
  const avgSyllabusPace = totalSchools > 0 ? Math.round(summary.reduce((acc, s) => acc + s.syllabusPace, 0) / totalSchools) : 0;

  // Financial calculations
  const transactions = state.db.financeTransactions || [];
  const revenue = transactions.filter((t) => t.type === 'Revenue' || t.type === 'Income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expenses = transactions.filter((t) => t.type === 'Expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = revenue - expenses;
  const profitMargin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  // Dev & Web projects
  const devReports = state.db.reportsDeveloper || [];
  const allProjects = [];
  devReports.forEach((r) => {
    if (Array.isArray(r.projects)) {
      r.projects.forEach((p) => allProjects.push(p));
    }
  });
  const activeProjectsCount = allProjects.filter((p) => p.status !== 'Completed' && p.status !== 'Deployed').length;

  // Workforce & Attendance
  const employees = (state.db.employees || []).filter((e) => e.active !== false);
  const today = todayISO(0);
  const todayAttendance = (state.db.attendance || []).filter((a) => a.date === today && a.status === 'Present');
  const attendanceRate = employees.length > 0 ? Math.round((todayAttendance.length / employees.length) * 100) : 0;

  // Pending Approvals & Escalations
  const pendingApprovals = getPendingApprovalsCount();
  const openIssues = (state.db.managementIssues || []).filter((i) => i.status !== 'Resolved' && i.status !== 'Closed').length;

  // Update Ribbon KPI Elements
  if (dom.ceoMetricRevenue) dom.ceoMetricRevenue.textContent = formatCurrency(revenue);
  if (dom.ceoMetricProfitMargin) dom.ceoMetricProfitMargin.textContent = `${profitMargin}%`;
  if (dom.ceoMetricAcademicHealth) dom.ceoMetricAcademicHealth.textContent = `${onPaceSchools}/${totalSchools} (${avgSyllabusPace}%)`;
  if (dom.ceoMetricDevProjects) dom.ceoMetricDevProjects.textContent = `${activeProjectsCount} Active`;
  if (dom.ceoMetricWorkforceAttendance) dom.ceoMetricWorkforceAttendance.textContent = `${todayAttendance.length}/${employees.length} (${attendanceRate}%)`;
  if (dom.ceoMetricApprovalsPending) dom.ceoMetricApprovalsPending.textContent = `${pendingApprovals}`;
  if (dom.ceoMetricUrgentEscalations) dom.ceoMetricUrgentEscalations.textContent = `${openIssues}`;

  // Sidebar badge for CEO approvals
  if (dom.sidebarCeoApprovalsBadge) {
    dom.sidebarCeoApprovalsBadge.textContent = pendingApprovals;
    dom.sidebarCeoApprovalsBadge.classList.toggle('d-none', pendingApprovals === 0);
  }

  // 2. Render Sub-Modules
  renderSchoolPerformanceMatrix();
  renderExecutiveApprovalCenter(currentApprovalFilter);
  renderExecutiveDirectives();
  renderExecutiveEscalations();
  renderExecutiveProjectsPortfolio();
  renderExecutiveFinancialSummary();
  renderExecutiveCharts();
}

export function renderSchoolPerformanceMatrix() {
  const matrixTable = document.getElementById('ceoSchoolsMatrixTableBody') || dom.ceoSchoolsMatrixTableBody;
  if (!matrixTable) return;
  let summary = getSchoolPerformanceSummary();

  const query = (dom.ceoSchoolSearch?.value || '').trim().toLowerCase();
  if (query) {
    summary = summary.filter((s) =>
      s.name.toLowerCase().includes(query) ||
      s.code.toLowerCase().includes(query) ||
      s.location.toLowerCase().includes(query) ||
      s.supervisorName.toLowerCase().includes(query)
    );
  }

  if (summary.length === 0) {
    matrixTable.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4 text-muted">
          <i class="bi bi-buildings fs-3 d-block mb-2 text-secondary"></i>
          ${query ? 'No client schools match your search.' : 'No client schools configured yet.'}
        </td>
      </tr>
    `;
    return;
  }

  matrixTable.innerHTML = summary.map((school) => {
    const paceColor = school.syllabusPace >= school.expectedPace ? 'bg-success' : school.syllabusPace >= school.expectedPace - 10 ? 'bg-warning' : 'bg-danger';

    return `
      <tr>
        <td>
          <div class="fw-bold text-white">${school.name}</div>
          <span class="badge text-bg-secondary font-monospace">${school.code}</span>
        </td>
        <td>
          <i class="bi bi-geo-alt me-1 text-muted"></i>${school.location}
        </td>
        <td>
          <span class="badge text-bg-dark border border-secondary">${school.supervisorName}</span>
        </td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="progress flex-grow-1" style="height: 8px;">
              <div class="progress-bar ${paceColor}" style="width: ${Math.min(100, school.syllabusPace)}%"></div>
            </div>
            <span class="small fw-semibold text-light">${school.syllabusPace}% <span class="text-muted small">/ ${school.expectedPace}%</span></span>
          </div>
        </td>
        <td>
          <span class="badge ${school.lessonNotesCompliance >= 80 ? 'text-bg-success' : 'text-bg-warning'}">
            ${school.lessonNotesCompliance}%
          </span>
        </td>
        <td>
          <span class="badge ${school.cbtStatus === 'Completed' || school.cbtStatus === 'Ready' ? 'text-bg-info' : 'text-bg-secondary'}">
            <i class="bi bi-laptop me-1"></i>${school.cbtStatus}
          </span>
        </td>
        <td>
          <span class="${school.outstandingBalance > 0 ? 'text-danger fw-bold' : 'text-success'}">
            ${formatCurrency(school.outstandingBalance)}
          </span>
        </td>
        <td>
          <span class="badge ${school.healthBadgeClass} px-2 py-1">
            ${school.health}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

export function renderExecutiveApprovalCenter(filter = currentApprovalFilter) {
  const approvalsTable = document.getElementById('ceoApprovalsTableBody') || dom.ceoApprovalsTableBody;
  if (!approvalsTable) return;
  currentApprovalFilter = filter;
  const approvals = getExecutiveApprovals(filter);

  // Update filter button states
  const filterWrap = dom.ceoApprovalFilter || document.getElementById('ceoApprovalFilter');
  if (filterWrap) {
    filterWrap.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.filter === filter);
    });
  }

  if (approvals.length === 0) {
    approvalsTable.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="bi bi-check2-circle fs-3 text-success d-block mb-2"></i>
          No approval requests matching filter "${filter}".
        </td>
      </tr>
    `;
    return;
  }

  approvalsTable.innerHTML = approvals.map((item) => {
    let statusBadge = '<span class="badge text-bg-warning">Pending Review</span>';
    if (item.status === 'Approved') statusBadge = '<span class="badge text-bg-success"><i class="bi bi-check-circle me-1"></i>Approved</span>';
    if (item.status === 'Rejected') statusBadge = '<span class="badge text-bg-danger"><i class="bi bi-x-circle me-1"></i>Rejected</span>';

    const isPending = item.status === 'Pending';
    const amountDisplay = item.amount ? formatCurrency(item.amount) : '<span class="text-muted">N/A</span>';
    const dateFormatted = item.requestedAt ? new Date(item.requestedAt).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today';

    return `
      <tr class="${isPending ? 'table-warning bg-opacity-10' : ''}">
        <td>
          <span class="badge text-bg-dark border border-warning text-warning font-monospace fw-bold">${item.id || 'REQ'}</span>
        </td>
        <td>
          <div class="fw-bold text-white">${item.title}</div>
          <small class="text-muted d-block">${item.details || ''}</small>
        </td>
        <td>
          <span class="badge text-bg-dark border border-secondary">${item.type || 'General'}</span>
          <div class="small text-muted mt-1">By: ${item.requestedBy || 'Management'}</div>
        </td>
        <td class="fw-bold font-monospace text-light">
          ${amountDisplay}
        </td>
        <td class="small text-muted">
          ${dateFormatted}
        </td>
        <td>
          ${statusBadge}
          ${item.executiveNotes ? `<div class="small text-info mt-1 fst-italic">"${item.executiveNotes}"</div>` : ''}
        </td>
        <td>
          ${
            isPending
              ? `<div class="d-flex gap-1">
                  <button class="btn btn-sm btn-success d-inline-flex align-items-center gap-1" data-action="approve-item" data-id="${item.id}" title="Approve Request">
                    <i class="bi bi-check-lg"></i> Approve
                  </button>
                  <button class="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1" data-action="reject-item" data-id="${item.id}" title="Reject Request">
                    <i class="bi bi-x-lg"></i> Reject
                  </button>
                </div>`
              : `<span class="small text-muted">Decided by ${item.decidedBy || 'CEO'}</span>`
          }
        </td>
      </tr>
    `;
  }).join('');
}

export function renderExecutiveDirectives() {
  if (!dom.ceoDirectivesList) return;
  const directives = getExecutiveDirectives();

  if (directives.length === 0) {
    dom.ceoDirectivesList.innerHTML = `
      <div class="text-center py-4 text-muted">
        <i class="bi bi-megaphone fs-3 d-block mb-2 text-secondary"></i>
        No executive directives broadcasted yet. Issue a directive using the form above.
      </div>
    `;
    return;
  }

  dom.ceoDirectivesList.innerHTML = directives.map((d) => {
    let priorityClass = 'text-bg-info';
    if (d.priority === 'Critical') priorityClass = 'text-bg-danger';
    else if (d.priority === 'High') priorityClass = 'text-bg-warning';

    const deadlineStr = d.deadline ? new Date(d.deadline).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline';
    const isCompleted = d.status === 'Completed';

    return `
      <div class="card bg-dark bg-opacity-50 border border-secondary border-opacity-25 mb-3">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2 flex-wrap">
            <div>
              <span class="badge ${priorityClass} me-2">${d.priority} Priority</span>
              <span class="badge text-bg-dark border border-secondary">${d.department}</span>
              <h6 class="fw-bold text-white mb-0 mt-2">${d.title}</h6>
            </div>
            <div class="text-end">
              <span class="badge text-bg-secondary"><i class="bi bi-people me-1"></i>${d.targetAudience}</span>
              <div class="small text-muted mt-1"><i class="bi bi-calendar-event me-1"></i>Due: ${deadlineStr}</div>
            </div>
          </div>
          <p class="text-light small mb-2">${d.instructions}</p>
          <div class="d-flex justify-content-between align-items-center small text-muted pt-2 border-top border-secondary border-opacity-25 flex-wrap gap-2">
            <span><i class="bi bi-person-check me-1"></i>Issued by: ${d.createdBy}</span>
            <div class="d-flex align-items-center gap-2">
              <span class="badge ${isCompleted ? 'text-bg-success' : 'text-bg-primary'}">${d.status}</span>
              <button class="btn btn-xs ${isCompleted ? 'btn-outline-secondary' : 'btn-outline-success'} py-0 px-2 small" data-action="toggle-directive-status" data-id="${d.id}">
                ${isCompleted ? 'Reopen' : 'Mark Done'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function renderExecutiveEscalations() {
  if (!dom.ceoEscalationsContainer) return;
  const issues = state.db.managementIssues || [];
  const openIssues = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');

  if (openIssues.length === 0) {
    dom.ceoEscalationsContainer.innerHTML = `
      <div class="text-center py-4 text-muted">
        <i class="bi bi-shield-check fs-3 text-success d-block mb-2"></i>
        No urgent management escalations active. All operational queues normal.
      </div>
    `;
    return;
  }

  dom.ceoEscalationsContainer.innerHTML = openIssues.map((issue) => {
    let badgeClass = 'text-bg-danger';
    if (issue.priority === 'Medium') badgeClass = 'text-bg-warning';
    if (issue.priority === 'Low') badgeClass = 'text-bg-info';

    return `
      <div class="d-flex align-items-start gap-3 p-3 mb-2 rounded bg-danger bg-opacity-10 border border-danger border-opacity-25">
        <div class="fs-4 text-danger"><i class="bi bi-exclamation-triangle-fill"></i></div>
        <div class="flex-grow-1 min-w-0">
          <div class="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-1">
            <h6 class="text-white fw-bold mb-0">${issue.title || issue.issue || 'Operational Issue'}</h6>
            <span class="badge ${badgeClass}">${issue.priority || 'Urgent'}</span>
          </div>
          <p class="small text-light text-opacity-75 mb-2">${issue.description || issue.details || 'No additional details.'}</p>
          <div class="d-flex justify-content-between align-items-center small text-muted flex-wrap gap-2">
            <span><i class="bi bi-building me-1"></i>Dept: ${issue.department || 'Operations'}</span>
            <span><i class="bi bi-clock me-1"></i>${issue.date || todayISO(0)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function renderExecutiveProjectsPortfolio() {
  if (!dom.ceoProjectsPortfolioContainer) return;
  const devReports = state.db.reportsDeveloper || [];
  const allProjects = [];

  devReports.forEach((r) => {
    if (Array.isArray(r.projects)) {
      r.projects.forEach((p) => {
        allProjects.push({
          ...p,
          developerName: r.developerName || 'Lead Developer',
          reportDate: r.date || todayISO(0)
        });
      });
    }
  });

  if (allProjects.length === 0) {
    dom.ceoProjectsPortfolioContainer.innerHTML = `
      <div class="col-12 text-center py-4 text-muted">
        <i class="bi bi-code-square fs-3 d-block mb-2 text-secondary"></i>
        No software or web development projects registered in developer reports.
      </div>
    `;
    return;
  }

  dom.ceoProjectsPortfolioContainer.innerHTML = allProjects.map((p) => {
    const progress = Math.min(100, Math.max(0, Number(p.completionPct || p.progress || 0)));
    let statusClass = 'text-bg-primary';
    if (p.status === 'Completed' || p.status === 'Deployed') statusClass = 'text-bg-success';
    else if (p.status === 'Testing' || p.status === 'In Review') statusClass = 'text-bg-info';
    else if (p.status === 'Blocked' || p.status === 'Stalled') statusClass = 'text-bg-danger';

    return `
      <div class="col-12 col-md-6 mb-3">
        <div class="card h-100 bg-dark bg-opacity-75 border border-secondary border-opacity-25">
          <div class="card-body p-3 d-flex flex-column justify-content-between">
            <div>
              <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                <h6 class="fw-bold text-white mb-0">${p.name || p.projectName || 'Digital Project'}</h6>
                <span class="badge ${statusClass}">${p.status || 'Active'}</span>
              </div>
              <p class="small text-muted mb-3">${p.details || p.description || 'Web application and client integration system.'}</p>
            </div>
            <div>
              <div class="d-flex justify-content-between align-items-center small text-light mb-1">
                <span>Milestone Progress</span>
                <span class="fw-bold text-info">${progress}%</span>
              </div>
              <div class="progress mb-2" style="height: 6px;">
                <div class="progress-bar bg-info" style="width: ${progress}%"></div>
              </div>
              <div class="small text-muted d-flex justify-content-between">
                <span><i class="bi bi-person me-1"></i>${p.developerName}</span>
                <span><i class="bi bi-calendar3 me-1"></i>${p.reportDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function renderExecutiveFinancialSummary() {
  const transactions = state.db.financeTransactions || [];
  const revenue = transactions.filter((t) => t.type === 'Revenue' || t.type === 'Income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expenses = transactions.filter((t) => t.type === 'Expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = revenue - expenses;
  const profitMargin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  const invoices = state.db.clientInvoices || [];
  const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.total || inv.amount || 0), 0);
  const totalReceived = invoices.filter((inv) => inv.status === 'Paid').reduce((sum, inv) => sum + Number(inv.total || inv.amount || 0), 0);
  const totalOutstanding = totalBilled - totalReceived;

  if (dom.ceoFinRevenueVal) dom.ceoFinRevenueVal.textContent = formatCurrency(revenue);
  if (dom.ceoFinExpensesVal) dom.ceoFinExpensesVal.textContent = formatCurrency(expenses);
  if (dom.ceoFinProfitVal) {
    dom.ceoFinProfitVal.textContent = formatCurrency(netProfit);
    dom.ceoFinProfitVal.className = `fs-4 fw-bold font-monospace ${netProfit >= 0 ? 'text-success' : 'text-danger'}`;
  }
  if (dom.ceoFinMarginVal) dom.ceoFinMarginVal.textContent = `${profitMargin}%`;
  if (dom.ceoFinBilledVal) dom.ceoFinBilledVal.textContent = formatCurrency(totalBilled);
  if (dom.ceoFinReceivedVal) dom.ceoFinReceivedVal.textContent = `${formatCurrency(totalReceived)} Rec.`;
  if (dom.ceoFinOutstandingVal) dom.ceoFinOutstandingVal.textContent = `${formatCurrency(totalOutstanding)} Out.`;
}

export function renderExecutiveCharts() {
  if (typeof Chart === 'undefined') return;

  // 1. Multi-School Curriculum Pace Chart
  const pacingCanvas = document.getElementById('ceoAcademicPacingChart');
  if (pacingCanvas) {
    if (state.charts.ceoAcademicPacingChart) {
      state.charts.ceoAcademicPacingChart.destroy();
    }
    const ctx = pacingCanvas.getContext('2d');
    const summary = getSchoolPerformanceSummary();
    const labels = summary.slice(0, 8).map((s) => s.name);
    const actualData = summary.slice(0, 8).map((s) => s.syllabusPace);
    const targetData = summary.slice(0, 8).map((s) => s.expectedPace);

    state.charts.ceoAcademicPacingChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['No Schools Configured'],
        datasets: [
          {
            label: 'Actual Syllabus Pace (%)',
            data: actualData.length > 0 ? actualData : [0],
            backgroundColor: 'rgba(139, 92, 246, 0.75)',
            borderColor: '#8b5cf6',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Target Benchmark (80%)',
            data: targetData.length > 0 ? targetData : [80],
            backgroundColor: 'rgba(6, 182, 212, 0.45)',
            borderColor: '#06b6d4',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#c7d2fe' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#c7d2fe' }
          }
        },
        plugins: {
          legend: { labels: { color: '#ecf2ff' } }
        }
      }
    });
  }

  // 2. Financial Breakdown Doughnut
  const finCanvas = document.getElementById('ceoFinancialBreakdownChart');
  if (finCanvas) {
    if (state.charts.ceoFinancialBreakdownChart) {
      state.charts.ceoFinancialBreakdownChart.destroy();
    }
    const ctx = finCanvas.getContext('2d');
    const transactions = state.db.financeTransactions || [];
    const revenue = transactions.filter((t) => t.type === 'Revenue' || t.type === 'Income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const expenses = transactions.filter((t) => t.type === 'Expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const invoices = state.db.clientInvoices || [];
    const receivables = invoices.filter((inv) => inv.status !== 'Paid').reduce((sum, inv) => sum + Number(inv.total || inv.amount || 0), 0);

    state.charts.ceoFinancialBreakdownChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Recognized Revenue', 'Direct Expenses', 'Unpaid Invoices'],
        datasets: [
          {
            data: [revenue || 1, expenses || 1, receivables || 0],
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
            borderColor: '#0d1423',
            borderWidth: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#ecf2ff', boxWidth: 12 }
          }
        }
      }
    });
  }
}

export async function submitCeoDirectiveForm(event, onComplete) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  const title = dom.ceoDirectiveTitle?.value?.trim();
  const department = dom.ceoDirectiveDept?.value?.trim() || 'All Departments';
  const targetAudience = dom.ceoDirectiveAudience?.value?.trim() || 'All Staff';
  const priority = dom.ceoDirectivePriority?.value || 'High';
  const deadline = dom.ceoDirectiveDeadline?.value || todayISO(7);
  const instructions = dom.ceoDirectiveInstructions?.value?.trim();

  if (!title || !instructions) {
    showToast('Please provide a directive title and instructions.', 'warning');
    return;
  }

  submitExecutiveDirective({
    title,
    department,
    targetAudience,
    priority,
    deadline,
    instructions
  });

  await saveDatabase();
  showToast('Executive Directive broadcasted successfully.', 'success');

  if (dom.ceoDirectiveForm) dom.ceoDirectiveForm.reset();
  renderCeoCommandCenter();

  if (typeof onComplete === 'function') onComplete();
}

export async function handleApprovalAction(approvalId, decisionStatus, notes = '') {
  if (!approvalId) return;
  saveExecutiveApproval(approvalId, decisionStatus, notes);
  await saveDatabase();
  showToast(`Request ${approvalId} marked as ${decisionStatus}.`, decisionStatus === 'Approved' ? 'success' : 'info');
  renderCeoCommandCenter();
}

export async function toggleDirectiveStatus(directiveId) {
  if (!directiveId || !state.db.executiveDirectives) return;
  const directive = state.db.executiveDirectives.find((d) => d.id === directiveId);
  if (!directive) return;
  directive.status = directive.status === 'Completed' ? 'Active' : 'Completed';
  if (state.db.settings) state.db.settings.lastWriteTimestamp = Date.now();
  await saveDatabase();
  showToast(`Directive ${directiveId} status updated to ${directive.status}.`, 'info');
  renderExecutiveDirectives();
}
