import { dom } from './dom.js';
import { state } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { formatCurrency, showToast } from '../utils.js';

export function getOperationsActual() {
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  return (state.db?.income || [])
    .filter((entry) => entry.type === 'Expense' && entry.date.startsWith(currentMonthKey) && entry.category.toLowerCase() !== 'payroll')
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
}

export function renderBudget(getPayrollTotals) {
  const payroll = typeof getPayrollTotals === 'function' ? getPayrollTotals() : { salaryActual: 0 };
  const operations = getOperationsActual();
  const salaryBudget = Number(state.db?.budget?.salary || 0);
  const operationsBudget = Number(state.db?.budget?.operations || 0);

  if (dom.salaryBudget) dom.salaryBudget.value = salaryBudget;
  if (dom.operationsBudget) dom.operationsBudget.value = operationsBudget;
  if (dom.budgetSalaryValue) dom.budgetSalaryValue.textContent = formatCurrency(salaryBudget);
  if (dom.budgetOperationsValue) dom.budgetOperationsValue.textContent = formatCurrency(operationsBudget);
  if (dom.budgetSalaryActual) dom.budgetSalaryActual.textContent = formatCurrency(payroll.salaryActual);
  if (dom.budgetOperationsActual) dom.budgetOperationsActual.textContent = formatCurrency(operations);

  if (dom.budgetSalaryStatus) {
    dom.budgetSalaryStatus.textContent = payroll.salaryActual > salaryBudget 
      ? `Exceeded by ${formatCurrency(payroll.salaryActual - salaryBudget)}` 
      : `Remaining ${formatCurrency(salaryBudget - payroll.salaryActual)}`;
  }
  if (dom.budgetOperationsStatus) {
    dom.budgetOperationsStatus.textContent = operations > operationsBudget 
      ? `Exceeded by ${formatCurrency(operations - operationsBudget)}` 
      : `Remaining ${formatCurrency(operationsBudget - operations)}`;
  }

  const alerts = [];
  if (payroll.salaryActual > salaryBudget) {
    alerts.push(`<div class="alert-item">Salary spending exceeded the budget limit by ${formatCurrency(payroll.salaryActual - salaryBudget)}.</div>`);
  }
  if (operations > operationsBudget) {
    alerts.push(`<div class="alert-item">Operations spending exceeded the budget limit by ${formatCurrency(operations - operationsBudget)}.</div>`);
  }
  if (dom.budgetAlerts) {
    dom.budgetAlerts.innerHTML = alerts.join('') || '<div class="small text-muted">All budget targets are currently within range.</div>';
  }
}

export function submitBudget(event, refreshAll) {
  event.preventDefault();
  if (!state.db.budget) state.db.budget = {};
  state.db.budget.salary = Number(dom.salaryBudget.value);
  state.db.budget.operations = Number(dom.operationsBudget.value);
  saveDatabase();
  showToast('Budget updated.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}
