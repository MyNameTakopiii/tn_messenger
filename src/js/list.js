// src/js/list.js
import feather from 'feather-icons';
import { loadMergedTasks, getScannedTasks } from '../utils/tn-employee-tasks.js';
import { showConfirmModal } from '../utils/modal.js';

// Protect Route
const token = localStorage.getItem("tn_employee_token");
if (!token) {
  window.location.href = "/employee/login_employee.html";
}

// Initialize feather icons
feather.replace();

const taskContainer = document.getElementById("task-container");
const detailModal = document.getElementById("detail-modal");
const modalBody = document.getElementById("modal-body");
const modalTitle = document.getElementById("modal-title");

document.addEventListener("DOMContentLoaded", () => {
  fetchTasks();
  setInterval(() => {
    if (document.visibilityState === "visible") fetchTasks();
  }, 45000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fetchTasks();
  });
});

let pollNoticeShown = false;
let isFirstLoad = true;

async function fetchTasks() {
  if (!taskContainer) return;
  
  const initialScanned = getScannedTasks();
  if (isFirstLoad && initialScanned.length === 0) {
    taskContainer.innerHTML = `
      <div id="loading-state">
        <i data-feather="loader" class="spin"></i>
        <p>กำลังโหลดจากระบบ...</p>
      </div>
    `;
    feather.replace();
  } else if (isFirstLoad) {
    renderTasks(initialScanned);
  }

  try {
    const taskList = await loadMergedTasks();
    renderTasks(taskList);
  } catch (err) {
    if (!pollNoticeShown) {
      pollNoticeShown = true;
      console.warn("ใช้ข้อมูลจากเครื่อง (deploy Apps Script เพื่อ sync):", err);
    }
    renderTasks(getScannedTasks());
  } finally {
    isFirstLoad = false;
  }
}

function renderTasks(tasks) {
  if (!taskContainer) return;
  if (!tasks || tasks.length === 0) {
    taskContainer.innerHTML = `<div class="no-data" style="text-align: center; padding: 40px; color: var(--text-light);">ไม่มีรายการงานที่ได้รับมอบหมาย</div>`;
    return;
  }

  taskContainer.innerHTML = "";
  tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = "task-card";

    const orderNo = task["เลขที่ใบสั่งงาน"] || task.orderNo || task.id || "-";
    const latestStatus = task["ผลการวิ่งงาน 3: สถานะ"] || 
                         task["ผลการวิ่งงาน 2: สถานะ"] || 
                         task["ผลการวิ่งงาน 1: สถานะ"] || 
                         "รอดำเนินการ";
    
    let statusClass = "status-badge";
    if (latestStatus === "สำเร็จ") statusClass += " status-success";
    else if (["ลูกค้าขอเลื่อน", "พนักงานขอเลื่อน", "ลูกค้าไม่รับสาย"].includes(latestStatus)) statusClass += " status-warning";
    else if (["ลูกค้าขอยกเลิก", "ใบหน้างานซ้ำ"].includes(latestStatus)) statusClass += " status-error";

    const sourceBadge =
      task._source === "assigned"
        ? '<span class="source-badge">มอบหมาย</span>'
        : task._source === "scan"
          ? '<span class="source-badge scan">สแกน QR</span>'
          : "";

    // Escape task object JSON safely for HTML attribute
    const escapedTaskJson = JSON.stringify(task).replace(/'/g, "&apos;").replace(/"/g, '&quot;');

    card.innerHTML = `
      <div class="task-header">
        <span class="order-no">
          #${orderNo}
          <span class="${statusClass}">${latestStatus}</span>
          ${sourceBadge}
        </span>
      </div>
      
      <div class="info-row">
        <span class="info-label">โครงการ / ทีม :</span>
        <span class="info-value">${task["โครงการ"] || "-"} / ${task["(ทีม)"] || "-"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">ชื่อผู้สั่งงาน :</span>
        <span class="info-value">${task["ผู้สั่งงาน"] || "-"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">เบอร์ผู้สั่งงาน :</span>
        <span class="info-value">${task["เบอร์โทรศัพท์"] || "-"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">ชื่อลูกค้า :</span>
        <span class="info-value">${task["ลูกค้า"] || "-"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">เบอร์ลูกค้า :</span>
        <span class="info-value">${task["เบอร์โทรศัพท์ลูกค้า"] || "-"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">สถานที่ติดต่อ :</span>
        <span class="info-value">${task["ที่อยู่รับเอกสาร เลขที่ ถนน"] || ""} ${task["แขวง/ตำบล"] || ""} ${task["เขต/อำเภอ"] || ""} ${task["จังหวัด/รหัสไปรษณีย์"] || ""}</span>
      </div>

      <div class="card-actions">
        <button class="btn btn-detail" data-task="${escapedTaskJson}">
          <i data-feather="eye"></i> ดูรายละเอียด
        </button>
         <a href="/employee/update-status.html?order=${orderNo}" class="btn btn-update">
          <i data-feather="edit-3"></i> อัปเดตสถานะ
        </a>
      </div>
    `;
    
    // Add event listener to the detail button instead of inline onclick
    const detailBtn = card.querySelector(".btn-detail");
    if (detailBtn) {
      detailBtn.addEventListener("click", () => {
        showDetails(task);
      });
    }

    taskContainer.appendChild(card);
  });
  feather.replace();
}

function formatDateOnly(val) {
  if (val === null || val === undefined || val === '') return '-';
  const str = String(val).trim().replace(/"/g, '');
  if (!str || str === '-') return '-';

  const dmYMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmYMatch) {
    const d = dmYMatch[1].padStart(2, '0');
    const m = dmYMatch[2].padStart(2, '0');
    return `${d}/${m}/${dmYMatch[3]}`;
  }

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    const d = String(parsedDate.getDate()).padStart(2, '0');
    const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const y = parsedDate.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return str;
}

window.showDetails = function showDetails(task) {
  if (!modalTitle || !modalBody || !detailModal) return;
  const orderNo = task["เลขที่ใบสั่งงาน"] || task.orderNo || task.id || "-";
  modalTitle.innerText = `รายละเอียดงาน #${orderNo}`;
  modalBody.innerHTML = "";

  for (const [key, value] of Object.entries(task)) {
    const item = document.createElement("div");
    item.className = "detail-item";
    let displayVal = value !== null && value !== undefined ? value : "-";
    if (key === "วันที่เก็บเอกสาร" || (key.includes("วันที่") && key !== "ประทับเวลา")) {
      displayVal = formatDateOnly(displayVal);
    }
    item.innerHTML = `
      <span class="detail-label">${key}</span>
      <span class="detail-value">${displayVal}</span>
    `;
    modalBody.appendChild(item);
  }

  detailModal.style.display = "flex";
  feather.replace();
};

window.closeModal = function closeModal() {
  if (detailModal) detailModal.style.display = "none";
};

// Close modal on background click
window.onclick = function (event) {
  if (event.target == detailModal) {
    window.closeModal();
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
