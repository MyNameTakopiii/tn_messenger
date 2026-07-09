// src/js/scan.js
import feather from 'feather-icons';
import { Html5Qrcode } from 'html5-qrcode';
import { jsonp, SCRIPT_URL_ORDER } from '../config/api.js';
import { showConfirmModal } from '../utils/modal.js';

// Protect Route
const token = localStorage.getItem("tn_employee_token");
if (!token) {
  window.location.href = "/employee/login_employee.html";
}

// Initialize feather icons
feather.replace();

document.addEventListener("DOMContentLoaded", () => {
  // ซ่อน loading
  setTimeout(() => {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "none";
    startScanner();
  }, 500);
});

let isScanning = true;

function startScanner() {
  const html5QrCode = new Html5Qrcode("reader");
  const qrCodeSuccessCallback = async (decodedText, decodedResult) => {
    // เมื่อสแกนสำเร็จ
    if (!isScanning) return;

    console.log(`Code matched = ${decodedText}`, decodedResult);

    // ตรวจสอบว่าในลิงก์มีคำว่า order หรือไม่
    let orderId = "";
    try {
      const url = new URL(decodedText);
      orderId = url.searchParams.get("order");
    } catch (e) {
      // ถ้าไม่ใช่ URL อาจจะเป็นข้อความปกติ ให้ลองเช็คด้วย regex
      const match = decodedText.match(/[?&]order=([^&]+)/);
      if (match) orderId = match[1];
    }

    if (orderId) {
      isScanning = false; // หยุดสแกนชั่วคราว
      const cleanOrderId = orderId.toString().replace(/^0+/, ""); // ตัดเลข 0 ข้างหน้า

      // แสดง UI สำเร็จแบบไม่มีข้อความ
      const mainContainer = document.getElementById("main-container");
      if (mainContainer) mainContainer.classList.add("success-border");
      
      const loader = document.getElementById("mini-loader");
      if (loader) loader.style.display = "block";
      
      const icon = document.getElementById("header-icon");
      if (icon) icon.style.color = "var(--success)";

      try {
        // ยิง API เพื่อดึงข้อมูลงาน (get_task_by_id)
        const response = await jsonp(SCRIPT_URL_ORDER, {
          action: "get_task_by_id",
          data: { orderNo: cleanOrderId }
        });
        console.log("Fetch task success:", response);
        
        if (response && response.result === "success" && response.data) {
          const storedTasks = JSON.parse(localStorage.getItem("tasks_employee") || "{}");
          const today = new Date().toISOString().split('T')[0];
          const taskData = { ...response.data, scan_date: today };
          storedTasks[cleanOrderId] = taskData; // เก็บข้อมูลลงใน key ที่เป็นเลขที่ใบสั่งงาน
          localStorage.setItem("tasks_employee", JSON.stringify(storedTasks));
        }
      } catch (err) {
        console.error("Auto-fetch failed", err);
      } finally {
        // พากลับไปหน้าอัปเดต
        setTimeout(() => {
          window.location.href = `/employee/update-status.html?order=${orderId}`;
        }, 500);
      }

      // สั่นเบาๆ (ถ้าอุปกรณ์รองรับ)
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
    }
  };

  const config = {
    fps: 10,
    qrbox: { width: 220, height: 220 },
    aspectRatio: 1.0,
  };

  // เริ่มเปิดกล้องหลัง
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
