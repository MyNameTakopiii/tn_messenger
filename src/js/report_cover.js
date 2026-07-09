// src/js/report_cover.js
import flatpickr from 'flatpickr';
import { Thai } from 'flatpickr/dist/l10n/th.js';
import 'flatpickr/dist/flatpickr.min.css';
import { jsPDF } from 'jspdf';
import feather from 'feather-icons';
import { jsonp, SCRIPT_URL_ORDER } from '../config/api.js';

let reportData = null;
let startDate = "";
let endDate = "";

// Initialize feather icons
feather.replace();

document.addEventListener("DOMContentLoaded", () => {
  flatpickr("#dateRange", {
    locale: Thai,
    mode: "range",
    dateFormat: "Y-m-d",
    onChange(dates) {
      if (dates.length >= 1) startDate = formatISO(dates[0]);
      if (dates.length >= 2) endDate = formatISO(dates[1]);
      else if (dates.length === 1) endDate = startDate;
    },
  });

  const btnGenerate = document.getElementById("btnGenerate");
  const btnPdf = document.getElementById("btnPdf");

  if (btnGenerate) btnGenerate.addEventListener("click", fetchReport);
  if (btnPdf) btnPdf.addEventListener("click", downloadPdf);
});

function formatISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toThaiDate(iso) {
  if (!iso) return "-";
  const p = iso.split("-");
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${parseInt(p[0], 10) + 543}`;
}

function showError(msg) {
  const el = document.getElementById("errorMsg");
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
  }
}

function hideError() {
  const el = document.getElementById("errorMsg");
  if (el) el.style.display = "none";
}

async function fetchReport() {
  if (!startDate) {
    showError("กรุณาเลือกช่วงวันที่");
    return;
  }
  if (!endDate) endDate = startDate;
  hideError();

  const btn = document.getElementById("btnGenerate");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "กำลังโหลด...";
  }

  try {
    const json = await jsonp(SCRIPT_URL_ORDER, {
      action: "get_cover_report",
      data: { startDate, endDate }
    });

    if (json.result !== "success") {
      throw new Error(json.message || "ไม่สามารถโหลดรายงานได้");
    }
    reportData = json;
    renderPreview(json);
    const btnPdf = document.getElementById("btnPdf");
    if (btnPdf) btnPdf.disabled = false;
  } catch (err) {
    showError("⚠ " + err.message + " — ตรวจสอบว่า deploy Apps Script แล้ว (ดู apps-script/DEPLOY.md)");
    reportData = buildDemoReport();
    renderPreview(reportData);
    const btnPdf = document.getElementById("btnPdf");
    if (btnPdf) btnPdf.disabled = false;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-feather="search"></i> สร้างรายงาน';
    }
    feather.replace();
  }
}

function buildDemoReport() {
  return {
    header: {
      company: "TN MESSENGER SERVICE",
      title: "รายงานปกวัน",
      dateRange: `${toThaiDate(startDate)}${startDate !== endDate ? " - " + toThaiDate(endDate) : ""}`,
      generatedAt: new Date().toLocaleString("th-TH"),
    },
    rows: [],
    totals: { count: 0 },
    _demo: true,
  };
}

function renderPreview(data) {
  const preview = document.getElementById("preview");
  if (!preview) return;

  const h = data.header || {};
  const rows = data.rows || [];
  const keys = rows.length ? Object.keys(rows[0]) : [];

  let tableHtml = "";
  if (rows.length && keys.length) {
    tableHtml = `
      <table class="report-table">
        <thead>
          <tr>${keys.map((k) => `<th>${k}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${keys.map((k) => `<td>${row[k] ?? "-"}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>`;
  } else {
    tableHtml = `<div class="empty">${data._demo ? "ไม่มีข้อมูล (demo mode — deploy get_cover_report ใน Apps Script)" : "ไม่พบข้อมูลในช่วงวันที่ที่เลือก"}</div>`;
  }

  preview.innerHTML = `
    <div class="cover-header">
      <h2>${h.company || "TN MESSENGER SERVICE"}</h2>
      <div style="font-size:16px;font-weight:600;margin-top:8px;">${h.title || "รายงานปกวัน"}</div>
      <div class="cover-meta">วันที่: ${h.dateRange || "-"}</div>
      <div class="cover-meta">สร้างเมื่อ: ${h.generatedAt || "-"}</div>
    </div>
    ${tableHtml}
    <div class="totals">รวม ${(data.totals && data.totals.count) ?? rows.length} รายการ</div>
  `;
}

async function ensureThaiFonts(doc) {
  if (!window.TNPromptFonts) {
    await import('../utils/load-prompt.js');
  }
  window.TNPromptFonts.load(doc);
}

function drawCoverReport(doc, data) {
  const margin = 15;
  let y = margin;
  const h = data.header || {};
  const rows = data.rows || [];
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont("Prompt", "bold");
  doc.setFontSize(18);
  doc.text(h.company || "TN MESSENGER SERVICE", pageW / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(14);
  doc.text(h.title || "รายงานปกวัน", pageW / 2, y, { align: "center" });
  y += 8;

  doc.setFont("Prompt", "normal");
  doc.setFontSize(11);
  doc.text(`วันที่: ${h.dateRange || "-"}`, margin, y);
  y += 6;
  doc.text(`สร้างเมื่อ: ${h.generatedAt || "-"}`, margin, y);
  y += 10;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  if (rows.length === 0) {
    doc.text("ไม่พบข้อมูลในช่วงวันที่ที่เลือก", margin, y);
    return;
  }

  const keys = Object.keys(rows[0]);
  const colW = (pageW - margin * 2) / Math.min(keys.length, 6);
  const displayKeys = keys.slice(0, 6);

  doc.setFont("Prompt", "bold");
  doc.setFontSize(9);
  displayKeys.forEach((k, i) => {
    doc.text(String(k).substring(0, 18), margin + i * colW, y);
  });
  y += 6;

  doc.setFont("Prompt", "normal");
  doc.setFontSize(8);
  rows.forEach((row) => {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = margin;
    }
    displayKeys.forEach((k, i) => {
      const val = String(row[k] ?? "-").substring(0, 24);
      doc.text(val, margin + i * colW, y);
    });
    y += 5;
  });

  y += 6;
  doc.setFont("Prompt", "bold");
  doc.text(`รวม ${(data.totals && data.totals.count) ?? rows.length} รายการ`, margin, y);
}

async function downloadPdf() {
  if (!reportData) return;
  const btn = document.getElementById("btnPdf");
  if (btn) btn.disabled = true;

  try {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    await ensureThaiFonts(doc);
    drawCoverReport(doc, reportData);
    const fname = `TN-รายงานปก_${startDate}${endDate !== startDate ? "_" + endDate : ""}.pdf`;
    doc.save(fname);
  } catch (err) {
    alert("❌ สร้าง PDF ไม่สำเร็จ: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}
