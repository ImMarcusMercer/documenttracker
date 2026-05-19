const API_PREFIX = "/api/v1";

const sortItems = (items, sortExpr) => {
  if (!sortExpr) return [...items];
  const descending = sortExpr.startsWith("-");
  const key = descending ? sortExpr.slice(1) : sortExpr;

  return [...items].sort((a, b) => {
    const left = a?.[key] ?? "";
    const right = b?.[key] ?? "";

    if (left < right) return descending ? 1 : -1;
    if (left > right) return descending ? -1 : 1;

    return 0;
  });
};

const applyLimit = (items, limit) => {
  if (!limit || Number.isNaN(Number(limit))) return items;
  return items.slice(0, Number(limit));
};

const filterItems = (items, filters = {}) =>
  items.filter((item) =>
    Object.entries(filters).every(([key, value]) => item?.[key] === value)
  );

const csrfToken = () =>
  document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";

const normalizeError = async (response) => {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const validationMessage = payload?.errors
    ? Object.values(payload.errors).flat().join(" ")
    : null;

  const error = new Error(
    validationMessage || payload?.message || `Request failed with status ${response.status}`
  );
  error.status = response.status;
  error.payload = payload;
  throw error;
};

const request = async (path, { method = "GET", body, formData } = {}) => {
  const headers = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-CSRF-TOKEN": csrfToken(),
  };

  const options = {
    method,
    credentials: "same-origin",
    headers,
  };

  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_PREFIX}${path}`, options);

  if (!response.ok) {
    await normalizeError(response);
  }

  if (response.status === 204) {
    if (!["GET", "HEAD"].includes(method.toUpperCase())) {
      window.dispatchEvent(new CustomEvent("docutracker:data-mutated", { detail: { path, method } }));
    }
    return null;
  }

  const payload = await response.json();

  if (!["GET", "HEAD"].includes(method.toUpperCase())) {
    window.dispatchEvent(new CustomEvent("docutracker:data-mutated", { detail: { path, method, payload } }));
  }

  return payload;
};

const download = async (path, filename = "download.csv", { method = "GET", body, formData } = {}) => {
  const headers = {
    Accept: "text/csv,application/pdf,application/vnd.ms-excel,application/zip,application/octet-stream,*/*",
    "X-Requested-With": "XMLHttpRequest",
    "X-CSRF-TOKEN": csrfToken(),
  };

  const options = { method, credentials: "same-origin", headers };
  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_PREFIX}${path}`, options);
  if (!response.ok) await normalizeError(response);

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const getCollection = async (path) => {
  const response = await request(path);
  return response?.data || [];
};

const getItem = async (path, key = "data") => {
  const response = await request(path);
  return response?.[key] || null;
};

const queryString = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.append(key, value);
  });
  const result = search.toString();
  return result ? `?${result}` : "";
};

