import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';
import { firebaseConfig } from '../config.js';
import { defaultSeed, state, normalizeDatabase, getCurrentPayrollPeriodKey } from '../state.js';
import { hashPassword, buildEmployeeEmail, showToast } from '../utils.js';

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseDb = getFirestore(firebaseApp);

if (new URLSearchParams(location.search).has('emulator')) {
  connectFirestoreEmulator(firebaseDb, '127.0.0.1', 8080);
}

export const firebaseAppStateRef = doc(firebaseDb, 'appState', 'main');

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
      if (!localDb.settings?.clearedDemoData) {
        localDb = null;
        localStorage.removeItem(LOCAL_DB_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to parse local database cache:', e);
    }
  }

  let remoteData = null;
  try {
    const snapshot = await getDoc(firebaseAppStateRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      if (data?.settings?.clearedDemoData) {
        remoteData = data;
      }
    }
  } catch (error) {
    console.warn('Firestore cloud fetch unavailable/restricted, using local storage:', error.message || error);
  }

  const localTs = localDb?.settings?.lastWriteTimestamp || 0;
  const remoteTs = remoteData?.settings?.lastWriteTimestamp || 0;

  // If local database has newer modifications than cloud, use local and push to Firestore
  if (localDb && localTs > remoteTs) {
    const prepared = await prepareDatabase(localDb);
    state.db = prepared;
    saveDatabase(prepared);
    return prepared;
  }

  // If remote database exists and is up to date, use remote and update local storage
  if (remoteData) {
    const prepared = await prepareDatabase(remoteData);
    state.db = prepared;
    try {
      localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(prepared));
    } catch (_) {}
    return prepared;
  }

  // If only local database exists, use it and push to cloud
  if (localDb && localDb.settings?.clearedDemoData) {
    const prepared = await prepareDatabase(localDb);
    state.db = prepared;
    saveDatabase(prepared);
    return prepared;
  }

  // Otherwise, initialize a clean seed state and write to both local and Firestore
  const seeded = await createSeedDatabase();
  state.db = seeded;
  localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(seeded));
  saveDatabase(seeded);
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
      lastWriteTimestamp: Date.now()
    }
  };
}

export function saveDatabase(database = state.db) {
  const targetDb = database || state.db;
  if (!targetDb) return;
  if (!targetDb.settings) targetDb.settings = {};
  targetDb.settings.lastWriteTimestamp = Date.now();

  // 1. Immediately persist to localStorage for 100% reliable local state
  try {
    localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(targetDb));
  } catch (storageErr) {
    console.warn('localStorage write failed:', storageErr);
  }

  // 2. Synchronize deletion / updates to Firestore in the background
  void setDoc(firebaseAppStateRef, targetDb).then(() => {
    console.log('Firebase / Firestore updated with latest state (deletions & changes saved).');
  }).catch((error) => {
    console.warn('Background Firestore cloud sync pending/offline:', error.code || error.message);
  });
}

export function startRealtimeListener(onRemoteUpdate) {
  let latestAppliedSnapshotId = 0;
  let snapshotCounter = 0;

  try {
    onSnapshot(firebaseAppStateRef, (snapshot) => {
      if (!snapshot.exists()) return;
      snapshotCounter++;
      const currentSnapshotId = snapshotCounter;
      const raw = snapshot.data();

      prepareDatabase(raw).then((incoming) => {
        if (currentSnapshotId < latestAppliedSnapshotId) return;

        const incomingTs = incoming?.settings?.lastWriteTimestamp || 0;
        const localTs = state.db?.settings?.lastWriteTimestamp || 0;
        if (state.db && incomingTs < localTs) {
          console.log('Ignoring stale Firestore snapshot. Local TS:', localTs, 'Incoming TS:', incomingTs);
          return;
        }

        latestAppliedSnapshotId = currentSnapshotId;
        state.db = incoming;
        try {
          localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(incoming));
        } catch (_) {}

        if (state.session && typeof onRemoteUpdate === 'function') {
          onRemoteUpdate();
        }
      });
    }, (error) => {
      console.warn('Firestore realtime listener restricted or offline:', error.code || error.message);
    });
  } catch (listenerErr) {
    console.warn('Could not initialize Firestore realtime listener:', listenerErr);
  }
}
