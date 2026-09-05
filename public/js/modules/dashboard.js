import { dom } from './dom.js';
import { state, isEmployeeActive, getTodayAttendance } from '../state.js';
import { formatDate } from '../utils.js';

export function updateChart(chartKey, config) {
  const canvas = document.getElementById(chartKey);
  if (!canvas) return;

  if (state.charts[chartKey]) {
    state.charts[chartKey].destroy();
  }

  const ctx = canvas.getContext('2d');
  
  if (config.data && config.data.datasets) {
    config.data.datasets.forEach((dataset) => {
      if (dataset.glowGradient === 'violet') {
        const grad = ctx.createLinearGradient(0, 0, 0, 260);
        grad.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
        grad.addColorStop(1, 'rgba(139, 92, 246, 0.01)');
        dataset.backgroundColor = grad;
      }
      if (dataset.glowGradient === 'cyan') {
        const grad = ctx.createLinearGradient(0, 0, 0, 260);
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
        grad.addColorStop(1, 'rgba(6, 182, 212, 0.01)');
        dataset.backgroundColor = grad;
      }
      if (dataset.glowGradient === 'emerald') {
        const grad = ctx.createLinearGradient(0, 0, 0, 260);
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
        grad.addColorStop(1, 'rgba(16, 185, 129, 0.01)');
        dataset.backgroundColor = grad;
      }
      if (dataset.glowGradient === 'rose') {
        const grad = ctx.createLinearGradient(0, 0, 0, 260);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0.01)');
        dataset.backgroundColor = grad;
      }
      if (dataset.glowGradient === 'amber') {
        const grad = ctx.createLinearGradient(0, 0, 0, 260);
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0.01)');
        dataset.backgroundColor = grad;
      }
    });
  }

  if (!config.plugins) config.plugins = [];
  config.plugins.push({
    id: 'shadow-3d',
    beforeDatasetDraw: (chart) => {
      const c = chart.ctx;
      c.save();
      c.shadowColor = 'rgba(0, 0, 0, 0.45)';
      c.shadowBlur = 10;
      c.shadowOffsetX = 3;
      c.shadowOffsetY = 5;
    },
    afterDatasetDraw: (chart) => {
      chart.ctx.restore();
    }
  });

  state.charts[chartKey] = new Chart(canvas, config);
}

export function chartOptions(type) {
  const common = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#ecf2ff' }
      }
    }
  };

  if (type === 'doughnut') {
    return {
      ...common,
      cutout: '68%'
    };
  }

  return {
    ...common,
    scales: {
      x: { ticks: { color: '#c7d2fe' }, grid: { color: 'rgba(255,255,255,0.06)' } },
      y: { ticks: { color: '#c7d2fe' }, grid: { color: 'rgba(255,255,255,0.06)' } }
    }
  };
}

export function init3DTilt() {
  const cards = document.querySelectorAll('.summary-card, .mini-metric, .countdown-tile, .auth-card, .budget-card, .compact-chart-card, .urgent-issue-card');
  cards.forEach((card) => {
    if (card.dataset.tiltBound) return;
    card.dataset.tiltBound = 'true';

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((centerY - y) / centerY) * 8;
      const rotateY = ((x - centerX) / centerX) * 8;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
  });
}

