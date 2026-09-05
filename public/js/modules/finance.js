import { dom } from './dom.js';
import { state } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { todayISO, formatDate, formatCurrency, showToast } from '../utils.js';

export function renderFinance() {
  const range = dom.financeRangeFilter?.value || 'monthly';
  const selected = buildFinanceSummary(range);
  if (dom.incomeTableBody) {
    dom.incomeTableBody.innerHTML = selected.rows || '<tr><td colspan="6" class="text-center text-muted py-4">No finance entries found</td></tr>';
  }
  if (dom.revenueMetric) dom.revenueMetric.textContent = formatCurrency(selected.revenue);
  if (dom.expensesMetric) dom.expensesMetric.textContent = formatCurrency(selected.expenses);
  if (dom.profitMetric) dom.profitMetric.textContent = formatCurrency(selected.revenue - selected.expenses);
}

export function buildFinanceSummary(range) {
  const now = new Date();
  let filtered = [...(state.db?.income || [])];

  if (range === 'monthly') {
    const key = now.toISOString().slice(0, 7);
    filtered = filtered.filter((entry) => entry.date.startsWith(key));
  } else if (range === 'fourMonths') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 3, 1);
    filtered = filtered.filter((entry) => new Date(entry.date) >= start);
  } else if (range === 'yearly') {
    const year = now.getFullYear();
    filtered = filtered.filter((entry) => new Date(entry.date).getFullYear() === year);
  }

  const revenue = filtered.filter((entry) => entry.type === 'Revenue').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expenses = filtered.filter((entry) => entry.type === 'Expense').reduce((sum, entry) => sum + Number(entry.amount), 0);

  const rows = filtered
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .map((entry) => `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td><span class="chip ${entry.type === 'Revenue' ? 'chip-success' : 'chip-danger'}">${entry.type}</span></td>
        <td>${entry.category}</td>
        <td>${entry.description || '—'}</td>
        <td class="text-end fw-bold">${formatCurrency(entry.amount)}</td>
        <td><button class="btn btn-sm btn-outline-secondary" data-action="delete-income" data-id="${entry.id}">Delete</button></td>
      </tr>`).join('');

  return { rows, revenue, expenses };
}

export function submitIncome(event, refreshAll) {
  event.preventDefault();
  if (!state.db.income) state.db.income = [];
  state.db.income.push({
    id: crypto.randomUUID(),
    type: dom.incomeType.value,
    category: dom.incomeCategory.value.trim(),
    amount: Number(dom.incomeAmount.value),
    date: dom.incomeDate.value,
    description: dom.incomeDescription.value.trim()
  });
  saveDatabase();
  dom.incomeForm.reset();
  dom.incomeType.value = 'Revenue';
  dom.incomeDate.value = todayISO(0);
  showToast('Finance entry saved.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}
