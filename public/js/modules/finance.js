import { dom } from './dom.js';
import { state, generateTransactionRef } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { todayISO, formatDate, formatCurrency, showToast, debounce } from '../utils.js';

export function renderFinance() {
  const range = dom.financeRangeFilter?.value || 'monthly';
  const deptFilter = dom.financeDeptFilter?.value || 'all';
  const typeFilter = dom.financeTypeFilter?.value || 'all';
  const search = (dom.financeSearch?.value || '').toLowerCase().trim();

  const summary = buildFinanceSummary(range, deptFilter, typeFilter, search);

  // Render Table Rows
  const incomeTable = document.getElementById('incomeTableBody') || dom.incomeTableBody;
  if (incomeTable) {
    incomeTable.innerHTML = summary.rows || '<tr><td colspan="8" class="text-center text-muted py-4">No finance records matching filter criteria.</td></tr>';
  }

  // Render Executive P&L Metrics
  if (dom.revenueMetric) dom.revenueMetric.textContent = formatCurrency(summary.revenue);
  if (dom.expensesMetric) dom.expensesMetric.textContent = formatCurrency(summary.expenses);
  const netProfit = summary.revenue - summary.expenses;
  if (dom.profitMetric) {
    dom.profitMetric.textContent = formatCurrency(netProfit);
    dom.profitMetric.className = netProfit >= 0 ? 'text-success' : 'text-danger';
  }
  if (dom.financeMarginMetric) {
    const margin = summary.revenue > 0 ? Math.round((netProfit / summary.revenue) * 100) : 0;
    dom.financeMarginMetric.textContent = `${margin}%`;
    dom.financeMarginMetric.className = margin >= 0 ? 'text-success' : 'text-danger';
  }
  if (dom.pendingTxnsMetric) {
    dom.pendingTxnsMetric.textContent = formatCurrency(summary.pendingAmount);
  }

  // Render or Update Dynamic Financial Charts
  renderFinancialCharts();
}

export function getAllTransactions() {
  return [...(state.db?.financeTransactions || [])];
}

export function buildFinanceSummary(range = 'monthly', deptFilter = 'all', typeFilter = 'all', search = '') {
  const now = new Date();
  let list = getAllTransactions();

  // Range Filtering
  if (range === 'monthly') {
    const key = now.toISOString().slice(0, 7);
    list = list.filter((t) => String(t.date || '').startsWith(key));
  } else if (range === 'lastMonth') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const key = prev.toISOString().slice(0, 7);
    list = list.filter((t) => String(t.date || '').startsWith(key));
  } else if (range === 'quarterly') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 2, 1);
    list = list.filter((t) => new Date(t.date || '') >= start);
  } else if (range === 'fourMonths') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 3, 1);
    list = list.filter((t) => new Date(t.date || '') >= start);
  } else if (range === 'yearly') {
    const year = now.getFullYear();
    list = list.filter((t) => new Date(t.date || '').getFullYear() === year);
  }

  // Department & Type Filtering
  if (deptFilter !== 'all') {
    list = list.filter((t) => (t.department || 'General').toLowerCase() === deptFilter.toLowerCase());
  }
  if (typeFilter !== 'all') {
    list = list.filter((t) => (t.type || 'Expense').toLowerCase() === typeFilter.toLowerCase());
  }

  // Search Filter
  if (search) {
    list = list.filter((t) =>
      (t.txnRef || '').toLowerCase().includes(search) ||
      (t.category || '').toLowerCase().includes(search) ||
      (t.description || '').toLowerCase().includes(search) ||
      (t.payeePayer || '').toLowerCase().includes(search) ||
      (t.referenceNo || '').toLowerCase().includes(search)
    );
  }

  const revenue = list
    .filter((t) => t.type === 'Revenue' && t.status !== 'Cancelled')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const expenses = list
    .filter((t) => t.type === 'Expense' && t.status !== 'Cancelled')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const pendingAmount = list
    .filter((t) => t.status === 'Pending')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const rows = list
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
    .map((entry) => {
      let typeChip = 'chip-success';
      if (entry.type === 'Expense') typeChip = 'chip-danger';

      let statusChip = 'badge text-bg-success';
      if (entry.status === 'Pending') statusChip = 'badge text-bg-warning';
      if (entry.status === 'Cancelled') statusChip = 'badge text-bg-secondary';

      return `
        <tr>
          <td><strong class="text-primary font-monospace small">${entry.txnRef || 'TXN-—'}</strong></td>
          <td>${formatDate(entry.date)}</td>
          <td><span class="chip ${typeChip}">${entry.type}</span></td>
          <td>
            <div class="fw-semibold">${entry.category}</div>
            <small class="text-muted">${entry.department || 'General'} Dept</small>
          </td>
          <td>
            <div class="text-truncate" style="max-width: 220px;" title="${entry.description || ''}">${entry.description || '—'}</div>
            ${entry.payeePayer ? `<small class="text-info">${entry.payeePayer}</small>` : ''}
          </td>
          <td><span class="${statusChip}">${entry.status || 'Completed'}</span></td>
          <td class="text-end fw-bold ${entry.type === 'Revenue' ? 'text-success' : 'text-light'}">${formatCurrency(entry.amount)}</td>
          <td class="text-end">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-info" data-action="view-txn-detail" data-id="${entry.id}" title="View Details"><i class="bi bi-eye"></i></button>
              <button class="btn btn-outline-secondary" data-action="edit-income" data-id="${entry.id}" title="Edit"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-danger" data-action="delete-income" data-id="${entry.id}" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
          </td>
        </tr>`;
    }).join('');

  return { rows, revenue, expenses, pendingAmount, filteredList: list };
}

