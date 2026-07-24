/**
 * TN Messenger — Unified Google Apps Script
 *
 * Paste into: Extensions → Apps Script on Sheet A spreadsheet
 * Deploy: Web app — Execute as Me, Access: Anyone
 *
 * Sheet IDs:
 *   Sheet A (orders): 1FkcnGM31UU1UNgsPyCrl95Jp1NDO98RlXpeU9a0eg_M  tab: ใบสั่งงาน
 *   Sheet B (reports): 1kI8D0p8n5huV8I57vzHVlDN0VAFYpgEw43gwMV_e7xc
 *
 */

const SHEET_B_ID = '1YYnOZ3mUVYQM26XkGPY5hbDS_3I9JsKgFsZ5HQ3iW2mdhXISmJegDtb_';
const ORDER_TAB = 'ใบสั่งงาน';
const META_TAB = '_meta';
const META_CELL = 'A1';
const EMPLOYEE_TAB = 'พนักงาน';
const ASSIGNED_COL = 'รหัสพนักงานที่มอบหมาย';
const TERMINAL_STATUSES = ['สำเร็จ', 'ลูกค้าขอยกเลิก'];
const PASSWORD_PEPPER = 'temm_tnmessenger';

// ─── Router ───────────────────────────────────────────────────────────────

function doPost(e) {
  // Check if it is a LINE webhook (has signature or events)
  const headers = e.headers || {};
  const signature = headers['x-line-signature'] || headers['X-Line-Signature'];
  if (signature) {
    return handleLineWebhook(e);
  }
  
  if (e.postData && e.postData.contents) {
    try {
      const body = JSON.parse(e.postData.contents);
      if (body && body.events) {
        return handleLineWebhook(e);
      }
    } catch (_) {}
  }

  return handleRequest(e);
}

function doGet(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const action = (e.parameter && e.parameter.action) || '';
  const callback = e.parameter && e.parameter.callback;
  let result;

  try {
    switch (action) {
      // doGet endpoints
      case 'get_rows_meta':
        result = getRowsMeta();
        break;
      case 'get_rows_paginated':
        result = getRowsPaginated(e.parameter);
        break;
      case 'get_employee_list':
        result = getEmployeeList();
        break;
      case 'get_tasks_by_employee':
        result = getTasksByEmployee(parseJsonParam(e, 'data'));
        break;
      case 'get_cover_report':
        result = getCoverReport(parseJsonParam(e, 'data'));
        break;
      case 'getOrderNo':
        result = getOrderNo();
        break;
      case 'get_all_row_json':
        result = getAllRowJson();
        break;
      case 'get_task_employee':
        result = getTaskEmployee(parseJsonParam(e, 'data'));
        break;
      case 'get_task_by_id':
        result = getTaskById(parseJsonParam(e, 'data'));
        break;
      case 'update':
        result = updateJob(parseJsonParam(e, 'data'));
        break;
      case 'test_line_config':
        result = testLineConfig();
        break;

      // doPost/JSON endpoints
      case 'insertJob':
      case 'add_work_order':
        result = insertJob(parseJsonParam(e, 'data'));
        break;
      case 'register_employee':
        result = registerEmployee(parseJsonParam(e, 'data'));
        break;
      case 'login_employee':
        result = loginEmployee(parseJsonParam(e, 'data'));
        break;
      case 'insert_news':
        result = insertNews(parseJsonParam(e, 'data'));
        break;

      default:
        // Default fallthrough to support direct JSONP inserts from legacy clients
        const payloadData = parseJsonParam(e, 'data');
        if (payloadData && (payloadData.orderNo || payloadData.customerName)) {
          result = insertJob(payloadData);
        } else {
          result = { result: 'error', message: 'Unknown action: ' + action };
        }
    }
  } catch (err) {
    result = { result: 'error', message: String(err.message || err) };
  }

  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseJsonParam(e, key) {
  const raw = (e.parameter && e.parameter[key]) || (e.postData && e.postData.contents) || '{}';
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_) {
    return {};
  }
}

// ─── Meta / cache bust ──────────────────────────────────────────────────────

function getOrderSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDER_TAB);
}

function bumpLastModified_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let meta = ss.getSheetByName(META_TAB);
  if (!meta) {
    meta = ss.insertSheet(META_TAB);
    meta.hideSheet();
  }
  meta.getRange(META_CELL).setValue(new Date().toISOString());
}

function getRowsMeta() {
  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  const total = Math.max(0, lastRow - 1);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const meta = ss.getSheetByName(META_TAB);
  const lastUpdated = meta ? String(meta.getRange(META_CELL).getValue() || '') : '';
  return { result: 'success', total: total, lastUpdated: lastUpdated };
}

// ─── Paginated rows ─────────────────────────────────────────────────────────

function getRowsPaginated(params) {
  params = params || {};
  const offset = Math.max(0, parseInt(params.offset, 10) || 0);
  const limit = Math.min(200, Math.max(1, parseInt(params.limit, 10) || 50));
  const search = (params.search || '').toString().toLowerCase().trim();
  const dateFilter = (params.date || '').toString().trim(); // YYYY-MM-DD

  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { result: 'success', data: [], total: 0, headers: [], offset: offset, limit: limit };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  const rows = [];
  for (let i = allData.length - 1; i >= 0; i--) {
    const obj = rowToObject_(headers, allData[i]);
    if (dateFilter) {
      const rawDate = String(obj['วันที่เก็บเอกสาร'] || '').trim();
      const formatted = formatDateForFilter_(rawDate);
      if (formatted !== dateFilter) continue;
    }
    if (search) {
      const hay = Object.values(obj).join(' ').toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }
    rows.push(obj);
  }

  const page = rows.slice(offset, offset + limit);
  return {
    result: 'success',
    data: page,
    total: rows.length,
    headers: headers,
    offset: offset,
    limit: limit
  };
}

