// src/js/update_status.js
import feather from 'feather-icons';
import flatpickr from 'flatpickr';
import { Thai } from 'flatpickr/dist/l10n/th.js';
import 'flatpickr/dist/flatpickr.min.css';
import { jsonp, SCRIPT_URL_ORDER } from '../config/api.js';
import { showConfirmModal } from '../utils/modal.js';

// Protect Route
const token = localStorage.getItem("tn_employee_token");
if (!token) {
  window.location.href = "/employee/login_employee.html";
}

// Initialize feather icons
feather.replace();

const urlParams = new URLSearchParams(window.location.search);
const orderFromURL = urlParams.get("order");

const orderInput = document.getElementById("orderNoInput");
const messengerNameInput = document.getElementById("messengerName");
const orderInfo = document.getElementById("orderInfo");
const resultMsg = document.getElementById("resultMsg");
const submitBtn = document.getElementById("submitBtn");

// ดึงข้อมูลพนักงานจาก localStorage
const userData = JSON.parse(
  localStorage.getItem("tn_employee_user") || "{}"
);

document.addEventListener("DOMContentLoaded", () => {
  if (messengerNameInput && userData.username) {
    messengerNameInput.value = userData.username;
    messengerNameInput.setAttribute("readonly", true);
  }

  // ถ้ามีเลขที่ใบสั่งงานจาก QR Code
  if (orderInput) {
    if (orderFromURL) {
      orderInput.value = orderFromURL;
      orderInput.setAttribute("readonly", true);
      fetchTaskData(orderFromURL);
    } else {
      if (orderInfo) orderInfo.textContent = "⚙️ กรอกเลขที่ใบสั่งงานเพื่ออัปเดตสถานะ";
      const form = document.getElementById("updateForm");
      if (form) form.style.display = "block";
    }

    // ฟังการเปลี่ยนแปลงใน input ถ้ากรอกมือ
    orderInput.addEventListener("change", (e) => {
      if (e.target.value.trim()) {
        fetchTaskData(e.target.value.trim());
      }
    });

    if (orderFromURL) {
      const res1 = document.getElementById("result1");
      if (res1) res1.focus();
    } else {
      orderInput.focus();
    }
  }
});

async function fetchTaskData(orderNo) {
  orderNo = orderNo.toString().replace(/^0+/, ""); // ตัดเลข 0 ที่นำหน้าออก
  const loading = document.getElementById("fetch-loading");
  const form = document.getElementById("updateForm");
  const summaryContainer = document.getElementById("summary-container");

  if (loading) loading.style.display = "block";
  if (form) form.style.display = "none";
  if (summaryContainer) summaryContainer.innerHTML = "";

  try {
    const response = await jsonp(SCRIPT_URL_ORDER, {
      action: "get_task_by_id",
      data: { orderNo }
    });
    console.log("API Response:", response);
    
    if (loading) loading.style.display = "none";
    if (response && response.result === "success" && response.data) {
      processTaskData(response.data);
    } else {
      if (form) form.style.display = "block";
    }
  } catch (err) {
    console.error("Fetch task error:", err);
    if (loading) loading.style.display = "none";
    if (form) form.style.display = "block";
  }
}

