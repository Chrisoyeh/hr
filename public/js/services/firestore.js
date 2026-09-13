import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';
import { firebaseConfig } from '../config.js';
import { defaultSeed, state, normalizeDatabase, getCurrentPayrollPeriodKey } from '../state.js';
import { hashPassword, buildEmployeeEmail, showToast, todayISO } from '../utils.js';

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseDb = getFirestore(firebaseApp);

if (new URLSearchParams(location.search).has('emulator')) {
  connectFirestoreEmulator(firebaseDb, '127.0.0.1', 8080);
}

export const firebaseAppStateRef = doc(firebaseDb, 'appState', 'main');

export function purgeHistoricalDataBeforeToday(database) {
  if (!database) return database;
  const today = todayISO(0);

  const isTodayOrFuture = (d) => {
    if (!d) return false;
    const str = String(d).slice(0, 10);
    return str >= today;
  };

  database.attendance = (database.attendance || []).filter((entry) => isTodayOrFuture(entry.date));
  database.tasks = (database.tasks || []).filter((task) => isTodayOrFuture(task.deadline) || isTodayOrFuture(task.createdAt));
  database.reportsSupervisor = (database.reportsSupervisor || []).filter((r) => isTodayOrFuture(r.date) || isTodayOrFuture(r.createdAt));
  database.reportsDeveloper = (database.reportsDeveloper || []).filter((r) => isTodayOrFuture(r.date) || isTodayOrFuture(r.createdAt));
  database.reportsWelfare = (database.reportsWelfare || []).filter((r) => isTodayOrFuture(r.date) || isTodayOrFuture(r.createdAt));
  database.staffAppraisalsQueries = (database.staffAppraisalsQueries || []).filter((q) => isTodayOrFuture(q.date) || isTodayOrFuture(q.createdAt));
  database.managementIssues = (database.managementIssues || []).filter((i) => isTodayOrFuture(i.date) || isTodayOrFuture(i.createdAt));
  database.reports = (database.reports || []).filter((r) => isTodayOrFuture(r.date) || isTodayOrFuture(r.createdAt));
  database.income = (database.income || []).filter((inc) => isTodayOrFuture(inc.date) || isTodayOrFuture(inc.createdAt));
  database.financeTransactions = (database.financeTransactions || []).filter((t) => isTodayOrFuture(t.date) || isTodayOrFuture(t.createdAt));
  database.clientInvoices = (database.clientInvoices || []).filter((inv) => isTodayOrFuture(inv.issueDate) || isTodayOrFuture(inv.createdAt));
  database.payrollAdjustments = (database.payrollAdjustments || []).filter((adj) => isTodayOrFuture(adj.date) || isTodayOrFuture(adj.createdAt));
  database.missingReportPenalties = (database.missingReportPenalties || []).filter((p) => isTodayOrFuture(p.date) || isTodayOrFuture(p.createdAt));

  if (!database.settings) database.settings = {};
  database.settings.purgedHistoricalBeforeDate = today;
  database.settings.lastWriteTimestamp = Date.now();

  return database;
}

export async function prepareDatabase(database) {
  const normalized = normalizeDatabase(database);

  if (!normalized.offices || normalized.offices.length === 0) {
    normalized.offices = [
      { id: 'off-hq', name: 'Lagos Headquarters', latitude: 6.5244, longitude: 3.3792, radius: 100 }
    ];
  }

  if (normalized.users.some((user) => !user.passwordHash)) {
    normalized.users = await Promise.all(normalized.users.map(async (user) => ({
      ...user,
      passwordHash: user.passwordHash || await hashPassword(user.password || 'Chrisella1!')
    })));
  }

  normalized.users = await Promise.all(normalized.users.map(async (user) => {
    if (user.role === 'admin') {
      return {
        ...user,
        username: 'Admin',
        email: user.email || 'admin@hr.local',
        active: user.active !== false,
        passwordHash: user.passwordHash || await hashPassword('Chrisella1!')
      };
    }
    return {
      ...user,
      active: user.active !== false
    };
  }));

  const nonStaffUsers = normalized.users.filter((user) => user.role !== 'staff' || !user.employeeId);
  const syncedEmployees = [];
  const syncedStaffUsers = [];
  const syncedPayrollPayments = Array.isArray(normalized.payrollPayments) ? [...normalized.payrollPayments] : [];
  const payrollPaymentKeys = new Set(syncedPayrollPayments.map((entry) => `${entry.employeeId}|${entry.periodKey}`));

  for (const employee of normalized.employees) {
    const email = String(employee.email || employee.username || buildEmployeeEmail(employee.fullName, employee.id)).toLowerCase();
    const salaryPaid = Boolean(employee.salaryPaid);
    const salaryPaidAt = salaryPaid ? (employee.salaryPaidAt || new Date().toISOString()) : null;
    const legacyPeriodKey = employee.salaryPaidAt ? new Date(employee.salaryPaidAt).toISOString().slice(0, 7) : getCurrentPayrollPeriodKey();

    if (salaryPaid && !payrollPaymentKeys.has(`${employee.id}|${legacyPeriodKey}`)) {
      syncedPayrollPayments.push({
        id: crypto.randomUUID(),
        employeeId: employee.id,
        periodKey: legacyPeriodKey,
        paid: true,
        paidAt: salaryPaidAt || new Date().toISOString(),
        paidBy: 'migration'
      });
      payrollPaymentKeys.add(`${employee.id}|${legacyPeriodKey}`);
    }

    syncedEmployees.push({
      ...employee,
      email,
      username: email,
      officeId: employee.officeId || 'off-hq',
      active: employee.active !== false,
      salaryPaid,
      salaryPaidAt
    });

    const existingStaffUser = normalized.users.find((u) => u.role === 'staff' && u.employeeId === employee.id);
    const staffPasswordHash = existingStaffUser?.passwordHash || await hashPassword(employee.id);

    syncedStaffUsers.push({
      name: employee.fullName,
      username: email,
      email,
      role: 'staff',
      employeeId: employee.id,
      active: employee.active !== false,
      passwordHash: staffPasswordHash
    });
  }

  return {
    ...normalized,
    users: [...nonStaffUsers, ...syncedStaffUsers],
    employees: syncedEmployees,
    payrollPayments: syncedPayrollPayments
  };
}

