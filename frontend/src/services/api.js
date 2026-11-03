import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("taskflow_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization) {
      window.dispatchEvent(new Event("taskflow:authentication-invalid"));
    }
    return Promise.reject(error);
  }
);

export function getApiError(error) {
  const responseData = error.response?.data;
  const message = responseData?.error?.message || responseData?.message;
  if (typeof message === "string" && message.trim()) return message.trim().slice(0, 300);
  if (error.code === "ECONNABORTED") return "The request timed out. Please try again.";
  if (error.response) {
    const messages = {
      400: "Some information is invalid. Check your entries and try again.",
      401: "Your session has expired. Sign in again to continue.",
      403: "You do not have permission to perform this action.",
      404: "The requested item or page could not be found.",
      409: "This action conflicts with the current data. Refresh and try again.",
      429: "Too many requests. Wait a moment and try again.",
    };
    if (messages[error.response.status]) return messages[error.response.status];
    if (error.response.status >= 500) return "The service is temporarily unavailable. Please try again.";
    return `The request could not be completed (status ${error.response.status}).`;
  }
  return "Unable to connect to TaskFlow. Check your connection and try again.";
}

export default api;