function processTaskData(data) {
  const form = document.getElementById("updateForm");
  const summaryContainer = document.getElementById("summary-container");
  const customerNameInput = document.getElementById("customerName");

  if (customerNameInput) {
    customerNameInput.value = data["ลูกค้า"] || "";
  }

  const s1 = data["ผลการวิ่งงาน 1: สถานะ"];
  const s2 = data["ผลการวิ่งงาน 2: สถานะ"];
  const s3 = data["ผลการวิ่งงาน 3: สถานะ"];

  const isFinished = (s) => s === "สำเร็จ" || s === "ลูกค้าขอยกเลิก";

  if (isFinished(s1) || isFinished(s2) || isFinished(s3)) {
    const finalStatus = isFinished(s1) ? s1 : isFinished(s2) ? s2 : s3;
    const isSuccess = finalStatus === "สำเร็จ";

    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="summary-card ${isSuccess ? "success" : "error"}">
          <i data-feather="${isSuccess ? "check-circle" : "x-circle"}"></i>
          <div class="summary-title">งานนี้ ${finalStatus} แล้ว</div>
          <div class="summary-detail">ไม่สามารถแก้ไขข้อมูลได้อีก</div>
        </div>
      `;
    }
    feather.replace();
    if (form) form.style.display = "none";
    return;
  }

  if (form) form.style.display = "block";
  const sections = [
    document.getElementById("section1"),
    document.getElementById("section2"),
    document.getElementById("section3"),
  ];

  sections.forEach((s) => {
    if (s) s.style.display = "none";
  });

  if (!s1) {
    if (sections[0]) sections[0].style.display = "block";
  } else if (!s2) {
    if (sections[1]) sections[1].style.display = "block";
  } else if (!s3) {
    if (sections[2]) sections[2].style.display = "block";
  } else {
    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="summary-card error">
          <i data-feather="alert-triangle"></i>
          <div class="summary-title">บันทึกครบ 3 ครั้งแล้ว</div>
          <div class="summary-detail">สถานะล่าสุด: ${s3} (ไม่สามารถบันทึกเพิ่มได้)</div>
        </div>
      `;
    }
    feather.replace();
    if (form) form.style.display = "none";
    return;
  }
}

// Highlight section on focus/blur
["result1", "result2", "result3"].forEach((id, index) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("focus", () => {
      const section = document.getElementById(`section${index + 1}`);
      if (section) section.classList.add("active");
    });
    el.addEventListener("blur", () => {
      const section = document.getElementById(`section${index + 1}`);
      if (section) section.classList.remove("active");
    });
  }
});

function showResult(type, message) {
  if (!resultMsg) return;
  resultMsg.className = type + " show";
  resultMsg.textContent = message;

  if (type === "success") {
    setTimeout(() => {
      if (!orderFromURL) {
        const form = document.getElementById("updateForm");
        if (form) form.reset();
        if (orderInput) orderInput.focus();
      } else {
        const fields = ["result1", "note1", "result2", "note2", "result3", "note3"];
        fields.forEach(f => {
          const el = document.getElementById(f);
          if (el) el.value = "";
        });
      }
      resultMsg.className = "";
    }, 3000);
  }
}

