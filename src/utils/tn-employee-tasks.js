// src/js/tn-employee-tasks.js
import { SCRIPT_URL_ORDER, jsonp } from '../config/api.js';

export function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function getEmployeeId() {
  try {
    const raw = localStorage.getItem("tn_employee_user");
    if (!raw || raw === "undefined") return "";
    const user = JSON.parse(raw);
    return user ? String(user.id || user.username || "").trim() : "";
  } catch (_) {
    return "";
  }
}

export async function fetchAssignedTasks(date) {
  const employeeId = getEmployeeId();
  if (!employeeId) return [];

  try {
    // Use jsonp helper to bypass CORS policy on Google Apps Script Web App GET requests
    const res = await jsonp(
      SCRIPT_URL_ORDER,
      {
        action: "get_tasks_by_employee",
        data: { employeeId, date: date || "" }
      },
      15000
    );

    if (res && res.result === "success" && Array.isArray(res.data)) {
      const assignedTasks = res.data.map((t) => ({ ...t, _source: "assigned" }));
      
      // Update local storage cache with assigned tasks for offline/instant availability
      const stored = JSON.parse(localStorage.getItem("tasks_employee") || "{}");
      const today = todayISO();
      assignedTasks.forEach((t) => {
        const key = String(t["เลขที่ใบสั่งงาน"] || t.orderNo || t.id || "").replace(/^0+/, "");
        if (key) {
          stored[key] = {
            ...stored[key],
            ...t,
            scan_date: t.scan_date || today,
            _source: "assigned"
          };
        }
      });
      localStorage.setItem("tasks_employee", JSON.stringify(stored));

      return assignedTasks;
    }
  } catch (err) {
    console.warn("fetchAssignedTasks error/timeout:", err);
  }
  return [];
}

export function getScannedTasks() {
  const today = todayISO();
  let stored = {};
  try {
    const raw = localStorage.getItem("tasks_employee");
    if (raw && raw !== "undefined") {
      stored = JSON.parse(raw) || {};
    }
  } catch (_) {
    stored = {};
  }
  let changed = false;
  for (const id in stored) {
    if (stored[id] && stored[id].scan_date !== today) {
      delete stored[id];
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem("tasks_employee", JSON.stringify(stored));
  }
  return Object.values(stored).map((t) => {
    const orderNo = String(t["เลขที่ใบสั่งงาน"] || t.orderNo || t.id || "").replace(/^0+/, "");
    return {
      ...t,
      "เลขที่ใบสั่งงาน": t["เลขที่ใบสั่งงาน"] || orderNo,
      _source: t._source || "scan"
    };
  });
}

export function mergeTasks(serverTasks, scannedTasks) {
  const map = new Map();
  scannedTasks.forEach((t) => {
    const key = String(t["เลขที่ใบสั่งงาน"] || t.orderNo || t.id || "").replace(/^0+/, "");
    if (key) {
      map.set(key, { ...t, "เลขที่ใบสั่งงาน": t["เลขที่ใบสั่งงาน"] || key });
    }
  });
  serverTasks.forEach((t) => {
    const key = String(t["เลขที่ใบสั่งงาน"] || t.orderNo || t.id || "").replace(/^0+/, "");
    if (key) {
      map.set(key, { ...t, "เลขที่ใบสั่งงาน": t["เลขที่ใบสั่งงาน"] || key });
    }
  });
  return Array.from(map.values());
}

let _mergedTasksPromise = null;
let _mergedTasksExpiry = 0;

export async function loadMergedTasks(forceRefresh = false) {
  const now = Date.now();
  if (_mergedTasksPromise && now < _mergedTasksExpiry && !forceRefresh) {
    return _mergedTasksPromise;
  }

  _mergedTasksExpiry = now + 10000; // 10 second memory cache window
  _mergedTasksPromise = (async () => {
    try {
      const [assigned, scanned] = await Promise.all([
        fetchAssignedTasks(),
        Promise.resolve(getScannedTasks()),
      ]);
      return mergeTasks(assigned, scanned);
    } catch (err) {
      _mergedTasksPromise = null;
      _mergedTasksExpiry = 0;
      throw err;
    }
  })();

  return _mergedTasksPromise;
}

// Keep backward compatibility for older script links if needed, but we will mostly use ESM
window.TNEmployeeTasks = {
  todayISO,
  getEmployeeId,
  fetchAssignedTasks,
  getScannedTasks,
  mergeTasks,
  loadMergedTasks
};
