import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
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

export function getApiError(error) {
  return (
    error.response?.data?.message ||
    (error.response
      ? `Request failed with status ${error.response.status}.`
      : "Unable to connect to the server. Check that TaskFlow services are running.")
  );
}

export default api;
