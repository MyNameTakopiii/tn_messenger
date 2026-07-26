// src/js/home.js
import feather from 'feather-icons';
import { loadMergedTasks, todayISO } from '../utils/tn-employee-tasks.js';
import { showConfirmModal } from '../utils/modal.js';
import { postData, SCRIPT_URL_ORDER } from '../config/api.js';
import '../utils/pwa-install.js';

// Protect Route: ตรวจสอบ Token ทันที
const token = localStorage.getItem("tn_employee_token");
const userDataStr = localStorage.getItem("tn_employee_user");

if (!token || !userDataStr) {
  window.location.href = '/employee/login_employee.html';
}

const userData = JSON.parse(userDataStr || "{}");

document.addEventListener('DOMContentLoaded', () => {
  if (userData.id) {
    const elements = {
      userId: userData.id || '-',
      userName: userData.username || '-',
      userFirstName: userData.username || '-',
      userLastName: userData.last_name || '-',
      userEmail: userData.email || '-',
      userNickname: userData.nickname || '-'
    };
    
    Object.keys(elements).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = elements[id];
    });
    
    const displayName = document.getElementById('displayName');
    if (displayName) {
      displayName.textContent = `ยินดีต้อนรับ คุณ${userData.nickname || userData.username}`;
    }
    const avatarText = document.getElementById('avatarText');
    if (avatarText) {
      avatarText.textContent = (userData.nickname || userData.username).charAt(0).toUpperCase();
    }
  }

  // Attendance UI & Listeners
  initAttendanceUI();
  setupAttendanceListeners();

  // Hide loader overlay
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 400);
  }

  updateTaskBadge();
  setInterval(updateTaskBadge, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateTaskBadge();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE & DAILY SUMMARY LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function getAttendanceKey() {
  return `tn_attendance_${todayISO()}`;
}

function getAttendanceData() {
  try {
    return JSON.parse(localStorage.getItem(getAttendanceKey()) || "{}");
  } catch (_) {
    return {};
  }
}

function saveAttendanceData(data) {
  const current = getAttendanceData();
  const updated = { ...current, date: todayISO(), ...data };
  localStorage.setItem(getAttendanceKey(), JSON.stringify(updated));
  return updated;
}

function formatThaiDate() {
  const now = new Date();
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const dayName = days[now.getDay()];
  const dateNum = now.getDate();
  const monthName = months[now.getMonth()];
  const yearBE = now.getFullYear() + 543;
  return `วัน${dayName}ที่ ${dateNum} ${monthName} ${yearBE}`;
}

function initAttendanceUI() {
  const attDateEl = document.getElementById('attendanceDate');
  const indicatorEl = document.getElementById('statusIndicator');
  const timeDisplayEl = document.getElementById('clockTimeDisplay');
  const btnClockIn = document.getElementById('btnClockIn');
  const btnClockOut = document.getElementById('btnClockOut');

  if (attDateEl) attDateEl.textContent = formatThaiDate();

  const data = getAttendanceData();
  const status = data.status || 'not_clocked_in';

  if (status === 'clocked_in') {
    if (indicatorEl) {
      indicatorEl.innerHTML = `<span style="color:#059669;">🟢 เข้างานแล้ว</span> (เวลา ${data.clockInTime || '--:--'} น.)`;
    }
    if (timeDisplayEl) timeDisplayEl.textContent = `${data.clockInTime || '--:--'} น.`;
    if (btnClockIn) btnClockIn.style.display = 'none';
    if (btnClockOut) {
      btnClockOut.style.display = 'flex';
      btnClockOut.innerHTML = `<i data-feather="log-out"></i> ลงเวลาออกงาน & สรุปผล`;
    }
  } else if (status === 'clocked_out') {
    if (indicatorEl) {
      indicatorEl.innerHTML = `<span style="color:#64748b;">⚪ ออกงานแล้ว</span> (เวลา ${data.clockOutTime || '--:--'} น.)`;
    }
    if (timeDisplayEl) timeDisplayEl.textContent = `${data.clockInTime || '--:--'} - ${data.clockOutTime || '--:--'}`;
    if (btnClockIn) btnClockIn.style.display = 'none';
    if (btnClockOut) {
      btnClockOut.style.display = 'flex';
      btnClockOut.innerHTML = `<i data-feather="file-text"></i> ดูสรุปผลการวิ่งงานวันนี้`;
    }
  } else {
    if (indicatorEl) {
      indicatorEl.innerHTML = `<span style="color:#ef4444;">🔴 ยังไม่ได้ลงเวลาเข้างาน</span>`;
    }
    if (timeDisplayEl) timeDisplayEl.textContent = `--:-- น.`;
    if (btnClockIn) btnClockIn.style.display = 'flex';
    if (btnClockOut) btnClockOut.style.display = 'none';
  }

  try { feather.replace(); } catch (_) {}
}

function setupAttendanceListeners() {
  const btnClockIn = document.getElementById('btnClockIn');
  const btnClockOut = document.getElementById('btnClockOut');
  const btnCloseModal = document.getElementById('btnCloseSummaryModal');
  const btnConfirmClockOut = document.getElementById('btnConfirmClockOut');
  const modal = document.getElementById('summaryModal');

  if (btnClockIn) {
    btnClockIn.addEventListener('click', () => {
      const nowStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      saveAttendanceData({
        status: 'clocked_in',
        clockInTime: nowStr,
        clockInTimestamp: Date.now()
      });
      if (navigator.vibrate) navigator.vibrate(100);
      initAttendanceUI();

      // Log clock-in to Google Sheet in background
      postData(SCRIPT_URL_ORDER, "log_attendance", {
        date: todayISO(),
        employeeId: userData.id || '',
        employeeName: userData.nickname ? `${userData.username} (${userData.nickname})` : (userData.username || ''),
        type: 'เข้างาน',
        clockInTime: nowStr
      }).catch(err => console.warn("Log clock-in error:", err));
    });
  }

  if (btnClockOut) {
    btnClockOut.addEventListener('click', () => {
      openSummaryModal();
    });
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });
  }

  if (btnConfirmClockOut) {
    btnConfirmClockOut.addEventListener('click', async () => {
      const attData = getAttendanceData();
      if (attData.status !== 'clocked_out') {
        const nowStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        saveAttendanceData({
          status: 'clocked_out',
          clockOutTime: nowStr,
          clockOutTimestamp: Date.now()
        });
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        // Calculate stats for Google Sheets log
        try {
          const tasks = await loadMergedTasks();
          let success = 0, cancel = 0, pending = 0;
          tasks.forEach(t => {
            const st = JSON.stringify(t);
            if (st.includes('สำเร็จ') || st.includes('เรียบร้อย')) success++;
            else if (st.includes('ยกเลิก') || st.includes('ล้มเหลว')) cancel++;
            else pending++;
          });

          const totalHoursText = document.getElementById('sumTotalHours')?.textContent || '';

          postData(SCRIPT_URL_ORDER, "log_attendance", {
            date: todayISO(),
            employeeId: userData.id || '',
            employeeName: userData.nickname ? `${userData.username} (${userData.nickname})` : (userData.username || ''),
            type: 'ออกงาน',
            clockInTime: attData.clockInTime || '',
            clockOutTime: nowStr,
            totalHours: totalHoursText,
            totalJobs: tasks.length,
            successJobs: success,
            pendingJobs: pending,
            cancelJobs: cancel
          }).catch(err => console.warn("Log clock-out error:", err));
        } catch (_) {}
      }
      if (modal) modal.style.display = 'none';
      initAttendanceUI();
    });
  }
}

