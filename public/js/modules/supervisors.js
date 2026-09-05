import { dom } from './dom.js';
import { state } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { todayISO, formatDate, showToast, isSchoolAssignedToSupervisor, getSupervisorIdentifiers } from '../utils.js';

export function getSupDraftKey(schoolId) {
  const email = (state.session?.email || 'sup').toLowerCase();
  return `sup_draft_${email}_${schoolId}`;
}

export function saveSupervisorDraft() {
  const schoolId = dom.supReportSchool?.value;
  if (!schoolId) return;
  const draft = {
    schoolId,
    curriculumExpected: dom.supCurriculumExpected?.value || '',
    curriculumActual: dom.supCurriculumActual?.value || '',
    deliveryNotes: dom.supDeliveryNotes?.value || '',
    lessonNoteCompliance: dom.supLessonNoteCompliance?.value || '',
    teachersFollowUp: dom.supTeachersFollowUp?.value || '',
    assessmentConducted: dom.supAssessmentConducted?.value || 'No',
    assessmentType: dom.supAssessmentType?.value || '',
    assessmentCompleted: dom.supAssessmentCompleted?.value || 'No',
    scoresSubmitted: dom.supScoresSubmitted?.value || 'No',
    cbtStatus: dom.supCbtStatus?.value || 'Stable / Good',
    cbtIssues: dom.supCbtIssues?.value || '',
    resultProgress: dom.supResultProgress?.value || '',
    teacherResultCompliance: dom.supTeacherResultCompliance?.value || '',
    schoolComplaint: dom.supSchoolComplaint?.value || '',
    actionTaken: dom.supActionTaken?.value || '',
    isResolved: dom.supIsResolved?.value || 'Yes',
    needManagementIntervention: dom.supNeedManagementIntervention?.value || 'No',
    satisfactionRating: dom.supSatisfactionRating?.value || '4',
    labIssues: dom.supLabIssues?.value || '',
    labStatus: dom.supLabStatus?.value || 'Resolved / All Functional',
    urgentAttention: dom.supUrgentAttention?.value || '',
    nextWeekPriorities: dom.supNextWeekPriorities?.value || ''
  };
  localStorage.setItem(getSupDraftKey(schoolId), JSON.stringify(draft));
}

export function restoreSupervisorDraft(schoolId) {
  if (!schoolId) return;
  const raw = localStorage.getItem(getSupDraftKey(schoolId));
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (dom.supCurriculumExpected && draft.curriculumExpected !== undefined) dom.supCurriculumExpected.value = draft.curriculumExpected;
    if (dom.supCurriculumActual && draft.curriculumActual !== undefined) dom.supCurriculumActual.value = draft.curriculumActual;
    if (dom.supDeliveryNotes && draft.deliveryNotes !== undefined) dom.supDeliveryNotes.value = draft.deliveryNotes;
    if (dom.supLessonNoteCompliance && draft.lessonNoteCompliance !== undefined) dom.supLessonNoteCompliance.value = draft.lessonNoteCompliance;
    if (dom.supTeachersFollowUp && draft.teachersFollowUp !== undefined) dom.supTeachersFollowUp.value = draft.teachersFollowUp;
    if (dom.supAssessmentConducted && draft.assessmentConducted !== undefined) dom.supAssessmentConducted.value = draft.assessmentConducted;
    if (dom.supAssessmentType && draft.assessmentType !== undefined) dom.supAssessmentType.value = draft.assessmentType;
    if (dom.supAssessmentCompleted && draft.assessmentCompleted !== undefined) dom.supAssessmentCompleted.value = draft.assessmentCompleted;
    if (dom.supScoresSubmitted && draft.scoresSubmitted !== undefined) dom.supScoresSubmitted.value = draft.scoresSubmitted;
    if (dom.supCbtStatus && draft.cbtStatus !== undefined) dom.supCbtStatus.value = draft.cbtStatus;
    if (dom.supCbtIssues && draft.cbtIssues !== undefined) dom.supCbtIssues.value = draft.cbtIssues;
    if (dom.supResultProgress && draft.resultProgress !== undefined) dom.supResultProgress.value = draft.resultProgress;
    if (dom.supTeacherResultCompliance && draft.teacherResultCompliance !== undefined) dom.supTeacherResultCompliance.value = draft.teacherResultCompliance;
    if (dom.supSchoolComplaint && draft.schoolComplaint !== undefined) dom.supSchoolComplaint.value = draft.schoolComplaint;
    if (dom.supActionTaken && draft.actionTaken !== undefined) dom.supActionTaken.value = draft.actionTaken;
    if (dom.supIsResolved && draft.isResolved !== undefined) dom.supIsResolved.value = draft.isResolved;
    if (dom.supNeedManagementIntervention && draft.needManagementIntervention !== undefined) dom.supNeedManagementIntervention.value = draft.needManagementIntervention;
    if (dom.supSatisfactionRating && draft.satisfactionRating !== undefined) dom.supSatisfactionRating.value = draft.satisfactionRating;
    if (dom.supLabIssues && draft.labIssues !== undefined) dom.supLabIssues.value = draft.labIssues;
    if (dom.supLabStatus && draft.labStatus !== undefined) dom.supLabStatus.value = draft.labStatus;
    if (dom.supUrgentAttention && draft.urgentAttention !== undefined) dom.supUrgentAttention.value = draft.urgentAttention;
    if (dom.supNextWeekPriorities && draft.nextWeekPriorities !== undefined) dom.supNextWeekPriorities.value = draft.nextWeekPriorities;
  } catch (err) {
    console.error('Error restoring draft:', err);
  }
}