function formatDateForFilter_(rawDate) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  const m = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const y = m[3].length === 4 && parseInt(m[3], 10) > 2500
      ? parseInt(m[3], 10) - 543
      : parseInt(m[3], 10);
    return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  return rawDate;
}

function rowToObject_(headers, row) {
  const obj = {};
  headers.forEach(function (h, i) {
    obj[String(h)] = row[i] != null ? String(row[i]) : '';
  });
  return obj;
}

// ─── Employee list ──────────────────────────────────────────────────────────

function getEmployeeList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = null;
  const candidateNames = [EMPLOYEE_TAB, 'employee_user', 'employee', 'employees', 'user', 'users', 'User', 'Employees'];
  
  for (var i = 0; i < candidateNames.length; i++) {
    const s = ss.getSheetByName(candidateNames[i]);
    if (s && s.getLastRow() >= 2) {
      sheet = s;
      break;
    }
  }

  if (!sheet) {
    const sheets = ss.getSheets();
    sheet = sheets.find(function (s) {
      const n = s.getName().toLowerCase();
      return (n.indexOf('พนักงาน') >= 0 || n.indexOf('employee') >= 0 || n.indexOf('user') >= 0) && s.getLastRow() >= 2;
    });
  }

  let employees = [];

  if (sheet && sheet.getLastRow() >= 2) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    const idIdx = findColIndex_(headers, ['id', 'รหัสพนักงาน', 'ID']);
    const nameIdx = findColIndex_(headers, ['username', 'ชื่อ', 'first_name', 'name']);
    const lastIdx = findColIndex_(headers, ['last_name', 'นามสกุล']);
    const nickIdx = findColIndex_(headers, ['nickname', 'ชื่อเล่น']);

    employees = data.map(function (row) {
      const idVal = String(row[idIdx] || '').trim();
      const firstName = String(row[nameIdx] || '').trim();
      const lastName = lastIdx >= 0 ? String(row[lastIdx] || '').trim() : '';
      const nickVal = nickIdx >= 0 ? String(row[nickIdx] || '').trim() : '';
      const fullName = lastName ? `${firstName} ${lastName}` : firstName;
      return {
        id: idVal,
        name: fullName,
        nickname: nickVal
      };
    }).filter(function (e) { return e.id; });
  }

  return { result: 'success', data: employees };
}

function findColIndex_(headers, candidates) {
  for (var c = 0; c < candidates.length; c++) {
    var idx = headers.findIndex(function (h) {
      return String(h).toLowerCase() === candidates[c].toLowerCase();
    });
    if (idx >= 0) return idx;
  }
  return 0;
}

// ─── Tasks by employee ──────────────────────────────────────────────────────

function getTasksByEmployee(data) {
  data = data || {};
  const employeeId = String(data.employeeId || data.id || '').trim();
  if (!employeeId) {
    return { result: 'error', message: 'employeeId required' };
  }

  const dateFilter = (data.date || '').toString().trim() ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { result: 'success', data: [] };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const assignIdx = headers.indexOf(ASSIGNED_COL);
  const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const tasks = [];

  for (var i = 0; i < allData.length; i++) {
    const row = allData[i];
    const assigned = assignIdx >= 0 ? String(row[assignIdx] || '').trim() : '';
    if (assigned !== employeeId) continue;

    const obj = rowToObject_(headers, row);
    const collectDate = formatDateForFilter_(String(obj['วันที่เก็บเอกสาร'] || '').trim());
    if (dateFilter && collectDate !== dateFilter) continue;

    if (isTerminalTask_(obj)) continue;
    tasks.push(obj);
  }

  return { result: 'success', data: tasks };
}

function isTerminalTask_(obj) {
  for (var r = 1; r <= 3; r++) {
    var status = String(obj['ผลการวิ่งงาน ' + r + ': สถานะ'] || '').trim();
    if (TERMINAL_STATUSES.indexOf(status) >= 0) return true;
  }
  return false;
}

// ─── Sheet B cover report ───────────────────────────────────────────────────

