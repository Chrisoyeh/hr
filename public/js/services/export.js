import { state, getSelectedPayrollPeriodKey, getEmployeeName } from '../state.js';
import { todayISO, showToast } from '../utils.js';

export function downloadFile(content, fileName, contentType) {
  const a = document.createElement('a');
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportFullSystemJson() {
  const jsonStr = JSON.stringify(state.db, null, 2);
  const dateStr = todayISO(0);
  downloadFile(jsonStr, `HLTS_HR_Backup_${dateStr}.json`, 'application/json');
  showToast('Full system JSON backup exported successfully.', 'success');
}

export function importFullSystemJson(file, onComplete) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file provided'));
    const role = state.session?.role;
    const actualRole = state.session?.actualRole;
    const isAuthorized = !state.session ||
      ['admin', 'ops_manager', 'ceo', 'finance_officer'].includes(role) ||
      ['admin', 'ops_manager', 'ceo', 'finance_officer'].includes(actualRole) ||
      ['ch4oyeh@gmail.com', 'admin@hr.local', 'finance.officer@hlts.local'].includes(state.session?.email);

    if (!isAuthorized) {
      showToast('Permission denied: Only Executive Management or Operations can restore backups.', 'danger');
      return reject(new Error('Permission denied'));
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = JSON.parse(e.target.result);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new Error('Invalid JSON backup format: Root structure must be a database object.');
        }

        const { prepareDatabase, saveDatabase } = await import('./firestore.js');
        const prepared = await prepareDatabase(raw);
        state.db = prepared;
        await saveDatabase(state.db);

        showToast('System backup restored successfully! Database updated across cloud & local storage.', 'success');
        if (typeof onComplete === 'function') onComplete();
        resolve(prepared);
      } catch (err) {
        console.error('Failed to import JSON backup:', err);
        showToast(`Restore failed: ${err.message || 'Invalid JSON file'}`, 'danger');
        reject(err);
      }
    };
    reader.onerror = () => {
      const err = new Error('Error reading backup file.');
      showToast(err.message, 'danger');
      reject(err);
    };
    reader.readAsText(file);
  });
}

