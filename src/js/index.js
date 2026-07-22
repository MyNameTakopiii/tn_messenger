// src/js/index.js
import flatpickr from 'flatpickr';
import { Thai } from 'flatpickr/dist/l10n/th.js';
import 'flatpickr/dist/flatpickr.min.css';
import QRCode from 'qrcode';
import {
  postData,
  jsonp,
  fetchAddressData,
  fetchProjectList,
  fetchDocumentsList,
  SCRIPT_URL_ORDER
} from '../config/api.js';

// Elements
const provinceSelect = document.getElementById("province");
const districtSelect = document.getElementById("district");
const subdistrictSelect = document.getElementById("subdistrict");
const zipcodeInput = document.getElementById("zipcode");
const loadingText = document.getElementById("loading");
const collectDateInput = document.getElementById("collectDateInput");
const employeeSelect = document.getElementById("assignedEmployeeId");
const form = document.getElementById("jobForm");

let thailandData = [];

document.addEventListener("DOMContentLoaded", () => {
  // Load initial dropdown lists
  if (provinceSelect) loadThailandData();
  loadProjectList();
  loadDocumentsList();
  loadEmployeeList();

  // Setup Date Picker
  setupDatePicker();

  // Setup UI event listeners
  setupAddressListeners();
  setupProjectToggle();
});

// 1) Load Thailand Address Data
async function loadThailandData() {
  try {
    if (loadingText) {
      loadingText.textContent = "กำลังโหลดข้อมูลที่อยู่...";
    }

    thailandData = await fetchAddressData();

    const provinces = [
      ...new Set(thailandData.map((i) => i.province)),
    ].sort();

    if (provinceSelect) {
      provinceSelect.innerHTML = '<option value="">-- เลือกจังหวัด --</option>';
      provinces.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        provinceSelect.appendChild(opt);
      });
      provinceSelect.disabled = false;
    }

    if (loadingText) loadingText.textContent = "";
  } catch (err) {
    if (loadingText) {
      loadingText.textContent = "❌ โหลดข้อมูลที่อยู่ไม่สำเร็จ";
    }
    console.error("❌ โหลดข้อมูลที่อยู่ไม่สำเร็จ", err);
  }
}

// Address cascades
function populateDistricts(province) {
  if (!districtSelect || !subdistrictSelect || !zipcodeInput) return;

  districtSelect.innerHTML = '<option value="">-- เลือกเขต/อำเภอ --</option>';
  subdistrictSelect.innerHTML = '<option value="">-- เลือกแขวง/ตำบล --</option>';
  subdistrictSelect.disabled = true;
  zipcodeInput.value = "";

  if (province) {
    const districts = [
      ...new Set(
        thailandData
          .filter((i) => i.province === province)
          .map((i) => i.district),
      ),
    ].sort();
    districts.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      districtSelect.appendChild(opt);
    });
    districtSelect.disabled = false;
  } else {
    districtSelect.disabled = true;
  }
}

function populateSubdistricts(district) {
  if (!subdistrictSelect || !zipcodeInput || !provinceSelect) return;

  subdistrictSelect.innerHTML = '<option value="">-- เลือกแขวง/ตำบล --</option>';
  zipcodeInput.value = "";

  if (district) {
    const province = provinceSelect.value;
    const subdistricts = [
      ...new Set(
        thailandData
          .filter(
            (i) => i.province === province && i.district === district,
          )
          .map((i) => i.subdistrict),
      ),
    ].sort();

    subdistricts.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      subdistrictSelect.appendChild(opt);
    });
    subdistrictSelect.disabled = false;
  } else {
    subdistrictSelect.disabled = true;
  }
}

