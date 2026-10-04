import api from "@/lib/api";

export type GuestIdType = "passport" | "national_id" | "driving_license" | "other";

export interface Guest {
  guest_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  id_type: GuestIdType | null;
  id_number: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  vip_status: boolean;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateGuestDto {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string | null;
  id_type?: GuestIdType | null;
  id_number?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postal_code?: string | null;
  vip_status?: boolean;
  notes?: string | null;
}

export interface UpdateGuestDto {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string | null;
  id_type?: GuestIdType | null;
  id_number?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postal_code?: string | null;
  vip_status?: boolean;
  notes?: string | null;
}

export interface GuestMutationResponse {
  message: string;
  guest: Guest;
}

export interface DeleteGuestResponse {
  message: string;
}

export const getGuests = async (search?: string): Promise<Guest[]> => {
  const params: Record<string, string> = {};
  if (search && search.trim()) {
    params.search = search.trim();
  }
  const response = await api.get<Guest[]>("/guests", { params });
  return response.data;
};

export const getGuest = async (id: number): Promise<Guest> => {
  const response = await api.get<Guest>(`/guests/${id}`);
  return response.data;
};

export const createGuest = async (data: CreateGuestDto): Promise<GuestMutationResponse> => {
  const response = await api.post<GuestMutationResponse>("/guests", data);
  return response.data;
};

export const updateGuest = async (
  id: number,
  data: UpdateGuestDto
): Promise<GuestMutationResponse> => {
  const response = await api.put<GuestMutationResponse>(`/guests/${id}`, data);
  return response.data;
};

export const deleteGuest = async (id: number): Promise<DeleteGuestResponse> => {
  const response = await api.delete<DeleteGuestResponse>(`/guests/${id}`);
  return response.data;
};