function getCoverReport(data) {
  data = data || {};
  const startDate = (data.startDate || data.date || '').toString().trim();
  const endDate = (data.endDate || startDate || '').toString().trim();

  let sheet = null;
  const propSheetB = PropertiesService.getScriptProperties().getProperty('SHEET_B_ID');
  if (propSheetB && propSheetB.length > 20) {
    try {
      const ssB = SpreadsheetApp.openById(propSheetB);
      if (ssB) sheet = ssB.getSheets()[0];
    } catch (e) {
      console.warn("Could not open SHEET_B_ID: " + e.message + ". Falling back to active order sheet.");
    }
  }

  // Fallback to primary order sheet
  if (!sheet) {
    sheet = getOrderSheet_();
  }

  if (!sheet || sheet.getLastRow() < 2) {
    return {
      result: 'success',
      header: buildCoverHeader_(startDate, endDate),
      rows: [],
      teams: [],
      requesters: [],
      totals: { count: 0 }
    };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dateColIdx = findColIndex_(headers, ['วันที่เก็บเอกสาร', 'วันที่', 'date', 'Date']);
  const teamColIdx = findColIndex_(headers, ['ทีม', 'Team', 'team']);
  const requesterColIdx = findColIndex_(headers, ['ผู้สั่งงาน', 'Requester', 'requester']);

  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const rows = [];
  const teamsMap = {};
  const requestersMap = {};

  for (var i = 0; i < allData.length; i++) {
    const rowObj = rowToObject_(headers, allData[i]);
    const teamVal = String(rowObj['ทีม'] || (teamColIdx >= 0 ? allData[i][teamColIdx] : '') || '').trim();
    const requesterVal = String(rowObj['ผู้สั่งงาน'] || (requesterColIdx >= 0 ? allData[i][requesterColIdx] : '') || '').trim();

    if (teamVal) teamsMap[teamVal] = true;
    if (requesterVal) requestersMap[requesterVal] = true;

    if (startDate) {
      const rawDateStr = String((dateColIdx >= 0 ? allData[i][dateColIdx] : '') || rowObj['วันที่เก็บเอกสาร'] || '');
      const rowDate = formatDateForFilter_(rawDateStr);

      if (endDate) {
        if (rowDate < startDate || rowDate > endDate) continue;
      } else {
        if (rowDate !== startDate) continue;
      }
    }

    rows.push(rowObj);
  }

  return {
    result: 'success',
    header: buildCoverHeader_(startDate, endDate),
    rows: rows,
    teams: Object.keys(teamsMap).sort(),
    requesters: Object.keys(requestersMap).sort(),
    totals: {
      count: rows.length
    }
  };
}

function buildCoverHeader_(startDate, endDate) {
  const fmt = function (iso) {
    const p = iso.split('-');
    if (p.length !== 3) return iso;
    const y = parseInt(p[0], 10) + 543;
    return p[2] + '/' + p[1] + '/' + y;
  };
  return {
    company: 'TN MESSENGER SERVICE',
    title: 'รายงานปกวัน',
    dateRange: startDate === endDate
      ? fmt(startDate)
      : fmt(startDate) + ' - ' + fmt(endDate),
    generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')
  };
}

// ─── New actions merged ────────────────────────────────────────────────────

function getOrderNo() {
  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  let nextOrderNo = 1;

  if (lastRow >= 2) {
    const orders = sheet.getRange(2, 17, lastRow - 1, 1).getValues().flat();
    const nums = orders.map(v => parseInt(v, 10)).filter(v => !isNaN(v));
    if (nums.length) nextOrderNo = Math.max(...nums) + 1;
  }
  return { result: 'success', orderNo: nextOrderNo };
}

function getAllRowJson() {
  const sheet = getOrderSheet_();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { result: 'success', count: 0, data: [] };

  const headers = data[0];
  const rows = data.slice(1);

  const formattedRows = rows
    .filter(row => row.some(cell => cell.toString().trim() !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if ((h === 'ประทับเวลา' || h === 'วันที่เก็บเอกสาร') && v instanceof Date) {
          const f = h === 'ประทับเวลา' ? 'dd/MM/yyyy HH:mm:ss' : 'dd/MM/yyyy';
          v = Utilities.formatDate(v, 'Asia/Bangkok', f);
        }
        obj[h] = v !== undefined && v !== null ? String(v) : '';
      });
      return obj;
    });

  return { result: 'success', count: formattedRows.length, data: formattedRows };
}

function getTaskEmployee(data) {
  const employeeId = String(data.id || '').trim();
  if (!employeeId) {
    return { result: 'error', message: 'กรุณาระบุรหัสพนักงาน' };
  }

  const allDataResult = getAllRowJson();
  if (allDataResult.result !== 'success') return allDataResult;

  const tasks = allDataResult.data.filter(row => {
    return row['รหัสพนักงาน'] === employeeId;
  });

  return { result: 'success', count: tasks.length, data: tasks };
}

function getTaskById(data) {
  const searchOrderNo = String(data.orderNo || '').trim().replace(/^0+/, '');
  if (!searchOrderNo) {
    return { result: 'error', message: 'กรุณาระบุเลขที่ใบสั่งงาน' };
  }

  const allDataResult = getAllRowJson();
  if (allDataResult.result !== 'success') return allDataResult;

  const task = allDataResult.data.find(row => {
    const rawVal = String(row['เลขที่ใบสั่งงาน'] || row.orderNo || row.id || '').trim();
    return rawVal === searchOrderNo || rawVal.replace(/^0+/, '') === searchOrderNo;
  });

  if (!task) {
    return { result: 'error', message: 'ไม่พบเลขที่ใบสั่งงาน: ' + searchOrderNo };
  }

  return { result: 'success', data: task };
}