export const base44 = {
  download,
  auth: {
    async login(email, password, remember = false) {
      const response = await request("/login", {
        method: "POST",
        body: { email, password, remember },
      });

      return response;
    },
    async verifyMfa(email, code, remember = false) {
      const response = await request("/mfa/verify", {
        method: "POST",
        body: { email, code, remember },
      });
      return { ...response.user, session_policy: response.session_policy };
    },
    async forgotPassword(email) {
      return request("/forgot-password", { method: "POST", body: { email } });
    },
    async resetPassword(payload) {
      return request("/reset-password", { method: "POST", body: payload });
    },
    async me() {
      const response = await request("/me");
      return { ...response.user, session_policy: response.session_policy };
    },
    async logout(redirectUrl) {
      try {
        await request("/logout", { method: "POST" });
      } catch (error) {
        if (![401, 403, 419].includes(error.status)) {
          throw error;
        }
      }

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    },
    redirectToLogin() {
      window.location.href = "/login";
    },
  },
  dashboard: {
    async stats(params = {}) {
      return getItem(`/dashboard/stats${queryString(params)}`);
    },
  },
  users: {
    async inviteUser(payload) {
      const response = await request("/users", { method: "POST", body: payload });
      return response.data;
    },
    async export(format = "csv", params = {}) {
      const extension = format === "pdf" ? "pdf" : "csv";
      return download(`/users-export${queryString({ ...params, format })}`, `docutracker-users.${extension}`);
    },
    async listPage(params = {}) {
      const response = await request(`/users${queryString({ ...params, paginate: 1 })}`);
      return { data: response.data || [], meta: response.meta || {} };
    },
    async bulkUpdate(ids = [], payload = {}) {
      const response = await request('/users/bulk-update', { method: 'POST', body: { ids, ...payload } });
      return response.data;
    },
    async emailPdf(params = {}) {
      const response = await request(`/users-export${queryString({ ...params, format: "pdf", email: 1 })}`);
      return response.data;
    },
    async analytics() {
      return getItem("/users-analytics");
    },
    async forceLogout(userId) {
      return request(`/users/${userId}/force-logout`, { method: "POST" });
    },
    async impersonate(userId) {
      const response = await request(`/users/${userId}/impersonate`, { method: "POST" });
      return response.data;
    },
    async importTemplate() {
      return download("/users-import/template", "docutracker-user-import-template.csv");
    },
    async previewImport(file) {
      const formData = new FormData();
      formData.append("file", file);
      const response = await request("/users-import/preview", { method: "POST", formData });
      return response.data;
    },
    async commitImport(rows) {
      const response = await request("/users-import/commit", { method: "POST", body: { rows } });
      return response.data;
    },
    async update(userId, payload = {}) {
      const response = await request(`/users/${userId}`, { method: "PATCH", body: payload });
      return response.data;
    },
    async activity(userId) {
      return getItem(`/users/${userId}/activity`);
    },
    async deactivate(userId) {
      return request(`/users/${userId}`, { method: "DELETE" });
    },
  },
  roles: {
    async list() {
      return getItem("/roles");
    },
    async create(payload = {}) {
      const response = await request("/roles", { method: "POST", body: payload });
      return response.data;
    },
    async update(roleId, payload = {}) {
      const response = await request(`/roles/${roleId}`, { method: "PATCH", body: payload });
      return response.data;
    },
  },
  profile: {
    async get() {
      return getItem("/profile");
    },
    async update(payload = {}) {
      const formData = new FormData();
      formData.append("_method", "PATCH");

      Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        // Laravel's multipart boolean validation expects 1/0 values.
        if (typeof value === "boolean") {
          formData.append(key, value ? "1" : "0");
          return;
        }

        formData.append(key, value);
      });
      const response = await request("/profile", { method: "POST", formData });
      return response.data;
    },
  },
  audit: {
    async list(params = {}) {
      const response = await request(`/audit-logs${queryString(params)}`);
      return response.data || [];
    },
    async listPage(params = {}) {
      const response = await request(`/audit-logs${queryString(params)}`);
      return { data: response.data || [], meta: response.meta || {} };
    },
    async export(params = {}) {
      const format = params.format || "csv";
      const extension = format === "xlsx" ? "xls" : format;
      return download(`/audit-logs/export${queryString(params)}`, `docutracker-audit-logs.${extension}`);
    },
    async emailPdf(params = {}) {
      const response = await request(`/audit-logs/export${queryString({ ...params, format: "pdf", email: 1 })}`);
      return response.data;
    },
    async archive(days) {
      const response = await request("/audit-logs/archive", { method: "POST", body: days ? { days } : {} });
      return response.data;
    },
    async bulkArchive(ids = []) {
      const response = await request("/audit-logs/bulk-archive", { method: "POST", body: { ids } });
      return response.data;
    },
    async bulkRestore(ids = []) {
      const response = await request("/audit-logs/bulk-restore", { method: "POST", body: { ids } });
      return response.data;
    },
  },
  reports: {
    async get(params = {}) {
      return getItem(`/reports${queryString(params)}`);
    },
    async export(params = {}) {
      const format = params.format || "csv";
      const extension = format === "excel" ? "xls" : format;
      return download(`/reports/export${queryString(params)}`, `docutracker-${params.type || "report"}.${extension}`);
    },
    async emailPdf(params = {}) {
      const response = await request(`/reports/export${queryString({ ...params, format: "pdf", email: 1 })}`);
      return response.data;
    },
    async favorites() {
      return getCollection("/reports/favorites");
    },
    async saveFavorite(payload) {
      const response = await request("/reports/favorites", { method: "POST", body: payload });
      return response.data;
    },
    async deleteFavorite(id) {
      return request(`/reports/favorites/${id}`, { method: "DELETE" });
    },
  },
  settings: {
    async list() {
      return getItem("/settings");
    },
    async update(payload) {
      const response = await request("/settings", { method: "PATCH", body: payload });
      return response.data;
    },
  },
  securityMonitor: {
    async live(params = {}) {
      return getItem(`/security-monitor${queryString(params)}`);
    },
  },
  backups: {
    async list() {
      return getCollection("/backups");
    },
    async listPage() {
      const response = await request("/backups");
      return { data: response.data || [], meta: response.meta || {} };
    },
    async run(backup_type = "manual") {
      const response = await request("/backups", { method: "POST", body: { backup_type } });
      return response.data;
    },
    async verify(id) {
      const response = await request(`/backups/${id}/verify`, { method: "POST" });
      return response.data;
    },
    async verifyUpload(file, expectedChecksum = "") {
      const formData = new FormData();
      formData.append("file", file);
      if (expectedChecksum) formData.append("expected_checksum", expectedChecksum);
      const response = await request("/backups/verify-upload", { method: "POST", formData });
      return response.data;
    },
    async download(id, filename = "docutracker-backup.zip") {
      return download(`/backups/${id}/download`, filename);
    },
  },
  importExport: {
    async exportDocuments(params = {}) {
      const format = params?.format || "csv";
      const extension = format === "excel" ? "xlsx" : format;
      return download(`/documents-export${queryString(params)}`, `docutracker-documents.${extension}`);
    },
    async emailPdf(params = {}) {
      const response = await request(`/documents-export${queryString({ ...params, format: "pdf", email: 1 })}`);
      return response.data;
    },
    async template(format = "csv") {
      const extension = format === "excel" ? "xlsx" : format;
      return download(`/documents-import/template${queryString({ format })}`, `docutracker-import-template.${extension}`);
    },
    async preview(file) {
      const formData = new FormData();
      formData.append("file", file);
      const response = await request("/documents-import/preview", { method: "POST", formData });
      return response.data;
    },
    async commit(rows, duplicateStrategy = "skip") {
      const response = await request("/documents-import/commit", {
        method: "POST",
        body: { rows, duplicate_strategy: duplicateStrategy },
      });
      return response.data;
    },
    async errorReport(rows) {
      return download("/documents-import/error-report", "docutracker-import-errors.csv", {
        method: "POST",
        body: { rows },
      });
    },
  },
  integrations: {
    Core: {
      async UploadFile({ file, category = "documents" }) {
        if (!file) {
          throw Object.assign(new Error("File is required"), { status: 400 });
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", category);

        return request("/uploads", { method: "POST", formData });
      },
      async ExtractDocument({ file }) {
        if (!file) {
          throw Object.assign(new Error("File is required"), { status: 400 });
        }

        const formData = new FormData();
        formData.append("file", file);

        const response = await request("/ocr/extract", { method: "POST", formData });
        return response.data;
      },
    },
  },

  helpdesk: {
    async list(params = {}) {
      const response = await request(`/helpdesk/tickets${queryString(params)}`);
      return { data: response.data || [], meta: response.meta || {} };
    },
    async stats() {
      return getItem('/helpdesk/tickets/stats');
    },
    async create(payload = {}) {
      const response = await request('/helpdesk/tickets', { method: 'POST', body: payload });
      return response.data;
    },
    async get(id) {
      return getItem(`/helpdesk/tickets/${id}`);
    },
    async update(id, payload = {}) {
      const response = await request(`/helpdesk/tickets/${id}`, { method: 'PATCH', body: payload });
      return response.data;
    },
    async reply(id, payload = {}) {
      const response = await request(`/helpdesk/tickets/${id}/messages`, { method: 'POST', body: payload });
      return response.data;
    },
    async archive(id) {
      const response = await request(`/helpdesk/tickets/${id}`, { method: 'DELETE' });
      return response.data;
    },
    async restore(id) {
      const response = await request(`/helpdesk/tickets/${id}/restore`, { method: 'POST' });
      return response.data;
    },
  },

  developer: {
    async simulations() {
      return getItem("/developer/simulations");
    },
    async runSimulation(payload) {
      const response = await request("/developer/simulations/run", { method: "POST", body: payload });
      return response.data;
    },
    async history(params = {}) {
      const response = await request(`/developer/simulations/history${queryString(params)}`);
      return { data: response.data || [], meta: response.meta || {} };
    },
    async diagnostics() {
      return getItem("/developer/diagnostics");
    },
  },
  assistant: {
    async chat({ message, history = [] }) {
      const response = await request("/assistant/chat", {
        method: "POST",
        body: { message, history },
      });
      return response.data;
    },
  },
  entities: {
    Document: {
      async list(sortExpr = "-created_date", limit, params = {}) {
        const items = await getCollection(`/documents${queryString(params)}`);
        return applyLimit(sortItems(items, sortExpr), limit);
      },
      async listPage(params = {}) {
        const response = await request(`/documents${queryString({ ...params, paginate: 1 })}`);
        return { data: response.data || [], meta: response.meta || {} };
      },
      async filter(filters = {}, sortExpr = "-created_date", limit) {
        if (filters?.id && Object.keys(filters).length === 1) {
          const item = await getItem(`/documents/${filters.id}`);
          return item ? [item] : [];
        }

        const items = await getCollection("/documents");
        return applyLimit(sortItems(filterItems(items, filters), sortExpr), limit);
      },
      async create(data) {
        const response = await request("/documents", { method: "POST", body: data });
        return response.data;
      },
      async update(id, data) {
        const response = await request(`/documents/${id}`, { method: "PATCH", body: data });
        return response.data;
      },
      async delete(id, confirmPassword = "") {
        return request(`/documents/${id}`, { method: "DELETE", body: { confirm_password: confirmPassword } });
      },
      async bulkDelete(ids = [], confirmPassword = "") {
        const response = await request("/documents/bulk-delete", { method: "DELETE", body: { ids, confirm_password: confirmPassword } });
        return response.data;
      },
      async bulkStatus(ids = [], status = "") {
        const response = await request("/documents/bulk-status", { method: "POST", body: { ids, status } });
        return response.data;
      },
      async restore(id) {
        const response = await request(`/documents/${id}/restore`, { method: "POST" });
        return response.data;
      },
    },
    DocumentAction: {
      async list(sortExpr = "-created_date", limit) {
        const items = await getCollection("/document-actions");
        return applyLimit(sortItems(items, sortExpr), limit);
      },
      async filter(filters = {}, sortExpr = "-created_date", limit) {
        if (!filters?.document_id) return [];

        const items = await getCollection(`/documents/${filters.document_id}/actions`);
        return applyLimit(sortItems(filterItems(items, filters), sortExpr), limit);
      },
      async create(data) {
        const response = await request(`/documents/${data.document_id}/actions`, {
          method: "POST",
          body: data,
        });
        return response.data;
      },
      async update() {
        throw Object.assign(new Error("Document actions cannot be edited."), { status: 405 });
      },
    },
    User: {
      async list(sortExpr = "full_name", limit) {
        const items = await getCollection("/users");
        return applyLimit(sortItems(items, sortExpr), limit);
      },
      async listPage(params = {}) {
        const response = await request(`/users${queryString({ ...params, paginate: 1 })}`);
        return { data: response.data || [], meta: response.meta || {} };
      },
      async filter(filters = {}, sortExpr = "full_name", limit) {
        const items = await getCollection("/users");
        return applyLimit(sortItems(filterItems(items, filters), sortExpr), limit);
      },
      async create(data) {
        const response = await request("/users", { method: "POST", body: data });
        return response.data;
      },
      async update(id, data) {
        const response = await request(`/users/${id}`, { method: "PATCH", body: data });
        return response.data;
      },
    },
    Notification: {
      async list(sortExpr = "-created_date", limit) {
        const items = await getCollection("/notifications");
        return applyLimit(sortItems(items, sortExpr), limit);
      },
      async listPage(params = {}) {
        const response = await request(`/notifications${queryString(params)}`);
        return { data: response.data || [], meta: response.meta || {} };
      },
      streamUrl() {
        return `${API_PREFIX}/notifications/stream`;
      },
      async filter(filters = {}, sortExpr = "-created_date", limit) {
        const items = await getCollection("/notifications");
        return applyLimit(sortItems(filterItems(items, filters), sortExpr), limit);
      },
      async create(data) {
        const response = await request("/notifications", { method: "POST", body: data });
        return response.data;
      },
      async update(id, data) {
        const response = await request(`/notifications/${id}`, { method: "PATCH", body: data });
        return response.data;
      },
      async markAllRead() {
        const response = await request("/notifications/mark-all-read", { method: "PATCH" });
        return response.data;
      },
      async delete(id) {
        return request(`/notifications/${id}`, { method: "DELETE" });
      },
      async preferences() {
        return getItem("/notification-preferences");
      },
      async updatePreferences(payload) {
        const response = await request("/notification-preferences", { method: "PATCH", body: payload });
        return response.data;
      },
    },
  },
};
