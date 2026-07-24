// src/js/tablelist.js
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import flatpickr from 'flatpickr';
import { Thai } from 'flatpickr/dist/l10n/th.js';
import 'flatpickr/dist/flatpickr.min.css';
import 'flatpickr/dist/themes/light.css';
import { jsonp, SCRIPT_URL_ORDER } from '../config/api.js';

const CACHE_KEY = "tn_table_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
let _fontsLoaded = false;
let useServerPagination = true;
let currentPage = 0;
let pageSize = 50;
let totalRows = 0;
let tableHeaders = [];
let selectedDateFilter = null;
let filterDebounceTimer = null;
let allRows = [];
let filteredRows = [];
const pinnedColumns = new Set();

async function ensureThaiFonts() {
  if (_fontsLoaded && window.TNPromptFonts) return;
  if (!window.TNPromptFonts) {
    await import('../utils/load-prompt.js');
  }
  _fontsLoaded = true;
}

const loadThaiFont = async (doc) => {
  await ensureThaiFonts();
  window.TNPromptFonts.load(doc);
};

// Generate QR Code as Data URL
async function generateQRCodeImage(text) {
  try {
    return await QRCode.toDataURL(text);
  } catch (err) {
    console.error("QR Code generation error:", err);
    return null;
  }
}

function formatThaiDateTime(timestamp) {
  if (!timestamp || timestamp.trim() === "-") return "-";
  const parts = timestamp.split(", ");
  if (parts.length !== 2) return timestamp;

  const datePart = parts[0];
  const timePart = parts[1];
  const dateParts = datePart.split("/");

  if (dateParts.length !== 3) return timestamp;

  const month = dateParts[0];
  const day = dateParts[1];
  const yearAD = parseInt(dateParts[2], 10);

  if (isNaN(yearAD)) return timestamp;

  const yearBE = yearAD + 543;
  return `${day}/${month}/${yearBE}, ${timePart}`;
}

function formatToThaiDateOnly(dateString) {
  if (!dateString || dateString.trim() === "-") return "-";
  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;

  const yearAD = parseInt(parts[0], 10);
  const month = parts[1];
  const day = parts[2];

  if (isNaN(yearAD)) return dateString;

  const yearBE = yearAD + 543;
  return `${day}/${month}/${yearBE}`;
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeCache(payload) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...payload, ts: Date.now() })
    );
  } catch (_) {}
}

function buildTableHead(keys) {
  const theadRow = document.getElementById("tableHeadRow");
  if (!theadRow) return;

  theadRow.innerHTML = "";
  keys.forEach((h, index) => {
    const th = document.createElement("th");
    th.textContent = h;
    th.dataset.columnIndex = index;
    th.addEventListener("click", () => togglePinColumn(index));
    theadRow.appendChild(th);
  });
  const thPrint = document.createElement("th");
  thPrint.textContent = "พิมพ์";
  thPrint.dataset.columnIndex = keys.length;
  thPrint.addEventListener("click", () => togglePinColumn(keys.length));
  theadRow.appendChild(thPrint);
}

function updatePaginationUI() {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(currentPage + 1, totalPages);
  
  const pageInfo = document.getElementById("pageInfo");
  const btnPrevPage = document.getElementById("btnPrevPage");
  const btnNextPage = document.getElementById("btnNextPage");

  if (pageInfo) pageInfo.textContent = `หน้า ${page} / ${totalPages}`;
  if (btnPrevPage) btnPrevPage.disabled = currentPage <= 0;
  if (btnNextPage) btnNextPage.disabled = currentPage >= totalPages - 1;
}

window.debouncedFilterTable = function debouncedFilterTable() {
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => {
    currentPage = 0;
    loadTableData();
  }, 300);
};

async function fetchPaginatedFromServer() {
  const searchInput = document.getElementById("searchInput");
  const search = searchInput ? searchInput.value.trim() : "";
  
  const queryData = {
    offset: currentPage * pageSize,
    limit: pageSize
  };
  if (search) queryData.search = search;
  if (selectedDateFilter) queryData.date = selectedDateFilter;

  return jsonp(SCRIPT_URL_ORDER, {
    action: "get_rows_paginated",
    data: queryData
  }).then(json => {
    if (json.result !== "success") throw new Error(json.message || "API error");
    return json;
  });
}

