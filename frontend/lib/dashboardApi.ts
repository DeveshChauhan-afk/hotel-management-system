import api from "@/lib/api";

/**
 * High-level hotel inventory and booking metrics returned by GET /dashboard/stats.
 */
export interface DashboardStats {
  total_rooms: number;
  available_rooms: number;
  occupied_rooms: number;
  total_bookings: number;
}

/**
 * Retrieve high-level hotel inventory and booking metrics.
 *
 * Endpoint: GET /dashboard/stats
 * RBAC: All authenticated roles (admin, manager, receptionist, housekeeper, maintenance)
 */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await api.get<DashboardStats>("/dashboard/stats");
  return response.data;
};
