import api from "@/lib/api";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export interface Booking {
  booking_id: number;
  booking_ref: string;
  guest_id: number;
  room_type_id: number | null;
  room_id: number | null;
  check_in_date: string | null;
  check_out_date: string | null;
  actual_check_in: string | null;
  actual_check_out: string | null;
  num_adults: number;
  num_children: number;
  nightly_rate: string;
  total_amount: string;
  status: BookingStatus;
  special_requests: string | null;
  cancellation_reason: string | null;
  created_by_user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BookingFilters {
  guest_id?: number | string;
  room_id?: number | string;
  status?: string;
}

export interface CreateBookingDto {
  guest_id: number;
  room_id: number;
  room_type_id?: number;
  check_in_date?: string;
  check_out_date?: string;
  num_adults?: number;
  num_children?: number;
  special_requests?: string | null;
}

export interface BookingMutationResponse {
  message: string;
  booking: Booking;
}

export const getBookings = async (filters?: BookingFilters): Promise<Booking[]> => {
  const params: Record<string, string> = {};
  if (filters) {
    if (filters.guest_id !== undefined && filters.guest_id !== "") {
      params.guest_id = String(filters.guest_id);
    }
    if (filters.room_id !== undefined && filters.room_id !== "") {
      params.room_id = String(filters.room_id);
    }
    if (filters.status && filters.status.trim()) {
      params.status = filters.status.trim();
    }
  }
  const response = await api.get<Booking[]>("/bookings", { params });
  return response.data;
};

export const getBooking = async (id: number): Promise<Booking> => {
  const response = await api.get<Booking>(`/bookings/${id}`);
  return response.data;
};

export const createBooking = async (
  data: CreateBookingDto
): Promise<BookingMutationResponse> => {
  const response = await api.post<BookingMutationResponse>("/bookings", data);
  return response.data;
};
