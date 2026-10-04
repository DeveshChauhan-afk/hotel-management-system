import api from "@/lib/api";

export interface RoomType {
  room_type_id: number;
  name: string;
  code: string;
  description: string | null;
  base_price: string;
  max_occupancy: number;
  bed_config: string;
  amenities: string[] | Record<string, unknown> | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateRoomTypeDto {
  name: string;
  code?: string;
  description?: string | null;
  base_price?: string | number;
  max_occupancy?: number;
  bed_config?: string;
  amenities?: string[] | Record<string, unknown> | null;
  is_active?: boolean;
}

export interface UpdateRoomTypeDto {
  name?: string;
  code?: string;
  description?: string | null;
  base_price?: string | number;
  max_occupancy?: number;
  bed_config?: string;
  amenities?: string[] | Record<string, unknown> | null;
  is_active?: boolean;
}

export interface RoomTypeMutationResponse {
  message: string;
  room_type: RoomType;
}

export interface DeleteResponse {
  message: string;
}

export const getRoomTypes = async (activeOnly = false): Promise<RoomType[]> => {
  const params: Record<string, string> = {};
  if (activeOnly) {
    params.active_only = "true";
  }
  const response = await api.get<RoomType[]>("/room-types", { params });
  return response.data;
};

export const getRoomType = async (id: number): Promise<RoomType> => {
  const response = await api.get<RoomType>(`/room-types/${id}`);
  return response.data;
};

export const createRoomType = async (
  data: CreateRoomTypeDto
): Promise<RoomTypeMutationResponse> => {
  const response = await api.post<RoomTypeMutationResponse>("/room-types", data);
  return response.data;
};

export const updateRoomType = async (
  id: number,
  data: UpdateRoomTypeDto
): Promise<RoomTypeMutationResponse> => {
  const response = await api.put<RoomTypeMutationResponse>(`/room-types/${id}`, data);
  return response.data;
};

export const deleteRoomType = async (id: number): Promise<DeleteResponse> => {
  const response = await api.delete<DeleteResponse>(`/room-types/${id}`);
  return response.data;
};
