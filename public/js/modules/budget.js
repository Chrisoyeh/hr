import { dom } from './dom.js';
import { state, getCurrentPayrollPeriodKey } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { formatCurrency, showToast } from '../utils.js';

export function getDepartmentActuals(periodKey = getCurrentPayrollPeriodKey()) {
  const txns = (state.db?.financeTransactions || []).filter((t) =>
    t.type === 'Expense' && t.status !== 'Cancelled' && String(t.date || '').startsWith(periodKey)
  );

  return {
    academic: txns.filter(t => (t.department || '').toLowerCase() === 'academic').reduce((sum, t) => sum + Number(t.amount || 0), 0),
    developer: txns.filter(t => (t.department || '').toLowerCase() === 'developer').reduce((sum, t) => sum + Number(t.amount || 0), 0),
    welfare_hr: txns.filter(t => (t.department || '').toLowerCase() === 'welfare_hr').reduce((sum, t) => sum + Number(t.amount || 0), 0),
    admin: txns.filter(t => ['admin', 'general'].includes((t.department || '').toLowerCase())).reduce((sum, t) => sum + Number(t.amount || 0), 0),
    totalOps: txns.filter(t => (t.category || '').toLowerCase() !== 'payroll').reduce((sum, t) => sum + Number(t.amount || 0), 0)
  };
}

