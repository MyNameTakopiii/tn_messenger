// src/js/tn-employee-tasks.js
import { SCRIPT_URL_ORDER } from '../config/api.js';

export function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function getEmployeeId() {
  try {
    const raw = localStorage.getItem("tn_employee_user");
    if (!raw || raw === "undefined") return "";
    const user = JSON.parse(raw);
    return user ? (user.id || "") : "";
  } catch (_) {
    return "";
  }
}

export async function fetchAssignedTasks(date) {
  const employeeId = getEmployeeId();
  if (!employeeId) return [];

  const params = new URLSearchParams({
    action: "get_tasks_by_employee",
    data: JSON.stringify({ employeeId, date: date || "" }),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${SCRIPT_URL_ORDER}?${params}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const json = await res.json();
    if (json.result === "success" && Array.isArray(json.data)) {
      return json.data.map((t) => ({ ...t, _source: "assigned" }));
    }
  } catch (err) {
    clearTimeout(timeoutId);
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
      _source: "scan"
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

export async function loadMergedTasks() {
  const [assigned, scanned] = await Promise.all([
    fetchAssignedTasks(),
    Promise.resolve(getScannedTasks()),
  ]);
  return mergeTasks(assigned, scanned);
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