async function fetchAllRowsFallback() {
  return jsonp(SCRIPT_URL_ORDER, {
    action: "get_all_row_json"
  }).then(json => {
    if (json.result !== "success" || !Array.isArray(json.data)) {
      throw new Error(json.message || "โหลดข้อมูลไม่สำเร็จ");
    }
    return json.data.slice().reverse();
  });
}

function clientFilterRows(rows) {
  const searchInput = document.getElementById("searchInput");
  const searchText = searchInput ? searchInput.value.toLowerCase().trim() : "";

  return rows.filter((row) => {
    let dateMatch = true;
    if (selectedDateFilter) {
      const rawDate = (row["วันที่เก็บเอกสาร"] || "").trim();
      const [year, month, day] = selectedDateFilter.split("-");
      const formattedDate = `${day}/${month}/${year}`;
      dateMatch = rawDate === formattedDate;
    }
    let searchMatch = true;
    if (searchText) {
      searchMatch = Object.values(row).some((cell) =>
        (cell || "").toString().toLowerCase().includes(searchText)
      );
    }
    return dateMatch && searchMatch;
  });
}

function renderTableRows(rows) {
  const tbody = document.getElementById("tableBody");
  const countLabel = document.getElementById("countLabel");
  const headRow = document.getElementById("tableHeadRow");
  const colCount = headRow ? headRow.children.length : 20;

  if (!tbody) return;

  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center; color:#6b7280;">🔭 ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
    if (countLabel) countLabel.textContent = `(รวม 0 รายการ)`;
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    Object.values(r).forEach((c, index) => {
      const td = document.createElement("td");
      td.textContent = c || "-";
      td.dataset.columnIndex = index;
      tr.appendChild(td);
    });
    const tdPrint = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn-print";
    btn.textContent = "🖨️ ดาวน์โหลด PDF";
    btn.onclick = () => generateOrderPDF(r);
    tdPrint.dataset.columnIndex = Object.keys(r).length;
    tdPrint.appendChild(btn);
    tr.appendChild(tdPrint);
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
  if (countLabel) countLabel.textContent = `(รวม ${totalRows} รายการ)`;
  if (pinnedColumns.size > 0) updatePinnedColumns();
}

