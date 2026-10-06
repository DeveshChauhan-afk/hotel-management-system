import api from "@/lib/api";
import type { Booking } from "./bookingsApi";
import type { Room } from "./roomsApi";

export type BillStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "voided"
  | "refunded";

export type PaymentMethod =
  | "cash"
  | "credit_card"
  | "debit_card"
  | "bank_transfer"
  | "upi"
  | "online";

export type PaymentType = "charge" | "refund" | "deposit";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export interface Bill {
  bill_id: number;
  invoice_number: string;
  booking_id: number;
  guest_id: number;
  subtotal_amount: string;
  tax_amount: string;
  discount_amount: string;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  status: BillStatus;
  issued_date: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Payment {
  payment_id: number;
  payment_ref: string;
  bill_id: number;
  amount: string;
  payment_type: PaymentType;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  gateway_provider: string | null;
  gateway_txn_id: string | null;
  recorded_by_user_id: number | null;
  paid_at: string | null;
  created_at: string | null;
}

export interface BillWithPayments extends Bill {
  payments: Payment[];
}

export interface BillFilters {
  booking_id?: number | string;
  guest_id?: number | string;
  status?: BillStatus | string;
}

export interface PaymentFilters {
  bill_id?: number | string;
  payment_method?: PaymentMethod | string;
  status?: PaymentStatus | string;
}

export interface CreateBillDto {
  tax_amount?: string | number;
  discount_amount?: string | number;
  status?: "draft" | "issued";
  notes?: string | null;
}

export interface BillCreationResponse {
  message: string;
  bill: Bill;
}

export interface DuplicateBillErrorResponse {
  error: string;
  bill: Bill;
}

export interface CheckoutResponse {
  message: string;
  booking: Booking;
  bill: Bill;
  room: Room | null;
}

export interface CreatePaymentDto {
  amount: string | number;
  payment_method?: PaymentMethod;
  payment_type?: PaymentType;
  gateway_provider?: string | null;
  gateway_txn_id?: string | null;
  gateway_payload?: Record<string, unknown> | null;
}

export interface PaymentCreationResponse {
  message: string;
  payment: Payment;
  bill: Bill;
}

// ---------------------------------------------------------------------------
// Billing API Methods
// ---------------------------------------------------------------------------

export const createBill = async (
  bookingId: number,
  data?: CreateBillDto
): Promise<BillCreationResponse> => {
  const response = await api.post<BillCreationResponse>(
    `/bookings/${bookingId}/bill`,
    data || {}
  );
  return response.data;
};

export const getBills = async (filters?: BillFilters): Promise<Bill[]> => {
  const params: Record<string, string> = {};
  if (filters) {
    if (filters.booking_id !== undefined && filters.booking_id !== "") {
      params.booking_id = String(filters.booking_id);
    }
    if (filters.guest_id !== undefined && filters.guest_id !== "") {
      params.guest_id = String(filters.guest_id);
    }
    if (filters.status && filters.status.trim()) {
      params.status = filters.status.trim();
    }
  }
  const response = await api.get<Bill[]>("/bills", { params });
  return response.data;
};

export const getBill = async (id: number): Promise<BillWithPayments> => {
  const response = await api.get<BillWithPayments>(`/bills/${id}`);
  return response.data;
};

export const checkoutBooking = async (
  bookingId: number
): Promise<CheckoutResponse> => {
  const response = await api.post<CheckoutResponse>(
    `/bookings/${bookingId}/checkout`
  );
  return response.data;
};

export const createPayment = async (
  billId: number,
  data: CreatePaymentDto
): Promise<PaymentCreationResponse> => {
  const response = await api.post<PaymentCreationResponse>(
    `/bills/${billId}/payments`,
    data
  );
  return response.data;
};

export const getPayments = async (
  filters?: PaymentFilters
): Promise<Payment[]> => {
  const params: Record<string, string> = {};
  if (filters) {
    if (filters.bill_id !== undefined && filters.bill_id !== "") {
      params.bill_id = String(filters.bill_id);
    }
    if (filters.payment_method && filters.payment_method.trim()) {
      params.payment_method = filters.payment_method.trim();
    }
    if (filters.status && filters.status.trim()) {
      params.status = filters.status.trim();
    }
  }
  const response = await api.get<Payment[]>("/payments", { params });
  return response.data;
};

export const getPayment = async (id: number): Promise<Payment> => {
  const response = await api.get<Payment>(`/payments/${id}`);
  return response.data;
};
