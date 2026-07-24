// src/js/scan.js
import feather from 'feather-icons';
import { Html5Qrcode } from 'html5-qrcode';
import { jsonp, postData, SCRIPT_URL_ORDER } from '../config/api.js';
import { showConfirmModal } from '../utils/modal.js';
import '../utils/pwa-install.js';

// Protect Route
const token = localStorage.getItem("tn_employee_token");
if (!token) {
  window.location.href = "/employee/login_employee.html";
}

// Initialize feather icons
feather.replace();

let isScanning = true;
let scannedSessionMap = new Set();
let sessionLogItems = [];

document.addEventListener("DOMContentLoaded", () => {
  // Hide loading overlay
  setTimeout(() => {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "none";
    startScanner();
    updateBatchCounter();
  }, 500);
});

function getEmployeeUser() {
  try {
    return JSON.parse(localStorage.getItem("tn_employee_user") || "{}");
  } catch (_) {
    return {};
  }
}

function updateBatchCounter() {
  const storedTasks = JSON.parse(localStorage.getItem("tasks_employee") || "{}");
  const today = new Date().toISOString().split('T')[0];
  let countToday = 0;

  Object.values(storedTasks).forEach(t => {
    if (t.scan_date === today || t._source === 'assigned') {
      countToday++;
    }
  });

  const batchCountEl = document.getElementById("batchCount");
  const btnTaskCountEl = document.getElementById("btnTaskCount");
  if (batchCountEl) batchCountEl.textContent = countToday;
  if (btnTaskCountEl) btnTaskCountEl.textContent = countToday;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById("toastAlert");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast-alert ${type}`;
  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

function addLogItem(orderNo, customer, project) {
  const logItemsContainer = document.getElementById("logItems");
  if (!logItemsContainer) return;

  sessionLogItems.unshift({ orderNo, customer, project, time: new Date().toLocaleTimeString('th-TH') });

  const emptyLog = logItemsContainer.querySelector(".empty-log");
  if (emptyLog) emptyLog.remove();

  const paddedOrder = `#${String(orderNo).padStart(4, '0')}`;
  const itemCard = document.createElement("div");
  itemCard.className = "log-item-card";
  itemCard.innerHTML = `
    <div>
      <span class="log-item-order">${paddedOrder}</span>
      <span class="log-item-customer"> - ${customer || 'ลูกค้าทั่วไป'} (${project || '-'})</span>
    </div>
    <span style="font-size: 11px; color: #10b981; font-weight: 600;">✅ รับงานแล้ว</span>
  `;

  logItemsContainer.prepend(itemCard);
}

function startScanner() {
  const html5QrCode = new Html5Qrcode("reader");

  const qrCodeSuccessCallback = async (decodedText, decodedResult) => {
    if (!isScanning) return;

    console.log(`Code matched = ${decodedText}`, decodedResult);

    let orderId = "";
    try {
      const url = new URL(decodedText);
      orderId = url.searchParams.get("order");
    } catch (e) {
      const match = decodedText.match(/[?&]order=([^&]+)/);
      if (match) orderId = match[1];
      else if (/^\d+$/.test(decodedText.trim())) orderId = decodedText.trim();
    }

    if (orderId) {
      isScanning = false; // Pause scanner during processing
      const cleanOrderId = orderId.toString().replace(/^0+/, "");
      const user = getEmployeeUser();
      const employeeId = user.id || user.username || "";
      const employeeFullName = user.last_name
        ? `${user.username || ''} ${user.last_name || ''}`
        : user.username || user.nickname || "พนักงานจัดส่ง";

      // Prevent duplicate scan in current session
      if (scannedSessionMap.has(cleanOrderId)) {
        showToast(`⚠️ ใบสั่งงาน #${cleanOrderId.padStart(4, '0')} รับไปแล้วในเซสชันนี้`, 'warning');
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        setTimeout(() => {
          isScanning = true;
        }, 1500);
        return;
      }

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }

      const loader = document.getElementById("mini-loader");
      if (loader) loader.style.display = "block";

      try {
        let taskData = {
          'เลขที่ใบสั่งงาน': cleanOrderId,
          orderNo: cleanOrderId,
          'ลูกค้า': 'ใบสั่งงาน #' + cleanOrderId,
          'โครงการ': '-'
        };

        try {
          // 1. Fetch task details from backend (with 4s timeout)
          const response = await jsonp(SCRIPT_URL_ORDER, {
            action: "get_task_by_id",
            data: { orderNo: cleanOrderId }
          }, 4000);

          if (response && response.result === "success" && response.data) {
            taskData = { ...taskData, ...response.data };
          }
        } catch (fetchErr) {
          console.warn("Could not fetch detailed task info from server, using local fallback:", fetchErr);
        }

        // Always ensure 'เลขที่ใบสั่งงาน' exists
        taskData['เลขที่ใบสั่งงาน'] = taskData['เลขที่ใบสั่งงาน'] || cleanOrderId;

        // 2. Save to Local Storage for employee's daily list IMMEDIATELY
        const storedTasks = JSON.parse(localStorage.getItem("tasks_employee") || "{}");
        const today = new Date().toISOString().split('T')[0];
        const fullTaskData = {
          ...taskData,
          'รหัสพนักงานที่มอบหมาย': employeeId,
          'ชื่อพนักงาน': employeeFullName,
          scan_date: today,
          _source: 'scan'
        };

        storedTasks[cleanOrderId] = fullTaskData;
        localStorage.setItem("tasks_employee", JSON.stringify(storedTasks));

        // Mark scanned in current session
        scannedSessionMap.add(cleanOrderId);

        // Update UI immediately
        showToast(`✅ บันทึกรับงาน #${cleanOrderId.padStart(4, '0')} เรียบร้อย!`, 'success');
        addLogItem(cleanOrderId, fullTaskData['ลูกค้า'], fullTaskData['โครงการ']);
        updateBatchCounter();

        // 3. Assign employee ID and name to Google Sheet in background (Non-blocking)
        postData(SCRIPT_URL_ORDER, "update", {
          orderNo: cleanOrderId,
          id: employeeId,
          messengerName: employeeFullName
        }).catch(assignErr => {
          console.warn("Background sheet update notification warning:", assignErr);
        });

      } catch (err) {
        console.error("Scan processing error:", err);
        showToast(`❌ เกิดข้อผิดพลาดในการสแกนใบงาน #${cleanOrderId}`, 'error');
      } finally {
        if (loader) loader.style.display = "none";
        // Auto resume scanner for continuous batch scanning
        setTimeout(() => {
          isScanning = true;
        }, 800);
      }
    }
  };

  const config = {
    fps: 10,
    qrbox: { width: 220, height: 220 },
    aspectRatio: 1.0,
  };

  html5QrCode
    .start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
    .catch((err) => {
      console.error("Unable to start scanning.", err);
      const reader = document.getElementById("reader");
      if (reader) {
        reader.innerHTML = `
          <div style="padding: 20px; color: var(--error);">
              <i data-feather="alert-circle"></i><br>
              ไม่สามารถเข้าถึงกล้องได้<br>
              กรุณาตรวจสอบการอนุญาตใช้งานกล้อง
          </div>
        `;
      }
      feather.replace();
    });
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
      window.location.href = "/employee/login_employee.html";
    }
  });
};