async function loadTableData(options = {}) {
  const { silent = false } = options;
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;

  if (!silent) {
    tbody.innerHTML = `<tr><td colspan="20" style="text-align:center; color:#6b7280;">⏳ กำลังโหลดข้อมูล...</td></tr>`;
  }

  try {
    if (useServerPagination) {
      try {
        const json = await fetchPaginatedFromServer();
        filteredRows = json.data || [];
        totalRows = json.total || 0;
        if (json.headers && json.headers.length) {
          tableHeaders = json.headers;
          buildTableHead(tableHeaders);
        } else if (filteredRows[0]) {
          tableHeaders = Object.keys(filteredRows[0]);
          buildTableHead(tableHeaders);
        }
        allRows = filteredRows;
        renderTableRows(filteredRows);
        updatePaginationUI();
        writeCache({
          mode: "server",
          rows: filteredRows,
          total: totalRows,
          headers: tableHeaders,
          page: currentPage,
        });
        return;
      } catch (err) {
        console.warn("Server pagination unavailable, falling back:", err);
        useServerPagination = false;
      }
    }

    const cached = readCache();
    if (cached && cached.mode === "client" && cached.allRows) {
      allRows = cached.allRows;
    } else {
      allRows = await fetchAllRowsFallback();
      writeCache({ mode: "client", allRows });
    }

    filteredRows = clientFilterRows(allRows);
    totalRows = filteredRows.length;
    if (allRows[0]) {
      tableHeaders = Object.keys(allRows[0]);
      buildTableHead(tableHeaders);
    }
    const start = currentPage * pageSize;
    const pageRows = filteredRows.slice(start, start + pageSize);
    renderTableRows(pageRows);
    updatePaginationUI();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="20" style="text-align:center; padding: 24px; color:#dc2626;">
      <div style="font-weight: 600; font-size: 15px; margin-bottom: 10px;">❌ โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>
      <button onclick="window.reloadTableData()" style="padding: 8px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">🔄 ลองใหม่อีกครั้ง</button>
    </td></tr>`;
  }
}
window.reloadTableData = loadTableData;

async function loadJSONData() {
  const cached = readCache();
  if (cached && cached.rows && cached.rows.length) {
    filteredRows = cached.rows;
    totalRows = cached.total || cached.rows.length;
    currentPage = cached.page || 0;
    if (cached.headers) {
      tableHeaders = cached.headers;
      buildTableHead(tableHeaders);
    }
    renderTableRows(cached.rows);
    updatePaginationUI();
  }
  try {
    const meta = await jsonp(SCRIPT_URL_ORDER, { action: "get_rows_meta" });
    if (meta.result === "success") {
      const cacheRaw = sessionStorage.getItem(CACHE_KEY);
      const cacheParsed = cacheRaw ? JSON.parse(cacheRaw) : null;
      if (
        !cacheParsed ||
        cacheParsed.total !== meta.total ||
        cacheParsed.lastUpdated !== meta.lastUpdated
      ) {
        await loadTableData({ silent: !!cached });
      }
      return;
    }
  } catch (_) {}
  await loadTableData({ silent: !!cached });
}

function filterTable() {
  currentPage = 0;
  loadTableData();
}

function changePage(delta) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const next = currentPage + delta;
  if (next < 0 || next >= totalPages) return;
  currentPage = next;
  if (useServerPagination) {
    loadTableData();
  } else {
    const start = currentPage * pageSize;
    renderTableRows(filteredRows.slice(start, start + pageSize));
    updatePaginationUI();
  }
}

function togglePinColumn(columnIndex) {
  if (pinnedColumns.has(columnIndex)) {
    pinnedColumns.delete(columnIndex);
  } else {
    pinnedColumns.add(columnIndex);
  }
  updatePinnedColumns();
}

function updatePinnedColumns() {
  const theadRow = document.getElementById("tableHeadRow");
  const tbody = document.getElementById("tableBody");
  if (!theadRow || !tbody) return;

  theadRow.querySelectorAll("th").forEach((th) => {
    th.classList.remove("pinned");
    th.style.left = "";
  });
  tbody.querySelectorAll("td").forEach((td) => {
    td.classList.remove("pinned");
    td.style.left = "";
  });

  const sortedPinned = Array.from(pinnedColumns).sort((a, b) => a - b);
  let cumulativeLeft = 0;
  sortedPinned.forEach((colIndex) => {
    const th = theadRow.querySelector(`th[data-column-index="${colIndex}"]`);
    if (th) {
      th.classList.add("pinned");
      th.style.left = `${cumulativeLeft}px`;

      const tds = tbody.querySelectorAll(`td[data-column-index="${colIndex}"]`);
      tds.forEach((td) => {
        td.classList.add("pinned");
        td.style.left = `${cumulativeLeft}px`;
      });

      cumulativeLeft += th.offsetWidth;
    }
  });
}

function drawOrder(doc, startX, startY, data, qrDataURL, side = "left") {
  const FORM_WIDTH = 130;
  const COL_WIDTH = FORM_WIDTH / 2;
  const TEXT_PAD = 2;
  const MARGIN_CENTER = 15;
  const LINE_HEIGHT = 4.2;

  let x = startX;
  let y = startY;

  /**************** HEADER ****************/
  doc.setFont("Prompt", "bold");
  doc.setFontSize(16);
  doc.text("TN MESSENGER SERVICE", x + FORM_WIDTH / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(10);
  doc.text(`เลขที่ใบสั่งงาน  ${data.orderNo}  ${data.dateTime}`, x + FORM_WIDTH / 2, y, { align: "center" });
  y += 10;

  /**************** 1. ข้อมูลทั่วไป ****************/
  const gTop = y;
  doc.setFont("Prompt", "bold");
  doc.setFontSize(10);
  doc.text("ข้อมูลทั่วไป", x + TEXT_PAD, gTop + 4);

  doc.setFont("Prompt", "normal");
  doc.setFontSize(8);

  let gy = gTop + 10;
  doc.text(`ทีม: ${data.team}`, x + TEXT_PAD, gy);
  gy += LINE_HEIGHT;
  doc.text(`ชื่อผู้สั่งงาน: ${data.requester}`, x + TEXT_PAD, gy);
  gy += LINE_HEIGHT;
  doc.text(`อีเมล: ${data.email}`, x + TEXT_PAD, gy);
  gy += LINE_HEIGHT;
  const projLines = doc.splitTextToSize(`โครงการ: ${data.project}`, COL_WIDTH - 2 * TEXT_PAD);
  doc.text(projLines, x + TEXT_PAD, gy);
  gy += projLines.length * LINE_HEIGHT;

  let gyRight = gTop + 10;
  doc.text(`เลขที่ใบสั่งงาน: ${data.orderNo}`, x + COL_WIDTH + TEXT_PAD, gyRight);
  gyRight += LINE_HEIGHT;
  doc.text(`โทร: ${data.requesterPhone}`, x + COL_WIDTH + TEXT_PAD, gyRight);
  gyRight += LINE_HEIGHT;
  doc.text(`วันที่เก็บเอกสาร: ${data.collectDate}`, x + COL_WIDTH + TEXT_PAD, gyRight);

  const gHeight = Math.max(gy, gyRight) - gTop + 3;
  doc.rect(x, gTop, FORM_WIDTH, gHeight);

  y = gTop + gHeight + 3;

  /**************** 2. รายละเอียดลูกค้า ****************/
  const cTop = y;
  const cHeight = 16;
  doc.rect(x, cTop, FORM_WIDTH, cHeight);
  doc.setFont("Prompt", "bold");
  doc.setFontSize(10);
  doc.text("รายละเอียดลูกค้า", x + TEXT_PAD, cTop + 4);

  doc.setFont("Prompt", "normal");
  doc.setFontSize(8);
  doc.text(`ลูกค้า: ${data.customerName}`, x + TEXT_PAD, cTop + 11.5);
  doc.text(`เบอร์: ${data.customerPhone}`, x + COL_WIDTH + TEXT_PAD, cTop + 11.5);

  y = cTop + cHeight + 3;

  /**************** 3. DOCS + ADDRESS ****************/
  const sTop = y;
  doc.setFont("Prompt", "bold");
  doc.setFontSize(10);
  doc.text("เอกสารที่ต้องจัดเก็บ", x + TEXT_PAD, sTop + 4);

  let docsY = sTop + 10;
  doc.setFont("Prompt", "normal");
  doc.setFontSize(8);

  data.documents.forEach((dname, i) => {
    if (dname && dname !== "-") {
      const displayText = dname.match(/^\d+\. /) ? dname : `${i + 1}. ${dname}`;
      const w = doc.splitTextToSize(displayText, COL_WIDTH - 2 * TEXT_PAD);
      doc.text(w, x + TEXT_PAD, docsY);
      docsY += w.length * LINE_HEIGHT;
    }
  });
  const docsH = docsY - sTop;

  doc.setFont("Prompt", "bold");
  doc.setFontSize(10);
  doc.text("สถานที่รับเอกสาร", x + COL_WIDTH + TEXT_PAD, sTop + 4);

  let addrY = sTop + 10;
  doc.setFont("Prompt", "normal");
  doc.setFontSize(8);

  const addr = [
    `เลขที่/ถนน: ${data.addrStreet}`,
    `แขวง: ${data.subdistrict}`,
    `เขต: ${data.district}`,
    `จังหวัด: ${data.province}/${data.zipcode}`,
  ];

  addr.forEach((line) => {
    const w = doc.splitTextToSize(line, COL_WIDTH - 2 * TEXT_PAD);
    doc.text(w, x + COL_WIDTH + TEXT_PAD, addrY);
    addrY += w.length * LINE_HEIGHT;
  });
  const addrH = addrY - sTop;

  const sHeight = Math.max(docsH, addrH) + 3;
  doc.rect(x, sTop, COL_WIDTH, sHeight);
  doc.rect(x + COL_WIDTH, sTop, COL_WIDTH, sHeight);

  y = sTop + sHeight + 3;

  /**************** 4. หมายเหตุ ****************/
  const nTop = y;
  doc.setFont("Prompt", "bold");
  doc.setFontSize(10);
  doc.text("หมายเหตุ:", x + TEXT_PAD, nTop + 4);

  doc.setFont("Prompt", "normal");
  doc.setFontSize(8);

  const noteLines = doc.splitTextToSize(data.note, FORM_WIDTH - 2 * TEXT_PAD);
  const noteH = noteLines.length === 0 ? 15 : noteLines.length * LINE_HEIGHT + 12;

  doc.text(noteLines, x + TEXT_PAD, nTop + 10.5);
  doc.rect(x, nTop, FORM_WIDTH, noteH);

  y = nTop + noteH + 3;

  /**************** 5. ผลการวิ่งงาน (3 ครั้ง) ****************/
  const rTop = y;
  const NAME_H = 6;
  const STATUS_H = 9;
  const REASON_COL_W = 50;
  const STATUS_COL_W = FORM_WIDTH - REASON_COL_W;
  const STATUS_ITEM_W = STATUS_COL_W / 3;

  doc.setFont("Prompt", "bold");
  doc.setFontSize(12);
  doc.text("ผลการวิ่งงาน", x + FORM_WIDTH / 2, rTop + 4, { align: "center" });

  let ry = rTop + 8;
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);

  for (let i = 1; i <= 3; i++) {
    let rx = x;
    doc.setFont("Prompt", "normal");
    doc.setFontSize(9);
    doc.text(`ครั้งที่ ${i} ชื่อพนักงาน...............................................................`, rx + TEXT_PAD, ry + 3.5);

    const BOX_TOP = ry + NAME_H;
    doc.rect(rx, BOX_TOP, STATUS_COL_W, STATUS_H);
    doc.rect(rx + STATUS_COL_W, BOX_TOP, REASON_COL_W, STATUS_H);

    const V_CENTER = BOX_TOP + STATUS_H / 2 + 1.5;
    doc.text("สำเร็จ", rx + TEXT_PAD, V_CENTER);
    doc.line(rx + STATUS_ITEM_W, BOX_TOP, rx + STATUS_ITEM_W, BOX_TOP + STATUS_H);

    doc.text("ยกเลิก", rx + STATUS_ITEM_W + TEXT_PAD, V_CENTER);
    doc.line(rx + STATUS_ITEM_W * 2, BOX_TOP, rx + STATUS_ITEM_W * 2, BOX_TOP + STATUS_H);

    doc.text("เลื่อนวันที่", rx + STATUS_ITEM_W * 2 + TEXT_PAD, V_CENTER);
    doc.text("เหตุผล", rx + STATUS_COL_W + TEXT_PAD, V_CENTER);

    ry = BOX_TOP + STATUS_H + 3;
  }

  y = ry;

  /************** QR CODE ****************/
  if (qrDataURL && side === "left") {
    const qrSize = 30;
    const qrPadding = 2;
    const qrX = startX + FORM_WIDTH - qrSize + 5;
    const qrY = startY - 8;

    doc.setFillColor(255, 255, 255);
    doc.rect(qrX - qrPadding, qrY - qrPadding, qrSize + (qrPadding * 2), qrSize + (qrPadding * 2), "F");
    doc.addImage(qrDataURL, "PNG", qrX, qrY, qrSize, qrSize);
  }

  if (side === "left") {
    doc.setDrawColor(200, 200, 200);
    doc.line(startX + FORM_WIDTH + MARGIN_CENTER / 2, startY - 10, startX + FORM_WIDTH + MARGIN_CENTER / 2, y);
    doc.setDrawColor(0, 0, 0);
  }

  return y;
}

async function generateOrderPDF(row) {
  const clean = (text) => (text || "").replace(/"/g, "").trim();
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "landscape",
  });

  await loadThaiFont(doc);

  const orderNo = clean(row["เลขที่ใบสั่งงาน"]).padStart(4, "0");
  const dateTime = formatThaiDateTime(clean(row["ประทับเวลา"]));
  const updateURL = `${window.location.origin}/employee/update-status.html?order=${orderNo}`;
  const qrDataURL = await generateQRCodeImage(updateURL);
  const collectDate = formatToThaiDateOnly(clean(row["วันที่เก็บเอกสาร"]));
  const provinceZip = clean(row["จังหวัด/รหัสไปรษณีย์"]);
  const [province, zipcode] = provinceZip.split(" ");
  const fullData = {
    orderNo: orderNo,
    dateTime: dateTime,
    team: clean(row["(ทีม)"]),
    requester: clean(row["ผู้สั่งงาน"]),
    requesterPhone: clean(row["เบอร์โทรศัพท์"]),
    email: clean(row["e-mail"]),
    project: clean(row["โครงการ"]),
    collectDate: collectDate,
    customerName: clean(row["ลูกค้า"]),
    customerPhone: clean(row["เบอร์โทรศัพท์ลูกค้า"]),
    addrStreet: clean(row["ที่อยู่รับเอกสาร เลขที่ ถนน"]),
    subdistrict: clean(row["แขวง/ตำบล"]),
    district: clean(row["เขต/อำเภอ"]),
    province: province || "",
    zipcode: zipcode || "",
    documents: clean(row["เอกสารที่ต้องจัดเก็บทั้งหมด"])
      .split("|")
      .map((d) => d.trim())
      .filter((d) => d !== "-" && d !== "" && d !== " "),
    note: clean(row["หมายเหตุ"]),
  };

  const topY = 15;
  const X_LEFT = 11;
  const X_RIGHT = 156;

  drawOrder(doc, X_LEFT, topY, fullData, qrDataURL, "left");
  drawOrder(doc, X_RIGHT, topY, fullData, qrDataURL, "right");

  doc.save(`TN-ใบสั่งงาน_${orderNo || "no"}.pdf`);
}

async function getAllFilteredRowsForExport() {
  if (!useServerPagination) {
    return filteredRows.length ? filteredRows : allRows;
  }
  const searchInput = document.getElementById("searchInput");
  const search = searchInput ? searchInput.value.trim() : "";
  
  const queryData = {
    offset: 0,
    limit: 10000
  };
  if (search) queryData.search = search;
  if (selectedDateFilter) queryData.date = selectedDateFilter;

  return jsonp(SCRIPT_URL_ORDER, {
    action: "get_rows_paginated",
    data: queryData
  }).then(json => {
    if (json.result === "success") return json.data || [];
    return filteredRows;
  });
}

window.downloadAllPDF = async function downloadAllPDF() {
  const btn = document.getElementById("btnDownloadAll");
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = "⏳ กำลังเตรียมข้อมูล...";

  let rowsToDownload;
  try {
    rowsToDownload = await getAllFilteredRowsForExport();
  } catch (_) {
    rowsToDownload = filteredRows.length > 0 ? filteredRows : allRows;
  }

  if (rowsToDownload.length === 0) {
    alert("❌ ไม่มีข้อมูลให้ดาวน์โหลด");
    btn.disabled = false;
    btn.textContent = "📥 ดาวน์โหลดทั้งหมด (PDF)";
    return;
  }

  btn.textContent = `⏳ กำลังสร้าง PDF... (${rowsToDownload.length} รายการ)`;

  try {
    const clean = (text) => (text || "").replace(/"/g, "").trim();
    const doc = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "landscape",
    });

    await loadThaiFont(doc);

    const qrDataURLs = [];
    for (const row of rowsToDownload) {
      const orderNo = clean(row["เลขที่ใบสั่งงาน"]);
      const updateURL = `${window.location.origin}/employee/update-status.html?order=${orderNo}`;
      const qrDataURL = await generateQRCodeImage(updateURL);
      qrDataURLs.push(qrDataURL);
    }

    rowsToDownload.forEach((row, index) => {
      if (index > 0) doc.addPage();

      const orderNo = clean(row["เลขที่ใบสั่งงาน"]).padStart(4, "0");
      const dateTime = formatThaiDateTime(clean(row["ประทับเวลา"]));
      const qrDataURL = qrDataURLs[index];
      const collectDate = formatToThaiDateOnly(clean(row["วันที่เก็บเอกสาร"]));

      const fullData = {
        orderNo: orderNo,
        dateTime: dateTime,
        team: clean(row["(ทีม)"]),
        requester: clean(row["ผู้สั่งงาน"]),
        requesterPhone: clean(row["เบอร์โทรศัพท์"]),
        email: clean(row["e-mail"]),
        project: clean(row["โครงการ"]),
        collectDate: collectDate,
        customerName: clean(row["ลูกค้า"]),
        customerPhone: clean(row["เบอร์โทรศัพท์ลูกค้า"]),
        addrStreet: clean(row["ที่อยู่รับเอกสาร เลขที่ ถนน"]),
        subdistrict: clean(row["แขวง/ตำบล"]),
        district: clean(row["เขต/อำเภอ"]),
        province: clean(row["จังหวัด/รหัสไปรษณีย์"]).split("/")[0].trim(),
        zipcode: clean(row["จังหวัด/รหัสไปรษณีย์"]).split("/")[1]
          ? clean(row["จังหวัด/รหัสไปรษณีย์"]).split("/")[1].trim()
          : "",
        documents: clean(row["เอกสารที่ต้องจัดเก็บทั้งหมด"])
          .split("|")
          .map((d) => d.trim())
          .filter((d) => d !== "-" && d !== "" && d !== " "),
        note: clean(row["หมายเหตุ"]),
      };

      const topY = 15;
      const X_LEFT = 11;
      const X_RIGHT = 156;

      drawOrder(doc, X_LEFT, topY, fullData, qrDataURL, "left");
      drawOrder(doc, X_RIGHT, topY, fullData, qrDataURL, "right");
    });

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    doc.save(`TN-ใบสั่งงานทั้งหมด_${timestamp}.pdf`);

    btn.disabled = false;
    btn.textContent = "📥 ดาวน์โหลดทั้งหมด (PDF)";
    alert(`✅ ดาวน์โหลดสำเร็จ! (${rowsToDownload.length} รายการ)`);
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาดในการดาวน์โหลด: " + err.message);
    console.error("Download Error:", err);
    btn.disabled = false;
    btn.textContent = "📥 ดาวน์โหลดทั้งหมด (PDF)";
  }
};

window.clearDateFilter = function clearDateFilter() {
  selectedDateFilter = null;
  const input = document.getElementById("dateFilterInput");
  const clearBtn = document.getElementById("clearDateFilterBtn");
  
  if (input) input.value = "";
  if (clearBtn) clearBtn.style.display = "none";
  filterTable();
  if (input && input._flatpickr) {
    input._flatpickr.clear();
  }
};

function setupDatePicker() {
  const dateInput = document.getElementById("dateFilterInput");
  const clearBtn = document.getElementById("clearDateFilterBtn");
  if (!dateInput) return;

  const fp = flatpickr(dateInput, {
    locale: Thai,
    altInput: true,
    altFormat: "d/m/Y พ.ศ.",
    dateFormat: "Y-m-d",
    disableMobile: true,
    onChange: function (selectedDates, dateStr) {
      if (selectedDates.length > 0) {
        selectedDateFilter = dateStr;
        if (clearBtn) clearBtn.style.display = "block";
      } else {
        selectedDateFilter = null;
        if (clearBtn) clearBtn.style.display = "none";
      }
      filterTable();
    },
    onClose: function (selectedDates) {
      if (selectedDates.length === 0) {
        selectedDateFilter = null;
        if (clearBtn) clearBtn.style.display = "none";
        filterTable();
      }
    },
  });

  dateInput._flatpickr = fp;
}

document.addEventListener("DOMContentLoaded", () => {
  setupDatePicker();
  loadJSONData();
  
  const btnPrevPage = document.getElementById("btnPrevPage");
  const btnNextPage = document.getElementById("btnNextPage");
  const pageSizeSelect = document.getElementById("pageSizeSelect");

  if (btnPrevPage) btnPrevPage.addEventListener("click", () => changePage(-1));
  if (btnNextPage) btnNextPage.addEventListener("click", () => changePage(1));
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (e) => {
      pageSize = parseInt(e.target.value, 10) || 50;
      currentPage = 0;
      loadTableData();
    });
  }
});