export async function submitIncome(event, refreshAll) {
  event.preventDefault();
  const isAuthorized = state.session?.role === 'ceo' || state.session?.actualRole === 'ceo';
  if (!isAuthorized) {
    showToast('Permission denied: Only Executive Management (CEO) has access to manage financial records.', 'danger');
    return;
  }
  if (!state.db.financeTransactions) state.db.financeTransactions = [];

  const txnId = dom.incomeId?.value;
  const type = dom.incomeType?.value || 'Revenue';
  const category = dom.incomeCategory?.value?.trim() || 'General';
  const department = dom.incomeDepartment?.value || 'General';
  const amount = Number(dom.incomeAmount?.value || 0);
  const date = dom.incomeDate?.value || todayISO(0);
  const paymentMethod = dom.incomePaymentMethod?.value || 'Bank Transfer';
  const status = dom.incomeStatus?.value || 'Completed';
  const referenceNo = dom.incomeReferenceNo?.value?.trim() || '';
  const payeePayer = dom.incomePayeePayer?.value?.trim() || '';
  const description = dom.incomeDescription?.value?.trim() || '';

  if (txnId) {
    // Update existing transaction
    const idx = state.db.financeTransactions.findIndex(t => t.id === txnId);
    if (idx >= 0) {
      state.db.financeTransactions[idx] = {
        ...state.db.financeTransactions[idx],
        type,
        category,
        department,
        amount,
        date,
        paymentMethod,
        status,
        referenceNo,
        payeePayer,
        description,
        updatedAt: new Date().toISOString()
      };
      showToast('Transaction record updated.', 'success');
    }
  } else {
    // Create new transaction
    const newTxn = {
      id: crypto.randomUUID(),
      txnRef: generateTransactionRef(),
      type,
      category,
      department,
      amount,
      date,
      paymentMethod,
      status,
      referenceNo,
      payeePayer,
      description,
      createdAt: new Date().toISOString(),
      createdBy: state.session?.email || 'admin'
    };
    state.db.financeTransactions.push(newTxn);
    showToast(`Transaction ${newTxn.txnRef} recorded successfully.`, 'success');
  }

  // Also sync legacy state.db.income for any older dependencies
  state.db.income = state.db.financeTransactions.map(t => ({
    id: t.id,
    type: t.type,
    category: t.category,
    amount: t.amount,
    date: t.date,
    description: t.description
  }));

  await saveDatabase();
  resetIncomeForm();
  if (typeof refreshAll === 'function') refreshAll();
}

