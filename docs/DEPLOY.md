# TN Messenger — Apps Script Deploy Guide

## Prerequisites

- Edit access to Google Sheet A: `1FkcnGM31UU1UNgsPyCrl95Jp1NDO98RlXpeU9a0eg_M`
- Edit access to Google Sheet B: `1kI8D0p8n5huV8I57vzHVlDN0VAFYpgEw43gwMV_e7xc`

## Step 1 — Add column on Sheet A

On tab **ใบสั่งงาน**, add header (if missing):

| Column name |
|-------------|
| `รหัสพนักงานที่มอบหมาย` |

This stores the employee ID selected when admin creates a job.

## Step 2 — Open Apps Script

1. Open Sheet A in Google Sheets
2. **Extensions → Apps Script**
3. You should see your existing order script (`insertJob`, `get_all_row_json`, etc.)

## Step 3 — Add new functions

Copy sections from [`Code.gs`](Code.gs) into your project:

1. Constants at top (adjust `EMPLOYEE_TAB` if your employee sheet tab name differs)
2. Extend `doGet` / router with new actions:
   - `get_rows_meta`
   - `get_rows_paginated`
   - `get_employee_list` 
   - `get_tasks_by_employee`
   - `get_cover_report`
3. In your existing **insertJob** handler, write `payload.assignedEmployeeId` to column `รหัสพนักงานที่มอบหมาย`
4. Call `bumpLastModified_()` after insert and update

## Step 4 — Deploy

1. **Deploy → Manage deployments → Edit** (or New deployment)
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Deploy and copy the URL (should match existing `AKfycbwutGjM8fg...` URL if updating same deployment)

## Step 5 — Test endpoints

Replace `YOUR_SCRIPT_URL` with your deployed web app URL.

```text
GET  YOUR_SCRIPT_URL?action=get_rows_meta
GET  YOUR_SCRIPT_URL?action=get_rows_paginated&offset=0&limit=50
GET  YOUR_SCRIPT_URL?action=get_employee_list
GET  YOUR_SCRIPT_URL?action=get_tasks_by_employee&data={"employeeId":"EMP001","date":"2026-07-05"}
GET  YOUR_SCRIPT_URL?action=get_cover_report&data={"startDate":"2026-03-16","endDate":"2026-03-16"}
```

Expected JSON: `{ "result": "success", ... }`

## Step 6 — Sheet B tab configuration

After reviewing the live “16 มีนาคม” tab (see [`sheet-b-template.md`](sheet-b-template.md)):

1. Update `getCoverReport()` in Code.gs with the correct data tab name
2. Set the date column name in `findColIndex_` candidates
3. Redeploy

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `get_employee_list` returns empty | Check employee tab name; update `EMPLOYEE_TAB` constant |
| Driver list empty after assign | Verify `รหัสพนักงานที่มอบหมาย` matches employee `id` from login |
| Cover report wrong layout | Fill in `sheet-b-template.md` from live Sheet B tab first |