export function exportPayrollCsv(getEmployeeDeductions, getPayrollPayment) {
  const periodKey = getSelectedPayrollPeriodKey();
  const headers = ['Employee ID', 'Full Name', 'Department', 'Position', 'Base Salary', 'Bonuses', 'Loans & Advances', 'Deductions', 'Net Salary', 'Status'];
  const rows = (state.db?.employees || []).map(emp => {
    const p = typeof getEmployeeDeductions === 'function' ? getEmployeeDeductions(emp.id, periodKey) : { originalSalary: emp.salary, bonus: 0, loanAndAdvance: 0, otherDeductions: 0, finalSalary: emp.salary };
    const pay = typeof getPayrollPayment === 'function' ? getPayrollPayment(emp.id, periodKey) : null;
    return [
      `"${emp.id}"`,
      `"${(emp.fullName || '').replace(/"/g, '""')}"`,
      `"${(emp.department || '').replace(/"/g, '""')}"`,
      `"${(emp.position || '').replace(/"/g, '""')}"`,
      p.originalSalary,
      p.bonus,
      p.loanAndAdvance,
      p.otherDeductions,
      p.finalSalary,
      `"${pay?.paid ? 'Paid' : 'Pending'}"`
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `HLTS_Payroll_${periodKey}.csv`, 'text/csv');
  showToast('Payroll CSV exported.', 'success');
}

export function exportAttendanceCsv(isLate, getAttendancePenalty) {
  const headers = ['Date', 'Employee ID', 'Employee Name', 'Status', 'Time In', 'Time Out', 'Late', 'Permission', 'Penalty (NGN)'];
  const rows = [...(state.db?.attendance || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(entry => {
    const late = typeof isLate === 'function' ? isLate(entry) : false;
    const penalty = typeof getAttendancePenalty === 'function' ? getAttendancePenalty(entry) : 0;
    return [
      `"${entry.date}"`,
      `"${entry.employeeId}"`,
      `"${getEmployeeName(entry.employeeId).replace(/"/g, '""')}"`,
      `"${entry.status}"`,
      `"${entry.timeIn || ''}"`,
      `"${entry.timeOut || ''}"`,
      `"${late ? 'Yes' : 'No'}"`,
      `"${entry.permission ? 'Yes' : 'No'}"`,
      penalty
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `HLTS_Attendance_${todayISO(0)}.csv`, 'text/csv');
  showToast('Attendance CSV exported.', 'success');
}

export function exportSupervisorsCsv() {
  const headers = ['Date', 'School', 'Supervisor', 'Expected %', 'Actual %', 'Lesson Note %', 'CBT Done', 'Scores Submitted', 'CBT Status', 'Satisfaction Rating (1-5)', 'Complaints', 'Urgent Attention'];
  const rows = [...(state.db?.reportsSupervisor || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(r => {
    return [
      `"${r.date}"`,
      `"${(r.schoolName || '').replace(/"/g, '""')}"`,
      `"${r.supervisorEmail || ''}"`,
      r.curriculumExpected || 0,
      r.curriculumActual || 0,
      r.lessonNoteCompliance || 0,
      `"${r.assessmentConducted || 'No'}"`,
      `"${r.scoresSubmitted || 'No'}"`,
      `"${r.cbtStatus || 'Stable'}"`,
      r.satisfactionRating || 4,
      `"${(r.schoolComplaint || '').replace(/"/g, '""')}"`,
      `"${(r.urgentAttention || '').replace(/"/g, '""')}"`
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `HLTS_Supervisor_Reports_${todayISO(0)}.csv`, 'text/csv');
  showToast('Supervisor reports CSV exported.', 'success');
}

export function exportFinanceLedgerCsv() {
  const headers = ['Txn Ref', 'Date', 'Type', 'Category', 'Department', 'Amount (NGN)', 'Payment Method', 'Status', 'Reference / Invoice No', 'Payee / Payer', 'Description'];
  const txns = [...(state.db?.financeTransactions || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  
  const rows = txns.map(t => [
    `"${t.txnRef || ''}"`,
    `"${t.date || ''}"`,
    `"${t.type || 'Expense'}"`,
    `"${(t.category || '').replace(/"/g, '""')}"`,
    `"${(t.department || 'General').replace(/"/g, '""')}"`,
    Number(t.amount || 0),
    `"${(t.paymentMethod || 'Bank Transfer').replace(/"/g, '""')}"`,
    `"${(t.status || 'Completed').replace(/"/g, '""')}"`,
    `"${(t.referenceNo || '').replace(/"/g, '""')}"`,
    `"${(t.payeePayer || '').replace(/"/g, '""')}"`,
    `"${(t.description || '').replace(/"/g, '""')}"`
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `HLTS_General_Ledger_${todayISO(0)}.csv`, 'text/csv');
  showToast('Finance General Ledger CSV exported.', 'success');
}

export function exportInvoicesCsv() {
  const headers = ['Invoice Number', 'Client School', 'Issue Date', 'Due Date', 'Amount (NGN)', 'Status', 'Description'];
  const invoices = [...(state.db?.clientInvoices || [])].sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)));

  const rows = invoices.map(i => [
    `"${i.invoiceNumber || ''}"`,
    `"${(i.schoolName || '').replace(/"/g, '""')}"`,
    `"${i.issueDate || ''}"`,
    `"${i.dueDate || ''}"`,
    Number(i.amount || 0),
    `"${(i.status || 'Sent').replace(/"/g, '""')}"`,
    `"${(i.description || '').replace(/"/g, '""')}"`
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `HLTS_Client_Invoices_${todayISO(0)}.csv`, 'text/csv');
  showToast('Client Invoices CSV exported.', 'success');
}

