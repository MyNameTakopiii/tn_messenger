import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: "index.html",
        main: "admin/index.html",
        landing: "customer/landing.html",
        report_cover: "admin/report_cover.html",
        dashboard: "admin/dashboard.html",
        customer_dashboard: "customer/customer_dashboard.html",
        customer_workorder: "customer/customer_workorder.html",
        account_list: "admin/account_list.html",
        news_page: "admin/news_page.html",
        news_manage: "admin/news_manage.html",
        register: "admin/register.html",
        tracking: "customer/tracking.html",
        tracking_2: "customer/tracking_2.html",
        tracking_admin: "admin/tracking_admin.html",
        update_status: "employee/update-status.html",
        not_found: "404.html",
        tablelist: "admin/sdknfklansdlfnaosdbgoiadotablelist.html",
        home: "employee/home.html",
        scan: "employee/scan.html",
        login_employee: "employee/login_employee.html",
        register_employee: "employee/register_employee.html",
        forgot_password: "employee/forgot_password.html",
        list: "employee/list.html",
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
