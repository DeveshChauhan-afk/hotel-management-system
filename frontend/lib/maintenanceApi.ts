import api from "@/lib/api";

/**
 * Maintenance categories as defined by the backend enum:
 * 'plumbing' | 'electrical' | 'hvac' | 'furniture' | 'appliance' | 'structural' | 'other'
 */
export type MaintenanceCategory =
  | "plumbing"
  | "electrical"
  | "hvac"
  | "furniture"
  | "appliance"
  | "structural"
  | "other";

/**
 * Maintenance priority levels as defined by the backend enum:
 * 'low' | 'medium' | 'high' | 'critical'
 */
export type MaintenancePriority = "low" | "medium" | "high" | "critical";

/**
 * Maintenance lifecycle statuses as defined by the backend enum:
 * 'reported' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
 */
export type MaintenanceStatus =
  | "reported"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

/**
 * Represents a single maintenance work order record from the backend.
 */
export interface MaintenanceRecord {
  maintenance_id: number;
  room_id: number | null;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  blocks_room_occupancy: boolean;
  reported_by_user_id: number | null;
  assigned_to_user_id: number | null;
  estimated_cost: string;
  actual_cost: string;
  reported_at: string;
  started_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Payload for creating a new maintenance work order.
 * RBAC: admin, manager, receptionist
 */
export interface CreateMaintenanceWorkOrderRequest {
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority?: MaintenancePriority;
  blocks_room_occupancy?: boolean;
  room_id?: number | null;
  assigned_to_user_id?: number | null;
  estimated_cost?: string | number;
}

/**
 * Payload for updating an existing maintenance record.
 * RBAC: admin, manager, maintenance
 * (Note: maintenance staff can update status, actual_cost, resolution_notes)
 */
export interface UpdateMaintenanceRecordRequest {
  title?: string;
  description?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  status?: MaintenanceStatus;
  blocks_room_occupancy?: boolean;
  assigned_to_user_id?: number | null;
  estimated_cost?: string | number;
  actual_cost?: string | number;
  resolution_notes?: string | null;
}

/**
 * Query filter parameters supported by GET /maintenance.
 */
export interface MaintenanceFilters {
  room_id?: number;
  status?: MaintenanceStatus | string;
  priority?: MaintenancePriority | string;
  category?: MaintenanceCategory | string;
  assigned_to_user_id?: number;
  blocks_room_occupancy?: boolean | string;
}

/**
 * Response structure for create and update maintenance mutations.
 */
export interface MaintenanceMutationResponse {
  message: string;
  maintenance: MaintenanceRecord;
}

/**
 * Response structure for maintenance deletion.
 */
export interface DeleteMaintenanceResponse {
  message: string;
}

/**
 * Retrieve a list of maintenance records matching the given filters.
 *
 * RBAC: admin, manager, receptionist, maintenance
 * Endpoint: GET /maintenance
 */
export const getMaintenanceRecords = async (
  filters?: MaintenanceFilters
): Promise<MaintenanceRecord[]> => {
  const params: Record<string, string | number | boolean> = {};

  if (filters) {
    if (filters.room_id !== undefined && filters.room_id !== null) {
      params.room_id = filters.room_id;
    }
    if (filters.status) {
      params.status = filters.status;
    }
    if (filters.priority) {
      params.priority = filters.priority;
    }
    if (filters.category) {
      params.category = filters.category;
    }
    if (filters.assigned_to_user_id !== undefined && filters.assigned_to_user_id !== null) {
      params.assigned_to_user_id = filters.assigned_to_user_id;
    }
    if (
      filters.blocks_room_occupancy !== undefined &&
      filters.blocks_room_occupancy !== null &&
      filters.blocks_room_occupancy !== ""
    ) {
      params.blocks_room_occupancy = filters.blocks_room_occupancy;
    }
  }

  const response = await api.get<MaintenanceRecord[]>("/maintenance", { params });
  return response.data;
};

/**
 * Retrieve a single maintenance record by ID.
 *
 * RBAC: admin, manager, receptionist, maintenance
 * Endpoint: GET /maintenance/:id
 */
export const getMaintenanceRecord = async (
  id: number
): Promise<MaintenanceRecord> => {
  const response = await api.get<MaintenanceRecord>(`/maintenance/${id}`);
  return response.data;
};

/**
 * Create a new maintenance work order.
 *
 * RBAC: admin, manager, receptionist
 * Endpoint: POST /maintenance
 */
export const createMaintenanceWorkOrder = async (
  data: CreateMaintenanceWorkOrderRequest
): Promise<MaintenanceMutationResponse> => {
  const response = await api.post<MaintenanceMutationResponse>("/maintenance", data);
  return response.data;
};

/**
 * Update an existing maintenance record.
 *
 * RBAC: admin, manager, maintenance
 * Endpoint: PUT /maintenance/:id
 */
export const updateMaintenanceRecord = async (
  id: number,
  data: UpdateMaintenanceRecordRequest
): Promise<MaintenanceMutationResponse> => {
  const response = await api.put<MaintenanceMutationResponse>(`/maintenance/${id}`, data);
  return response.data;
};

/**
 * Delete a maintenance record by ID.
 *
 * RBAC: admin, manager
 * Endpoint: DELETE /maintenance/:id
 */
export const deleteMaintenanceRecord = async (
  id: number
): Promise<DeleteMaintenanceResponse> => {
  const response = await api.delete<DeleteMaintenanceResponse>(`/maintenance/${id}`);
  return response.data;
};
