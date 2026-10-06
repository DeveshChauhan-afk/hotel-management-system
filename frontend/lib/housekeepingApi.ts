import api from "@/lib/api";

export type HousekeepingTaskType =
  | "checkout_cleaning"
  | "stayover_cleaning"
  | "deep_clean"
  | "inspection"
  | "turndown";

export type HousekeepingPriority = "low" | "medium" | "high" | "urgent";

export type HousekeepingStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "verified"
  | "cancelled";

export interface HousekeepingTask {
  task_id: number;
  room_id: number;
  task_type: HousekeepingTaskType;
  priority: HousekeepingPriority;
  status: HousekeepingStatus;
  assigned_to_user_id: number | null;
  inspected_by_user_id: number | null;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  remarks: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHousekeepingTaskRequest {
  room_id: number;
  task_type: HousekeepingTaskType;
  priority?: HousekeepingPriority;
  assigned_to_user_id?: number | null;
  scheduled_date?: string | null;
  remarks?: string | null;
}

export interface UpdateHousekeepingTaskRequest {
  room_id?: number;
  task_type?: HousekeepingTaskType;
  priority?: HousekeepingPriority;
  status?: HousekeepingStatus;
  assigned_to_user_id?: number | null;
  inspected_by_user_id?: number | null;
  scheduled_date?: string | null;
  remarks?: string | null;
}

export interface HousekeepingFilters {
  room_id?: number;
  status?: HousekeepingStatus | string;
  assigned_to_user_id?: number;
  task_type?: HousekeepingTaskType | string;
  priority?: HousekeepingPriority | string;
  scheduled_date?: string;
}

export interface HousekeepingMutationResponse {
  message: string;
  task: HousekeepingTask;
}

export interface DeleteHousekeepingResponse {
  message: string;
}

export const getHousekeepingTasks = async (
  filters?: HousekeepingFilters
): Promise<HousekeepingTask[]> => {
  const params: Record<string, string | number> = {};
  if (filters) {
    if (filters.room_id !== undefined && filters.room_id !== null) {
      params.room_id = filters.room_id;
    }
    if (filters.status) {
      params.status = filters.status;
    }
    if (filters.assigned_to_user_id !== undefined && filters.assigned_to_user_id !== null) {
      params.assigned_to_user_id = filters.assigned_to_user_id;
    }
    if (filters.task_type) {
      params.task_type = filters.task_type;
    }
    if (filters.priority) {
      params.priority = filters.priority;
    }
    if (filters.scheduled_date) {
      params.scheduled_date = filters.scheduled_date;
    }
  }

  const response = await api.get<HousekeepingTask[]>("/housekeeping", { params });
  return response.data;
};

export const getHousekeepingTask = async (
  id: number
): Promise<HousekeepingTask> => {
  const response = await api.get<HousekeepingTask>(`/housekeeping/${id}`);
  return response.data;
};

export const createHousekeepingTask = async (
  data: CreateHousekeepingTaskRequest
): Promise<HousekeepingMutationResponse> => {
  const response = await api.post<HousekeepingMutationResponse>("/housekeeping", data);
  return response.data;
};

export const updateHousekeepingTask = async (
  id: number,
  data: UpdateHousekeepingTaskRequest
): Promise<HousekeepingMutationResponse> => {
  const response = await api.put<HousekeepingMutationResponse>(`/housekeeping/${id}`, data);
  return response.data;
};

export const deleteHousekeepingTask = async (
  id: number
): Promise<DeleteHousekeepingResponse> => {
  const response = await api.delete<DeleteHousekeepingResponse>(`/housekeeping/${id}`);
  return response.data;
};
