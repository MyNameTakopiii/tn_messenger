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
  const teamSelect = document.getElementById("teamSelect");
  const requesterSelect = document.getElementById("requesterSelect");

  if (btnGenerate) btnGenerate.addEventListener("click", fetchReport);
  if (btnPdf) btnPdf.addEventListener("click", downloadPdf);

  if (teamSelect) teamSelect.addEventListener("change", () => renderPreview(reportData));
  if (requesterSelect) requesterSelect.addEventListener("change", () => renderPreview(reportData));
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
    showError("กรุณาเลือกช่วงวันที่เก็บเอกสาร");
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
    populateFilters(json);
    renderPreview(json);
    const btnPdf = document.getElementById("btnPdf");
    if (btnPdf) btnPdf.disabled = false;
  } catch (err) {
    showError("⚠ " + err.message);
    reportData = buildDemoReport();
    populateFilters(reportData);
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

function populateFilters(data) {
  const teamSelect = document.getElementById("teamSelect");
  const requesterSelect = document.getElementById("requesterSelect");

  const teams = data.teams || extractUnique(data.rows || [], 'ทีม');
  const requesters = data.requesters || extractUnique(data.rows || [], 'ผู้สั่งงาน');

  if (teamSelect) {
    const currentVal = teamSelect.value;
    teamSelect.innerHTML = '<option value="">-- ทั้งหมด --</option>';
    teams.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if (t === currentVal) opt.selected = true;
      teamSelect.appendChild(opt);
    });
  }

  if (requesterSelect) {
    const currentVal = requesterSelect.value;
    requesterSelect.innerHTML = '<option value="">-- ทั้งหมด --</option>';
    requesters.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      if (r === currentVal) opt.selected = true;
      requesterSelect.appendChild(opt);
    });
  }
}

function extractUnique(rows, key) {
  const set = {};
  rows.forEach(r => {
    const val = String(r[key] || '').trim();
    if (val) set[val] = true;
  });
  return Object.keys(set).sort();
}

function buildDemoReport() {
  return {
    header: {
      company: "TN MESSENGER SERVICE",
      title: "รายงานปกวัน (รายงานปิดวัน)",
      dateRange: `${toThaiDate(startDate)}${startDate !== endDate ? " - " + toThaiDate(endDate) : ""}`,
      generatedAt: new Date().toLocaleString("th-TH"),
    },
    rows: [],
    teams: [],
    requesters: [],
    totals: { count: 0 },
    _demo: true,
  };
}

function getFilteredRows(data) {
  if (!data || !data.rows) return [];
  const teamVal = document.getElementById("teamSelect")?.value || "";
  const reqVal = document.getElementById("requesterSelect")?.value || "";

  return data.rows.filter(row => {
    const t = String(row['ทีม'] || '').trim();
    const r = String(row['ผู้สั่งงาน'] || '').trim();

    if (teamVal && t !== teamVal) return false;
    if (reqVal && r !== reqVal) return false;
    return true;
  });
}

function groupRowsByTeamReqDate(rows) {
  const groupsMap = {};

  rows.forEach(row => {
    const team = (row['ทีม'] || 'ไม่ระบุทีม').trim();
    const requester = (row['ผู้สั่งงาน'] || 'ไม่ระบุผู้สั่งงาน').trim();
    const collectDate = (row['วันที่เก็บเอกสาร'] || row['วันที่'] || '-').trim();

    const groupKey = `${team}___${requester}___${collectDate}`;
    if (!groupsMap[groupKey]) {
      groupsMap[groupKey] = {
        team,
        requester,
        collectDate,
        items: []
      };
    }
    groupsMap[groupKey].items.push(row);
  });

  return Object.values(groupsMap);
}