export function renderDashboard() {
  const activeEmployees = (state.db?.employees || []).filter((e) => isEmployeeActive(e));
  const todayAttendance = getTodayAttendance();
  const presentCount = todayAttendance.filter((e) => e.status === 'Present').length;
  const urgentIssues = (state.db?.managementIssues || []).filter((i) => i.status === 'urgent');

  if (dom.presentTodayCard) dom.presentTodayCard.textContent = `${presentCount} / ${activeEmployees.length}`;
  if (dom.urgentAlertsCard) dom.urgentAlertsCard.textContent = urgentIssues.length;
  if (dom.sidebarIssuesBadge) {
    dom.sidebarIssuesBadge.textContent = urgentIssues.length;
    dom.sidebarIssuesBadge.classList.toggle('d-none', urgentIssues.length === 0);
  }

  // Calculate Supervisor Metrics
  const schools = state.db?.schools || [];
  const supReports = state.db?.reportsSupervisor || [];
  const schoolMetrics = schools.map(sch => {
    const latestRep = supReports.filter(r => r.schoolId === sch.id).sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
    return {
      name: sch.code || sch.name.slice(0, 14),
      fullName: sch.name,
      curriculumPace: latestRep?.curriculumActual || 75,
      lessonCompliance: latestRep?.lessonNoteCompliance || 80,
      cbtCompleted: latestRep?.assessmentCompleted === 'Yes' ? 100 : (latestRep?.assessmentCompleted === 'Partially' ? 50 : 20),
      cbtScores: latestRep?.scoresSubmitted === 'Yes' ? 100 : (latestRep?.scoresSubmitted === 'Partially' ? 50 : 10),
      satisfaction: (latestRep?.satisfactionRating || 4) * 20,
      resultProgress: latestRep?.resultProgress || 70,
      teacherCompliance: latestRep?.teacherCompliance || 80,
      labStatus: latestRep?.labStatus === 'Resolved / All Functional' ? 'Good' : 'Faulty'
    };
  });

  const avgCurriculum = schoolMetrics.length ? Math.round(schoolMetrics.reduce((a,b) => a + b.curriculumPace, 0) / schoolMetrics.length) : 0;
  if (dom.curriculumPaceCard) dom.curriculumPaceCard.textContent = schoolMetrics.length ? `${avgCurriculum}%` : '—';

  // Dev metrics
  const devReps = state.db?.reportsDeveloper || [];
  const latestDev = devReps.sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
  const allProjects = latestDev?.projects || [];
  const activeDevProjects = allProjects.filter(p => p.status === 'Active');
  if (dom.activeDevProjectsCard) dom.activeDevProjectsCard.textContent = activeDevProjects.length;

  // 1. Staff Attendance Doughnut
  updateChart('attendanceRatioChart', {
    type: 'doughnut',
    data: {
      labels: ['Present Today', 'Absent / Pending'],
      datasets: [{
        data: [presentCount, Math.max(0, activeEmployees.length - presentCount)],
        backgroundColor: ['#10b981', '#ef4444'],
        borderWidth: 0
      }]
    },
    options: chartOptions('doughnut')
  });

  // 2. Curriculum Pace (Bar)
  updateChart('curriculumPaceChart', {
    type: 'bar',
    data: {
      labels: schoolMetrics.length ? schoolMetrics.map(s => s.name) : ['No School Records'],
      datasets: [{
        label: 'Actual Syllabus Progress %',
        data: schoolMetrics.length ? schoolMetrics.map(s => s.curriculumPace) : [0],
        backgroundColor: '#6366f1',
        borderRadius: 6
      }]
    },
    options: chartOptions('bar')
  });

  // 3. Lesson Note Compliance (Bar)
  updateChart('lessonNoteComplianceChart', {
    type: 'bar',
    data: {
      labels: schoolMetrics.length ? schoolMetrics.map(s => s.name) : ['No School Records'],
      datasets: [{
        label: 'Teacher Lesson Note Compliance %',
        data: schoolMetrics.length ? schoolMetrics.map(s => s.lessonCompliance) : [0],
        backgroundColor: '#06b6d4',
        borderRadius: 6
      }]
    },
    options: chartOptions('bar')
  });

  // 4. Assessment & CBT Status (Bar)
  updateChart('cbtAssessmentChart', {
    type: 'bar',
    data: {
      labels: schoolMetrics.length ? schoolMetrics.map(s => s.name) : ['No School Records'],
      datasets: [
        { label: 'CBT Assessment Done %', data: schoolMetrics.length ? schoolMetrics.map(s => s.cbtCompleted) : [0], backgroundColor: 'rgba(16, 185, 129, 0.75)', borderRadius: 6 },
        { label: 'Scores Submitted %', data: schoolMetrics.length ? schoolMetrics.map(s => s.cbtScores) : [0], backgroundColor: 'rgba(245, 158, 11, 0.75)', borderRadius: 6 }
      ]
    },
    options: chartOptions('bar')
  });

  // 5. Client Satisfaction Index (Line)
  updateChart('clientSatisfactionChart', {
    type: 'line',
    data: {
      labels: schoolMetrics.length ? schoolMetrics.map(s => s.name) : ['No School Records'],
      datasets: [{
        label: 'Satisfaction Index %',
        data: schoolMetrics.length ? schoolMetrics.map(s => s.satisfaction) : [0],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderWidth: 3,
        glowGradient: 'amber',
        tension: 0.35,
        fill: true
      }]
    },
    options: chartOptions('line')
  });

  // 6. Result Management Progress (Bar)
  updateChart('resultProgressChart', {
    type: 'bar',
    data: {
      labels: schoolMetrics.length ? schoolMetrics.map(s => s.name) : ['No School Records'],
      datasets: [
        { label: 'Result Compilation %', data: schoolMetrics.length ? schoolMetrics.map(s => s.resultProgress) : [0], backgroundColor: '#8b5cf6', borderRadius: 6 },
        { label: 'Teacher Compliance %', data: schoolMetrics.length ? schoolMetrics.map(s => s.teacherCompliance) : [0], backgroundColor: '#ec4899', borderRadius: 6 }
      ]
    },
    options: chartOptions('bar')
  });

  // 7. Developer Projects Velocity (Horizontal Bar)
  const projLabels = allProjects.map(p => p.name.slice(0, 16));
  const projProgress = allProjects.map(p => p.completionPct);
  updateChart('devVelocityChart', {
    type: 'bar',
    data: {
      labels: projLabels.length ? projLabels : ['No Active Projects'],
      datasets: [{
        label: 'Completion %',
        data: projProgress.length ? projProgress : [0],
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }]
    },
    options: {
      ...chartOptions('bar'),
      indexAxis: 'y'
    }
  });

  // 8. Staff Performance & Morale (Welfare HR)
  const welfareReps = state.db?.reportsWelfare || [];
  const latestWelfare = welfareReps.sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
  const staffPerfs = latestWelfare?.staffPerformances || [];
  updateChart('staffPerformanceChart', {
    type: 'bar',
    data: {
      labels: staffPerfs.length ? staffPerfs.map(s => s.name.split(' ')[0]) : ['No Evaluations Logged'],
      datasets: [{
        label: 'Weekly Rating %',
        data: staffPerfs.length ? staffPerfs.map(s => s.performancePct) : [0],
        backgroundColor: '#10b981',
        borderRadius: 6
      }]
    },
    options: chartOptions('bar')
  });

  // Render Dashboard Urgent Issues Hub
  if (dom.dashboardIssuesContainer) {
    if (urgentIssues.length === 0) {
      dom.dashboardIssuesContainer.innerHTML = '<div class="p-3 rounded bg-dark border border-secondary border-opacity-25 text-success small"><i class="bi bi-check-circle me-1"></i> No critical items requiring urgent management intervention at this time.</div>';
    } else {
      dom.dashboardIssuesContainer.innerHTML = urgentIssues.map(issue => `
        <div class="urgent-issue-card pulse-glow-danger">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <span class="badge text-bg-danger me-1">Urgent Attention</span>
              <strong class="text-white">${issue.schoolName || (issue.dept === 'developer' ? 'Developers Office' : 'Welfare & HR')}</strong>
            </div>
            <small class="text-muted">${formatDate(issue.date)}</small>
          </div>
          <div class="text-white-50 small mb-2">${issue.summary}</div>
          <div class="d-flex justify-content-between align-items-center">
            <span class="small text-muted"><i class="bi bi-person me-1"></i>${issue.reporter}</span>
            <button class="btn btn-sm btn-primary" data-action="manage-issue" data-id="${issue.id}">Take Action</button>
          </div>
        </div>
      `).join('');
    }
  }

  // Render Dashboard Queries / Appraisals Table
  if (dom.dashboardQueriesTableBody) {
    const qaList = (state.db?.staffAppraisalsQueries || []).slice(0, 5);
    dom.dashboardQueriesTableBody.innerHTML = qaList.length ? qaList.map(item => `
      <tr>
        <td><span class="badge ${item.type === 'Query' ? 'text-bg-warning' : 'text-bg-success'}">${item.type}</span></td>
        <td>${item.employeeName}</td>
        <td><small class="text-truncate d-inline-block" style="max-width: 150px;">${item.subject}</small></td>
        <td><span class="chip ${item.status === 'Resolved' ? 'chip-success' : 'chip-warning'}">${item.status || 'Pending'}</span></td>
      </tr>
    `).join('') : '<tr><td colspan="4" class="text-center text-muted py-3">No active queries or appraisals</td></tr>';
  }
}
