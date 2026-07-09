// src/js/tracking_admin.js
import { jsonp, SCRIPT_URL_ORDER } from '../config/api.js';

let currentOrderNo = null;

document.addEventListener("DOMContentLoaded", () => {
  const orderInput = document.getElementById('orderInput');
  if (orderInput) {
    orderInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchOrder();
    });
  }

  // Parse URL query param if present
  const params = new URLSearchParams(window.location.search);
  const order = params.get('order');
  if (order && orderInput) {
    orderInput.value = order;
    searchOrder();
  }
});

function showError(message) {
  const errorMsg = document.getElementById('errorMsg');
  if (errorMsg) {
    errorMsg.textContent = message;
    errorMsg.classList.add('show');
    setTimeout(() => errorMsg.classList.remove('show'), 5000);
  }
}

function getStatusIcon(status) {
  const statusMap = {
    'สำเร็จ': { emoji: '●', class: 'success' },
    'ลูกค้าขอเลื่อน': { emoji: '!', class: 'warning' },
    'ลูกค้าไม่รับสาย': { emoji: '✖', class: 'error' },
    'พนักงานขอเลื่อน': { emoji: '!', class: 'warning' },
    'ลูกค้าขอยกเลิก': { emoji: '✖', class: 'error' },
    'ใบหน้างานซ้ำ': { emoji: '?', class: 'warning' }
  };
  return statusMap[status] || { emoji: '…', class: 'pending' };
}

async function fetchOrderById(orderNo) {
  const cleanOrderNo = orderNo.replace(/^0+/, "");
  return jsonp(SCRIPT_URL_ORDER, {
    action: "get_task_by_id",
    data: { orderNo: cleanOrderNo }
  }).then(response => {
    if (response && response.result === "success" && response.data) {
      return response.data;
    } else {
      throw new Error((response && response.message) || "ไม่พบข้อมูล");
    }
  });
}

window.searchOrder = async function searchOrder() {
  const orderInput = document.getElementById('orderInput');
  if (!orderInput) return;

  const orderNo = orderInput.value.trim();
  if (!orderNo) {
    showError('⚠ กรุณากรอกเลขที่ใบสั่งงาน');
    return;
  }

  currentOrderNo = orderNo;
  const loadingMsg = document.getElementById('loadingMsg');
  const trackingCard = document.getElementById('trackingCard');
  const searchBtn = document.getElementById('searchBtn');

  if (loadingMsg) loadingMsg.classList.add('show');
  if (trackingCard) trackingCard.classList.remove('show');
  if (searchBtn) searchBtn.disabled = true;

  try {
    const data = await fetchOrderById(orderNo);
    displayOrderInfo(data);
    if (trackingCard) trackingCard.classList.add('show');
  } catch (err) {
    showError('⚠ ' + err.message);
  } finally {
    if (loadingMsg) loadingMsg.classList.remove('show');
    if (searchBtn) searchBtn.disabled = false;
  }
};

function displayOrderInfo(data) {
  const clean = text => (text || "").toString().trim();

  const displayOrderNo = document.getElementById('displayOrderNo');
  if (displayOrderNo) displayOrderNo.textContent = clean(data["เลขที่ใบสั่งงาน"]);

  const mappings = {
    'team': data["(ทีม)"],
    'requester': data["ผู้สั่งงาน"],
    'phone': data["เบอร์โทรศัพท์"],
    'project': data["โครงการ"],
    'collectDate': data["วันที่เก็บเอกสาร"],
    'customer': data["ลูกค้า"],
    'addrStreet': data["ที่อยู่รับเอกสาร เลขที่ ถนน"],
    'subdistrict': data["แขวง/ตำบล"],
    'district': data["เขต/อำเภอ"],
    'province': data["จังหวัด/รหัสไปรษณีย์"]
  };

  for (const [id, value] of Object.entries(mappings)) {
    const el = document.getElementById(id);
    if (el) el.textContent = clean(value) || '-';
  }

  buildTimeline(data);
}

function buildTimeline(data) {
  const clean = text => (text || "").toString().trim();
  const timeline = document.getElementById('timeline');
  if (!timeline) return;

  timeline.innerHTML = '';

  const results = [
    {
      status: clean(data["ผลการวิ่งงาน 1: สถานะ"]),
      date: clean(data["ผลการวิ่งงาน 1: วันที่"]),
      note: clean(data["ผลการวิ่งงาน 1: หมายเหตุ"]),
      label: 'ผลการวิ่งงาน 1'
    },
    {
      status: clean(data["ผลการวิ่งงาน 2: สถานะ"]),
      date: clean(data["ผลการวิ่งงาน 2: วันที่"]),
      note: clean(data["ผลการวิ่งงาน 2: หมายเหตุ"]),
      label: 'ผลการวิ่งงาน 2'
    },
    {
      status: clean(data["ผลการวิ่งงาน 3: สถานะ"]),
      date: clean(data["ผลการวิ่งงาน 3: วันที่"]),
      note: clean(data["ผลการวิ่งงาน 3: หมายเหตุ"]),
      label: 'ผลการวิ่งงาน 3'
    }
  ].filter(r => r.status);

  if (results.length === 0) {
    timeline.innerHTML = '<div class="empty-timeline">ยังไม่มีการอัปเดตสถานะ<br><small style="color:#9ca3af; margin-top:8px; display:block;">กรุณารอการอัปเดตจากทีมงาน</small></div>';
    return;
  }

  results.forEach((result) => {
    const statusInfo = getStatusIcon(result.status);
    const item = document.createElement('div');
    item.className = 'timeline-item';

    item.innerHTML = `
      <div class="timeline-dot ${statusInfo.class}">${statusInfo.emoji}</div>
      <div class="timeline-content ${statusInfo.class}">
        <div class="timeline-status">${result.label}: ${result.status}</div>
        ${result.date ? `<div class="timeline-date"><strong>วันที่:</strong> ${formatThaiDate(result.date)}</div>` : ''}
        ${result.note ? `<div class="timeline-note"><strong>หมายเหตุ:</strong> ${result.note}</div>` : ''}
      </div>
    `;

    timeline.appendChild(item);
  });
}

function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date)) {
      return dateStr;
    }
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}