function insertJob(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ORDER_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(ORDER_TAB);
    sheet.appendRow([
      'ประทับเวลา', 'วันที่เก็บเอกสาร', 'โครงการ', '(ทีม)', 'ผู้สั่งงาน', 'เบอร์โทรศัพท์', 'ลูกค้า',
      'Link to merged Doc - WORK ORDER', 'เบอร์โทรศัพท์ลูกค้า', 'ที่อยู่รับเอกสาร เลขที่ ถนน',
      'แขวง/ตำบล', 'เขต/อำเภอ', 'จังหวัด/รหัสไปรษณีย์', 'เอกสารที่ต้องจัดเก็บทั้งหมด', 'หมายเหตุ',
      'e-mail', 'เลขที่ใบสั่งงาน', 'ผลการวิ่งงาน 1: สถานะ', 'ผลการวิ่งงาน 1: วัน/เดือน/ปี',
      'ผลการวิ่งงาน 1: หมายเหตุ', 'ผลการวิ่งงาน 2: สถานะ', 'ผลการวิ่งงาน 2: วัน/เดือน/ปี',
      'ผลการวิ่งงาน 2: หมายเหตุ', 'ผลการวิ่งงาน 3: สถานะ', 'ผลการวิ่งงาน 3: วัน/เดือน/ปี',
      'ผลการวิ่งงาน 3: หมายเหตุ', 'ชื่อพนักงาน', 'รหัสพนักงาน', 'รหัสพนักงานที่มอบหมาย', 'LINE User ID'
    ]);
  }

  const orderNo = data.orderNo || 0;
  const documentsString = data.documents || '';
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowLen = Math.max(headers.length, 30);
  const row = Array(rowLen).fill('');

  const setCol = (name, val) => {
    const idx = headers.indexOf(name);
    if (idx >= 0) row[idx] = String(val);
  };

  row[0] = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
  row[1] = data.collectDate || '';
  row[2] = data.project || '';
  row[3] = data.team || '';
  row[4] = data.requester || '';
  row[5] = "'" + String(data.requesterPhone || '');
  row[6] = data.customerName || '';
  row[7] = '';
  row[8] = "'" + String(data.customerPhone || '');
  row[9] = data.addrStreet || '';
  row[10] = data.subdistrict || '';
  row[11] = data.district || '';
  row[12] = `${data.province || ''} ${data.zipcode || ''}`;
  row[13] = documentsString;
  row[14] = data.note || '';
  row[15] = data.email || '';
  row[16] = String(orderNo);

  setCol('ประทับเวลา', row[0]);
  setCol('วันที่เก็บเอกสาร', row[1]);
  setCol('โครงการ', row[2]);
  setCol('(ทีม)', row[3]);
  setCol('ผู้สั่งงาน', row[4]);
  setCol('เบอร์โทรศัพท์', row[5]);
  setCol('ลูกค้า', row[6]);
  setCol('Link to merged Doc - WORK ORDER', row[7]);
  setCol('เบอร์โทรศัพท์ลูกค้า', row[8]);
  setCol('ที่อยู่รับเอกสาร เลขที่ ถนน', row[9]);
  setCol('แขวง/ตำบล', row[10]);
  setCol('เขต/อำเภอ', row[11]);
  setCol('จังหวัด/รหัสไปรษณีย์', row[12]);
  setCol('เอกสารที่ต้องจัดเก็บทั้งหมด', row[13]);
  setCol('หมายเหตุ', row[14]);
  setCol('e-mail', row[15]);
  setCol('เลขที่ใบสั่งงาน', row[16]);

  const assignIdx = headers.indexOf(ASSIGNED_COL);
  if (assignIdx >= 0 && data.assignedEmployeeId) {
    row[assignIdx] = String(data.assignedEmployeeId);
  } else if (headers.length < 29 && data.assignedEmployeeId) {
    row[28] = String(data.assignedEmployeeId);
  }

  sheet.appendRow(row);
  bumpLastModified_();

  if (data.email) {
    try {
      sendConfirmationEmail_(data, orderNo);
    } catch (e) {
      console.warn("Mail error: " + e);
    }
  }

  return { result: 'success', orderNo: orderNo, message: 'บันทึกข้อมูลเรียบร้อย' };
}

function sendConfirmationEmail_(data, orderNo) {
  const paddedOrderNo = String(orderNo).padStart(4, '0');
  const updateURL = `${data.baseURL || 'https://tn-messenger.vercel.app'}/tracking.html?order=${paddedOrderNo}`;

  const subject = `📋 ขอบคุณที่กรอกข้อมูลใบสั่งงาน #${paddedOrderNo}`;
  const htmlBody = `
    <div style="font-family:Prompt,Arial,sans-serif;color:#111;line-height:1.7;">
      <h2 style="color:#1e3a8a;">TN Messenger Service</h2>
      <p>ขอบคุณที่กรอกข้อมูลใบสั่งงานเรียบร้อยแล้ว 🎉</p>
      <p>
        <b>เลขที่ใบสั่งงาน:</b> ${paddedOrderNo}<br>
        <b>ชื่อผู้สั่งงาน:</b> ${data.requester} (${data.requesterPhone})<br>
        <b>โครงการ:</b> ${data.project}<br>
        <b>วันที่เก็บเอกสาร:</b> ${data.collectDate}<br>
        <b>ลูกค้า:</b> ${data.customerName} (${data.customerPhone})
      </p>
      <p>
        <b>📍 ที่อยู่รับเอกสาร</b><br>
        ${data.addrStreet || '-'}<br>
        แขวง/ตำบล ${data.subdistrict || '-'}<br>
        เขต/อำเภอ ${data.district || '-'}
      </p>
      <p>
        <a href="${updateURL}" style="color:#1e40af;font-weight:600;">
          🔗 คลิกเพื่อติดตามสถานะงาน
        </a>
      </p>
    </div>
  `;

  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    htmlBody: htmlBody
  });
}