function renderPreview(data) {
  const preview = document.getElementById("preview");
  if (!preview) return;

  if (!data || (!data.rows && !data._demo)) {
    preview.innerHTML = '<div class="empty">เลือกช่วงวันที่แล้วกด "สร้างรายงาน"</div>';
    return;
  }

  const filteredRows = getFilteredRows(data);
  const groups = groupRowsByTeamReqDate(filteredRows);
  const h = data.header || {};

  if (groups.length === 0) {
    preview.innerHTML = `
      <div class="cover-header">
        <h2>${h.company || "TN MESSENGER SERVICE"}</h2>
        <div style="font-size:16px;font-weight:600;margin-top:8px;">${h.title || "รายงานปกวัน (รายงานปิดวัน)"}</div>
        <div class="cover-meta">วันที่เก็บเอกสาร: ${h.dateRange || "-"}</div>
      </div>
      <div class="empty">${data._demo ? "ไม่มีข้อมูลที่ตรงตามเงื่อนไข" : "ไม่พบข้อมูลตามเงื่อนไขที่เลือก"}</div>
    `;
    return;
  }

  let groupsHtml = groups.map(g => {
    const rowsHtml = g.items.map((row, idx) => {
      const orderNo = row['เลขที่ใบสั่งงาน'] || row['orderNo'] || '-';
      const customer = row['ลูกค้า'] || '-';
      const project = row['โครงการ'] || '-';
      const docs = row['เอกสารที่ต้องจัดเก็บ'] || row['addrStreet'] || '-';
      const messenger = row['ชื่อพนักงาน'] || row['มอบหมายพนักงาน'] || row['รหัสพนักงานที่มอบหมาย'] || '-';
      const status = row['ผลการวิ่งงาน 1: สถานะ'] || row['สถานะ'] || 'รอดำเนินการ';

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>#${String(orderNo).padStart(4, '0')}</strong></td>
          <td>${customer}</td>
          <td>${project}</td>
          <td>${docs}</td>
          <td>${messenger}</td>
          <td>${status}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="group-card">
        <div class="group-header">
          <div class="group-title">📌 ทีม: ${g.team}</div>
          <div class="group-meta">ผู้สั่งงาน: <strong>${g.requester}</strong> | วันที่เก็บเอกสาร: <strong>${g.collectDate}</strong></div>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th style="width:110px;">เลขที่งาน</th>
              <th>ลูกค้า</th>
              <th>โครงการ</th>
              <th>เอกสาร / รายละเอียด</th>
              <th style="width:130px;">พนักงานจัดส่ง</th>
              <th style="width:110px;">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="group-subtotal">รวมย่อย: ${g.items.length} รายการ</div>
      </div>
    `;
  }).join("");

  preview.innerHTML = `
    <div class="cover-header">
      <h2>${h.company || "TN MESSENGER SERVICE"}</h2>
      <div style="font-size:16px;font-weight:600;margin-top:8px;">${h.title || "รายงานปกวัน (รายงานปิดวัน)"}</div>
      <div class="cover-meta">วันที่เก็บเอกสาร: ${h.dateRange || "-"} | สร้างเมื่อ: ${h.generatedAt || new Date().toLocaleString("th-TH")}</div>
    </div>
    ${groupsHtml}
    <div class="totals">รวมทั้งหมด ${filteredRows.length} รายการ (แบ่งเป็น ${groups.length} กลุ่มทีม/ผู้สั่งงาน)</div>
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
  const filteredRows = getFilteredRows(data);
  const groups = groupRowsByTeamReqDate(filteredRows);
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont("Prompt", "bold");
  doc.setFontSize(18);
  doc.text(h.company || "TN MESSENGER SERVICE", pageW / 2, y, { align: "center" });
  y += 9;

  doc.setFontSize(14);
  doc.text(h.title || "รายงานปกวัน (รายงานปิดวัน)", pageW / 2, y, { align: "center" });
  y += 8;

  doc.setFont("Prompt", "normal");
  doc.setFontSize(10);
  doc.text(`วันที่เก็บเอกสาร: ${h.dateRange || "-"} | พิมพ์เมื่อ: ${h.generatedAt || new Date().toLocaleString("th-TH")}`, margin, y);
  y += 8;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  if (groups.length === 0) {
    doc.text("ไม่พบข้อมูลตามเงื่อนไขที่เลือก", margin, y);
    return;
  }

  groups.forEach((g) => {
    if (y > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("Prompt", "bold");
    doc.setFontSize(11);
    doc.setFillColor(238, 242, 255);
    doc.rect(margin, y - 4, pageW - margin * 2, 7, "F");
    doc.text(`ทีม: ${g.team} | ผู้สั่งงาน: ${g.requester} | วันที่เก็บเอกสาร: ${g.collectDate}`, margin + 2, y);
    y += 7;

    const cols = [
      { name: "#", width: 10 },
      { name: "เลขงาน", width: 22 },
      { name: "ลูกค้า", width: 42 },
      { name: "โครงการ", width: 35 },
      { name: "พนักงาน", width: 35 },
      { name: "สถานะ", width: 35 }
    ];

    doc.setFont("Prompt", "bold");
    doc.setFontSize(9);
    let x = margin;
    cols.forEach(c => {
      doc.text(c.name, x, y);
      x += c.width;
    });
    y += 5;

    doc.setFont("Prompt", "normal");
    doc.setFontSize(8);

    g.items.forEach((item, idx) => {
      if (y > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        y = margin;
      }
      x = margin;
      const orderNo = "#" + String(item['เลขที่ใบสั่งงาน'] || item['orderNo'] || '-').padStart(4, '0');
      const customer = String(item['ลูกค้า'] || '-').substring(0, 20);
      const project = String(item['โครงการ'] || '-').substring(0, 16);
      const messenger = String(item['ชื่อพนักงาน'] || item['มอบหมายพนักงาน'] || '-').substring(0, 16);
      const status = String(item['ผลการวิ่งงาน 1: สถานะ'] || item['สถานะ'] || 'รอดำเนินการ').substring(0, 16);

      const vals = [String(idx + 1), orderNo, customer, project, messenger, status];
      vals.forEach((v, cIdx) => {
        doc.text(v, x, y);
        x += cols[cIdx].width;
      });
      y += 4.5;
    });

    y += 2;
    doc.setFont("Prompt", "bold");
    doc.setFontSize(8.5);
    doc.text(`รวมย่อย: ${g.items.length} รายการ`, pageW - margin - 35, y);
    y += 7;
  });

  y += 4;
  doc.setFont("Prompt", "bold");
  doc.setFontSize(11);
  doc.text(`รวมทั้งหมด ${filteredRows.length} รายการ (${groups.length} กลุ่ม)`, margin, y);
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