function updateZipcode(subdistrict) {
  if (!zipcodeInput || !provinceSelect || !districtSelect) return;

  zipcodeInput.value = "";
  if (subdistrict) {
    const province = provinceSelect.value;
    const district = districtSelect.value;

    const item = thailandData.find(
      (i) =>
        i.province === province &&
        i.district === district &&
        i.subdistrict === subdistrict,
    );
    if (item) {
      zipcodeInput.value = item.zipcode;
    }
  }
}

function setupAddressListeners() {
  if (provinceSelect) {
    provinceSelect.addEventListener("change", (e) => {
      populateDistricts(e.target.value);
    });
  }
  if (districtSelect) {
    districtSelect.addEventListener("change", (e) => {
      populateSubdistricts(e.target.value);
    });
  }
  if (subdistrictSelect) {
    subdistrictSelect.addEventListener("change", (e) => {
      updateZipcode(e.target.value);
    });
  }
}

// 2) Project List Checkboxes
async function loadProjectList() {
  try {
    const projectList = await fetchProjectList();
    const container = document.getElementById("projectCheckboxes");
    if (!container) return;

    container.innerHTML = "";
    projectList.forEach((name) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" name="project" value="${name}"> ${name}`;
      container.appendChild(label);
    });
  } catch (err) {
    console.error("❌ โหลดโครงการผิดพลาด", err);
  }
}

function setupProjectToggle() {
  const toggleBtn = document.getElementById("toggleProjects");
  const container = document.getElementById("projectCheckboxes");
  if (!toggleBtn || !container) return;

  toggleBtn.addEventListener("click", () => {
    if (container.style.display === "none" || !container.style.display) {
      container.style.display = "block";
      toggleBtn.textContent = "เลือกโครงการ ▲";
    } else {
      container.style.display = "none";
      toggleBtn.textContent = "เลือกโครงการ ▼";
    }
  });
}

// 3) Document Checklist
async function loadDocumentsList() {
  try {
    const docList = await fetchDocumentsList();
    const container = document.getElementById("documentsChecklist");
    if (!container) return;

    container.innerHTML = "";
    docList.forEach((name) => {
      const li = document.createElement("li");
      li.classList.add("doc-item");
      li.innerHTML = `
        <input type="checkbox" name="documents" value="${name}">
        ${name}
      `;
      container.appendChild(li);
    });

    attachDocumentClickListener();
  } catch (err) {
    console.error("❌ โหลดเอกสารไม่สำเร็จ", err);
  }
}

function attachDocumentClickListener() {
  document.querySelectorAll("#documentsChecklist li").forEach((item) => {
    item.addEventListener("click", function (e) {
      if (e.target.tagName.toLowerCase() === "input") return;
      const checkbox = this.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
      }
    });
  });
}