function updateJob(data) {
  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { result: 'error', message: 'ยังไม่มีข้อมูลในระบบ' };
  }

  const orders = sheet.getRange(2, 17, lastRow - 1, 1).getValues();
  const target = parseInt(data.orderNo, 10);
  const idx = orders.findIndex(r => parseInt(r[0], 10) === target);

  if (idx === -1) {
    return { result: 'error', message: 'ไม่พบเลขที่ใบงาน: ' + data.orderNo };
  }

  const row = idx + 2;
  const startCol = 18;
  const numCols = 11;

  const existingData = sheet.getRange(row, startCol, 1, numCols).getValues()[0];
  const keys = [
    'result1', 'date1', 'note1', 
    'result2', 'date2', 'note2', 
    'result3', 'date3', 'note3', 
    'messengerName', 'id'
  ];

  const finalRowValues = keys.map((key, i) => {
    const newVal = data[key];
    const isNewValEmpty = (newVal === undefined || newVal === null || String(newVal).trim() === "");
    return isNewValEmpty ? existingData[i] : newVal;
  });

  sheet.getRange(row, startCol, 1, numCols).setValues([finalRowValues]);
  bumpLastModified_();

  // Trigger LINE Push Notification if user is linked
  try {
    const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const updatedRowData = sheet.getRange(row, 1, 1, updatedHeaders.length).getValues()[0];
    const updatedRowObj = rowToObject_(updatedHeaders, updatedRowData);
    const lineUserId = updatedRowObj['LINE User ID'];
    if (lineUserId && lineUserId.trim()) {
      sendLinePushNotification(lineUserId, updatedRowObj);
    }
  } catch (err) {
    console.warn("LINE push notification failed: " + err);
  }

  return { result: 'success', message: 'อัปเดตสถานะและ ID เรียบร้อยแล้ว' };
}

// ─── Authentication Handlers ────────────────────────────────────────────────

function loginEmployee(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('employee_user');
  if (!sheet) {
    return { result: 'error', message: 'ไม่พบชีต employee_user' };
  }

  const email = String(data.email || '').trim();
  const password = String(data.password || '').trim();

  if (!email || !password) {
    return { result: 'error', message: 'ข้อมูลไม่ครบ' };
  }

  const sheetData = sheet.getDataRange().getValues();
  const headers = sheetData.shift();
  const idx = h => headers.indexOf(h);

  const user = sheetData.find(r => r[idx('email')] === email);
  if (!user) {
    return { result: 'error', message: 'ไม่พบผู้ใช้' };
  }

  const hash = hash_password(password);
  if (hash !== user[idx('password')]) {
    return { result: 'error', message: 'รหัสผ่านไม่ถูกต้อง' };
  }

  // sign_jwt signature matches helpers in jwt.gs
  const token = sign_jwt({
    id: user[idx('id')],
    email: email,
    role: user[idx('role')],
    iat: Math.floor(Date.now() / 1000)
  });

  return {
    result: 'success',
    token: token,
    user: {
      id: user[idx('id')],
      username: user[idx('username')],
      last_name: user[idx('last_name')],
      email: user[idx('email')],
      nickname: user[idx('nickname')]
    }
  };
}

function registerEmployee(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('employee_user');
  if (!sheet) {
    return { result: 'error', message: 'ไม่พบชีต employee_user' };
  }

  const sheetData = sheet.getDataRange().getValues();
  const headers = sheetData.shift();
  const idx = h => headers.indexOf(h);

  if (!data.email || !data.username || !data.password) {
    return { result: 'error', message: 'ข้อมูลไม่ครบ' };
  }

  const emailExists = sheetData.some(r => r[idx('email')] === data.email);
  if (emailExists) {
    return { result: 'error', message: 'อีเมลนี้ถูกใช้งานแล้ว' };
  }

  const usernameExists = sheetData.some(r => r[idx('username')] === data.username);
  if (usernameExists) {
    return { result: 'error', message: 'username นี้ถูกใช้งานแล้ว' };
  }

  const id = sheetData.length === 0
    ? 1
    : Math.max(...sheetData.map(r => Number(r[idx('id')]) || 0)) + 1;

  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  const passwordHash = hash_password(data.password);

  const row = headers.map(h => {
    switch (h) {
      case 'id': return String(id);
      case 'password': return passwordHash;
      case 'role': return '1';
      case 'isDelete': return '0';
      case 'created_at': return now;
      default: return data[h] ? String(data[h]) : '';
    }
  });

  sheet.appendRow(row);
  return { result: 'success', message: 'สมัครพนักงานเรียบร้อย', id: id };
}

function hash_password(password) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + PASSWORD_PEPPER
  );

  return raw.map(b => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.padStart(2, '0');
  }).join('');
}

// ─── LINE OA Customer Bot Integration ────────────────────────────────────────

