// src/js/home.js
import feather from 'feather-icons';
import { loadMergedTasks } from '../utils/tn-employee-tasks.js';
import { showConfirmModal } from '../utils/modal.js';

// Protect Route: ตรวจสอบ Token ทันที
const token = localStorage.getItem("tn_employee_token");
const userDataStr = localStorage.getItem("tn_employee_user");

if (!token || !userDataStr) {
  window.location.href = '/employee/login_employee.html';
}

// Initialize feather icons
feather.replace();

document.addEventListener('DOMContentLoaded', () => {
  const userData = JSON.parse(localStorage.getItem("tn_employee_user") || "{}");
  
  if (userData.id) {
    // แสดงข้อมูลในหน้าเว็บ
    const elements = {
      userId: userData.id || '-',
      userName: userData.username || '-',
      userFirstName: userData.username || '-', // username ในที่นี้คือชื่อจริงที่ส่งไปตอนสมัคร
      userLastName: userData.last_name || '-',
      userEmail: userData.email || '-',
      userNickname: userData.nickname || '-'
    };
    
    Object.keys(elements).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = elements[id];
    });
    
    // ปรับแต่ง UI เล็กน้อย
    const displayName = document.getElementById('displayName');
    if (displayName) {
      displayName.textContent = `ยินดีต้อนรับ คุณ${userData.nickname || userData.username}`;
    }
    const avatarText = document.getElementById('avatarText');
    if (avatarText) {
      avatarText.textContent = (userData.nickname || userData.username).charAt(0).toUpperCase();
    }
  }

  // ซ่อน loading ครู่หนึ่งเพื่อให้ดูเนียน
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 500);
  }

  updateTaskBadge();
  setInterval(updateTaskBadge, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateTaskBadge();
  });
});

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