// 4) Load Employee List
async function loadEmployeeList() {
  if (!employeeSelect) return;
  try {
    let json;
    try {
      json = await jsonp(SCRIPT_URL_ORDER, { action: "get_employee_list" });
    } catch (_) {
      json = await postData(SCRIPT_URL_ORDER, "get_employee_list", {});
    }
    console.log("loadEmployeeList raw response:", json);
    if (json.result !== "success" || !Array.isArray(json.data)) {
      console.warn("⚠️ ไม่พบข้อมูลพนักงาน หรือ Apps Script บน Google Sheets ยังไม่ได้อัปเดต Deploy โค้ดใหม่จาก apps-script/Code.gs");
      return;
    }
    
    // Clear dynamic options (keeping the placeholder)
    employeeSelect.innerHTML = '<option value="">-- เลือกพนักงาน --</option>';
    
    json.data.forEach((emp) => {
      const opt = document.createElement("option");
      opt.value = emp.id;
      const label = emp.nickname
        ? `${emp.name} (${emp.nickname}) — ${emp.id}`
        : `${emp.name} — ${emp.id}`;
      opt.textContent = label;
      employeeSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("โหลดรายชื่อพนักงานไม่สำเร็จ:", err);
  }
}

// 5) Setup Date Picker with Thai Buddhist Year
function setupDatePicker() {
  const updateYearBE = (yearInput) => {
    const yearAD = parseInt(yearInput.value, 10);
    if (yearAD < 2500) {
      yearInput.value = yearAD + 543;
    }
  };

  const convertYearDropdownToBE = (instance) => {
    const yearSelect = instance.calendarContainer.querySelector(
      ".flatpickr-month-dropdown-container select"
    );
    if (yearSelect && yearSelect.options.length > 0) {
      if (parseInt(yearSelect.options[0].textContent, 10) < 2500) {
        Array.from(yearSelect.options).forEach((option) => {
          const yearAD = parseInt(option.textContent, 10);
          if (yearAD) {
            option.textContent = yearAD + 543;
          }
        });
      }
    }
  };

  if (collectDateInput) {
    flatpickr(collectDateInput, {
      locale: Thai,
      dateFormat: "d/m/Y",
      thai_buddhist: true,
      onReady: function (selectedDates, dateStr, instance) {
        const yearInput = instance.calendarContainer.querySelector(".cur-year");
        if (yearInput) updateYearBE(yearInput);

        instance.calendarContainer
          .querySelectorAll(".flatpickr-prev-month, .flatpickr-next-month")
          .forEach((btn) => {
            btn.addEventListener("click", () => {
              if (yearInput) updateYearBE(yearInput);
            });
          });
        convertYearDropdownToBE(instance);
      },
      onYearChange: function (selectedDates, dateStr, instance) {
        const yearInput = instance.calendarContainer.querySelector(".cur-year");
        if (yearInput) {
          updateYearBE(yearInput);
        } else {
          convertYearDropdownToBE(instance);
        }
      },
      onOpen: function (selectedDates, dateStr, instance) {
        const currentValue = instance.input.value;
        const parts = currentValue.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const yearBE = parseInt(parts[2], 10);

          if (yearBE > 2500 && !isNaN(day) && !isNaN(month)) {
            const yearAD = yearBE - 543;
            const dateAD = new Date(yearAD, month, day);

            if (
              dateAD.getFullYear() === yearAD &&
              dateAD.getMonth() === month &&
              dateAD.getDate() === day
            ) {
              instance.setDate(dateAD, false);
            } else {
              instance.setDate(null, false);
            }
          }
        }
        convertYearDropdownToBE(instance);
      },
      onClose: function (selectedDates, dateStr, instance) {
        if (selectedDates.length > 0) {
          const date = selectedDates[0];
          const day = String(date.getDate()).padStart(2, "0");
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const yearBE = date.getFullYear() + 543;

          instance.input.value = `${parseInt(day, 10)}/${parseInt(month, 10)}/${yearBE}`;

          const yearAD = date.getFullYear();
          const dateISO = `${yearAD}-${month}-${day}`;
          instance.input.setAttribute("data-iso-date", dateISO);
        }
      },
    });
  }
}

// 6) Form submit handler
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const f = e.target;
    const d = Object.fromEntries(new FormData(f).entries());
    const get = (n) => (d[n] && String(d[n]).trim() !== "" ? String(d[n]).trim() : "");

    // Validations
    const docs = Array.from(f.querySelectorAll('input[name="documents"]:checked')).map((x) => x.value);
    if (docs.length === 0) {
      alert("กรุณาเลือกเอกสารที่ต้องจัดเก็บอย่างน้อย 1 รายการ");
      return;
    }

    const projects = Array.from(f.querySelectorAll('input[name="project"]:checked')).map((x) => x.value);
    if (projects.length === 0) {
      alert("กรุณาเลือกโครงการอย่างน้อย 1 รายการ");
      return;
    }

    const assignedEmployeeId = get("assignedEmployeeId");
    if (!assignedEmployeeId) {
      alert("กรุณาเลือกพนักงานที่มอบหมายงาน");
      return;
    }

    const assignedEmployeeName = employeeSelect.options[employeeSelect.selectedIndex]?.text || "";

    const submitBtn = f.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ กำลังบันทึกข้อมูล...";

    try {
      // Get order No
      const orderRes = await jsonp(SCRIPT_URL_ORDER, { action: "getOrderNo" });
      if (orderRes.result !== "success") {
        throw new Error(orderRes.message || "ไม่สามารถดึงเลขที่ใบสั่งงานได้");
      }
      const orderNo = orderRes.orderNo;
      const orderNoStr = String(orderNo).padStart(4, "0");

      // Timestamp BE
      const now = new Date();
      const yearAD = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hour = String(now.getHours()).padStart(2, "0");
      const minute = String(now.getMinutes()).padStart(2, "0");
      const second = String(now.getSeconds()).padStart(2, "0");
      const yearBE = yearAD + 543;
      const dateTime = `${parseInt(day, 10)}/${parseInt(month, 10)}/${yearBE}, ${hour}:${minute}:${second}`;

      const collectDateISO = collectDateInput ? collectDateInput.getAttribute("data-iso-date") : get("collectDate");

      if (!collectDateISO || collectDateISO.length !== 10) {
        throw new Error("❌ กรุณาเลือกวันที่เก็บเอกสารให้ถูกต้อง");
      }

      const payload = {
        action: "insertJob",
        orderNo,
        baseURL: window.location.origin,
        assignedEmployeeId,
        dateTime,
        team: get("team"),
        requester: get("requester"),
        requesterPhone: get("requesterPhone"),
        email: get("email"),
        project: projects.join(", "),
        collectDate: collectDateISO,
        customerName: get("customerName"),
        customerPhone: get("customerPhone"),
        addrStreet: get("addrStreet"),
        province: get("province"),
        district: get("district"),
        subdistrict: get("subdistrict"),
        zipcode: get("zipcode"),
        documents: docs.join(" | "),
        note: get("note"),
      };

      // Submit via JSONP
      const saveRes = await jsonp(SCRIPT_URL_ORDER, payload);
      console.log("บันทึกข้อมูลลง Google Sheets:", saveRes);

      alert(`✅ บันทึกข้อมูลสำเร็จ!\nเลขที่ใบสั่งงาน: ${orderNoStr}\nมอบหมายให้: ${assignedEmployeeName}`);
      f.reset();

      // Reset DOM state
      const projCheckboxes = document.getElementById("projectCheckboxes");
      if (projCheckboxes) projCheckboxes.style.display = "none";
      const toggleProjBtn = document.getElementById("toggleProjects");
      if (toggleProjBtn) toggleProjBtn.textContent = "เลือกโครงการ ▼";

      if (collectDateInput) {
        collectDateInput.value = "";
        collectDateInput.removeAttribute("data-iso-date");
      }
      if (provinceSelect) provinceSelect.selectedIndex = 0;
      if (districtSelect) {
        districtSelect.innerHTML = '<option value="">-- เลือกเขต/อำเภอ --</option>';
        districtSelect.disabled = true;
      }
      if (subdistrictSelect) {
        subdistrictSelect.innerHTML = '<option value="">-- เลือกแขวง/ตำบล --</option>';
        subdistrictSelect.disabled = true;
      }
      if (zipcodeInput) zipcodeInput.value = "";

    } catch (err) {
      alert("❌ ERROR: " + err.message);
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

// Focus highlight highlight assignedEmployeeId on hash load
window.addEventListener("load", () => {
  if (window.location.hash === "#assignedEmployeeId" && employeeSelect) {
    setTimeout(() => {
      employeeSelect.scrollIntoView({ behavior: "smooth", block: "center" });
      employeeSelect.focus();
      employeeSelect.style.transition = "outline 0.3s ease";
      employeeSelect.style.outline = "4px solid #3b82f6";
      setTimeout(() => {
        employeeSelect.style.outline = "";
      }, 2000);
    }, 500);
  }
});