const LOCAL_DB_STORAGE_KEY = 'hlts_hr_suite_db_v2';

export async function loadDatabase() {
  let localDb = null;
  const rawLocal = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
  if (rawLocal) {
    try {
      localDb = JSON.parse(rawLocal);
    } catch (e) {
      console.warn('Failed to parse local database cache:', e);
    }
  }

  let remoteData = null;
  try {
    const snapshot = await getDoc(firebaseAppStateRef);
    if (snapshot.exists()) {
      remoteData = snapshot.data();
    }
  } catch (error) {
    console.warn('Firestore cloud fetch unavailable, checking local storage:', error.message || error);
  }

  // Authoritative: Always use remote Firestore state if available
  if (remoteData) {
    const prepared = await prepareDatabase(remoteData);
    state.db = prepared;
    try {
      localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(prepared));
    } catch (_) {}
    return prepared;
  }

  // Fallback to local storage if offline
  if (localDb) {
    const prepared = await prepareDatabase(localDb);
    state.db = prepared;
    return prepared;
  }

  // Otherwise, initialize a clean seed state and write to both local and Firestore
  const seeded = await createSeedDatabase();
  state.db = seeded;
  try {
    localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(seeded));
  } catch (_) {}
  await saveDatabase(seeded);
  return seeded;
}

export async function createSeedDatabase() {
  const users = await Promise.all(defaultSeed.users.map(async (user) => ({
    ...user,
    passwordHash: await hashPassword(user.password || 'Chrisella1!')
  })));

  for (const employee of defaultSeed.employees) {
    const email = String(employee.email || buildEmployeeEmail(employee.fullName, employee.id)).toLowerCase();
    users.push({
      name: employee.fullName,
      username: email,
      email,
      role: 'staff',
      employeeId: employee.id,
      active: employee.active !== false,
      passwordHash: await hashPassword(employee.id)
    });
  }

  return {
    users,
    employees: defaultSeed.employees,
    schools: defaultSeed.schools,
    reportsSupervisor: defaultSeed.reportsSupervisor,
    reportsDeveloper: defaultSeed.reportsDeveloper,
    reportsWelfare: defaultSeed.reportsWelfare,
    staffAppraisalsQueries: defaultSeed.staffAppraisalsQueries,
    managementIssues: defaultSeed.managementIssues,
    attendance: defaultSeed.attendance,
    tasks: defaultSeed.tasks,
    reports: [],
    income: [],
    financeTransactions: [],
    departmentBudgets: {},
    clientInvoices: [],
    payrollAdjustments: [],
    payrollPayments: [],
    missingReportPenalties: [],
    budget: {
      salary: 0,
      operations: 0
    },
    settings: {
      attendanceLocked: false,
      clearedDemoData: true,
      purgedHistoricalBeforeDate: todayISO(0),
      lastWriteTimestamp: Date.now()
    }
  };
}

export async function saveDatabase(database = state.db) {
  const targetDb = database || state.db;
  if (!targetDb) return false;
  if (!targetDb.settings) targetDb.settings = {};
  targetDb.settings.lastWriteTimestamp = Date.now();

  // 1. Immediately persist to localStorage for local fast resilience
  try {
    localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(targetDb));
  } catch (storageErr) {
    console.warn('localStorage write failed:', storageErr);
  }

  // 2. Synchronize to Firestore permanently across all devices
  try {
    await setDoc(firebaseAppStateRef, targetDb);
    console.log('Firebase Firestore updated permanently with latest state.');
    return true;
  } catch (error) {
    console.error('Firestore cloud sync error:', error);
    showToast('Warning: Cloud sync failed. Check internet connection.', 'warning');
    return false;
  }
}

export function startRealtimeListener(onRemoteUpdate) {
  try {
    onSnapshot(firebaseAppStateRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      const raw = snapshot.data();
      const incoming = await prepareDatabase(raw);
      state.db = incoming;
      try {
        localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(incoming));
      } catch (_) {}

      if (state.session && typeof onRemoteUpdate === 'function') {
        onRemoteUpdate();
      }
    }, (error) => {
      console.warn('Firestore realtime listener restricted or offline:', error.code || error.message);
    });
  } catch (listenerErr) {
    console.warn('Could not initialize Firestore realtime listener:', listenerErr);
  }
}

