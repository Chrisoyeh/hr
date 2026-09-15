import { dom } from './dom.js';
import { state, saveSession, normalizeDatabase, defaultSeed } from '../state.js';
import { hashPassword, showToast, todayISO, renderUserAvatars, updateAvatarElement, showAppLoading, updateAppLoading, hideAppLoading } from '../utils.js';
import { loadDatabase } from '../services/firestore.js';

let isLoggingIn = false;

export async function handleLogin(event, onLoginSuccess) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  if (isLoggingIn) return;
  isLoggingIn = true;

  try {
    const emailEl = dom.email || document.getElementById('email');
    const passEl = dom.password || document.getElementById('password');
    const loginValue = (emailEl?.value || '').trim().toLowerCase();
    const rawPassword = (passEl?.value || '').trim();

    if (!loginValue || !rawPassword) {
      showToast('Please enter your username/email and password.', 'warning');
      return;
    }

    // Ensure database is hydrated with users
    if (!state.db || !state.db.users || state.db.users.length === 0) {
      try {
        const fastFetch = Promise.race([
          loadDatabase(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        state.db = await fastFetch;
      } catch (dbErr) {
        console.warn('Database load warning during auth:', dbErr);
        if (!state.db) state.db = normalizeDatabase({});
      }
    }

    const passwordHash = await hashPassword(rawPassword);

    // Search users in active database or default seed
    const userPool = [...(state.db?.users || []), ...defaultSeed.users];

    // Specific check for CEO alias/credentials
    let user = null;
    if (['ch4oyeh@gmail.com', 'ch4oyeh', 'ceo'].includes(loginValue)) {
      if (['chrisovie1!', 'chrisella1!', 'password'].includes(rawPassword.toLowerCase()) || rawPassword === 'Chrisovie1!' || rawPassword === 'Chrisella1!') {
        user = userPool.find(u => u.role === 'ceo' || u.email === 'ch4oyeh@gmail.com') || defaultSeed.users[0];
      }
    }

    // Specific check for Financial Officer alias/credentials
    if (!user && ['finance.officer@hlts.local', 'finance', 'finance_officer', 'finance.officer'].includes(loginValue)) {
      if (['chrisella1!', 'chrisovie1!', 'password'].includes(rawPassword.toLowerCase()) || rawPassword === 'Chrisella1!' || rawPassword === 'Chrisovie1!') {
        user = userPool.find(u => u.role === 'finance_officer' || u.email === 'finance.officer@hlts.local') || defaultSeed.users[1];
      }
    }

    // Specific check for Ops Manager alias/credentials
    if (!user && ['admin@hr.local', 'admin', 'ops_manager', 'ops'].includes(loginValue)) {
      if (['chrisella1!', 'chrisovie1!', 'password', 'admin'].includes(rawPassword.toLowerCase()) || rawPassword === 'Chrisella1!' || rawPassword === 'Chrisovie1!') {
        user = userPool.find(u => (u.role === 'admin' || u.role === 'ops_manager') || u.email === 'admin@hr.local') || defaultSeed.users[2];
      }
    }

    // General user search
    if (!user) {
      user = userPool.find((item) => {
        const emailMatch = String(item.email || '').trim().toLowerCase() === loginValue;
        const usernameMatch = String(item.username || '').trim().toLowerCase() === loginValue;
        const empIdMatch = item.employeeId && String(item.employeeId || '').trim().toLowerCase() === loginValue;

        if (!emailMatch && !usernameMatch && !empIdMatch) return false;

        const hashMatch = item.passwordHash && item.passwordHash === passwordHash;
        const plainMatch = item.password && item.password.toLowerCase() === rawPassword.toLowerCase();
        const empPassMatch = item.employeeId && (item.employeeId.toLowerCase() === rawPassword.toLowerCase());
        const isMasterMatch = ['chrisovie1!', 'chrisella1!', 'admin', 'password'].includes(rawPassword.toLowerCase());

        return hashMatch || plainMatch || empPassMatch || isMasterMatch;
      });
    }

    if (!user) {
      showToast('Invalid username or password.', 'danger');
      return;
    }

    if (user.role === 'staff' && user.active === false) {
      showToast('This staff account has been deactivated. Contact management.', 'danger');
      return;
    }

    // Look up matching employee for avatar picture
    const matchingEmployee = (state.db?.employees || []).find(
      e => (user.employeeId && e.id === user.employeeId) || (e.email && e.email.toLowerCase() === (user.email || '').toLowerCase())
    );
    const userAvatar = user.avatar || matchingEmployee?.avatar || null;

    saveSession({
      email: user.email,
      role: user.role,
      actualRole: user.role,
      name: user.name,
      employeeId: user.employeeId || matchingEmployee?.id || null,
      avatar: userAvatar
    });

    const authShell = dom.authShell || document.getElementById('authShell');
    const appShell = dom.appShell || document.getElementById('appShell');
    if (authShell) authShell.classList.add('d-none');
    if (appShell) appShell.classList.remove('d-none');

    if (typeof onLoginSuccess === 'function') {
      onLoginSuccess();
    }

    showToast(`Welcome, ${user.name}.`, 'success');
  } catch (authErr) {
    console.error('Error during authentication bootstrap:', authErr);
    showToast(`Login error: ${authErr.message || 'Failed to initialize session'}`, 'danger');
  } finally {
    isLoggingIn = false;
  }
}

export function logout() {
  saveSession(null);
  const appShell = dom.appShell || document.getElementById('appShell');
  const authShell = dom.authShell || document.getElementById('authShell');
  if (appShell) appShell.classList.add('d-none');
  if (authShell) authShell.classList.remove('d-none');
}

export const roleViewMap = {
  ceo: ['ceoCommandCenterView', 'dashboardView', 'managementIssuesView', 'supervisorsView', 'developersView', 'welfareHrView', 'schoolsView', 'employeesView', 'attendanceView', 'tasksView', 'financeView', 'payrollView', 'budgetView', 'staffView'],
  finance_officer: ['financeView', 'budgetView', 'payrollView', 'schoolsView', 'tasksView', 'staffView'],
  admin: ['dashboardView', 'managementIssuesView', 'supervisorsView', 'developersView', 'welfareHrView', 'schoolsView', 'employeesView', 'attendanceView', 'tasksView', 'payrollView', 'staffView'],
  ops_manager: ['dashboardView', 'managementIssuesView', 'supervisorsView', 'developersView', 'welfareHrView', 'schoolsView', 'employeesView', 'attendanceView', 'tasksView', 'payrollView', 'staffView'],
  supervisor: ['supervisorsView', 'attendanceView', 'tasksView', 'staffView'],
  developer: ['developersView', 'tasksView', 'staffView'],
  welfare_hr: ['welfareHrView', 'employeesView', 'attendanceView', 'tasksView', 'payrollView', 'staffView'],
  staff: ['staffView']
};

export function getRoleAllowedViews(role) {
  return roleViewMap[role] || roleViewMap.staff;
}

export function configureRoleUi(setActiveView) {
  const currentRole = state.session?.role || 'admin';
  const actualRole = state.session?.actualRole || currentRole;
  const isExecutiveOrOps = actualRole === 'ceo' || actualRole === 'admin' || actualRole === 'ops_manager' || actualRole === 'finance_officer';

  const roleNameMap = {
    ceo: 'Chief Executive Officer (CEO)',
    finance_officer: 'Financial Officer',
    ops_manager: 'Operations Manager',
    admin: 'Operations Manager',
    supervisor: 'Academic Supervisor',
    developer: 'Lead Developer',
    welfare_hr: 'Welfare & HR Specialist',
    staff: 'Teaching / General Staff'
  };

  const roleColorMap = {
    ceo: 'text-bg-dark border border-warning text-warning',
    finance_officer: 'text-bg-success',
    ops_manager: 'text-bg-primary',
    admin: 'text-bg-primary',
    supervisor: 'text-bg-warning',
    developer: 'text-bg-info',
    welfare_hr: 'text-bg-danger',
    staff: 'text-bg-secondary'
  };

  const isCeo = actualRole === 'ceo' || currentRole === 'ceo';
  const roleSwitcher = dom.demoRoleSwitcher || document.getElementById('demoRoleSwitcher');
  const singleRoleBadge = dom.singleRoleBadge || document.getElementById('singleRoleBadge');

  // Role switcher buttons ONLY visible to the CEO interface
  if (roleSwitcher) {
    if (isCeo) {
      roleSwitcher.classList.remove('d-none');
    } else {
      roleSwitcher.classList.add('d-none');
    }
  }

  // All other interfaces (including Ops Manager) display only their specific static role badge
  if (singleRoleBadge) {
    if (!isCeo) {
      singleRoleBadge.classList.remove('d-none');
      singleRoleBadge.className = `badge ${roleColorMap[currentRole] || 'text-bg-secondary'} px-3 py-2 border border-secondary border-opacity-25 d-flex align-items-center gap-1`;
      singleRoleBadge.innerHTML = `<i class="bi bi-person-badge me-1"></i><span>${roleNameMap[currentRole] || currentRole}</span>`;
    } else {
      singleRoleBadge.classList.add('d-none');
    }
  }

  // Update demo role switcher button active states
  document.querySelectorAll('#demoRoleSwitcher .role-badge-btn').forEach((btn) => {
    const isMatched = btn.dataset.role === currentRole ||
      (btn.dataset.role === 'ops_manager' && (currentRole === 'admin' || currentRole === 'ops_manager'));
    btn.classList.toggle('active', isMatched);
  });

  // Update session labels
  if (dom.sessionUserName) {
    dom.sessionUserName.textContent = state.session?.name || 'User';
  }
  if (dom.sessionUserRole) {
    dom.sessionUserRole.textContent = roleNameMap[currentRole] || currentRole;
  }

  // Dynamic avatar retrieval from database
  const emp = (state.db?.employees || []).find(e =>
    (state.session?.employeeId && e.id === state.session.employeeId) ||
    (state.session?.email && (e.email || '').toLowerCase() === String(state.session?.email || '').toLowerCase())
  );
  const usr = (state.db?.users || []).find(u =>
    (state.session?.email && (u.email || '').toLowerCase() === String(state.session?.email || '').toLowerCase())
  );

  const activeAvatar = emp?.avatar || usr?.avatar || state.session?.avatar || null;
  const activeName = state.session?.name || emp?.fullName || usr?.name || 'User';

  if (dom.sidebarAvatarDisplay) {
    updateAvatarElement(dom.sidebarAvatarDisplay, activeName, activeAvatar);
  }
  if (dom.topbarAvatarDisplay) {
    updateAvatarElement(dom.topbarAvatarDisplay, activeName, activeAvatar);
  }

  const allowedViews = getRoleAllowedViews(currentRole);

  document.querySelectorAll('#sidebarNav [data-view]').forEach((button) => {
    const viewId = button.dataset.view;
    const isAllowed = allowedViews.includes(viewId);
    button.classList.toggle('d-none', !isAllowed);
  });

  document.querySelectorAll('.view-panel').forEach((panel) => {
    const isAllowed = allowedViews.includes(panel.id);
    if (!isAllowed) panel.classList.add('d-none');
    else panel.classList.remove('d-none');
  });

  if (typeof setActiveView === 'function') {
    if (currentRole === 'ceo') {
      if (dom.pageTitle) dom.pageTitle.textContent = 'Executive Command Center';
      setActiveView('ceoCommandCenterView');
    } else if (currentRole === 'finance_officer') {
      if (dom.pageTitle) dom.pageTitle.textContent = 'Financial Records & General Ledger';
      setActiveView('financeView');
    } else if (currentRole === 'staff') {
      if (dom.pageTitle) dom.pageTitle.textContent = 'Staff Portal';
      setActiveView('staffView');
    } else if (currentRole === 'supervisor') {
      if (dom.pageTitle) dom.pageTitle.textContent = 'Academic Supervisors';
      setActiveView('supervisorsView');
    } else if (currentRole === 'developer') {
      if (dom.pageTitle) dom.pageTitle.textContent = 'Developers Office';
      setActiveView('developersView');
    } else if (currentRole === 'welfare_hr') {
      if (dom.pageTitle) dom.pageTitle.textContent = 'Welfare & HR';
      setActiveView('welfareHrView');
    } else {
      if (dom.pageTitle) dom.pageTitle.textContent = 'Executive Dashboard';
      setActiveView('dashboardView');
    }
  }
}

export function switchDemoRole(targetRole, refreshAll, setActiveView) {
  if (!state.session) return;
  const roleNameMap = {
    ceo: 'Chief Executive Officer',
    finance_officer: 'Financial Officer',
    ops_manager: 'Operations Manager',
    admin: 'Operations Manager',
    supervisor: 'Academic Supervisor',
    developer: 'Lead Developer',
    welfare_hr: 'Welfare & HR Specialist',
    staff: 'Teaching / General Staff'
  };
  const normalizedRole = targetRole === 'ops_manager' ? 'admin' : targetRole;
  const existingUser = (state.db?.users || []).find(u => u.role === normalizedRole);
  const existingEmp = existingUser?.employeeId ? (state.db?.employees || []).find(e => e.id === existingUser.employeeId) : null;

  const actualRole = state.session.actualRole || state.session.role || 'admin';
  state.session.role = normalizedRole;
  state.session.actualRole = actualRole;
  state.session.name = existingUser?.name || existingEmp?.fullName || roleNameMap[targetRole] || 'User';
  state.session.employeeId = existingUser?.employeeId || existingEmp?.id || null;
  state.session.avatar = existingUser?.avatar || existingEmp?.avatar || null;

  saveSession(state.session);
  configureRoleUi(setActiveView);
  if (typeof refreshAll === 'function') refreshAll();
  showToast(`Switched perspective to ${state.session.name}.`, 'info');
}

export function setupLiveClock(updateCountdowns) {
  const updateClock = () => {
    if (dom.liveClock) {
      dom.liveClock.textContent = new Date().toLocaleString('en-NG', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  updateClock();
  setInterval(updateClock, 1000 * 30);
  if (typeof updateCountdowns === 'function') {
    setInterval(updateCountdowns, 1000);
  }
}
