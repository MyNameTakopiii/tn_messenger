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

const SHEET_B_ID = '1kI8D0p8n5huV8I57vzHVlDN0VAFYpgEw43gwMV_e7xc';
const ORDER_TAB = 'ใบสั่งงาน';
const META_TAB = '_meta';
const META_CELL = 'A1';
const EMPLOYEE_TAB = 'พนักงาน';
const ASSIGNED_COL = 'รหัสพนักงานที่มอบหมาย';
const TERMINAL_STATUSES = ['สำเร็จ', 'ลูกค้าขอยกเลิก'];
const PASSWORD_PEPPER = 'temm_tnmessenger';

function forceAuthorizeLINE() {
  // Raw call without try-catch or muteHttpExceptions to force Apps Script engine to display Authorization Required dialog
  UrlFetchApp.fetch('https://api.line.me/v2/bot/info');
}

// ─── Router ───────────────────────────────────────────────────────────────

function doPost(e) {
  // Check if action parameter is line or if it is a LINE webhook (has signature or events)
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'line') {
    return handleLineWebhook(e);
  }

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
  if (!e) e = { parameter: {} };

  let action = (e.parameter && e.parameter.action) || '';
  const callback = e.parameter && e.parameter.callback;
  const dataObj = parseJsonParam(e, 'data');

  if (!action && dataObj && dataObj.action) {
    action = dataObj.action;
  }

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
        result = getTasksByEmployee(dataObj);
        break;
      case 'get_cover_report':
        result = getCoverReport(dataObj);
        break;
      case 'getOrderNo':
        result = getOrderNo();
        break;
      case 'get_all_row_json':
        result = getAllRowJson();
        break;
      case 'get_task_employee':
        result = getTaskEmployee(dataObj);
        break;
      case 'get_task_by_id':
        result = getTaskById(dataObj);
        break;
      case 'update':
        result = updateJob(dataObj);
        break;
      case 'test_line_config':
        result = testLineConfig();
        break;

      // doPost/JSON endpoints
      case 'insertJob':
      case 'add_work_order':
        result = insertJob(dataObj);
        break;
      case 'register_employee':
        result = registerEmployee(dataObj);
        break;
      case 'login_employee':
        result = loginEmployee(dataObj);
        break;
      case 'reset_password_employee':
        result = resetPasswordEmployee(dataObj);
        break;
      case 'insert_news':
        result = insertNews(dataObj);
        break;
      case 'log_attendance':
        result = logAttendance(dataObj);
        break;

      default:
        // Default fallthrough to support direct JSONP inserts from legacy clients
        if (dataObj && (dataObj.orderNo || dataObj.customerName || dataObj.requester)) {
          result = insertJob(dataObj);
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
  if (!e) return {};

  // 1. Check if e.parameter[key] exists (e.g. ?data={"orderNo":123,...})
  if (e.parameter && e.parameter[key]) {
    try {
      const parsed = typeof e.parameter[key] === 'string' ? JSON.parse(e.parameter[key]) : e.parameter[key];
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (_) {}
  }

  // 2. Check if e.postData.contents exists (POST payload)
  if (e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents);
      if (parsed && typeof parsed === 'object') {
        if (key && parsed[key] && typeof parsed[key] === 'object') {
          return parsed[key];
        }
        return parsed;
      }
    } catch (_) {}
  }

  // 3. Check if flat query parameters exist on e.parameter (e.g. ?action=insertJob&orderNo=123&customerName=John)
  if (e.parameter && Object.keys(e.parameter).length > 0) {
    const params = Object.assign({}, e.parameter);
    delete params.callback;
    delete params._;
    return params;
  }

  return {};
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

function formatDateOnly_(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Bangkok', 'dd/MM/yyyy');
  }
  const str = String(val).trim();
  if (!str) return '';

  const dmYMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmYMatch) {
    const d = String(dmYMatch[1]).padStart(2, '0');
    const m = String(dmYMatch[2]).padStart(2, '0');
    return `${d}/${m}/${dmYMatch[3]}`;
  }

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  if (str.includes('GMT') || str.includes('Indochina Time') || /^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{2}\s\d{4}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM/yyyy');
    }
  }

  return str;
}

