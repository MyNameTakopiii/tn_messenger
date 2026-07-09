# Sheet B — Cover Sheet Template ("16 มีนาคม")

**Spreadsheet:** `1kI8D0p8n5huV8I57vzHVlDN0VAFYpgEw43gwMV_e7xc`  
**Reference tab:** gid `920202991` — tab name **16 มีนาคม**

> Fill in column mappings after opening the live tab in Google Sheets.  
> The CSV export for this tab is not public; Apps Script `get_cover_report` reads it directly.

---

## Document layout (target for `report_cover.html` + PDF)

### Header block

| Element | Content | Notes |
|---------|---------|-------|
| Company | TN MESSENGER SERVICE | Centered, bold |
| Title | รายงานปกวัน / ใบปก | Match tab title style |
| Report date | Selected date or range (พ.ศ.) | e.g. `16/03/2569` |
| Generated at | Timestamp | Footer of header |

### Summary row (if present on template)

| Field | Sheet source (TBD) |
|-------|-------------------|
| จำนวนงานทั้งหมด | COUNT of filtered rows |
| วันที่ | Filter column value |

### Data table columns

Document each column from row 1 of the data tab:

| # | Column header (Thai) | Sheet column letter | Used in PDF |
|---|---------------------|---------------------|-------------|
| 1 | _(fill from Sheet B)_ | | |
| 2 | | | |
| 3 | | | |

### Date filter

| Setting | Value |
|---------|-------|
| Filter column name | `วันที่` _(confirm on live sheet)_ |
| Format in sheet | `YYYY-MM-DD` or `DD/MM/YYYY` |
| Filter mode | Row filter within master data tab _(or tab-per-day — confirm)_ |

### Footer / signatures (if present)

| Block | Description |
|-------|-------------|
| ผู้จัดทำ | Signature line |
| ผู้ตรวจสอบ | Signature line |

---

## Discovery checklist

- [ ] Open Sheet B → tab **16 มีนาคม**
- [ ] Screenshot or export PDF for pixel reference
- [ ] List all header cells (merged ranges)
- [ ] Confirm data tab name (may differ from cover tab)
- [ ] Map each visible column to Sheet B header row
- [ ] Update `getCoverReport()` in `Code.gs` with correct tab + date column
- [ ] Update `drawCoverReport()` in `report_cover.html` to match layout

---

## Example JSON from `get_cover_report`

```json
{
  "result": "success",
  "header": {
    "company": "TN MESSENGER SERVICE",
    "title": "รายงานปกวัน",
    "dateRange": "16/03/2569",
    "generatedAt": "05/07/2569 19:30:00"
  },
  "rows": [
    { "วันที่": "2026-03-16", "เลขที่": "0001", "...": "..." }
  ],
  "totals": { "count": 42 }
}
```
