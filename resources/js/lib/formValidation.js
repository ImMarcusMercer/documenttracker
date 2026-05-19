export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phonePattern = /^[+0-9() .-]{7,40}$/;
export const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function validateRequired(value, label) {
  return String(value ?? "").trim() ? "" : `${label} is required.`;
}

export function validateEmail(value, { required = false, label = "Email" } = {}) {
  if (!String(value ?? "").trim()) return required ? `${label} is required.` : "";
  return emailPattern.test(String(value).trim()) ? "" : `${label} must be a valid email address.`;
}

export function validatePhone(value) {
  if (!String(value ?? "").trim()) return "";
  return phonePattern.test(String(value).trim()) ? "" : "Phone number must include only digits, spaces, +, -, parentheses, or periods.";
}

export function validateStrongPassword(value, { required = false } = {}) {
  if (!String(value ?? "").trim()) return required ? "Password is required." : "";
  return strongPasswordPattern.test(String(value))
    ? ""
    : "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";
}

export function validateDate(value, { required = false, min, max, label = "Date" } = {}) {
  if (!String(value ?? "").trim()) return required ? `${label} is required.` : "";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return `${label} must be a valid date.`;
  if (min && timestamp < Date.parse(min)) return `${label} cannot be earlier than ${min}.`;
  if (max && timestamp > Date.parse(max)) return `${label} cannot be later than ${max}.`;
  return "";
}

export function validateNumber(value, { required = false, min, max, decimals = 2, label = "Number" } = {}) {
  if (value === "" || value === null || value === undefined) return required ? `${label} is required.` : "";
  const number = Number(value);
  if (!Number.isFinite(number)) return `${label} must be a valid number.`;
  if (min !== undefined && number < min) return `${label} must be at least ${min}.`;
  if (max !== undefined && number > max) return `${label} must be at most ${max}.`;
  const decimalPart = String(value).split(".")[1] || "";
  if (decimalPart.length > decimals) return `${label} allows only ${decimals} decimal place(s).`;
  return "";
}

export function validateFile(file, { required = false, allowed = [], maxMb = 10, imageOnly = false } = {}) {
  if (!file) return required ? "File is required." : "";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (allowed.length && !allowed.includes(extension)) return `File type must be: ${allowed.join(", ")}.`;
  if (imageOnly && !file.type.startsWith("image/")) return "File must be an image.";
  if (file.size > maxMb * 1024 * 1024) return `File size must not exceed ${maxMb} MB.`;
  return "";
}

export function firstError(errors = {}) {
  return Object.values(errors).find(Boolean) || "";
}