async function openSummaryModal() {
  const modal = document.getElementById('summaryModal');
  if (!modal) return;

  const attData = getAttendanceData();
  const nowStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const clockIn = attData.clockInTime || '--:--';
  const clockOut = attData.clockOutTime || nowStr;

  // Render Employee & Time details
  const empNameEl = document.getElementById('sumEmpName');
  const empIdEl = document.getElementById('sumEmpId');
  const dateTextEl = document.getElementById('sumDateText');
  const clockInEl = document.getElementById('sumClockInTime');
  const clockOutEl = document.getElementById('sumClockOutTime');
  const totalHoursEl = document.getElementById('sumTotalHours');
  const btnConfirm = document.getElementById('btnConfirmClockOut');

  if (empNameEl) empNameEl.textContent = userData.nickname ? `${userData.username} (${userData.nickname})` : (userData.username || '-');
  if (empIdEl) empIdEl.textContent = userData.id || '-';
  if (dateTextEl) dateTextEl.textContent = formatThaiDate();
  if (clockInEl) clockInEl.textContent = `${clockIn} น.`;
  if (clockOutEl) clockOutEl.textContent = `${clockOut} น.`;

  // Calculate work duration
  if (attData.clockInTimestamp) {
    const endTs = attData.clockOutTimestamp || Date.now();
    const diffMs = endTs - attData.clockInTimestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (totalHoursEl) totalHoursEl.textContent = `${hours} ชั่วโมง ${mins} นาที`;
  } else {
    if (totalHoursEl) totalHoursEl.textContent = `- ชั่วโมง`;
  }

  if (attData.status === 'clocked_out' && btnConfirm) {
    btnConfirm.textContent = 'ปิดหน้าต่างสรุปผล';
  } else if (btnConfirm) {
    btnConfirm.textContent = '✅ ยืนยันลงเวลาออกงาน';
  }

  modal.style.display = 'flex';

  // Fetch today's tasks and calculate summary stats
  try {
    const tasks = await loadMergedTasks();
    let total = tasks.length;
    let success = 0;
    let cancel = 0;
    let pending = 0;

    tasks.forEach(t => {
      const statusText = JSON.stringify(t);
      if (statusText.includes('สำเร็จ') || statusText.includes('เรียบร้อย')) {
        success++;
      } else if (statusText.includes('ยกเลิก') || statusText.includes('ล้มเหลว')) {
        cancel++;
      } else {
        pending++;
      }
    });

    const elTotal = document.getElementById('statTotalJobs');
    const elSuccess = document.getElementById('statSuccessJobs');
    const elPending = document.getElementById('statPendingJobs');
    const elCancel = document.getElementById('statCancelJobs');

    if (elTotal) elTotal.textContent = total;
    if (elSuccess) elSuccess.textContent = success;
    if (elPending) elPending.textContent = pending;
    if (elCancel) elCancel.textContent = cancel;
  } catch (err) {
    console.warn("Could not load task stats for modal:", err);
  }
}

async function updateTaskBadge() {
  const badge = document.getElementById('taskCountBadge');
  if (!badge) return;
  try {
    const tasks = await loadMergedTasks();
    const count = tasks.length;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (_) {
    badge.style.display = 'none';
  }
}

window.handleLogout = function handleLogout() {
  showConfirmModal({
    title: 'ออกจากระบบ',
    message: 'คุณต้องการออกจากระบบใช่หรือไม่?',
    confirmText: 'ออกจากระบบ',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
      localStorage.removeItem("tn_employee_token");
      localStorage.removeItem("tn_employee_user");
      window.location.href = '/employee/login_employee.html';
    }
  });
};

