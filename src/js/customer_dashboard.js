import feather from 'feather-icons';
import { SHEET_A_ID, fetchAddressData } from '../config/api.js';

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

  let uniqueProvinces = [];

  try {
    const response = await fetch(CSV_URL);
    if (response.ok) {
      const csvText = await response.text();
      const rows = csvText.split('\n').map(row => row.trim()).filter(row => row.length > 0);

      if (rows.length >= 2) {
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
        // Flexible column lookup for "จังหวัด"
        const provinceColIndex = header.findIndex(h => {
          const cleanH = String(h || '').trim().toLowerCase();
          return cleanH.includes('จังหวัด') || cleanH.includes('province');
        });

        if (provinceColIndex !== -1) {
          const dataRows = rows.slice(1);
          const provinces = dataRows.map(row => {
            const columns = csvRowToArray(row);
            return columns[provinceColIndex];
          }).filter(p => p && String(p).trim() !== "" && String(p).trim() !== "-");

          uniqueProvinces = [...new Set(provinces)];
        }
      }
    }
  } catch (error) {
    console.warn("CSV fetch branch data info:", error);
  }

  // Fallback to fetchAddressData API if CSV load returned no provinces
  if (uniqueProvinces.length === 0) {
    try {
      const addressData = await fetchAddressData();
      if (Array.isArray(addressData) && addressData.length > 0) {
        const provinces = addressData
          .map(item => item.province)
          .filter(p => p && String(p).trim() !== "");
        uniqueProvinces = [...new Set(provinces)].sort();
      }
    } catch (fallbackErr) {
      console.error("Address data fallback error:", fallbackErr);
    }
  }

  if (uniqueProvinces.length > 0) {
    let branchHtml = '<div class="branch-grid">';
    uniqueProvinces.forEach(province => {
      branchHtml += `<div class="branch-card">${province}</div>`;
    });
    branchHtml += '</div>';
    container.innerHTML = branchHtml;
    return;
  }

  // Show error card only if both CSV and API fallback failed
  container.innerHTML = `
    <div class="error-message-card">
      <div class="error-header">
        <i data-feather="alert-triangle" class="error-icon"></i>
        <span>ขออภัย! ไม่สามารถโหลดข้อมูลสาขาได้</span>
      </div>
      <div class="error-body">
        <p class="error-text"><strong>ข้อผิดพลาด:</strong> ไม่พบข้อมูลจังหวัดบริการ กรุณาตรวจสอบการตั้งค่า Sheet หรือสิทธิ์การเข้าถึง</p>
        <div class="error-checklist">
          <h4>สิ่งที่ต้องตรวจสอบ:</h4>
          <ul>
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
  
  try { feather.replace(); } catch (_) {}
}