const updateForm = document.getElementById("updateForm");
if (updateForm) {
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const orderNo = formData.get("orderNo").trim();
    const messengerName = formData.get("messengerName").trim();
    const result1 = formData.get("result1");
    const note1 = formData.get("note1").trim();
    const result2 = formData.get("result2");
    const note2 = formData.get("note2").trim();
    const result3 = formData.get("result3");
    const note3 = formData.get("note3").trim();

    if (!orderNo) return showResult("error", "❌ กรุณากรอกเลขที่ใบสั่งงาน");
    if (!messengerName) return showResult("error", "❌ กรุณากรอกชื่อพนักงาน");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ กำลังบันทึก...";
    }
    showResult("loading", "⏳ กำลังบันทึกสถานะ...");

    // วันที่ปัจจุบัน dd/mm/yyyy
    const now = new Date();
    const autoDate = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}`;

    const isPostpone = (val) => val === "ลูกค้าขอเลื่อน" || val === "พนักงานขอเลื่อน" || val === "ลูกค้าไม่รับสาย";

    const payload = {
      action: "update",
      orderNo,
      messengerName,
      id: userData.id || "",
      result1: result1 || "",
      date1: result1 ? (isPostpone(result1) ? formData.get("rescheduledDate1") : autoDate) : "",
      note1: note1 || "",
      result2: result2 || "",
      date2: result2 ? (isPostpone(result2) ? formData.get("rescheduledDate2") : autoDate) : "",
      note2: note2 || "",
      result3: result3 || "",
      date3: result3 ? (isPostpone(result3) ? formData.get("rescheduledDate3") : autoDate) : "",
      note3: note3 || "",
      timestamp: new Date().toLocaleString("th-TH"),
    };

    // 1. Optimistic Local Storage Update (Instant Feedback <100ms)
    const storedTasks = JSON.parse(localStorage.getItem("tasks_employee") || "{}");
    const cleanOrderNo = orderNo.toString().replace(/^0+/, "");
    
    if (!storedTasks[cleanOrderNo]) {
      storedTasks[cleanOrderNo] = {
        'เลขที่ใบสั่งงาน': cleanOrderNo,
        orderNo: cleanOrderNo,
        scan_date: new Date().toISOString().split('T')[0],
        _source: 'scan'
      };
    }
    
    const task = storedTasks[cleanOrderNo];
    if (payload.result1) {
      task["ผลการวิ่งงาน 1: สถานะ"] = payload.result1;
      task["ผลการวิ่งงาน 1: วัน/เดือน/ปี"] = payload.date1;
      task["ผลการวิ่งงาน 1: หมายเหตุ"] = payload.note1;
    }
    if (payload.result2) {
      task["ผลการวิ่งงาน 2: สถานะ"] = payload.result2;
      task["ผลการวิ่งงาน 2: วัน/เดือน/ปี"] = payload.date2;
      task["ผลการวิ่งงาน 2: หมายเหตุ"] = payload.note2;
    }
    if (payload.result3) {
      task["ผลการวิ่งงาน 3: สถานะ"] = payload.result3;
      task["ผลการวิ่งงาน 3: วัน/เดือน/ปี"] = payload.date3;
      task["ผลการวิ่งงาน 3: หมายเหตุ"] = payload.note3;
    }
    task["ชื่อพนักงาน"] = messengerName;
    task["รหัสพนักงาน"] = userData.id || "";
    localStorage.setItem("tasks_employee", JSON.stringify(storedTasks));

    // Show immediate success to user
    showResult("success", "✅ บันทึกสถานะลงเครื่องเรียบร้อย! (กำลังซิงค์กับเซิร์ฟเวอร์...)");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ กำลังซิงค์...";
    }

    // 2. Background sync to Google Sheet
    try {
      const response = await jsonp(SCRIPT_URL_ORDER, {
        action: "update",
        data: payload
      }, 12000);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "💾 บันทึกสถานะ";
      }

      if (response && response.result === "success") {
        showResult("success", "✅ อัปเดตสถานะสมบูรณ์และซิงค์ข้อมูลเรียบร้อย!");
      } else {
        showResult("error", "⚠️ บันทึกในเครื่องแล้ว แต่เซิร์ฟเวอร์แจ้งเตือน: " + ((response && response.message) || "ไม่สามารถอัปเดตบนเซิร์ฟเวอร์ได้"));
      }
    } catch (error) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "💾 บันทึกสถานะ";
      }
      console.warn("Background sync error:", error);
      showResult("success", "✅ บันทึกสถานะลงเครื่องเรียบร้อย! (ระบบจะซิงค์ใหม่อัตโนมัติเมื่อออนไลน์)");
    }
  });
}

// เปิด/ปิดช่องกรอกวันที่ขอเลื่อน
window.togglePostponeDate = function togglePostponeDate(index) {
  const select = document.getElementById(`result${index}`);
  const container = document.getElementById(`date-postpone-container-${index}`);
  const dateInput = document.getElementById(`rescheduledDate${index}`);

  if (select && select.value === "ลูกค้าขอเลื่อน" || select.value === "พนักงานขอเลื่อน" || select.value === "ลูกค้าไม่รับสาย") {
    if (container) container.style.display = "block";
    if (dateInput && !dateInput._flatpickr) {
      flatpickr(dateInput, {
        locale: Thai,
        altInput: true,
        altFormat: "d/m/Y",
        dateFormat: "d/m/Y",
        defaultDate: "today",
      });
    }
  } else {
    if (container) container.style.display = "none";
  }
};

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
