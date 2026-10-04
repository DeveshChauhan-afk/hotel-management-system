import api from "@/lib/api";

export type OperationalStatus =
  | "available"
  | "occupied"
  | "under_maintenance"
  | "out_of_service";

export type CleanlinessStatus =
  | "clean"
  | "dirty"
  | "inspecting"
  | "cleaning_in_progress";

export interface Room {
  room_id: number;
  room_number: string;
  floor: number;
  room_type_id: number | null;
  room_type: string | null;
  operational_status: OperationalStatus;
  cleanliness_status: CleanlinessStatus;
  status: OperationalStatus;
  cleaned: boolean;
  is_available: boolean;
  is_smoking: boolean;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RoomFilters {
  room_type_id?: number | string;
  operational_status?: string;
  cleanliness_status?: string;
  floor?: number | string;
  available?: boolean | string;
}

export interface CreateRoomDto {
  room_number: string;
  room_type_id: number;
  floor?: number;
  operational_status?: OperationalStatus;
  cleanliness_status?: CleanlinessStatus;
  is_smoking?: boolean;
  notes?: string | null;
}

export interface UpdateRoomDto {
  room_number?: string;
  room_type_id?: number;
  floor?: number;
  operational_status?: OperationalStatus;
  cleanliness_status?: CleanlinessStatus;
  is_smoking?: boolean;
  notes?: string | null;
}

export interface RoomMutationResponse {
  message: string;
  room: Room;
}

export interface DeleteRoomResponse {
  message: string;
}

export const getRooms = async (filters?: RoomFilters): Promise<Room[]> => {
  const params: Record<string, string> = {};

  if (filters) {
    if (filters.room_type_id !== undefined && filters.room_type_id !== "") {
      params.room_type_id = String(filters.room_type_id);
    }
    if (filters.operational_status) {
      params.operational_status = filters.operational_status;
    }
    if (filters.cleanliness_status) {
      params.cleanliness_status = filters.cleanliness_status;
    }
    if (filters.floor !== undefined && filters.floor !== "") {
      params.floor = String(filters.floor);
    }
    if (filters.available !== undefined && filters.available !== "") {
      params.available = String(filters.available);
    }
  }

  const response = await api.get<Room[]>("/rooms", { params });
  return response.data;
};

export const getRoom = async (id: number): Promise<Room> => {
  const response = await api.get<Room>(`/rooms/${id}`);
  return response.data;
};

export const createRoom = async (data: CreateRoomDto): Promise<RoomMutationResponse> => {
  const response = await api.post<RoomMutationResponse>("/rooms", data);
  return response.data;
};

export const updateRoom = async (
  id: number,
  data: UpdateRoomDto
): Promise<RoomMutationResponse> => {
  const response = await api.put<RoomMutationResponse>(`/rooms/${id}`, data);
  return response.data;
};

export const deleteRoom = async (id: number): Promise<DeleteRoomResponse> => {
  const response = await api.delete<DeleteRoomResponse>(`/rooms/${id}`);
  return response.data;
};

export const autoAssignRoom = async (roomType: string): Promise<Room> => {
  const response = await api.post<Room>("/auto-assign-room", { room_type: roomType });
  return response.data;
};
