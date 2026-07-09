// src/js/customer_dashboard.js
import feather from 'feather-icons';
import { SHEET_A_ID } from '../config/api.js';

// Initialize feather icons
feather.replace();

const SHEET_NAME = "ที่อยู่ โครงการ เอกสารที่ต้องจัดเก็บ";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_A_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&cacheBust=${Date.now()}`;

document.addEventListener("DOMContentLoaded", () => {
  loadBranchData();
});

window.createWorkOrder = function createWorkOrder() {
  window.location.href = '/customer/customer_workorder.html';
};

window.checkStatus = function checkStatus() {
  window.location.href = '/customer/tracking_2.html';
};

window.checkNews = function checkNews() {
  window.location.href = '/admin/news_page.html';
};

async function loadBranchData() {
  const container = document.getElementById('branchListContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading-message">กำลังโหลดข้อมูลสาขาที่ให้บริการ...</div>';

  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}.`);
    }

    const csvText = await response.text();
    const rows = csvText.split('\n').map(row => row.trim()).filter(row => row.length > 0);

    if (rows.length < 2) {
      container.innerHTML = '<div class="loading-message">ไม่พบข้อมูลสาขาที่เปิดให้บริการใน CSV</div>';
      return;
    }

    const csvRowToArray = (row) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const header = csvRowToArray(rows[0]);
    const provinceColIndex = header.indexOf('จังหวัด');

    if (provinceColIndex === -1) {
      throw new Error('ไม่พบหัวคอลัมน์ "จังหวัด" ในไฟล์ CSV (โปรดตรวจสอบว่าสะกดถูกต้อง)');
    }

    const dataRows = rows.slice(1);
    const provinces = dataRows.map(row => {
      const columns = csvRowToArray(row);
      return columns[provinceColIndex];
    }).filter(province => province && String(province).trim() !== "");

    const uniqueProvinces = [...new Set(provinces)];

    if (uniqueProvinces.length === 0) {
      container.innerHTML = '<div class="loading-message">ไม่พบข้อมูลจังหวัดที่เปิดให้บริการ</div>';
      return;
    }

    let branchHtml = '<div class="branch-grid">';
    uniqueProvinces.forEach(province => {
      branchHtml += `<div class="branch-card">${province}</div>`;
    });
    branchHtml += '</div>';

    container.innerHTML = branchHtml;
  } catch (error) {
    console.error("Error loading branch data:", error);
    container.innerHTML = `
      <div class="error-message-card">
        <div class="error-header">
          <i data-feather="alert-triangle" class="error-icon"></i>
          <span>ขออภัย! ไม่สามารถโหลดข้อมูลสาขาได้</span>
        </div>
        <div class="error-body">
          <p class="error-text"><strong>ข้อผิดพลาด:</strong> ${error.message}</p>
          <div class="error-checklist">
            <h4>สิ่งที่ต้องตรวจสอบ:</h4>
            <ul>
              <li>
                <i data-feather="help-circle" class="checklist-icon"></i>
                <span>Google Sheet ID ในระบบถูกต้องหรือไม่</span>
              </li>
              <li>
                <i data-feather="help-circle" class="checklist-icon"></i>
                <span>Sheet <strong>"${SHEET_NAME}"</strong> ถูกตั้งค่าแชร์เป็น <strong>"ทุกคนที่มีลิงก์สามารถดูได้" (Public)</strong> แล้วหรือยัง</span>
              </li>
              <li>
                <i data-feather="help-circle" class="checklist-icon"></i>
                <span>แถวแรกของ Sheet มีคอลัมน์ชื่อ <strong>"จังหวัด"</strong> สะกดถูกต้องใช่หรือไม่</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `;
    
    // Re-initialize feather icons for the new elements
    try {
      feather.replace();
    } catch (_) {}
  }
}
