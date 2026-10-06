import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request Interceptor: automatically attach JWT Bearer token from localStorage
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: detect 401 Unauthorized or corrupt JWT (422), clear auth, and redirect to /login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const isUnauthorized = error.response.status === 401;
      const isBadToken =
        error.response.status === 422 &&
        (String(error.response.data?.msg || "").toLowerCase().includes("token") ||
         String(error.response.data?.msg || "").toLowerCase().includes("header"));

      if (isUnauthorized || isBadToken) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          localStorage.removeItem("user");

          // Avoid redirect loops if already on /login
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export * from "./roomTypesApi";
export * from "./roomsApi";
export * from "./guestsApi";
export * from "./bookingsApi";
export * from "./billingApi";