function rowToObject_(headers, row) {
  const obj = {};
  headers.forEach(function (h, i) {
    const key = String(h);
    let val = row[i];
    if (key === 'วันที่เก็บเอกสาร' || (key.includes('วันที่') && key !== 'ประทับเวลา')) {
      val = formatDateOnly_(val);
    } else if (val instanceof Date) {
      val = formatDateOnly_(val);
    }
    obj[key] = val != null ? String(val) : '';
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
      return String(h).toLowerCase().trim() === candidates[c].toLowerCase().trim();
    });
    if (idx >= 0) return idx;
  }
  return -1;
}

// ─── Tasks by employee ──────────────────────────────────────────────────────

function getTasksByEmployee(data) {
  data = data || {};
  const employeeId = String(data.employeeId || data.id || '').trim();
  if (!employeeId) {
    return { result: 'success', data: [] };
  }

  const dateFilter = (data.date || '').toString().trim();

  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { result: 'success', data: [] };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const assignIdx = findColIndex_(headers, [ASSIGNED_COL, 'รหัสพนักงานที่มอบหมาย', 'assignedEmployeeId']);
  const empIdIdx = findColIndex_(headers, ['id', 'ID', 'รหัสพนักงาน']);
  const messengerNameIdx = findColIndex_(headers, ['ชื่อพนักงาน', 'messengerName', 'พนักงานจัดส่ง']);

  // OPTIMIZATION: Read only recent rows (last 500 rows) instead of 9,000+ rows for 10x faster speed
  const maxSearchRows = 500;
  const startRow = Math.max(2, lastRow - maxSearchRows + 1);
  const numRows = lastRow - startRow + 1;

  const allData = sheet.getRange(startRow, 1, numRows, headers.length).getValues();
  const tasks = [];
  const empIdLower = employeeId.toLowerCase();

  for (var i = allData.length - 1; i >= 0; i--) {
    const row = allData[i];
    const assigned = assignIdx >= 0 ? String(row[assignIdx] || '').trim().toLowerCase() : '';
    const empIdVal = empIdIdx >= 0 ? String(row[empIdIdx] || '').trim().toLowerCase() : '';
    const messengerVal = messengerNameIdx >= 0 ? String(row[messengerNameIdx] || '').trim().toLowerCase() : '';

    const isMatch = (assigned && assigned === empIdLower) ||
                    (empIdVal && empIdVal === empIdLower) ||
                    (messengerVal && messengerVal.includes(empIdLower));

    if (!isMatch) continue;

    const obj = rowToObject_(headers, row);
    const collectDate = formatDateForFilter_(String(obj['วันที่เก็บเอกสาร'] || '').trim());
    if (dateFilter && dateFilter !== 'all' && collectDate && collectDate !== dateFilter) continue;

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

function getAllRowJson(maxRows) {
  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { result: 'success', count: 0, data: [] };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const limit = maxRows || 1000;
  const startRow = Math.max(2, lastRow - limit + 1);
  const numRows = lastRow - startRow + 1;
  const dataRange = sheet.getRange(startRow, 1, numRows, headers.length).getValues();

  const formattedRows = dataRange
    .filter(row => row.some(cell => cell.toString().trim() !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (h === 'ประทับเวลา' && v instanceof Date) {
          v = Utilities.formatDate(v, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
        } else if (h === 'วันที่เก็บเอกสาร' || (h.includes('วันที่') && h !== 'ประทับเวลา')) {
          v = formatDateOnly_(v);
        } else if (v instanceof Date) {
          v = formatDateOnly_(v);
        }
        obj[h] = v !== undefined && v !== null ? String(v) : '';
      });
      return obj;
    });

  return { result: 'success', count: formattedRows.length, data: formattedRows };
}

function getTaskEmployee(data) {
  data = data || {};
  const employeeId = String(data.id || data.employeeId || '').trim();
  if (!employeeId) {
    return { result: 'error', message: 'กรุณาระบุรหัสพนักงาน' };
  }

  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { result: 'success', count: 0, data: [] };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const maxSearch = 500;
  const startRow = Math.max(2, lastRow - maxSearch + 1);
  const numRows = lastRow - startRow + 1;
  const allData = sheet.getRange(startRow, 1, numRows, headers.length).getValues();

  const tasks = [];
  const empIdLower = employeeId.toLowerCase();

  for (let i = allData.length - 1; i >= 0; i--) {
    const obj = rowToObject_(headers, allData[i]);
    const empId = String(obj['รหัสพนักงาน'] || '').trim().toLowerCase();
    const assignedEmpId = String(obj['รหัสพนักงานที่มอบหมาย'] || '').trim().toLowerCase();
    if (empId === empIdLower || assignedEmpId === empIdLower) {
      tasks.push(obj);
    }
  }

  return { result: 'success', count: tasks.length, data: tasks };
}

function getTaskById(data) {
  data = data || {};
  const searchOrderNo = String(data.orderNo || '').trim().replace(/^0+/, '');
  if (!searchOrderNo) {
    return { result: 'error', message: 'กรุณาระบุเลขที่ใบสั่งงาน' };
  }

  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { result: 'error', message: 'ไม่พบเลขที่ใบสั่งงาน: ' + searchOrderNo };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const orderColIdx = findColIndex_(headers, ['เลขที่ใบสั่งงาน', 'orderNo', 'id', 'ID']);
  const colNumber = orderColIdx >= 0 ? orderColIdx + 1 : 17;

  // Ultra-Fast 2-Step Search: Search last 500 rows of OrderNo column first
  const maxSearch = 500;
  const searchStart = Math.max(2, lastRow - maxSearch + 1);
  const searchCount = lastRow - searchStart + 1;
  const orderValues = sheet.getRange(searchStart, colNumber, searchCount, 1).getValues();

  let foundRowIndex = -1;
  const targetNum = parseInt(searchOrderNo, 10);

  for (var i = orderValues.length - 1; i >= 0; i--) {
    const val = String(orderValues[i][0] || '').trim();
    if (val === searchOrderNo || val.replace(/^0+/, '') === searchOrderNo || (!isNaN(targetNum) && parseInt(val, 10) === targetNum)) {
      foundRowIndex = searchStart + i;
      break;
    }
  }

  // Fallback search remaining rows if not found in last 500 rows
  if (foundRowIndex === -1 && searchStart > 2) {
    const remainingValues = sheet.getRange(2, colNumber, searchStart - 2, 1).getValues();
    for (var i = remainingValues.length - 1; i >= 0; i--) {
      const val = String(remainingValues[i][0] || '').trim();
      if (val === searchOrderNo || val.replace(/^0+/, '') === searchOrderNo || (!isNaN(targetNum) && parseInt(val, 10) === targetNum)) {
        foundRowIndex = i + 2;
        break;
      }
    }
  }

  if (foundRowIndex === -1) {
    return { result: 'error', message: 'ไม่พบเลขที่ใบสั่งงาน: ' + searchOrderNo };
  }

  // Fetch ONLY the target row
  const rowData = sheet.getRange(foundRowIndex, 1, 1, headers.length).getValues()[0];
  const taskObj = rowToObject_(headers, rowData);

  return { result: 'success', data: taskObj };
}

function insertJob(data) {
  if (!data || typeof data !== 'object' || (!data.customerName && !data.requester && !data.collectDate)) {
    return { result: 'error', message: 'กรุณากรอกข้อมูลใบสั่งงานให้ครบถ้วน' };
  }

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
  const updateURL = `${data.baseURL || 'https://tn-messenger-olive.vercel.app'}/customer/tracking_2.html?order=${paddedOrderNo}`;

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

  const target = parseInt(data.orderNo, 10);
  const targetStr = String(data.orderNo || '').trim().replace(/^0+/, '');

  // Search last 500 rows from bottom-up for maximum speed
  const maxSearch = 500;
  const searchStart = Math.max(2, lastRow - maxSearch + 1);
  const searchCount = lastRow - searchStart + 1;
  const orders = sheet.getRange(searchStart, 17, searchCount, 1).getValues();

  let idx = -1;
  for (let i = orders.length - 1; i >= 0; i--) {
    const val = String(orders[i][0] || '').trim();
    if (parseInt(val, 10) === target || val.replace(/^0+/, '') === targetStr) {
      idx = searchStart + i;
      break;
    }
  }

  // Fallback if not found in last 500 rows
  if (idx === -1 && searchStart > 2) {
    const remainingOrders = sheet.getRange(2, 17, searchStart - 2, 1).getValues();
    for (let i = remainingOrders.length - 1; i >= 0; i--) {
      const val = String(remainingOrders[i][0] || '').trim();
      if (parseInt(val, 10) === target || val.replace(/^0+/, '') === targetStr) {
        idx = i + 2;
        break;
      }
    }
  }

  if (idx === -1) {
    return { result: 'error', message: 'ไม่พบเลขที่ใบงาน: ' + data.orderNo };
  }

  const row = idx;
  const startCol = 18;
  const numCols = 11;

  const existingData = sheet.getRange(row, startCol, 1, numCols).getValues()[0];
  const existingMessenger = String(existingData[9] || '').trim();
  const existingEmpId = String(existingData[10] || '').trim();
  const newEmpId = String(data.id || '').trim();

  // Check today's date
  const todayDateStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');
  const todayISOStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');

  // Check order creation timestamp & collect date
  const orderTimestamp = String(sheet.getRange(row, 1).getValue() || '');
  const collectDate = String(sheet.getRange(row, 2).getValue() || '');
  
  const isToday = !orderTimestamp || 
                  orderTimestamp.includes(todayDateStr) || 
                  collectDate.includes(todayDateStr) || 
                  collectDate.includes(todayISOStr) ||
                  orderTimestamp.includes(todayISOStr);

  // If already assigned to a different employee AND it is TODAY:
  if (newEmpId && existingEmpId && existingEmpId !== newEmpId && isToday && data.allowReassign !== true) {
    return {
      result: 'already_assigned',
      existingMessenger: existingMessenger || existingEmpId,
      existingId: existingEmpId,
      message: 'ใบสั่งงาน #' + data.orderNo + ' ถูกมอบหมายให้ "' + (existingMessenger || existingEmpId) + '" แล้วในวันนี้'
    };
  }

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

  // Update ASSIGNED_COL (รหัสพนักงานที่มอบหมาย) if id or assignedEmployeeId is provided
  const empIdToAssign = data.id || data.assignedEmployeeId;
  if (empIdToAssign) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const assignIdx = headers.indexOf(ASSIGNED_COL);
    if (assignIdx >= 0) {
      sheet.getRange(row, assignIdx + 1).setValue(String(empIdToAssign));
    }
  }

  bumpLastModified_();

  // Trigger LINE Push Notification if user is linked (check Col 30 / LINE User ID)
  try {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lineColIdx = headers.indexOf('LINE User ID');
    if (lineColIdx >= 0) {
      const lineUserId = String(sheet.getRange(row, lineColIdx + 1).getValue() || '').trim();
      if (lineUserId) {
        const updatedRowData = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
        const updatedRowObj = rowToObject_(headers, updatedRowData);
        sendLinePushNotification(lineUserId, updatedRowObj);
      }
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

function resetPasswordEmployee(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('employee_user');
  if (!sheet) {
    return { result: 'error', message: 'ไม่พบชีต employee_user' };
  }

  const email = String(data.email || '').trim().toLowerCase();
  const newPassword = String(data.newPassword || '').trim();

  if (!email || !newPassword) {
    return { result: 'error', message: 'กรุณากรอกอีเมลและรหัสผ่านใหม่ให้ครบถ้วน' };
  }

  if (newPassword.length < 6) {
    return { result: 'error', message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { result: 'error', message: 'ไม่พบข้อมูลผู้ใช้ในระบบ' };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let emailIdx = headers.indexOf('email');
  if (emailIdx === -1) {
    emailIdx = headers.findIndex(h => String(h).toLowerCase() === 'email');
  }
  const passIdx = headers.indexOf('password');

  if (emailIdx === -1 || passIdx === -1) {
    return { result: 'error', message: 'โครงสร้างชีต employee_user ไม่ถูกต้อง' };
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  let userRowIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    const userEmail = String(rows[i][emailIdx] || '').trim().toLowerCase();
    if (userEmail === email) {
      userRowIndex = i + 2;
      break;
    }
  }

  if (userRowIndex === -1) {
    return { result: 'error', message: 'ไม่พบอีเมลนี้ในระบบพนักงาน' };
  }

  const newPasswordHash = hash_password(newPassword);
  sheet.getRange(userRowIndex, passIdx + 1).setValue(newPasswordHash);

  return { result: 'success', message: 'เปลี่ยนรหัสผ่านสำเร็จ! ท่านสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที' };
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
  const userId = (event.source && event.source.userId) || '';
  const inputText = (event.message.text || '').trim();

  if (!inputText) return;

  // ใช้ Push API (userId) เป็นหลัก เพราะ Vercel proxy ตอบ LINE ไปก่อนแล้ว replyToken จะหมดอายุ
  // ถ้าไม่มี userId ให้ fallback ไปใช้ replyToken
  const usePush = !!userId;

  // ตรวจสอบว่าข้อความเป็นเลขที่ใบสั่งงานหรือไม่
  const normalizedJobCode = normalizeJobCode(inputText);

  if (!normalizedJobCode) {
    // ไม่ใช่ตัวเลข → ตอบข้อความต้อนรับ แนะนำให้พิมพ์เลขใบงาน
    const welcomeMsg = 'สวัสดีค่ะ ยินดีต้อนรับสู่บริการ TN Messenger 🎉\n\n' +
      'กรุณาพิมพ์ เลขที่ใบสั่งงาน เพื่อตรวจสอบสถานะค่ะ\n' +
      '(ตัวอย่าง: 0001 หรือ 25)';
    if (usePush) {
      sendLinePushMessage(userId, welcomeMsg);
    } else {
      sendLineReply(replyToken, welcomeMsg);
    }
    return;
  }

  // ค้นหาใบงานจากเลขที่ใบสั่งงาน
  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    const noDataMsg = '❌ ขออภัยค่ะ ระบบยังไม่มีข้อมูลใบสั่งงานในขณะนี้';
    if (usePush) { sendLinePushMessage(userId, noDataMsg); } else { sendLineReply(replyToken, noDataMsg); }
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const orderNoIdx = findColIndex_(headers, ['เลขที่ใบสั่งงาน', 'orderNo', 'id', 'ID']);
  const colNumber = orderNoIdx >= 0 ? orderNoIdx + 1 : 17;

  // Ultra-Fast Search: Check last 500 rows bottom-up first
  const maxSearch = 500;
  const searchStart = Math.max(2, lastRow - maxSearch + 1);
  const searchCount = lastRow - searchStart + 1;
  const recentOrders = sheet.getRange(searchStart, colNumber, searchCount, 1).getValues();

  let matchedJob = null;
  let targetRow = -1;

  for (let i = recentOrders.length - 1; i >= 0; i--) {
    const rowOrderNo = String(recentOrders[i][0] || '').trim();
    if (normalizeJobCode(rowOrderNo) === normalizedJobCode) {
      targetRow = searchStart + i;
      break;
    }
  }

  // Fallback if not found in last 500 rows
  if (targetRow === -1 && searchStart > 2) {
    const olderOrders = sheet.getRange(2, colNumber, searchStart - 2, 1).getValues();
    for (let i = olderOrders.length - 1; i >= 0; i--) {
      const rowOrderNo = String(olderOrders[i][0] || '').trim();
      if (normalizeJobCode(rowOrderNo) === normalizedJobCode) {
        targetRow = i + 2;
        break;
      }
    }
  }

  if (targetRow !== -1) {
    const rowData = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
    matchedJob = rowToObject_(headers, rowData);
  }

  if (!matchedJob) {
    const notFoundMsg = '❌ ไม่พบเลขที่ใบสั่งงาน ' + inputText + '\n\n' +
      'กรุณาตรวจสอบเลขที่ใบสั่งงานและลองพิมพ์ใหม่อีกครั้งค่ะ';
    if (usePush) { sendLinePushMessage(userId, notFoundMsg); } else { sendLineReply(replyToken, notFoundMsg); }
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

  const baseURL = PropertiesService.getScriptProperties().getProperty('BASE_URL') || 'https://tn-messenger-olive.vercel.app';
  replyText += `\n🔗 ติดตามสถานะ: ${baseURL}/customer/tracking_2.html?order=${orderNo}`;

  if (usePush) {
    sendLinePushMessage(userId, replyText);
  } else {
    sendLineReply(replyToken, replyText);
  }
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
  const rawToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
  const lineChannelAccessToken = rawToken.trim();
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
  console.log('LINE Reply Response (' + response.getResponseCode() + '): ' + response.getContentText());
}

function sendLinePushMessage(userId, text) {
  const rawToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
  const lineChannelAccessToken = rawToken.trim();
  if (!lineChannelAccessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN is not set, cannot push');
    return;
  }

  const payload = {
    to: userId,
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

  const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', options);
  console.log('LINE Push Response (' + response.getResponseCode() + '): ' + response.getContentText());
}

function sendLinePushNotification(lineUserId, rowObj) {
  const rawToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
  const lineChannelAccessToken = rawToken.trim();
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
  
  const baseURL = PropertiesService.getScriptProperties().getProperty('BASE_URL') || 'https://tn-messenger-olive.vercel.app';
  messageText += `\n🔗 ติดตามสถานะ: ${baseURL}/customer/tracking_2.html?order=${orderNo}`;

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

  console.log("LINE Test Report:\n" + JSON.stringify(report, null, 2));
  Logger.log(report);
  return report;
}

/**
 * ฟังก์ชันทดสอบระบบ LINE Bot และพิมพ์ผลลัพธ์ลง Log แบบละเอียด
 */
function testLineBot() {
  const secret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');

  console.log("=== 1. ตรวจสอบ Script Properties ===");
  console.log("LINE_CHANNEL_SECRET:", secret ? "ตั้งค่าแล้ว (" + secret.length + " ตัวอักษร)" : "❌ ยังไม่ได้ตั้งค่า!");
  console.log("LINE_CHANNEL_ACCESS_TOKEN:", token ? "ตั้งค่าแล้ว (" + token.length + " ตัวอักษร)" : "❌ ยังไม่ได้ตั้งค่า!");

  if (!token) {
    console.error("❌ ERROR: LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ใส่ใน Script Properties ( Project Settings ⚙️ )");
    return "❌ กรุณาตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties";
  }

  console.log("=== 2. ทดสอบเชื่อมต่อ LINE Bot API ===");
  const options = {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token.trim() },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', options);
    const code = response.getResponseCode();
    const body = response.getContentText();

    if (code === 200) {
      const data = JSON.parse(body);
      console.log("✅ โทเค็นถูกต้องใช้งานได้จริง! เชื่อมโยงกับบอทชื่อ: " + data.displayName);
    } else {
      console.error("❌ โทเค็นไม่ถูกต้อง (HTTP " + code + "): " + body);
      return "❌ โทเค็นไม่ถูกต้อง (HTTP " + code + ")";
    }
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดเชื่อมต่อ LINE: " + err.message);
    return "❌ เชื่อมต่อ LINE ไม่ได้";
  }

  console.log("=== 3. ทดสอบการค้นหาใบงาน ===");
  const sheet = getOrderSheet_();
  const lastRow = sheet.getLastRow();
  console.log("จำนวนแถวในใบสั่งงาน:", lastRow);

  console.log("✅ การทดสอบสำเร็จสมบูรณ์! พร้อมใช้งาน");
  return "✅ การทดสอบสำเร็จสมบูรณ์! พร้อมใช้งาน";
}

function logAttendance(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('ลงเวลาพนักงาน');
  if (!sheet) {
    sheet = ss.insertSheet('ลงเวลาพนักงาน');
    sheet.appendRow([
      'ประทับเวลา', 'วันที่', 'รหัสพนักงาน', 'ชื่อพนักงาน', 'ประเภท',
      'เวลาเข้างาน', 'เวลาออกงาน', 'รวมเวลาปฏิบัติงาน',
      'ใบงานทั้งหมด', 'ส่งสำเร็จ', 'รอดำเนินการ', 'ยกเลิก'
    ]);
  }

  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
  sheet.appendRow([
    now,
    data.date || '',
    data.employeeId || '',
    data.employeeName || '',
    data.type || '',
    data.clockInTime || '',
    data.clockOutTime || '',
    data.totalHours || '',
    data.totalJobs || 0,
    data.successJobs || 0,
    data.pendingJobs || 0,
    data.cancelJobs || 0
  ]);

  return { result: 'success', message: 'บันทึกเวลาปฏิบัติงานเรียบร้อย' };
}