export function renderSupervisorsView() {
  const isOpsManager = state.session?.role === 'admin' || state.session?.role === 'ops_manager';

  // Determine allowed schools for the active session
  let assignedSchools = [...(state.db?.schools || [])];
  if (!isOpsManager) {
    assignedSchools = assignedSchools.filter(s => isSchoolAssignedToSupervisor(s, state.session, state.db?.employees, state.db?.users));
  }

  // Handle No Schools Assigned state for supervisor
  const noSchoolsAlert = dom.supNoSchoolsAlert || document.getElementById('supNoSchoolsAlert');
  if (noSchoolsAlert) {
    if (!isOpsManager && assignedSchools.length === 0) {
      noSchoolsAlert.classList.remove('d-none');
    } else {
      noSchoolsAlert.classList.add('d-none');
    }
  }

  // Populate school select options in the report form
  if (dom.supReportSchool) {
    const currentVal = dom.supReportSchool.value;
    if (assignedSchools.length === 0) {
      dom.supReportSchool.innerHTML = '<option value="">No Assigned Schools Found</option>';
      dom.supReportSchool.disabled = true;
      if (dom.supSubmitBtn) dom.supSubmitBtn.disabled = true;
    } else {
      dom.supReportSchool.disabled = false;
      if (dom.supSubmitBtn) dom.supSubmitBtn.disabled = false;
      dom.supReportSchool.innerHTML = '<option value="">Select Assigned School...</option>' + 
        assignedSchools.map(s => `<option value="${s.id}">${s.name} (${s.code || s.location || 'Client'})</option>`).join('');
      
      if (currentVal && assignedSchools.some(s => s.id === currentVal)) {
        dom.supReportSchool.value = currentVal;
      } else if (!isOpsManager && assignedSchools.length === 1) {
        dom.supReportSchool.value = assignedSchools[0].id;
      }
    }
  }

  // Populate filter dropdown in history table
  if (dom.supSchoolFilter) {
    const currentVal = dom.supSchoolFilter.value;
    dom.supSchoolFilter.innerHTML = '<option value="all">All Assigned Schools</option>' + 
      assignedSchools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (currentVal) dom.supSchoolFilter.value = currentVal;
  }

  const tableBody = dom.supReportsTableBody;
  if (!tableBody) return;

  const schoolFilter = dom.supSchoolFilter?.value || 'all';
  const query = dom.supReportSearch?.value.trim().toLowerCase() || '';

  let reports = [...(state.db?.reportsSupervisor || [])];

  if (!isOpsManager) {
    // Only show reports belonging to schools assigned to this supervisor
    const assignedSchoolIds = new Set(assignedSchools.map(s => s.id));
    const validSupIds = getSupervisorIdentifiers(state.session, state.db?.employees, state.db?.users);
    
    reports = reports.filter(r => 
      assignedSchoolIds.has(r.schoolId) || 
      validSupIds.includes(String(r.supervisorEmail || '').toLowerCase())
    );
  }

  if (schoolFilter !== 'all') {
    reports = reports.filter(r => r.schoolId === schoolFilter);
  }

  if (query) {
    reports = reports.filter(r => 
      [r.schoolName, r.deliveryNotes, r.schoolComplaint, r.urgentAttention, r.cbtIssues, r.supervisorEmail]
        .some(f => String(f || '').toLowerCase().includes(query))
    );
  }

  reports.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (reports.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No supervisor reports logged for your assigned schools.</td></tr>';
    return;
  }

  tableBody.innerHTML = reports.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>
        <div class="fw-semibold text-white">${r.schoolName}</div>
        <small class="text-muted">${r.supervisorEmail || 'Supervisor'}</small>
      </td>
      <td><span class="chip ${r.curriculumActual >= r.curriculumExpected ? 'chip-success' : 'chip-warning'}">${r.curriculumActual}% / ${r.curriculumExpected}%</span></td>
      <td><span class="chip chip-neutral">${r.lessonNoteCompliance}%</span></td>
      <td><span class="chip ${r.assessmentCompleted === 'Yes' ? 'chip-success' : 'chip-neutral'}">${r.cbtStatus}</span></td>
      <td>
        <div>★ ${r.satisfactionRating || 4}/5</div>
        ${r.urgentAttention ? '<span class="badge text-bg-danger">Urgent Attention</span>' : ''}
      </td>
      <td>
        <button class="btn btn-sm btn-soft me-1" data-action="view-sup-report" data-id="${r.id}">View Full</button>
        ${isOpsManager ? `<button class="btn btn-sm btn-outline-secondary" data-action="delete-sup-report" data-id="${r.id}">Delete</button>` : ''}
      </td>
    </tr>
  `).join('');
}

export function submitSupervisorReport(event, refreshAll) {
  event.preventDefault();
  const isOpsManager = state.session?.role === 'admin' || state.session?.role === 'ops_manager' || state.session?.actualRole === 'admin' || state.session?.actualRole === 'ops_manager';
  const schoolId = dom.supReportSchool?.value;
  if (!schoolId) {
    showToast('Please select a school to submit your report.', 'warning');
    return;
  }

  const school = (state.db?.schools || []).find(s => s.id === schoolId);
  if (!school) {
    showToast('Invalid school selected.', 'danger');
    return;
  }

  // Security check: Only the assigned supervisor (or Ops Manager) can report for the school
  if (!isOpsManager && !isSchoolAssignedToSupervisor(school, state.session, state.db?.employees, state.db?.users)) {
    showToast(`Access Denied: You are not assigned to ${school.name}. You can only submit reports for schools assigned to you.`, 'danger');
    return;
  }

  const id = dom.supervisorReportId?.value || `srep-${crypto.randomUUID()}`;
  const urgentText = dom.supUrgentAttention?.value.trim() || '';

  const report = {
    id,
    supervisorEmail: state.session?.email || 'supervisor@hlts.local',
    supervisorName: state.session?.name || 'Supervisor',
    schoolId,
    schoolName: school.name,
    date: todayISO(0),
    curriculumExpected: Number(dom.supCurriculumExpected.value),
    curriculumActual: Number(dom.supCurriculumActual.value),
    deliveryNotes: dom.supDeliveryNotes.value.trim(),
    lessonNoteCompliance: Number(dom.supLessonNoteCompliance.value),
    teachersRequiringFollowUp: dom.supTeachersFollowUp.value.trim(),
    assessmentConducted: dom.supAssessmentConducted.value,
    assessmentType: dom.supAssessmentType.value.trim(),
    assessmentCompleted: dom.supAssessmentCompleted.value,
    scoresSubmitted: dom.supScoresSubmitted.value,
    cbtStatus: dom.supCbtStatus.value,
    cbtIssues: dom.supCbtIssues.value.trim(),
    resultProgress: Number(dom.supResultProgress.value),
    teacherCompliance: Number(dom.supTeacherResultCompliance.value),
    schoolComplaint: dom.supSchoolComplaint.value.trim(),
    actionTaken: dom.supActionTaken.value.trim(),
    isResolved: dom.supIsResolved.value,
    needManagementIntervention: dom.supNeedManagementIntervention.value,
    satisfactionRating: Number(dom.supSatisfactionRating.value),
    labIssues: dom.supLabIssues.value.trim(),
    labStatus: dom.supLabStatus.value,
    urgentAttention: urgentText,
    nextWeekPriorities: dom.supNextWeekPriorities.value.trim(),
    createdAt: new Date().toISOString()
  };

  if (!state.db.reportsSupervisor) state.db.reportsSupervisor = [];
  const existingIdx = state.db.reportsSupervisor.findIndex(r => r.id === id);
  if (existingIdx >= 0) {
    state.db.reportsSupervisor[existingIdx] = report;
  } else {
    state.db.reportsSupervisor.push(report);
  }

  // Clear draft from localStorage for this school upon submission
  localStorage.removeItem(getSupDraftKey(schoolId));

  // Auto-escalate urgent issues to Management Issues for the Operations Manager
  if (urgentText || report.needManagementIntervention === 'Yes') {
    if (!state.db.managementIssues) state.db.managementIssues = [];
    state.db.managementIssues.push({
      id: `missue-${crypto.randomUUID()}`,
      date: todayISO(0),
      dept: 'supervisor',
      schoolId: schoolId,
      schoolName: school.name,
      reporter: state.session?.email || 'supervisor@hlts.local',
      summary: urgentText || `Academic escalation for ${school.name}: ${report.schoolComplaint || 'Management intervention requested by supervisor'}`,
      status: 'urgent',
      opsNotes: '',
      updatedAt: new Date().toISOString()
    });
  }

  saveDatabase();
  resetSupervisorReportForm();
  showToast(`Weekly academic report for ${school.name} submitted successfully.`, 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export function resetSupervisorReportForm() {
  if (dom.supervisorReportForm) dom.supervisorReportForm.reset();
  if (dom.supervisorReportId) dom.supervisorReportId.value = '';
  if (dom.supSatisfactionRating) dom.supSatisfactionRating.value = '4';
}

export function openReportDetailModal(type, id) {
  const modalEl = document.getElementById('reportDetailModal');
  const titleEl = document.getElementById('reportDetailModalTitle');
  const bodyEl = document.getElementById('reportDetailModalBody');
  if (!modalEl || !titleEl || !bodyEl) return;

  if (type === 'supervisor') {
    const rep = (state.db?.reportsSupervisor || []).find(r => r.id === id);
    if (!rep) return;
    titleEl.textContent = `Supervisor Report: ${rep.schoolName} (${formatDate(rep.date)})`;
    bodyEl.innerHTML = `
      <div class="report-detail-section">
        <h5>A. Curriculum & Lesson Delivery</h5>
        <div class="row g-3">
          <div class="col-md-6"><strong>Expected Pace:</strong> ${rep.curriculumExpected}%</div>
          <div class="col-md-6"><strong>Actual Pace:</strong> ${rep.curriculumActual}%</div>
          <div class="col-12 text-muted"><strong>Delivery Remarks:</strong> ${rep.deliveryNotes || 'None'}</div>
        </div>
      </div>
      <div class="report-detail-section">
        <h5>B. Lesson Notes & Teachers</h5>
        <div class="row g-3">
          <div class="col-md-6"><strong>Compliance:</strong> ${rep.lessonNoteCompliance}%</div>
          <div class="col-md-6"><strong>Follow-Up Needed:</strong> ${rep.teachersRequiringFollowUp || 'None'}</div>
        </div>
      </div>
      <div class="report-detail-section">
        <h5>C. CBT & Examination</h5>
        <div class="row g-3">
          <div class="col-md-4"><strong>Conducted:</strong> ${rep.assessmentConducted} (${rep.assessmentType || 'N/A'})</div>
          <div class="col-md-4"><strong>Completed:</strong> ${rep.assessmentCompleted}</div>
          <div class="col-md-4"><strong>Scores Submitted:</strong> ${rep.scoresSubmitted}</div>
          <div class="col-md-6"><strong>CBT Status:</strong> ${rep.cbtStatus}</div>
          <div class="col-md-6"><strong>Issues:</strong> ${rep.cbtIssues || 'None'}</div>
        </div>
      </div>
      <div class="report-detail-section">
        <h5>D. Result Management & Feedback</h5>
        <div class="row g-3">
          <div class="col-md-6"><strong>Result Progress:</strong> ${rep.resultProgress}%</div>
          <div class="col-md-6"><strong>Teacher Compliance:</strong> ${rep.teacherCompliance}%</div>
          <div class="col-12"><strong>Complaint:</strong> ${rep.schoolComplaint || 'None'}</div>
          <div class="col-12"><strong>Action Taken:</strong> ${rep.actionTaken || 'None'} (${rep.isResolved})</div>
          <div class="col-md-6"><strong>Satisfaction:</strong> ★ ${rep.satisfactionRating || 4}/5</div>
          <div class="col-md-6"><strong>Management Intervention:</strong> ${rep.needManagementIntervention}</div>
        </div>
      </div>
      <div class="report-detail-section">
        <h5>E. Lab Status & Urgent Matters</h5>
        <div class="row g-3">
          <div class="col-md-6"><strong>Lab Issues:</strong> ${rep.labIssues || 'None'}</div>
          <div class="col-md-6"><strong>Lab Status:</strong> ${rep.labStatus}</div>
          <div class="col-12 text-danger"><strong>Urgent Attention:</strong> ${rep.urgentAttention || 'None'}</div>
          <div class="col-12"><strong>Next Week Priorities:</strong> ${rep.nextWeekPriorities || 'None'}</div>
        </div>
      </div>
    `;
  }

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}