export function renderBudget(getPayrollTotals) {
  const periodKey = getCurrentPayrollPeriodKey();
  const payroll = typeof getPayrollTotals === 'function' ? getPayrollTotals() : { salaryActual: 0 };
  const deptActuals = getDepartmentActuals(periodKey);

  // Budgets config from state
  const b = state.db?.departmentBudgets?.[periodKey] || {
    salary: Number(state.db?.budget?.salary || 0),
    operations: Number(state.db?.budget?.operations || 0),
    academic: 0,
    developer: 0,
    welfare_hr: 0,
    admin: 0
  };

  // Form Inputs Population
  if (dom.salaryBudget) dom.salaryBudget.value = b.salary || 0;
  if (dom.operationsBudget) dom.operationsBudget.value = b.operations || 0;
  if (dom.academicBudgetInput) dom.academicBudgetInput.value = b.academic || 0;
  if (dom.developerBudgetInput) dom.developerBudgetInput.value = b.developer || 0;
  if (dom.welfareBudgetInput) dom.welfareBudgetInput.value = b.welfare_hr || 0;
  if (dom.adminBudgetInput) dom.adminBudgetInput.value = b.admin || 0;

  // Render Top Level Overview Cards
  if (dom.budgetSalaryValue) dom.budgetSalaryValue.textContent = formatCurrency(b.salary);
  if (dom.budgetOperationsValue) dom.budgetOperationsValue.textContent = formatCurrency(b.operations);
  if (dom.budgetSalaryActual) dom.budgetSalaryActual.textContent = formatCurrency(payroll.salaryActual);
  if (dom.budgetOperationsActual) dom.budgetOperationsActual.textContent = formatCurrency(deptActuals.totalOps);

  const salaryDiff = b.salary - payroll.salaryActual;
  if (dom.budgetSalaryStatus) {
    dom.budgetSalaryStatus.textContent = salaryDiff < 0
      ? `Exceeded by ${formatCurrency(Math.abs(salaryDiff))}`
      : `Remaining ${formatCurrency(salaryDiff)}`;
    dom.budgetSalaryStatus.className = salaryDiff < 0 ? 'text-danger small' : 'text-success small';
  }

  const opsDiff = b.operations - deptActuals.totalOps;
  if (dom.budgetOperationsStatus) {
    dom.budgetOperationsStatus.textContent = opsDiff < 0
      ? `Exceeded by ${formatCurrency(Math.abs(opsDiff))}`
      : `Remaining ${formatCurrency(opsDiff)}`;
    dom.budgetOperationsStatus.className = opsDiff < 0 ? 'text-danger small' : 'text-success small';
  }

  // Render Department Budget Matrix
  const departments = [
    { name: 'Academic Supervisors Office', code: 'academic', target: b.academic || 0, actual: deptActuals.academic, icon: 'bi-mortarboard' },
    { name: 'Developers & Web Office', code: 'developer', target: b.developer || 0, actual: deptActuals.developer, icon: 'bi-code-slash' },
    { name: 'Welfare & HR Operations', code: 'welfare_hr', target: b.welfare_hr || 0, actual: deptActuals.welfare_hr, icon: 'bi-heart-pulse' },
    { name: 'Executive Administration & Ops', code: 'admin', target: b.admin || 0, actual: deptActuals.admin, icon: 'bi-building-gear' }
  ];

  if (dom.departmentBudgetsContainer) {
    dom.departmentBudgetsContainer.innerHTML = departments.map(d => {
      const pct = d.target > 0 ? Math.min(Math.round((d.actual / d.target) * 100), 200) : (d.actual > 0 ? 100 : 0);
      let barColor = 'bg-success';
      let statusBadge = '<span class="badge text-bg-success">Within Budget</span>';

      if (pct >= 100) {
        barColor = 'bg-danger';
        statusBadge = '<span class="badge text-bg-danger">Limit Exceeded</span>';
      } else if (pct >= 80) {
        barColor = 'bg-warning';
        statusBadge = '<span class="badge text-bg-warning">Approaching Cap (80%+)</span>';
      }

      return `
        <div class="col-12 col-md-6">
          <div class="p-3 bg-secondary bg-opacity-10 border rounded h-100">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="fw-semibold d-flex align-items-center gap-2">
                <i class="bi ${d.icon} text-primary"></i> ${d.name}
              </div>
              ${statusBadge}
            </div>
            <div class="d-flex justify-content-between align-items-baseline mb-2">
              <div>
                <span class="text-muted small">Actual Spend:</span>
                <strong class="fs-5 ms-1">${formatCurrency(d.actual)}</strong>
              </div>
              <div class="text-end">
                <span class="text-muted small">Target:</span>
                <span class="fw-semibold ms-1">${formatCurrency(d.target)}</span>
              </div>
            </div>
            <div class="progress" style="height: 8px;">
              <div class="progress-bar ${barColor}" role="progressbar" style="width: ${pct}%;" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <div class="d-flex justify-content-between small text-muted mt-2">
              <span>${pct}% Utilized</span>
              <span>${d.target >= d.actual ? `Remaining: ${formatCurrency(d.target - d.actual)}` : `Over by: ${formatCurrency(d.actual - d.target)}`}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Alerts
  const alerts = [];
  if (salaryDiff < 0) {
    alerts.push(`<div class="alert-item alert-danger"><i class="bi bi-exclamation-triangle-fill me-2 text-danger"></i><strong>Salary Budget Exceeded:</strong> Net payroll spending surpassed the salary allocation by ${formatCurrency(Math.abs(salaryDiff))}.</div>`);
  }
  if (opsDiff < 0) {
    alerts.push(`<div class="alert-item alert-danger"><i class="bi bi-exclamation-triangle-fill me-2 text-danger"></i><strong>Operations Budget Exceeded:</strong> Total operational expense surpassed limit by ${formatCurrency(Math.abs(opsDiff))}.</div>`);
  }
  departments.forEach(d => {
    if (d.target > 0 && d.actual > d.target) {
      alerts.push(`<div class="alert-item alert-danger"><i class="bi bi-exclamation-circle-fill me-2 text-danger"></i><strong>${d.name}:</strong> Actual expenditure (${formatCurrency(d.actual)}) exceeded the monthly target of ${formatCurrency(d.target)}.</div>`);
    } else if (d.target > 0 && d.actual >= d.target * 0.8) {
      alerts.push(`<div class="alert-item alert-warning"><i class="bi bi-info-circle-fill me-2 text-warning"></i><strong>${d.name}:</strong> Expenditure is at ${Math.round((d.actual / d.target) * 100)}% of target limit.</div>`);
    }
  });

  if (dom.budgetAlerts) {
    dom.budgetAlerts.innerHTML = alerts.join('') || '<div class="small text-muted py-2"><i class="bi bi-check-circle text-success me-1"></i> All department spending and company operational targets are currently within budget limits.</div>';
  }
}

export async function submitBudget(event, refreshAll) {
  event.preventDefault();
  const periodKey = getCurrentPayrollPeriodKey();

  if (!state.db.departmentBudgets) state.db.departmentBudgets = {};
  if (!state.db.budget) state.db.budget = {};

  const salary = Number(dom.salaryBudget?.value || 0);
  const operations = Number(dom.operationsBudget?.value || 0);
  const academic = Number(dom.academicBudgetInput?.value || 0);
  const developer = Number(dom.developerBudgetInput?.value || 0);
  const welfare_hr = Number(dom.welfareBudgetInput?.value || 0);
  const admin = Number(dom.adminBudgetInput?.value || 0);

  // Save global legacy budget
  state.db.budget.salary = salary;
  state.db.budget.operations = operations;

  // Save period departmental budgets
  state.db.departmentBudgets[periodKey] = {
    salary,
    operations,
    academic,
    developer,
    welfare_hr,
    admin,
    updatedAt: new Date().toISOString(),
    updatedBy: state.session?.email || 'admin'
  };

  await saveDatabase();
  showToast('Company & Department Budgets saved.', 'success');
  if (typeof refreshAll === 'function') refreshAll();
}