export function resetIncomeForm() {
  if (dom.incomeForm) dom.incomeForm.reset();
  if (dom.incomeId) dom.incomeId.value = '';
  if (dom.incomeType) dom.incomeType.value = 'Revenue';
  if (dom.incomeDate) dom.incomeDate.value = todayISO(0);
  if (dom.incomeDepartment) dom.incomeDepartment.value = 'General';
  if (dom.incomePaymentMethod) dom.incomePaymentMethod.value = 'Bank Transfer';
  if (dom.incomeStatus) dom.incomeStatus.value = 'Completed';
  if (dom.incomeFormTitle) dom.incomeFormTitle.textContent = 'Record Financial Transaction';
  if (dom.incomeSubmitBtn) dom.incomeSubmitBtn.textContent = 'Save Record';
}

export async function deleteIncome(id, refreshAll) {
  const isAuthorized = ['ceo', 'finance_officer'].includes(state.session?.role) || ['ceo', 'finance_officer'].includes(state.session?.actualRole);
  if (!isAuthorized) {
    showToast('Permission denied: Only Executive Management or Financial Officer can delete transactions.', 'danger');
    return;
  }

  if (!confirm('Are you sure you want to delete this financial record?')) return;
  state.db.financeTransactions = (state.db?.financeTransactions || []).filter(t => t.id !== id);
  state.db.income = (state.db?.income || []).filter(t => t.id !== id);
  await saveDatabase();
  showToast('Transaction record removed.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export function editIncome(id) {
  const txn = (state.db?.financeTransactions || []).find(t => t.id === id);
  if (!txn) return;

  if (dom.incomeId) dom.incomeId.value = txn.id;
  if (dom.incomeType) dom.incomeType.value = txn.type;
  if (dom.incomeCategory) dom.incomeCategory.value = txn.category;
  if (dom.incomeDepartment) dom.incomeDepartment.value = txn.department || 'General';
  if (dom.incomeAmount) dom.incomeAmount.value = txn.amount;
  if (dom.incomeDate) dom.incomeDate.value = txn.date || todayISO(0);
  if (dom.incomePaymentMethod) dom.incomePaymentMethod.value = txn.paymentMethod || 'Bank Transfer';
  if (dom.incomeStatus) dom.incomeStatus.value = txn.status || 'Completed';
  if (dom.incomeReferenceNo) dom.incomeReferenceNo.value = txn.referenceNo || '';
  if (dom.incomePayeePayer) dom.incomePayeePayer.value = txn.payeePayer || '';
  if (dom.incomeDescription) dom.incomeDescription.value = txn.description || '';

  if (dom.incomeFormTitle) dom.incomeFormTitle.textContent = `Edit Transaction (${txn.txnRef || ''})`;
  if (dom.incomeSubmitBtn) dom.incomeSubmitBtn.textContent = 'Update Record';

  if (dom.incomeForm) {
    dom.incomeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function openTransactionDetailModal(id) {
  const txn = (state.db?.financeTransactions || []).find(t => t.id === id);
  if (!txn) return;

  let modalEl = document.getElementById('financeDetailModal');
  if (!modalEl) {
    const div = document.createElement('div');
    div.id = 'financeDetailModal';
    div.className = 'modal fade';
    div.tabIndex = -1;
    div.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-secondary shadow-lg">
          <div class="modal-header">
            <h5 class="modal-title" id="financeModalTitle">Transaction Details</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="financeModalBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    modalEl = div;
  }

  const body = document.getElementById('financeModalBody');
  const title = document.getElementById('financeModalTitle');
  if (title) title.innerHTML = `<i class="bi bi-file-earmark-spreadsheet me-2 text-info"></i>Transaction: <span class="font-monospace">${txn.txnRef || txn.id.slice(0, 8)}</span>`;

  body.innerHTML = `
    <div class="p-2">
      <div class="row g-3">
        <div class="col-6">
          <small class="text-muted d-block">Transaction Type</small>
          <span class="badge ${txn.type === 'Revenue' ? 'text-bg-success' : 'text-bg-danger'}">${txn.type}</span>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Status</small>
          <span class="badge ${txn.status === 'Completed' ? 'text-bg-success' : 'text-bg-warning'}">${txn.status || 'Completed'}</span>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Amount</small>
          <div class="h5 fw-bold ${txn.type === 'Revenue' ? 'text-success' : 'text-danger'} mb-0">${formatCurrency(txn.amount)}</div>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Date</small>
          <div class="fw-semibold">${formatDate(txn.date)}</div>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Category</small>
          <div class="fw-semibold">${txn.category}</div>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Department</small>
          <div class="fw-semibold">${txn.department || 'General'}</div>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Payee / Payer</small>
          <div class="fw-semibold">${txn.payeePayer || '—'}</div>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Payment Method</small>
          <div class="fw-semibold">${txn.paymentMethod || 'Bank Transfer'}</div>
        </div>
        <div class="col-12">
          <small class="text-muted d-block">Reference / Invoice No</small>
          <div class="font-monospace">${txn.referenceNo || '—'}</div>
        </div>
        <div class="col-12">
          <small class="text-muted d-block">Description & Notes</small>
          <div class="p-2 bg-secondary bg-opacity-10 border rounded">${txn.description || 'No additional notes provided.'}</div>
        </div>
        <div class="col-12 small text-muted text-end">
          Recorded by ${txn.createdBy || 'Financial Officer'} on ${formatDate(txn.createdAt || txn.date)}
        </div>
      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

// ── Expense Vouchers & Claims Workflow ──
export function renderExpenseVouchers() {
  const vouchers = state.db?.expenseVouchers || [];
  const statusFilter = dom.voucherStatusFilter?.value || 'all';

  const filtered = vouchers.filter(v => statusFilter === 'all' || v.status === statusFilter);

  const pendingCount = vouchers.filter(v => v.status === 'Pending Review').length;
  const disbursedTotal = vouchers.filter(v => v.status === 'Disbursed').reduce((sum, v) => sum + Number(v.amount || 0), 0);

  if (dom.vouchersPendingMetric) dom.vouchersPendingMetric.textContent = `${pendingCount} Pending`;
  if (dom.vouchersDisbursedMetric) dom.vouchersDisbursedMetric.textContent = formatCurrency(disbursedTotal);

  const vouchersTable = document.getElementById('vouchersTableBody') || dom.vouchersTableBody;
  if (!vouchersTable) return;

  if (filtered.length === 0) {
    vouchersTable.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="bi bi-receipt fs-3 d-block mb-2 text-secondary"></i>
          No expense vouchers or claims found.
        </td>
      </tr>
    `;
    return;
  }

  const isFinancialOfficerOrCeo = ['ceo', 'finance_officer'].includes(state.session?.role) || ['ceo', 'finance_officer'].includes(state.session?.actualRole);

  vouchersTable.innerHTML = filtered.map((v) => {
    let statusBadge = 'badge text-bg-warning';
    if (v.status === 'Approved') statusBadge = 'badge text-bg-info';
    if (v.status === 'Disbursed') statusBadge = 'badge text-bg-success';
    if (v.status === 'Rejected') statusBadge = 'badge text-bg-danger';

    let actionBtns = '';
    if (isFinancialOfficerOrCeo) {
      if (v.status === 'Pending Review') {
        actionBtns = `
          <button class="btn btn-sm btn-outline-success" data-action="approve-voucher" data-id="${v.id}" title="Approve Claim"><i class="bi bi-check-lg me-1"></i>Approve</button>
          <button class="btn btn-sm btn-outline-danger" data-action="reject-voucher" data-id="${v.id}" title="Reject Claim"><i class="bi bi-x-lg me-1"></i>Reject</button>
        `;
      } else if (v.status === 'Approved') {
        actionBtns = `
          <button class="btn btn-sm btn-success" data-action="disburse-voucher" data-id="${v.id}" title="Disburse & Post to General Ledger"><i class="bi bi-cash me-1"></i>Disburse</button>
          <button class="btn btn-sm btn-outline-danger" data-action="reject-voucher" data-id="${v.id}" title="Reject Claim"><i class="bi bi-x-lg me-1"></i>Reject</button>
        `;
      } else if (v.status === 'Disbursed') {
        actionBtns = `<span class="badge text-bg-dark border border-success text-success"><i class="bi bi-check-all me-1"></i>Paid (${v.disbursementTxnRef || 'TXN'})</span>`;
      } else {
        actionBtns = `<span class="text-muted small">${v.rejectionReason || 'Declined'}</span>`;
      }
    } else {
      actionBtns = `<span class="${statusBadge}">${v.status}</span>`;
    }

    return `
      <tr>
        <td>
          <span class="font-monospace text-info fw-semibold">${v.id}</span>
          <div class="small text-muted">${formatDate(v.date)}</div>
        </td>
        <td>
          <div class="fw-semibold text-white">${v.applicantName}</div>
          <small class="text-muted">${v.applicantEmail || 'Staff'}</small>
        </td>
        <td>
          <span class="badge text-bg-secondary font-monospace text-uppercase">${v.department || 'general'}</span>
          <div class="small text-muted">${v.category}</div>
        </td>
        <td>
          <div class="text-truncate" style="max-width: 200px;" title="${v.description}">${v.description}</div>
        </td>
        <td class="text-end fw-bold text-light">${formatCurrency(v.amount)}</td>
        <td><span class="${statusBadge}">${v.status}</span></td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            ${actionBtns}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

export async function submitExpenseVoucherForm(event, refreshAll) {
  event.preventDefault();
  const applicantName = dom.voucherApplicantName?.value?.trim() || state.session?.name || 'Staff Member';
  const applicantEmail = dom.voucherApplicantEmail?.value?.trim() || state.session?.email || '';
  const department = dom.voucherDept?.value || 'general';
  const category = dom.voucherCategory?.value || 'School Supplies';
  const amount = Number(dom.voucherAmount?.value || 0);
  const date = dom.voucherDate?.value || todayISO(0);
  const description = dom.voucherDescription?.value?.trim() || '';

  if (amount <= 0) {
    showToast('Please enter a valid expense voucher amount.', 'warning');
    return;
  }

  const voucher = {
    id: `VOUCH-${Date.now().toString().slice(-6)}`,
    applicantName,
    applicantEmail,
    department,
    category,
    amount,
    date,
    description,
    status: 'Pending Review',
    createdAt: new Date().toISOString()
  };

  if (!state.db.expenseVouchers) state.db.expenseVouchers = [];
  state.db.expenseVouchers.unshift(voucher);
  await saveDatabase();

  resetVoucherForm();
  showToast(`Expense voucher ${voucher.id} submitted for treasury review.`, 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export function resetVoucherForm() {
  if (dom.voucherForm) dom.voucherForm.reset();
  if (dom.voucherDate) dom.voucherDate.value = todayISO(0);
  if (dom.voucherApplicantName && state.session) dom.voucherApplicantName.value = state.session.name || '';
  if (dom.voucherApplicantEmail && state.session) dom.voucherApplicantEmail.value = state.session.email || '';
}

export async function handleVoucherAction(action, voucherId, refreshAll) {
  const isAuthorized = ['ceo', 'finance_officer'].includes(state.session?.role) || ['ceo', 'finance_officer'].includes(state.session?.actualRole);
  if (!isAuthorized) {
    showToast('Permission denied: Only Executive Management or Financial Officer can approve or disburse vouchers.', 'danger');
    return;
  }

  const voucher = (state.db?.expenseVouchers || []).find(v => v.id === voucherId);
  if (!voucher) return;

  if (action === 'approve') {
    voucher.status = 'Approved';
    voucher.reviewedBy = state.session?.name || 'Financial Officer';
    voucher.reviewedAt = new Date().toISOString();
    showToast(`Voucher ${voucher.id} approved for disbursement.`, 'success');
  } else if (action === 'disburse') {
    voucher.status = 'Disbursed';
    voucher.reviewedBy = state.session?.name || 'Financial Officer';
    voucher.reviewedAt = new Date().toISOString();

    // Create automatic Expense record in General Ledger
    if (!state.db.financeTransactions) state.db.financeTransactions = [];
    const txnRef = generateTransactionRef();
    const newTxn = {
      id: crypto.randomUUID(),
      txnRef,
      type: 'Expense',
      category: voucher.category || 'Operations',
      department: voucher.department || 'General',
      amount: Number(voucher.amount || 0),
      date: todayISO(0),
      paymentMethod: 'Bank Transfer',
      status: 'Completed',
      referenceNo: voucher.id,
      payeePayer: voucher.applicantName,
      description: `Disbursed voucher ${voucher.id}: ${voucher.description}`,
      createdAt: new Date().toISOString(),
      createdBy: state.session?.email || 'finance.officer@hlts.local'
    };
    state.db.financeTransactions.push(newTxn);
    voucher.disbursementTxnRef = txnRef;
    showToast(`Voucher ${voucher.id} disbursed and posted to General Ledger (${txnRef}).`, 'success');
  } else if (action === 'reject') {
    const reason = prompt('Please specify rejection reason for this claim:') || 'Requirements not met';
    voucher.status = 'Rejected';
    voucher.rejectionReason = reason;
    voucher.reviewedBy = state.session?.name || 'Financial Officer';
    voucher.reviewedAt = new Date().toISOString();
    showToast(`Voucher ${voucher.id} marked as rejected.`, 'info');
  }

  await saveDatabase();
  if (typeof refreshAll === 'function') refreshAll();
}

// ── Chart.js Visualizations ──
export function renderFinancialCharts() {
  if (typeof Chart === 'undefined') return;

  const txns = getAllTransactions().filter(t => t.status !== 'Cancelled');

  // 1. Cash Flow History Trend (Last 6 Months)
  const cashFlowCanvas = document.getElementById('financeCashFlowChart');
  if (cashFlowCanvas) {
    const months = [];
    const revenueByMonth = [];
    const expenseByMonth = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      months.push(monthLabel);

      const mRev = txns.filter(t => t.type === 'Revenue' && String(t.date).startsWith(key)).reduce((s, t) => s + Number(t.amount || 0), 0);
      const mExp = txns.filter(t => t.type === 'Expense' && String(t.date).startsWith(key)).reduce((s, t) => s + Number(t.amount || 0), 0);

      revenueByMonth.push(mRev);
      expenseByMonth.push(mExp);
    }

    if (state.charts.financeCashFlow) {
      state.charts.financeCashFlow.destroy();
    }

    state.charts.financeCashFlow = new Chart(cashFlowCanvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Revenue (₦)',
            data: revenueByMonth,
            backgroundColor: 'rgba(16, 185, 129, 0.75)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Expenses (₦)',
            data: expenseByMonth,
            backgroundColor: 'rgba(239, 68, 68, 0.75)',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { family: 'Manrope', size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // 2. Department Expenses Breakdown (Donut)
  const deptCanvas = document.getElementById('financeDeptExpenseChart');
  if (deptCanvas) {
    const deptTotals = {
      'Academic': 0,
      'Developer': 0,
      'Welfare_HR': 0,
      'Admin': 0,
      'General': 0
    };

    txns.filter(t => t.type === 'Expense').forEach(t => {
      const dept = t.department || 'General';
      if (deptTotals[dept] !== undefined) {
        deptTotals[dept] += Number(t.amount || 0);
      } else {
        deptTotals['General'] += Number(t.amount || 0);
      }
    });

    if (state.charts.financeDeptExpense) {
      state.charts.financeDeptExpense.destroy();
    }

    state.charts.financeDeptExpense = new Chart(deptCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Academic', 'Developer', 'Welfare & HR', 'Admin', 'General'],
        datasets: [{
          data: Object.values(deptTotals),
          backgroundColor: [
            '#3b82f6',
            '#8b5cf6',
            '#ec4899',
            '#f59e0b',
            '#64748b'
          ],
          borderWidth: 2,
          borderColor: '#0f172a'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } }
        }
      }
    });
  }
}
