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
  if (dom.incomeTableBody) {
    dom.incomeTableBody.innerHTML = summary.rows || '<tr><td colspan="8" class="text-center text-muted py-4">No finance records matching filter criteria.</td></tr>';
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
  if (dom.incomeSubmitBtn) dom.incomeSubmitBtn.textContent = 'Save Transaction';
}

export function openTransactionDetailModal(txnId) {
  const txn = getAllTransactions().find(t => t.id === txnId);
  if (!txn) return;

  const modalEl = document.getElementById('transactionDetailModal');
  const bodyEl = document.getElementById('transactionDetailModalBody');
  if (!modalEl || !bodyEl) return;

  bodyEl.innerHTML = `
    <div class="transaction-detail-card p-3">
      <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
        <div>
          <span class="badge ${txn.type === 'Revenue' ? 'text-bg-success' : 'text-bg-danger'} px-3 py-2 me-2">${txn.type}</span>
          <span class="badge text-bg-secondary px-2 py-1">${txn.status || 'Completed'}</span>
        </div>
        <div class="fw-bold font-monospace text-primary">${txn.txnRef || 'TXN-REF'}</div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-6">
          <small class="text-muted d-block">Amount</small>
          <div class="fs-4 fw-bold ${txn.type === 'Revenue' ? 'text-success' : 'text-light'}">${formatCurrency(txn.amount)}</div>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Transaction Date</small>
          <div class="fw-semibold">${formatDate(txn.date)}</div>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Category</small>
          <div class="fw-semibold">${txn.category}</div>
        </div>
        <div class="col-6">
          <small class="text-muted d-block">Department / Cost Center</small>
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
          <small class="text-muted d-block">Reference / Invoice Number</small>
          <div class="font-monospace">${txn.referenceNo || '—'}</div>
        </div>
        <div class="col-12">
          <small class="text-muted d-block">Description & Notes</small>
          <div class="p-2 bg-secondary bg-opacity-10 border rounded">${txn.description || 'No additional notes provided.'}</div>
        </div>
        <div class="col-12 small text-muted text-end">
          Recorded by ${txn.createdBy || 'Admin'} on ${formatDate(txn.createdAt || txn.date)}
        </div>
      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
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
