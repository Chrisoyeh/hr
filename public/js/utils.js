export function todayISO(dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function monthDateISO(monthOffset = 0, day = 1) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset, day);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function saturdayLateISOString(isLate) {
  const now = new Date();
  const current = new Date(now);
  const day = current.getDay();
  const diffToSaturday = (6 - day + 7) % 7;
  current.setDate(current.getDate() + diffToSaturday);
  current.setHours(isLate ? 10 : 9, isLate ? 15 : 30, 0, 0);
  return current.toISOString();
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeToMinutes(timeValue) {
  if (!timeValue) return null;
  const [hours, minutes] = timeValue.split(':').map(Number);
  return hours * 60 + minutes;
}

const passwordHashCache = new Map();
export async function hashPassword(password) {
  if (passwordHashCache.has(password)) {
    return passwordHashCache.get(password);
  }
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  passwordHashCache.set(password, hash);
  return hash;
}

export function generatePassword(length = 10) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (value) => charset[value % charset.length]).join('');
}

export function slugifyName(value) {
  return String(value || 'staff')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'staff';
}

export function buildEmployeeUsername(fullName, employeeId) {
  return `${slugifyName(fullName)}-${String(employeeId || '').slice(-4).toLowerCase()}`;
}

export function buildEmployeeEmail(fullName, employeeId) {
  return `${slugifyName(fullName || employeeId || 'staff')}@hr.local`;
}

export function buildEmployeeCredentials(employee) {
  const username = String(employee.email || employee.username || buildEmployeeEmail(employee.fullName, employee.id)).toLowerCase();
  const password = String(employee.id || '').toUpperCase();
  return { username, password };
}

// ── Avatar & Image Helpers ──
export function getInitials(name) {
  if (!name) return 'HL';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function compressImage(file, maxWidth = 260, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function updateAvatarElement(circleEl, name, avatarDataUrl) {
  if (!circleEl) return;
  const initials = getInitials(name);
  if (avatarDataUrl) {
    circleEl.innerHTML = `<img src="${avatarDataUrl}" class="avatar-img" alt="${name || 'Avatar'}">`;
  } else {
    circleEl.innerHTML = `<span>${initials}</span>`;
  }
}

export function renderUserAvatars(optionalAvatar, optionalName) {
  const sidebarAvatar = document.getElementById('sidebarAvatarDisplay');
  const topbarAvatar = document.getElementById('topbarAvatarDisplay');
  const sessionUser = JSON.parse(localStorage.getItem('hr_suite_session') || 'null');
  const name = optionalName || sessionUser?.name || 'Admin';
  const avatar = optionalAvatar !== undefined ? optionalAvatar : (sessionUser?.avatar || null);
  if (sidebarAvatar) updateAvatarElement(sidebarAvatar, name, avatar);
  if (topbarAvatar) updateAvatarElement(topbarAvatar, name, avatar);
}

// ── Debounce Utility ──
export function debounce(fn, delay = 150) {
  let timeoutId = null;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Toast Notification System ──
export function showToast(message, variant = 'primary') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-bg-${variant} border-0 show mb-2`;
  toast.role = 'alert';
  toast.ariaLive = 'assertive';
  toast.ariaAtomic = 'true';
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('show');
    toast.remove();
  }, 3500);
}

// ── Application Loading Screen Helpers ──
export function showAppLoading(statusText = 'Connecting to Firebase...', subText = 'Synchronizing real-time database...') {
  const overlay = document.getElementById('appLoadingOverlay');
  const statusEl = document.getElementById('loadingStatusText');
  const subEl = document.getElementById('loadingSubtext');
  const progressEl = document.getElementById('loadingProgressFill');
  const pctEl = document.getElementById('loadingPctText');

  if (overlay) {
    overlay.classList.remove('d-none', 'fade-out');
  }
  if (statusEl) statusEl.textContent = statusText;
  if (subEl) subEl.innerHTML = `<i class="bi bi-cloud-arrow-down me-1"></i> ${subText}`;
  if (progressEl) progressEl.style.width = '15%';
  if (pctEl) pctEl.textContent = '15%';
}

export function updateAppLoading(statusText, progressPercent, subText) {
  const statusEl = document.getElementById('loadingStatusText');
  const subEl = document.getElementById('loadingSubtext');
  const progressEl = document.getElementById('loadingProgressFill');
  const pctEl = document.getElementById('loadingPctText');

  if (statusText && statusEl) statusEl.textContent = statusText;
  if (progressPercent !== undefined) {
    const clamped = Math.min(100, Math.max(0, progressPercent));
    if (progressEl) progressEl.style.width = `${clamped}%`;
    if (pctEl) pctEl.textContent = `${Math.round(clamped)}%`;
  }
  if (subText && subEl) subEl.innerHTML = `<i class="bi bi-cloud-arrow-down me-1"></i> ${subText}`;
}

export function hideAppLoading(delayMs = 300) {
  const overlay = document.getElementById('appLoadingOverlay');
  const progressEl = document.getElementById('loadingProgressFill');
  const pctEl = document.getElementById('loadingPctText');
  if (progressEl) progressEl.style.width = '100%';
  if (pctEl) pctEl.textContent = '100%';

  setTimeout(() => {
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.classList.add('d-none');
        overlay.classList.remove('fade-out');
      }, 350);
    }
  }, delayMs);
}

// ── Supervisor & School Security & Association Helpers ──
export function getSupervisorIdentifiers(session, employees = [], users = []) {
  if (!session) return [];
  const ids = new Set();
  if (session.email) ids.add(session.email.trim().toLowerCase());
  if (session.name) ids.add(session.name.trim().toLowerCase());
  if (session.employeeId) ids.add(session.employeeId.trim().toLowerCase());

  const emp = (employees || []).find(e => 
    (session.employeeId && e.id === session.employeeId) || 
    (session.email && (e.email || '').toLowerCase() === (session.email || '').toLowerCase())
  );
  if (emp) {
    if (emp.id) ids.add(emp.id.trim().toLowerCase());
    if (emp.email) ids.add(emp.email.trim().toLowerCase());
    if (emp.fullName) ids.add(emp.fullName.trim().toLowerCase());
  }

  const usr = (users || []).find(u => 
    (session.email && (u.email || '').toLowerCase() === (session.email || '').toLowerCase()) || 
    (session.name && (u.name || '').toLowerCase() === (session.name || '').toLowerCase())
  );
  if (usr) {
    if (usr.email) ids.add(usr.email.trim().toLowerCase());
    if (usr.name) ids.add(usr.name.trim().toLowerCase());
    if (usr.username) ids.add(usr.username.trim().toLowerCase());
  }

  return Array.from(ids);
}

export function isSchoolAssignedToSupervisor(school, session, employees = [], users = []) {
  if (!school?.supervisorId) return false;
  const isOps = session?.role === 'admin' || session?.role === 'ops_manager' || session?.actualRole === 'admin' || session?.actualRole === 'ops_manager';
  if (isOps) return true; // Operations Manager has executive authority across all schools

  const supTarget = String(school.supervisorId).trim().toLowerCase();
  const validIds = getSupervisorIdentifiers(session, employees, users);
  return validIds.some(id => supTarget === id || supTarget.includes(id) || id.includes(supTarget));
}

