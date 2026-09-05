export const dom = {};

export function cacheDom() {
  const ids = {
    authShell: 'authShell', appShell: 'appShell', loginForm: 'loginForm', email: 'email', password: 'password',
    sidebar: 'sidebarPanel', mobileMenuBtn: 'mobileMenuBtn', logoutBtn: 'logoutBtn',
    liveClock: 'liveClock', sessionUserName: 'sessionUserName', sessionUserRole: 'sessionUserRole', pageTitle: 'pageTitle',
    demoRoleSwitcher: 'demoRoleSwitcher', singleRoleBadge: 'singleRoleBadge', sidebarIssuesBadge: 'sidebarIssuesBadge',
    sidebarAvatarDisplay: 'sidebarAvatarDisplay', topbarAvatarDisplay: 'topbarAvatarDisplay',
    orgHealthCard: 'orgHealthCard', presentTodayCard: 'presentTodayCard', curriculumPaceCard: 'curriculumPaceCard', activeDevProjectsCard: 'activeDevProjectsCard', urgentAlertsCard: 'urgentAlertsCard',
    dashboardIssuesContainer: 'dashboardIssuesContainer', dashboardQueriesTableBody: 'dashboardQueriesTableBody',
    // Management issues
    issueStatusFilter: 'issueStatusFilter', issueDeptFilter: 'issueDeptFilter', managementIssuesList: 'managementIssuesList',
    modalIssueId: 'modalIssueId', modalIssueSummary: 'modalIssueSummary', modalIssueStatus: 'modalIssueStatus', modalIssueNotes: 'modalIssueNotes', modalSaveIssueBtn: 'modalSaveIssueBtn',
    // Supervisors
    supervisorReportForm: 'supervisorReportForm', supervisorReportId: 'supervisorReportId', supervisorReportFormTitle: 'supervisorReportFormTitle',
    supReportSchool: 'supReportSchool', supCurriculumExpected: 'supCurriculumExpected', supCurriculumActual: 'supCurriculumActual', supDeliveryNotes: 'supDeliveryNotes',
    supLessonNoteCompliance: 'supLessonNoteCompliance', supTeachersFollowUp: 'supTeachersFollowUp',
    supAssessmentConducted: 'supAssessmentConducted', supAssessmentType: 'supAssessmentType', supAssessmentCompleted: 'supAssessmentCompleted', supScoresSubmitted: 'supScoresSubmitted', supCbtStatus: 'supCbtStatus', supCbtIssues: 'supCbtIssues',
    supResultProgress: 'supResultProgress', supTeacherResultCompliance: 'supTeacherResultCompliance',
    supSchoolComplaint: 'supSchoolComplaint', supActionTaken: 'supActionTaken', supIsResolved: 'supIsResolved', supNeedManagementIntervention: 'supNeedManagementIntervention', supSatisfactionRating: 'supSatisfactionRating',
    supLabIssues: 'supLabIssues', supLabStatus: 'supLabStatus', supUrgentAttention: 'supUrgentAttention', supNextWeekPriorities: 'supNextWeekPriorities',
    supSubmitBtn: 'supSubmitBtn', supResetBtn: 'supResetBtn', supSchoolFilter: 'supSchoolFilter', supReportSearch: 'supReportSearch', supReportsTableBody: 'supReportsTableBody',
    supNoSchoolsAlert: 'supNoSchoolsAlert',
    // Developers
    devReportForm: 'devReportForm', devReportId: 'devReportId', devReportFormTitle: 'devReportFormTitle',
    devProjectsBuilder: 'devProjectsBuilder', devAddProjectBtn: 'devAddProjectBtn', devWorkCompleted: 'devWorkCompleted',
    devMaintType: 'devMaintType', devMaintTarget: 'devMaintTarget', devMaintDetails: 'devMaintDetails', devSupportRequired: 'devSupportRequired',
    devSubmitBtn: 'devSubmitBtn', devResetBtn: 'devResetBtn', devReportSearch: 'devReportSearch', devReportsTableBody: 'devReportsTableBody', devProjectsDirectoryTableBody: 'devProjectsDirectoryTableBody',
    // Welfare / HR
    welfareReportForm: 'welfareReportForm', welfareReportId: 'welfareReportId', welfareReportFormTitle: 'welfareReportFormTitle',
    welfareStaffRosterBuilder: 'welfareStaffRosterBuilder', qaType: 'qaType', qaEmployee: 'qaEmployee', qaSubject: 'qaSubject', qaDetails: 'qaDetails', welfareGeneralNotes: 'welfareGeneralNotes',
    welfareSubmitBtn: 'welfareSubmitBtn', welfareResetBtn: 'welfareResetBtn', qaFilter: 'qaFilter', qaTableBody: 'qaTableBody', welfareReportsTableBody: 'welfareReportsTableBody',
    // Schools
    schoolForm: 'schoolForm', schoolId: 'schoolId', schoolFormTitle: 'schoolFormTitle', schoolName: 'schoolName', schoolCode: 'schoolCode', schoolLocation: 'schoolLocation',
    schoolContactPerson: 'schoolContactPerson', schoolContactPhone: 'schoolContactPhone', schoolSupervisor: 'schoolSupervisor',
    schoolSubmitBtn: 'schoolSubmitBtn', schoolResetBtn: 'schoolResetBtn', schoolSearch: 'schoolSearch', schoolsTableBody: 'schoolsTableBody',
    schoolFormCol: 'schoolFormCol', schoolsTableCol: 'schoolsTableCol', schoolsRegistryTitle: 'schoolsRegistryTitle', schoolsRegistrySubtitle: 'schoolsRegistrySubtitle',
    // Core HR
    employeeForm: 'employeeForm', employeeId: 'employeeId', employeeRole: 'employeeRole',
    employeeName: 'employeeName', employeeEmail: 'employeeEmail', employeeSalary: 'employeeSalary',
    employeeFormTitle: 'employeeFormTitle', employeeSubmitBtn: 'employeeSubmitBtn', employeeResetBtn: 'employeeResetBtn',
    employeeAvatarFile: 'employeeAvatarFile', employeeAvatarData: 'employeeAvatarData', employeeFormAvatarPreview: 'employeeFormAvatarPreview',
    employeeSearch: 'employeeSearch', employeeTableBody: 'employeeTableBody', attendanceForm: 'attendanceForm', attendanceEmployee: 'attendanceEmployee',
    attendanceDate: 'attendanceDate', attendanceStatus: 'attendanceStatus', attendancePermission: 'attendancePermission', attendanceTimeIn: 'attendanceTimeIn',
    attendanceTimeOut: 'attendanceTimeOut', attendanceId: 'attendanceId', attendanceFormTitle: 'attendanceFormTitle', attendanceSubmitBtn: 'attendanceSubmitBtn', attendanceResetBtn: 'attendanceResetBtn', attendanceSearch: 'attendanceSearch', attendanceTableBody: 'attendanceTableBody',
    attendanceStatusCol: 'attendanceStatusCol', attendancePermissionCol: 'attendancePermissionCol', attendanceTimeRow: 'attendanceTimeRow', attendanceQuickSignRow: 'attendanceQuickSignRow', attendanceFormSignInBtn: 'attendanceFormSignInBtn', attendanceFormSignOutBtn: 'attendanceFormSignOutBtn', attendanceLockControlGroup: 'attendanceLockControlGroup', attendanceSaveResetRow: 'attendanceSaveResetRow', attendanceFormCol: 'attendanceFormCol', attendanceTableCol: 'attendanceTableCol',
    taskForm: 'taskForm',
    taskId: 'taskId', taskEmployee: 'taskEmployee', taskTitle: 'taskTitle', taskDescription: 'taskDescription', taskDeadline: 'taskDeadline',
    taskProgress: 'taskProgress', taskPermission: 'taskPermission', taskFormTitle: 'taskFormTitle', taskSearch: 'taskSearch', taskTableBody: 'taskTableBody', taskResetBtn: 'taskResetBtn',
    incomeForm: 'incomeForm', incomeType: 'incomeType', incomeCategory: 'incomeCategory', incomeAmount: 'incomeAmount',
    incomeDate: 'incomeDate', incomeDescription: 'incomeDescription', incomeTableBody: 'incomeTableBody', revenueMetric: 'revenueMetric', expensesMetric: 'expensesMetric',
    profitMetric: 'profitMetric', financeRangeFilter: 'financeRangeFilter',
    payrollAdjustmentForm: 'payrollAdjustmentForm', payrollAdjustmentId: 'payrollAdjustmentId', payrollAdjustmentFormTitle: 'payrollAdjustmentFormTitle', payrollAdjustmentSubmitBtn: 'payrollAdjustmentSubmitBtn', payrollAdjustmentEmployee: 'payrollAdjustmentEmployee', payrollAdjustmentType: 'payrollAdjustmentType', payrollAdjustmentAmount: 'payrollAdjustmentAmount', payrollAdjustmentDate: 'payrollAdjustmentDate', payrollAdjustmentNotes: 'payrollAdjustmentNotes', payrollAdjustmentResetBtn: 'payrollAdjustmentResetBtn', payrollAdjustmentSearch: 'payrollAdjustmentSearch', payrollAdjustmentTableBody: 'payrollAdjustmentTableBody', payrollDeductionsMetric: 'payrollDeductionsMetric', payrollLoansMetric: 'payrollLoansMetric', payrollAdvancesMetric: 'payrollAdvancesMetric', payrollBonusesMetric: 'payrollBonusesMetric', payrollPeriodFilter: 'payrollPeriodFilter', payrollPeriodLabel: 'payrollPeriodLabel', payrollSummaryTableBody: 'payrollSummaryTableBody', budgetForm: 'budgetForm', salaryBudget: 'salaryBudget',
    batchPayrollPaidBtn: 'batchPayrollPaidBtn',
    operationsBudget: 'operationsBudget', budgetSalaryValue: 'budgetSalaryValue', budgetOperationsValue: 'budgetOperationsValue', budgetSalaryActual: 'budgetSalaryActual',
    budgetOperationsActual: 'budgetOperationsActual', budgetSalaryStatus: 'budgetSalaryStatus', budgetOperationsStatus: 'budgetOperationsStatus', budgetAlerts: 'budgetAlerts',
    staffPortalStatus: 'staffPortalStatus', staffAttendanceSummary: 'staffAttendanceSummary', staffAttendanceDetail: 'staffAttendanceDetail', staffSalaryTopMetric: 'staffSalaryTopMetric', staffSalaryValue: 'staffSalaryValue', staffActualSalaryValue: 'staffActualSalaryValue', staffSalaryPeriodLabel: 'staffSalaryPeriodLabel', staffSalaryStatus: 'staffSalaryStatus', staffTasksBody: 'staffTasksBody', staffDeductionsBody: 'staffDeductionsBody', staffDailyAttendanceBody: 'staffDailyAttendanceBody', staffColleaguesBody: 'staffColleaguesBody', staffCheckInBtn: 'staffCheckInBtn', staffCheckOutBtn: 'staffCheckOutBtn', staffInactiveState: 'staffInactiveState', staffActiveContent: 'staffActiveContent', staffAttendanceLockStatus: 'staffAttendanceLockStatus', adminAttendanceLockStatus: 'adminAttendanceLockStatus', attendanceLockBtn: 'attendanceLockBtn', employeeCredentialBox: 'employeeCredentialBox',
    staffPortalAvatar: 'staffPortalAvatar', staffAvatarInput: 'staffAvatarInput', staffProfileName: 'staffProfileName', staffProfileBadge: 'staffProfileBadge', staffProfileSubtitle: 'staffProfileSubtitle', staffPrintPaySlipBtn: 'staffPrintPaySlipBtn', staffPaySlipModalBody: 'staffPaySlipModalBody',
    exportFullJsonBtn: 'exportFullJsonBtn', exportPayrollCsvBtn: 'exportPayrollCsvBtn', exportAttendanceCsvBtn: 'exportAttendanceCsvBtn', exportSupervisorsCsvBtn: 'exportSupervisorsCsvBtn',
    attendanceDateFilter: 'attendanceDateFilter', taskStatusFilter: 'taskStatusFilter', payrollAdjDateFilter: 'payrollAdjDateFilter',
    toastContainer: 'toastContainer',
    taskCountdownGrid: 'taskCountdownGrid',
    staffTaskCountdownGrid: 'staffTaskCountdownGrid',
    // Loading Screen
    appLoadingOverlay: 'appLoadingOverlay',
    loadingStatusText: 'loadingStatusText',
    loadingProgressFill: 'loadingProgressFill',
    loadingPctText: 'loadingPctText',
    loadingSubtext: 'loadingSubtext'
  };

  Object.entries(ids).forEach(([key, id]) => {
    dom[key] = document.getElementById(id);
  });
}
