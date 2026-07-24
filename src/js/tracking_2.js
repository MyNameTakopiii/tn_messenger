// src/js/tracking_2.js
import feather from 'feather-icons';
import { SHEET_A_ID } from '../config/api.js';

const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_A_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('ใบสั่งงาน')}&cacheBust=${Date.now()}`;
let currentOrderNo = null;

feather.replace();

document.addEventListener("DOMContentLoaded", () => {
  const orderInput = document.getElementById('orderInput');
  if (orderInput) {
    orderInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchOrder();
    });
  }

  // Read order from URL param
  const urlParams = new URLSearchParams(window.location.search);
  const orderFromURL = urlParams.get("order");
  if (orderFromURL && orderInput) {
    orderInput.value = orderFromURL;
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
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลจากระบบได้");

    const csvText = await res.text();
    const rows = csvText.trim().split("\n").map(r =>
      r.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    );

    if (rows.length <= 1) {
      showError('⚠ ไม่พบข้อมูลในระบบ');
      return;
    }

    const dataRows = rows.slice(1);
    const orderRow = dataRows.find(r => {
      const rowOrderNo = (r[16] || "").replace(/"/g, '').trim();
      return String(Number(rowOrderNo)) === String(Number(orderNo));
    });

    if (!orderRow) {
      showError(`⚠ ไม่พบเลขที่ใบสั่งงาน ${orderNo}`);
      return;
    }

    displayOrderInfo(orderRow);
    if (trackingCard) trackingCard.classList.add('show');

  } catch (err) {
    showError('⚠ เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    if (loadingMsg) loadingMsg.classList.remove('show');
    if (searchBtn) searchBtn.disabled = false;
  }
};

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

function displayOrderInfo(row) {
  const clean = text => (text || "").replace(/"/g, "").trim();

  const displayOrderNo = document.getElementById('displayOrderNo');
  if (displayOrderNo) displayOrderNo.textContent = clean(row[16]);

  const mappings = {
    'team': row[3],
    'requester': row[4],
    'phone': row[5],
    'project': row[2],
    'collectDate': formatDateOnly(row[1]),
    'customer': row[6],
    'addrStreet': row[9],
    'subdistrict': row[10],
    'district': row[11],
    'province': row[12]
  };

  for (const [id, value] of Object.entries(mappings)) {
    const el = document.getElementById(id);
    if (el) el.textContent = id === 'collectDate' ? value : (clean(value) || '-');
  }

  buildTimeline(row);
}

function buildTimeline(row) {
  const clean = text => (text || "").replace(/"/g, "").trim();
  const timeline = document.getElementById('timeline');
  if (!timeline) return;

  timeline.innerHTML = '';

  const results = [
    {
      status: clean(row[17]),
      date: clean(row[18]),
      note: clean(row[19]),
      label: 'สถานะครั้งที่ 1'
    },
    {
      status: clean(row[20]),
      date: clean(row[21]),
      note: clean(row[22]),
      label: 'สถานะครั้งที่ 2'
    },
    {
      status: clean(row[23]),
      date: clean(row[24]),
      note: clean(row[25]),
      label: 'สถานะครั้งที่ 3'
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