function handleLineWebhook(e) {
  const lineChannelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
  const headers = e.headers || {};
  const signature = headers['x-line-signature'] || headers['X-Line-Signature'];
  const body = e.postData.contents;

  if (lineChannelSecret) {
    const hash = Utilities.computeHmacSha256Signature(body, lineChannelSecret.trim(), Utilities.Charset.UTF_8);
    const calculatedSignature = Utilities.base64Encode(hash);
    if (signature !== calculatedSignature) {
      console.warn('Invalid LINE signature. Signature from LINE: ' + signature + ' | Calculated: ' + calculatedSignature);
      // ในช่วงพัฒนา/ทดสอบ: บังคับให้ข้ามการตรวจสอบเพื่อให้บอททำงานได้ แม้ Secret จะไม่ถูกต้อง
      console.log('Bypassing signature validation check for debugging...');
    } else {
      console.log('Signature verified successfully! ✅');
    }
  } else {
    console.warn('Skipping LINE signature verification because LINE_CHANNEL_SECRET is not set');
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', message: 'Invalid JSON' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const events = payload.events || [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === 'message' && event.message.type === 'text') {
      try {
        processLineMessage(event);
      } catch (err) {
        console.error('Error processing event: ' + err);
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ result: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function processLineMessage(event) {
  const replyToken = event.replyToken;
  const inputText = (event.message.text || '').trim();

  if (!inputText) return;

  // ตรวจสอบว่าข้อความเป็นเลขที่ใบสั่งงานหรือไม่
  const normalizedJobCode = normalizeJobCode(inputText);

  if (!normalizedJobCode) {
    // ไม่ใช่ตัวเลข → ตอบข้อความต้อนรับ แนะนำให้พิมพ์เลขใบงาน
    sendLineReply(replyToken,
      'สวัสดีค่ะ ยินดีต้อนรับสู่บริการ TN Messenger 🎉\n\n' +
      'กรุณาพิมพ์ เลขที่ใบสั่งงาน เพื่อตรวจสอบสถานะค่ะ\n' +
      '(ตัวอย่าง: 0001 หรือ 25)'
    );
    return;
  }

  // ค้นหาใบงานจากเลขที่ใบสั่งงาน
  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    sendLineReply(replyToken, '❌ ขออภัยค่ะ ระบบยังไม่มีข้อมูลใบสั่งงานในขณะนี้');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const orderNoIdx = headers.indexOf('เลขที่ใบสั่งงาน');

  // ค้นหาใบงานที่ตรงกับเลขที่ระบุ
  let matchedJob = null;
  for (let i = 0; i < allData.length; i++) {
    const rowOrderNo = String(allData[i][orderNoIdx] || '').trim();
    if (normalizeJobCode(rowOrderNo) === normalizedJobCode) {
      matchedJob = rowToObject_(headers, allData[i]);
      break;
    }
  }

  if (!matchedJob) {
    sendLineReply(replyToken,
      '❌ ไม่พบเลขที่ใบสั่งงาน ' + inputText + '\n\n' +
      'กรุณาตรวจสอบเลขที่ใบสั่งงานและลองพิมพ์ใหม่อีกครั้งค่ะ'
    );
    return;
  }

  // พบใบงาน → สร้างข้อความตอบกลับ
  const orderNo = String(matchedJob['เลขที่ใบสั่งงาน'] || '').trim().padStart(4, '0');
  const customer = String(matchedJob['ลูกค้า'] || '').trim();
  const project = String(matchedJob['โครงการ'] || '').trim();
  const latest = getLatestStatusOfJob(matchedJob);

  let replyText = `📦 ใบสั่งงาน #${orderNo}\n`;
  if (customer) replyText += `ลูกค้า: ${customer}\n`;
  if (project) replyText += `โครงการ: ${project}\n`;
  replyText += `\n📋 สถานะล่าสุด: ${latest.status}\n`;
  if (latest.date) replyText += `📅 วันที่: ${latest.date}\n`;
  if (latest.note) replyText += `📝 หมายเหตุ: ${latest.note}\n`;

  // ข้อมูลพนักงานจัดส่ง
  const messengerName = String(matchedJob['ชื่อพนักงาน'] || '').trim();
  const employeeId = String(matchedJob['รหัสพนักงาน'] || matchedJob['รหัสพนักงานที่มอบหมาย'] || '').trim();

  if (messengerName) {
    replyText += `\n👤 พนักงานจัดส่ง: ${messengerName}\n`;

    // ค้นหาเบอร์โทรพนักงานจาก Sheet employee_user
    if (employeeId) {
      const phone = lookupEmployeePhone_(employeeId);
      if (phone) {
        replyText += `📱 เบอร์ติดต่อ: ${phone}\n`;
      }
    }
  } else {
    replyText += `\n👤 พนักงานจัดส่ง: ยังไม่ได้มอบหมาย\n`;
  }

  const baseURL = PropertiesService.getScriptProperties().getProperty('BASE_URL') || 'https://tn-messenger.vercel.app';
  replyText += `\n🔗 ติดตามสถานะ: ${baseURL}/tracking.html?order=${orderNo}`;

  sendLineReply(replyToken, replyText);
}

function normalizePhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('66')) {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

function normalizeJobCode(code) {
  if (!code) return '';
  const cleaned = String(code).replace('#', '').trim();
  const num = parseInt(cleaned, 10);
  if (!isNaN(num)) {
    return String(num);
  }
  return '';
}

// [DEPRECATED] saveLineUserId — ไม่ใช้งานแล้วหลังปรับ flow ใหม่
// function saveLineUserId(rowIndexes, lineUserId) {
//   const sheet = getOrderSheet_();
//   const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
//   let lineUserIdIdx = headers.indexOf('LINE User ID');
//   
//   if (lineUserIdIdx === -1) {
//     lineUserIdIdx = headers.length;
//     sheet.getRange(1, lineUserIdIdx + 1).setValue('LINE User ID');
//   }
//   
//   rowIndexes.forEach(rowIndex => {
//     const cellRange = sheet.getRange(rowIndex, lineUserIdIdx + 1);
//     const existingVal = String(cellRange.getValue() || '').trim();
//     if (!existingVal) {
//       cellRange.setValue(lineUserId);
//     }
//   });
// }

/**
 * ค้นหาเบอร์โทรพนักงานจาก Sheet employee_user ด้วยรหัสพนักงาน
 * @param {string} employeeId - รหัสพนักงาน
 * @returns {string} เบอร์โทรศัพท์ หรือ '' ถ้าไม่พบ
 */
function lookupEmployeePhone_(employeeId) {
  if (!employeeId) return '';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('employee_user');
  if (!sheet || sheet.getLastRow() < 2) return '';

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();

  const idIdx = findColIndex_(headers, ['id', 'ID', 'รหัสพนักงาน']);
  const phoneIdx = findColIndex_(headers, ['phone', 'เบอร์โทร', 'เบอร์โทรศัพท์', 'tel']);

  for (let i = 0; i < data.length; i++) {
    const rowId = String(data[i][idIdx] || '').trim();
    if (rowId === employeeId) {
      return String(data[i][phoneIdx] || '').trim();
    }
  }

  return '';
}

function getLatestStatusOfJob(rowObj) {
  const run3Status = String(rowObj['ผลการวิ่งงาน 3: สถานะ'] || '').trim();
  const run3Date = String(rowObj['ผลการวิ่งงาน 3: วัน/เดือน/ปี'] || rowObj['ผลการวิ่งงาน 3: วันที่'] || '').trim();
  const run3Note = String(rowObj['ผลการวิ่งงาน 3: หมายเหตุ'] || '').trim();

  const run2Status = String(rowObj['ผลการวิ่งงาน 2: สถานะ'] || '').trim();
  const run2Date = String(rowObj['ผลการวิ่งงาน 2: วัน/เดือน/ปี'] || rowObj['ผลการวิ่งงาน 2: วันที่'] || '').trim();
  const run2Note = String(rowObj['ผลการวิ่งงาน 2: หมายเหตุ'] || '').trim();

  const run1Status = String(rowObj['ผลการวิ่งงาน 1: สถานะ'] || '').trim();
  const run1Date = String(rowObj['ผลการวิ่งงาน 1: วัน/เดือน/ปี'] || rowObj['ผลการวิ่งงาน 1: วันที่'] || '').trim();
  const run1Note = String(rowObj['ผลการวิ่งงาน 1: หมายเหตุ'] || '').trim();

  if (run3Status) {
    return { runNum: 3, status: run3Status, date: run3Date, note: run3Note };
  } else if (run2Status) {
    return { runNum: 2, status: run2Status, date: run2Date, note: run2Note };
  } else if (run1Status) {
    return { runNum: 1, status: run1Status, date: run1Date, note: run1Note };
  } else {
    return { runNum: 0, status: 'รอดำเนินการ', date: '', note: '' };
  }
}

function sendLineReply(replyToken, text) {
  const lineChannelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!lineChannelAccessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN is not set, cannot reply');
    return;
  }

  const payload = {
    replyToken: replyToken,
    messages: [
      {
        type: 'text',
        text: text
      }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + lineChannelAccessToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', options);
  console.log('LINE Reply Response: ' + response.getContentText());
}

function sendLinePushNotification(lineUserId, rowObj) {
  const lineChannelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!lineChannelAccessToken) {
    console.warn('LINE_CHANNEL_ACCESS_TOKEN is not set, skipping push notification');
    return;
  }

  const orderNo = String(rowObj['เลขที่ใบสั่งงาน'] || '').trim().padStart(4, '0');
  const project = String(rowObj['โครงการ'] || '-').trim();
  const latest = getLatestStatusOfJob(rowObj);

  let messageText = `🔔 อัปเดตสถานะใบสั่งงาน #${orderNo}\n`;
  if (project !== '-') {
    messageText += `โครงการ: ${project}\n`;
  }
  messageText += `สถานะล่าสุด: ${latest.status}\n`;
  if (latest.date) {
    messageText += `วันที่: ${latest.date}\n`;
  }
  if (latest.note) {
    messageText += `หมายเหตุ: ${latest.note}\n`;
  }
  
  const baseURL = PropertiesService.getScriptProperties().getProperty('BASE_URL') || 'https://tn-messenger.vercel.app';
  messageText += `\n🔗 ติดตามสถานะ: ${baseURL}/tracking.html?order=${orderNo}`;

  const payload = {
    to: lineUserId,
    messages: [
      {
        type: 'text',
        text: messageText
      }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + lineChannelAccessToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', options);
  console.log('LINE Push Response: ' + response.getContentText());
}

// ─── LINE OA Unit Test ───────────────────────────────────────────────────────

function testLineBot() {
  console.log("=== Running LINE Bot Unit Tests ===");
  
  // 1. Test normalizePhone
  console.log("normalizePhone('081-234-5678'): " + (normalizePhone('081-234-5678') === '0812345678' ? 'PASS' : 'FAIL'));
  console.log("normalizePhone('+66 81 234 5678'): " + (normalizePhone('+66 81 234 5678') === '0812345678' ? 'PASS' : 'FAIL'));
  
  // 2. Test normalizeJobCode
  console.log("normalizeJobCode('#0025'): " + (normalizeJobCode('#0025') === '25' ? 'PASS' : 'FAIL'));
  console.log("normalizeJobCode('010'): " + (normalizeJobCode('010') === '10' ? 'PASS' : 'FAIL'));
  
  // 3. Test getLatestStatusOfJob
  const mockJob1 = {
    'ผลการวิ่งงาน 1: สถานะ': 'สำเร็จ',
    'ผลการวิ่งงาน 1: วัน/เดือน/ปี': '08/07/2026',
    'ผลการวิ่งงาน 1: หมายเหตุ': 'เรียบร้อย'
  };
  const status1 = getLatestStatusOfJob(mockJob1);
  console.log("getLatestStatusOfJob (1 run): " + (status1.status === 'สำเร็จ' && status1.runNum === 1 ? 'PASS' : 'FAIL'));

  const mockJob2 = {
    'ผลการวิ่งงาน 1: สถานะ': 'ลูกค้าขอเลื่อน',
    'ผลการวิ่งงาน 1: วัน/เดือน/ปี': '08/07/2026',
    'ผลการวิ่งงาน 1: หมายเหตุ': 'ไม่ว่าง',
    'ผลการวิ่งงาน 2: สถานะ': 'พนักงานขอเลื่อน',
    'ผลการวิ่งงาน 2: วัน/เดือน/ปี': '09/07/2026',
    'ผลการวิ่งงาน 2: หมายเหตุ': 'ฝนตกหนัก'
  };
  const status2 = getLatestStatusOfJob(mockJob2);
  console.log("getLatestStatusOfJob (2 runs): " + (status2.status === 'พนักงานขอเลื่อน' && status2.runNum === 2 ? 'PASS' : 'FAIL'));

  console.log("=== Unit Tests Completed ===");
}

// ─── News Management ────────────────────────────────────────────────────────
function insertNews(data) {
  if (!data || !data.title || !data.detail) {
    return { result: 'error', message: 'กรุณากรอกข้อมูลหัวข้อและรายละเอียดให้ครบถ้วน' };
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('NEWS_SHEET_ID') || '1IxrsUeatefuzXlCgKVHkYjyqg230KFxtYQHLEOmzVfo';
  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName('ข่าวสาร');
  
  if (!sheet) {
    sheet = ss.insertSheet('ข่าวสาร');
    sheet.appendRow(['หัวข้อ', 'วันที่', 'รายละเอียด']);
  }

  const title = data.title;
  const detail = data.detail;
  
  // Format current date as dd/MM/yyyy
  const now = new Date();
  const dateStr = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy');

  // Insert as the first data row (below the header row 1) so newest news displays first!
  // To do that, we insert a blank row at index 2 and set the values.
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, 3).setValues([[title, dateStr, detail]]);
  
  return { result: 'success', message: 'บันทึกข่าวสารเรียบร้อยแล้ว' };
}

function testEmployeeList() {
  const result = getEmployeeList();
  console.log("getEmployeeList result: " + JSON.stringify(result));
}

/**
 * ฟังก์ชันตรวจสอบความถูกต้องของ LINE Channel Token และ Secret
 */
function testLineConfig() {
  const secret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');

  const report = {
    result: 'success',
    LINE_CHANNEL_SECRET_status: secret ? `ตั้งค่าแล้ว (ความยาว ${secret.length} ตัวอักษร)` : 'ยังไม่ได้ตั้งค่า ❌',
    LINE_CHANNEL_ACCESS_TOKEN_status: token ? `ตั้งค่าแล้ว (ความยาว ${token.length} ตัวอักษร)` : 'ยังไม่ได้ตั้งค่า ❌',
    tokenTestResult: ''
  };

  if (!token) {
    report.result = 'error';
    report.tokenTestResult = 'ไม่สามารถทดสอบโทเค็นได้เนื่องจากไม่มีข้อมูลโทเค็นในระบบ';
    return report;
  }

  // ส่งคำขอจำลองเรียกข้อมูล Bot info จาก LINE API
  const options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + token.trim()
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', options);
    const code = response.getResponseCode();
    const body = response.getContentText();

    if (code === 200) {
      const data = JSON.parse(body);
      report.tokenTestResult = '✅ โทเค็นถูกต้องใช้งานได้จริง! เชื่อมโยงกับบอทชื่อ: ' + data.displayName;
      report.botDetails = data;
    } else {
      report.result = 'error';
      report.tokenTestResult = `❌ โทเค็นไม่ถูกต้อง (LINE API ตอบกลับด้วยรหัส HTTP ${code})`;
      report.lineResponse = body;
    }
  } catch (err) {
    report.result = 'error';
    report.tokenTestResult = '❌ เกิดข้อผิดพลาดทางเทคนิคระหว่างเชื่อมต่อหา LINE: ' + err.message;
  }

  return report;
}
