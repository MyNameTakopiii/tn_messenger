// src/js/api.js

export const SCRIPT_URL_ORDER = import.meta.env.VITE_SCRIPT_URL_ORDER || "https://script.google.com/macros/s/AKfycbwutGjM8fg__QRCBYBiDsCJ8ttkQ-97v8gER_C_W7VB4TG5-vvX5doUXlbGc5bvZYM5/exec";
export const SCRIPT_URL_DATA = import.meta.env.VITE_SCRIPT_URL_DATA || "https://script.google.com/macros/s/AKfycbyq3DjZ8ZulzWSq4yu6vvp4HGvkLaK_WqMjAYiBYb5xWcpaHxsNKoupPa133Nkajj4r0w/exec";
export const SHEET_A_ID = import.meta.env.VITE_SHEET_A_ID || "1FkcnGM31UU1UNgsPyCrl95Jp1NDO98RlXpeU9a0eg_M";

/**
 * JSONP request helper to bypass CORS issues with Google Apps Script GET requests
 * @param {string} url - Base URL
 * @param {object} params - Query parameters
 * @returns {Promise<any>}
 */
/**
 * JSONP request helper to bypass CORS issues with Google Apps Script GET requests
 * @param {string} url - Base URL
 * @param {object} params - Query parameters
 * @param {number} timeoutMs - Timeout in milliseconds (default 12000ms)
 * @param {number} retries - Number of retries on timeout/error (default 1)
 * @returns {Promise<any>}
 */
export function jsonp(url, params = {}, timeoutMs = 12000, retries = 1) {
  return new Promise((resolve, reject) => {
    const callbackName = "jsonp_cb_" + Math.random().toString(36).substring(2, 15);
    let timer = null;

    function cleanup() {
      if (timer) clearTimeout(timer);
      delete window[callbackName];
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = function (response) {
      cleanup();
      resolve(response);
    };

    const script = document.createElement("script");
    const searchParams = new URLSearchParams();
    
    // Copy existing search params from URL if any
    const urlObj = new URL(url, window.location.href);
    urlObj.searchParams.forEach((value, key) => {
      searchParams.set(key, value);
    });
    
    // Add dynamic params
    Object.keys(params).forEach((key) => {
      let val = params[key];
      if (typeof val === "object") {
        val = JSON.stringify(val);
      }
      searchParams.set(key, val);
    });
    
    searchParams.set("callback", callbackName);
    
    // Strip query string from base URL to avoid duplicates
    const cleanUrl = url.split("?")[0];
    script.src = `${cleanUrl}?${searchParams.toString()}`;
    
    script.onerror = (err) => {
      cleanup();
      if (retries > 0) {
        console.warn(`JSONP failed, retrying... (${retries} left)`);
        jsonp(url, params, timeoutMs, retries - 1).then(resolve).catch(reject);
      } else {
        reject(new Error("JSONP Request failed"));
      }
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        if (retries > 0) {
          console.warn(`JSONP timeout (${timeoutMs}ms), retrying... (${retries} left)`);
          jsonp(url, params, timeoutMs, retries - 1).then(resolve).catch(reject);
        } else {
          reject(new Error("JSONP Request timeout"));
        }
      }, timeoutMs);
    }

    document.body.appendChild(script);
  });
}

/**
 * POST request helper for Google Apps Script POST actions
 * @param {string} url - Endpoint URL
 * @param {string} action - Action parameter
 * @param {object} data - Post payload
 * @returns {Promise<any>}
 */
export async function postData(url, action, data = {}) {
  const endpoint = `${url}?action=${action}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain"
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON response: ${text}`);
  }
}

/**
 * Standard GET request helper
 * @param {string} url 
 * @param {object} params 
 * @returns {Promise<any>}
 */
export async function getData(url, params = {}) {
  const searchParams = new URLSearchParams(params);
  const response = await fetch(`${url}?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch and parse CSV from Google Sheet
 * @param {string} sheetId 
 * @param {string} gid 
 * @returns {Promise<string[][]>}
 */
export async function fetchSheetCSV(sheetId = SHEET_A_ID, gid = "0") {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch sheet data");
  }
  const text = await res.text();
  return parseCSV(text);
}

/**
 * Simple CSV parser to convert raw text into 2D array
 * Handles basic quotes and commas
 */
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  return lines.map((line) => {
    const row = [];
    let insideQuote = false;
    let entry = "";
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === "," && !insideQuote) {
        row.push(entry.trim());
        entry = "";
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    return row;
  });
}

/**
 * Caching fetcher helper
 * @param {string} cacheKey 
 * @param {string} url 
 * @param {object} params 
 * @param {number} ttl - Cache time-to-live in ms (default 24 hours)
 */
async function fetchWithCache(cacheKey, url, params = {}, ttl = 24 * 60 * 60 * 1000) {
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.timestamp && Date.now() - parsed.timestamp < ttl) {
        return parsed.data;
      }
    } catch (_) {
      // ignore
    }
  }

  const data = await getData(url, params);
  localStorage.setItem(cacheKey, JSON.stringify({
    timestamp: Date.now(),
    data
  }));
  return data;
}

/**
 * Fetch address data with 24h caching
 */
export function fetchAddressData() {
  return fetchWithCache("th_address_data", SCRIPT_URL_DATA, { action: "getAddressData" });
}

/**
 * Fetch project list with 24h caching
 */
export function fetchProjectList() {
  return fetchWithCache("project_list", SCRIPT_URL_DATA, { action: "getProjectList" });
}

/**
 * Fetch documents list with 24h caching
 */
export function fetchDocumentsList() {
  return fetchWithCache("documents_list", SCRIPT_URL_DATA, { action: "getDocumentsList" });
}

