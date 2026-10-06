"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import CheckoutModal from "@/components/CheckoutModal";
import { useAuth } from "@/context/AuthContext";
import {
  getBills,
  getBill,
  createBill,
  createPayment,
  Bill,
  BillWithPayments,
  BillStatus,
  PaymentMethod,
  PaymentType,
  CreateBillDto,
  CreatePaymentDto,
} from "@/lib/billingApi";
import { getBookings, Booking } from "@/lib/bookingsApi";
import { getGuests, Guest } from "@/lib/guestsApi";
import { getRooms, Room } from "@/lib/roomsApi";
import toast from "react-hot-toast";
import {
  Receipt,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  X,
  User,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertTriangle,
  FileText,
  CreditCard,
  DoorOpen,
  ArrowRight,
  ExternalLink,
  LogOut,
  ShieldAlert,
} from "lucide-react";

const BILL_STATUS_CONFIG: Record<
  BillStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  draft: {
    label: "Draft",
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-200",
  },
  issued: {
    label: "Issued",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  partially_paid: {
    label: "Partially Paid",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  paid: {
    label: "Paid in Full",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  voided: {
    label: "Voided",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  refunded: {
    label: "Refunded",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
};

const formatCurrency = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined || val === "") return "$0.00";
  const num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
};

const formatDate = (isoString: string | null | undefined): string => {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

function BillingContent() {
  const searchParams = useSearchParams();
  const { role } = useAuth();
  const userRole = (role || "").toLowerCase();
  const canMutate = ["admin", "manager", "receptionist"].includes(userRole);

  // Data states
  const [bills, setBills] = useState<Bill[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters initialized lazily from searchParams
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(
    () => searchParams.get("status") || ""
  );
  const [bookingIdFilter, setBookingIdFilter] = useState<string>(
    () => searchParams.get("booking_id") || ""
  );
  const [guestIdFilter, setGuestIdFilter] = useState<string>(
    () => searchParams.get("guest_id") || ""
  );

  // Details Drawer State
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [selectedBillDetails, setSelectedBillDetails] =
    useState<BillWithPayments | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);

  // Payment Form State (inside drawer)
  const [isRecordingPayment, setIsRecordingPayment] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentType, setPaymentType] = useState<PaymentType>("charge");
  const [paymentGatewayProvider, setPaymentGatewayProvider] = useState<string>("");
  const [paymentGatewayTxnId, setPaymentGatewayTxnId] = useState<string>("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Checkout Modal State
  const [checkoutBookingTarget, setCheckoutBookingTarget] = useState<Booking | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState<boolean>(false);

  // Generate Bill Modal State
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState<boolean>(
    () => searchParams.get("action") === "new" && !!searchParams.get("booking_id")
  );
  const [selectedBookingId, setSelectedBookingId] = useState<string>(
    () => searchParams.get("booking_id") || ""
  );
  const [taxAmount, setTaxAmount] = useState<string>("0.00");
  const [discountAmount, setDiscountAmount] = useState<string>("0.00");
  const [billStatus, setBillStatus] = useState<"draft" | "issued">("issued");
  const [billNotes, setBillNotes] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [duplicateExistingBill, setDuplicateExistingBill] = useState<Bill | null>(
    null
  );

  // Maps for fast lookups
  const guestMap = useMemo(() => {
    const map = new Map<number, Guest>();
    guests.forEach((g) => map.set(g.guest_id, g));
    return map;
  }, [guests]);

  const bookingMap = useMemo(() => {
    const map = new Map<number, Booking>();
    bookings.forEach((b) => map.set(b.booking_id, b));
    return map;
  }, [bookings]);

  const roomMap = useMemo(() => {
    const map = new Map<number, Room>();
    rooms.forEach((r) => map.set(r.room_id, r));
    return map;
  }, [rooms]);

  // Set of booking IDs that already have a bill
  const billedBookingIds = useMemo(() => {
    return new Set(bills.map((b) => b.booking_id));
  }, [bills]);

  // Load Bills and reference data
  const loadData = useCallback(
    async (showToast = false) => {
      try {
        const filters: {
          status?: string;
          booking_id?: string;
          guest_id?: string;
        } = {};
        if (statusFilter) filters.status = statusFilter;
        if (bookingIdFilter.trim()) filters.booking_id = bookingIdFilter.trim();
        if (guestIdFilter.trim()) filters.guest_id = guestIdFilter.trim();

        const [billsData, bookingsData, guestsData, roomsData] =
          await Promise.all([
            getBills(filters),
            getBookings(),
            getGuests(),
            getRooms(),
          ]);

        setBills(billsData);
        setBookings(bookingsData);
        setGuests(guestsData);
        setRooms(roomsData);
        setFetchError(null);

        if (showToast) {
          toast.success("Billing workspace refreshed");
        }
      } catch (error: unknown) {
        const axiosErr = error as {
          response?: { data?: { error?: string } };
          message?: string;
        };
        const msg =
          axiosErr.response?.data?.error ||
          axiosErr.message ||
          "Failed to load bills";
        setFetchError(msg);
        if (showToast) {
          toast.error(msg);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter, bookingIdFilter, guestIdFilter]
  );

  // Initial load
  useEffect(() => {
    let isMounted = true;

    const initialFilters = {
      booking_id: searchParams.get("booking_id") || undefined,
      guest_id: searchParams.get("guest_id") || undefined,
      status: searchParams.get("status") || undefined,
    };

    Promise.all([
      getBills(initialFilters),
      getBookings(),
      getGuests(),
      getRooms(),
    ])
      .then(([billsData, bookingsData, guestsData, roomsData]) => {
        if (isMounted) {
          setBills(billsData);
          setBookings(bookingsData);
          setGuests(guestsData);
          setRooms(roomsData);
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          const axiosErr = error as {
            response?: { data?: { error?: string } };
            message?: string;
          };
          setFetchError(
            axiosErr.response?.data?.error ||
              axiosErr.message ||
              "Failed to initialize billing workspace"
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  // Open Bill Details
  const handleOpenBillDetails = async (billId: number) => {
    setSelectedBillId(billId);
    setIsDetailOpen(true);
    setIsDetailLoading(true);
    setIsRecordingPayment(false);
    setPaymentError(null);
    try {
      const billData = await getBill(billId);
      setSelectedBillDetails(billData);
    } catch (error: unknown) {
      const axiosErr = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to load bill details";
      toast.error(msg);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Close Bill Details
  const handleCloseBillDetails = () => {
    setIsDetailOpen(false);
    setSelectedBillId(null);
    setSelectedBillDetails(null);
    setIsRecordingPayment(false);
    setPaymentError(null);
  };

  // Handle Record Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillDetails) return;

    const rawAmount = paymentAmount.trim();
    if (!rawAmount || isNaN(Number(rawAmount)) || Number(rawAmount) <= 0) {
      setPaymentError("Payment amount must be a valid number greater than 0");
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentError(null);

    const dto: CreatePaymentDto = {
      amount: rawAmount,
      payment_method: paymentMethod,
      payment_type: paymentType,
      gateway_provider: paymentGatewayProvider.trim() || null,
      gateway_txn_id: paymentGatewayTxnId.trim() || null,
    };

    try {
      const res = await createPayment(selectedBillDetails.bill_id, dto);
      toast.success(res.message || "Payment recorded successfully");
      setIsRecordingPayment(false);
      setPaymentAmount("");
      setPaymentGatewayProvider("");
      setPaymentGatewayTxnId("");

      // Refresh single bill and workspace list
      const updatedBill = await getBill(selectedBillDetails.bill_id);
      setSelectedBillDetails(updatedBill);
      await loadData();
    } catch (error: unknown) {
      const axiosErr = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to record payment";
      setPaymentError(msg);
      toast.error(msg);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Handle Generate Bill
  const handleGenerateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingId) {
      setGenerateError("Please select an eligible booking");
      return;
    }

    const bookingIdNum = parseInt(selectedBookingId, 10);
    if (isNaN(bookingIdNum) || bookingIdNum <= 0) {
      setGenerateError("Invalid booking ID");
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);
    setDuplicateExistingBill(null);

    const payload: CreateBillDto = {
      tax_amount: taxAmount.trim() || "0.00",
      discount_amount: discountAmount.trim() || "0.00",
      status: billStatus,
      notes: billNotes.trim() || null,
    };

    try {
      const res = await createBill(bookingIdNum, payload);
      toast.success(res.message || "Bill generated successfully");
      setIsGenerateModalOpen(false);
      // Reset form
      setSelectedBookingId("");
      setTaxAmount("0.00");
      setDiscountAmount("0.00");
      setBillNotes("");
      setBillStatus("issued");

      // Reload data and automatically open new bill
      await loadData();
      if (res.bill?.bill_id) {
        handleOpenBillDetails(res.bill.bill_id);
      }
    } catch (error: unknown) {
      const axiosErr = error as {
        response?: {
          status?: number;
          data?: { error?: string; bill?: Bill };
        };
        message?: string;
      };

      if (axiosErr.response?.status === 409) {
        const existing = axiosErr.response.data?.bill;
        setGenerateError(
          axiosErr.response.data?.error ||
            "A bill already exists for this booking"
        );
        if (existing) {
          setDuplicateExistingBill(existing);
        }
      } else {
        const errorMsg =
          axiosErr.response?.data?.error ||
          axiosErr.message ||
          "Failed to generate bill";
        setGenerateError(errorMsg);
        toast.error(errorMsg);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Filter bills on client for text search (invoice number, guest name, booking ref)
  const filteredBills = useMemo(() => {
    if (!searchQuery.trim()) return bills;
    const q = searchQuery.toLowerCase().trim();

    return bills.filter((b) => {
      const invMatch = b.invoice_number.toLowerCase().includes(q);
      const booking = bookingMap.get(b.booking_id);
      const bookingRefMatch = booking?.booking_ref.toLowerCase().includes(q);
      const guest = guestMap.get(b.guest_id);
      const guestName = `${guest?.first_name || ""} ${guest?.last_name || ""}`.toLowerCase();
      const guestMatch = guestName.includes(q);
      const idMatch =
        String(b.bill_id).includes(q) ||
        String(b.booking_id).includes(q) ||
        String(b.guest_id).includes(q);

      return invMatch || bookingRefMatch || guestMatch || idMatch;
    });
  }, [bills, searchQuery, bookingMap, guestMap]);

  // Aggregate stats from bills
  const metrics = useMemo(() => {
    let totalInvoiced = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    bills.forEach((b) => {
      totalInvoiced += parseFloat(b.total_amount) || 0;
      totalCollected += parseFloat(b.paid_amount) || 0;
      totalOutstanding += parseFloat(b.balance_due) || 0;
    });

    return {
      totalInvoiced,
      totalCollected,
      totalOutstanding,
      count: bills.length,
    };
  }, [bills]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Receipt className="w-7 h-7 text-blue-600" />
            Billing &amp; Folios
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage guest invoices, review transaction folios, and track outstanding balances.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setIsLoading(true);
              loadData(true);
            }}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition shadow-2xs disabled:opacity-50"
            title="Refresh billing data"
          >
            <RefreshCw
              className={`w-4 h-4 text-gray-500 ${
                isLoading ? "animate-spin text-blue-600" : ""
              }`}
            />
            <span>Refresh</span>
          </button>

          {canMutate && (
            <button
              onClick={() => {
                setGenerateError(null);
                setDuplicateExistingBill(null);
                setIsGenerateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Generate Bill</span>
            </button>
          )}
        </div>
      </div>

      {/* Financial Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Invoices
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">
              {metrics.count}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              Across all bookings
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Invoiced
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">
              {formatCurrency(metrics.totalInvoiced)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              Gross billed value
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Collected
            </p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">
              {formatCurrency(metrics.totalCollected)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              Payments settled
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Outstanding Balance
            </p>
            <p className="text-2xl font-bold text-amber-600 mt-0.5">
              {formatCurrency(metrics.totalOutstanding)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              Due from guests
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Quick Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice #, guest, or booking..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setIsLoading(true);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">All Bill Statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="voided">Voided</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Booking ID Filter */}
          <div>
            <input
              type="number"
              value={bookingIdFilter}
              onChange={(e) => setBookingIdFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsLoading(true);
                  loadData();
                }
              }}
              placeholder="Filter by Booking ID..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Guest ID Filter */}
          <div>
            <input
              type="number"
              value={guestIdFilter}
              onChange={(e) => setGuestIdFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsLoading(true);
                  loadData();
                }
              }}
              placeholder="Filter by Guest ID..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Active Filters / Apply / Clear */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>
              Showing{" "}
              <strong className="text-gray-900 font-semibold">
                {filteredBills.length}
              </strong>{" "}
              of {bills.length} bills
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(bookingIdFilter || guestIdFilter || statusFilter || searchQuery) && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("");
                  setBookingIdFilter("");
                  setGuestIdFilter("");
                  setIsLoading(true);
                  setTimeout(() => {
                    getBills().then((data) => {
                      setBills(data);
                      setIsLoading(false);
                    });
                  }, 0);
                }}
                className="text-blue-600 hover:text-blue-800 font-medium transition"
              >
                Reset All Filters
              </button>
            )}

            <button
              onClick={() => {
                setIsLoading(true);
                loadData();
              }}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-md transition"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-red-800">
              Error Loading Invoices
            </h2>
            <p className="text-sm text-red-700 mt-0.5">{fetchError}</p>
          </div>
          <button
            onClick={() => {
              setIsLoading(true);
              loadData();
            }}
            className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Bills Table / List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <div className="flex items-center justify-center gap-3 text-gray-500 py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-sm font-medium">
                Loading bills and folios...
              </span>
            </div>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <Receipt className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              No bills found
            </h2>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1">
              {searchQuery || statusFilter || bookingIdFilter || guestIdFilter
                ? "No billing records match your current search or filter criteria."
                : "No folios or invoices have been generated yet."}
            </p>
            {canMutate && (
              <button
                onClick={() => {
                  setGenerateError(null);
                  setDuplicateExistingBill(null);
                  setIsGenerateModalOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>Generate First Bill</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    Invoice #
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Booking &amp; Room
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Guest
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Subtotal
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Tax
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Discount
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Paid
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Balance Due
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Issued Date
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredBills.map((bill) => {
                  const booking = bookingMap.get(bill.booking_id);
                  const guest = guestMap.get(bill.guest_id);
                  const room = booking?.room_id
                    ? roomMap.get(booking.room_id)
                    : null;
                  const statusCfg =
                    BILL_STATUS_CONFIG[bill.status] || BILL_STATUS_CONFIG.draft;
                  const balanceNum = parseFloat(bill.balance_due) || 0;

                  return (
                    <tr
                      key={bill.bill_id}
                      className="hover:bg-blue-50/40 transition-colors"
                    >
                      {/* Invoice # */}
                      <td className="px-4 py-3.5 font-mono text-xs font-medium text-gray-900 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenBillDetails(bill.bill_id)}
                          className="hover:text-blue-600 hover:underline flex items-center gap-1.5"
                          title="Open invoice details"
                        >
                          <span>{bill.invoice_number}</span>
                          <ExternalLink className="w-3 h-3 text-gray-400" />
                        </button>
                      </td>

                      {/* Booking & Room */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">
                            {booking?.booking_ref || `ID #${bill.booking_id}`}
                          </span>
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <DoorOpen className="w-3 h-3 text-gray-400" />
                            {room ? `Room ${room.room_number}` : "Room unassigned"}
                          </span>
                        </div>
                      </td>

                      {/* Guest */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">
                            {guest
                              ? `${guest.first_name} ${guest.last_name}`
                              : `Guest #${bill.guest_id}`}
                          </span>
                          {guest?.phone && (
                            <span className="text-xs text-gray-400">
                              {guest.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Subtotal */}
                      <td className="px-4 py-3.5 text-right font-medium text-gray-600 whitespace-nowrap">
                        {formatCurrency(bill.subtotal_amount)}
                      </td>

                      {/* Tax */}
                      <td className="px-4 py-3.5 text-right text-gray-600 whitespace-nowrap">
                        {formatCurrency(bill.tax_amount)}
                      </td>

                      {/* Discount */}
                      <td className="px-4 py-3.5 text-right text-gray-600 whitespace-nowrap">
                        {parseFloat(bill.discount_amount) > 0 ? (
                          <span className="text-rose-600">
                            -{formatCurrency(bill.discount_amount)}
                          </span>
                        ) : (
                          "$0.00"
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {formatCurrency(bill.total_amount)}
                      </td>

                      {/* Paid */}
                      <td className="px-4 py-3.5 text-right text-emerald-600 font-medium whitespace-nowrap">
                        {formatCurrency(bill.paid_amount)}
                      </td>

                      {/* Balance Due */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            balanceNum === 0
                              ? "text-emerald-700"
                              : balanceNum > 0
                              ? "text-amber-700"
                              : "text-gray-900"
                          }`}
                        >
                          {formatCurrency(bill.balance_due)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                        >
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* Issued Date */}
                      <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(bill.issued_date || bill.created_at)}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenBillDetails(bill.bill_id)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bill Details Drawer */}
      {isDetailOpen && (
        <div
          className="fixed inset-0 z-50 overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={handleCloseBillDetails}
            aria-hidden="true"
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <Receipt className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-gray-900 truncate">
                      {selectedBillDetails?.invoice_number ||
                        `Bill #${selectedBillId}`}
                    </h2>
                    {selectedBillDetails && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          BILL_STATUS_CONFIG[selectedBillDetails.status]?.bg ||
                          "bg-gray-100"
                        } ${
                          BILL_STATUS_CONFIG[selectedBillDetails.status]?.text ||
                          "text-gray-700"
                        } ${
                          BILL_STATUS_CONFIG[selectedBillDetails.status]?.border ||
                          "border-gray-200"
                        }`}
                      >
                        {BILL_STATUS_CONFIG[selectedBillDetails.status]?.label ||
                          selectedBillDetails.status}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Invoice Folio &amp; Transaction Details
                  </p>
                </div>

                <button
                  onClick={handleCloseBillDetails}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {isDetailLoading || !selectedBillDetails ? (
                  <div className="py-20 flex flex-col items-center justify-center text-gray-500 gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                    <p className="text-sm font-medium">
                      Fetching live folio records...
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Stay & Guest Metadata */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Guest Card */}
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-2 text-gray-700 font-semibold text-xs uppercase tracking-wider mb-2">
                          <User className="w-4 h-4 text-gray-500" />
                          <span>Guest Information</span>
                        </div>
                        {(() => {
                          const guest = guestMap.get(
                            selectedBillDetails.guest_id
                          );
                          return (
                            <div className="text-sm space-y-1">
                              <p className="font-semibold text-gray-900">
                                {guest
                                  ? `${guest.first_name} ${guest.last_name}`
                                  : `Guest ID #${selectedBillDetails.guest_id}`}
                              </p>
                              {guest?.email && (
                                <p className="text-gray-600 text-xs">
                                  {guest.email}
                                </p>
                              )}
                              {guest?.phone && (
                                <p className="text-gray-600 text-xs">
                                  {guest.phone}
                                </p>
                              )}
                              {guest?.vip_status && (
                                <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-amber-100 text-amber-800">
                                  VIP Guest
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Booking Card */}
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-2 text-gray-700 font-semibold text-xs uppercase tracking-wider mb-2">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span>Reservation Info</span>
                        </div>
                        {(() => {
                          const booking = bookingMap.get(
                            selectedBillDetails.booking_id
                          );
                          const room = booking?.room_id
                            ? roomMap.get(booking.room_id)
                            : null;
                          return (
                            <div className="text-sm space-y-1">
                              <p className="font-semibold text-gray-900">
                                {booking?.booking_ref ||
                                  `Booking #${selectedBillDetails.booking_id}`}
                              </p>
                              <p className="text-xs text-gray-600">
                                {room
                                  ? `Room ${room.room_number}`
                                  : "Room Unassigned"}
                              </p>
                              <p className="text-xs text-gray-500">
                                Check-in: {booking?.check_in_date || "—"} | Out:{" "}
                                {booking?.check_out_date || "—"}
                              </p>
                              {booking?.status && (
                                <span className="inline-block mt-1 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                                  Status: {booking.status}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Financial Summary Breakdown */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                      <div className="px-5 py-3.5 bg-gray-50/80 border-b border-gray-200 font-semibold text-xs text-gray-700 uppercase tracking-wider">
                        Authoritative Folio Charges
                      </div>
                      <div className="p-5 space-y-3 text-sm">
                        <div className="flex justify-between items-center text-gray-600">
                          <span>Subtotal (Room Rate &amp; Nights)</span>
                          <span className="font-mono font-medium text-gray-900">
                            {formatCurrency(selectedBillDetails.subtotal_amount)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-gray-600">
                          <span>Taxes &amp; Levies</span>
                          <span className="font-mono font-medium text-gray-900">
                            {formatCurrency(selectedBillDetails.tax_amount)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-gray-600">
                          <span>Discount / Promo</span>
                          <span className="font-mono font-medium text-rose-600">
                            {parseFloat(selectedBillDetails.discount_amount) > 0
                              ? `-${formatCurrency(
                                  selectedBillDetails.discount_amount
                                )}`
                              : "$0.00"}
                          </span>
                        </div>

                        <div className="pt-3 border-t border-gray-200 flex justify-between items-center text-base font-bold text-gray-900">
                          <span>Total Amount</span>
                          <span className="font-mono">
                            {formatCurrency(selectedBillDetails.total_amount)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-emerald-700 font-medium">
                          <span>Amount Paid</span>
                          <span className="font-mono">
                            {formatCurrency(selectedBillDetails.paid_amount)}
                          </span>
                        </div>

                        <div className="p-3.5 bg-blue-50/60 rounded-lg flex justify-between items-center font-bold">
                          <span className="text-gray-900">
                            Outstanding Balance Due
                          </span>
                          <span
                            className={`font-mono text-lg ${
                              parseFloat(selectedBillDetails.balance_due) === 0
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                          >
                            {formatCurrency(selectedBillDetails.balance_due)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Active Stay Checkout Trigger (if booking not checked out yet) */}
                    {(() => {
                      const booking = bookingMap.get(
                        selectedBillDetails.booking_id
                      );
                      const isCheckedOut = booking?.status === "checked_out";
                      const isTerminated =
                        booking?.status === "cancelled" ||
                        booking?.status === "no_show";

                      if (!canMutate || !booking || isCheckedOut || isTerminated) {
                        return null;
                      }

                      return (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-4">
                          <div className="text-xs text-rose-800 space-y-0.5">
                            <p className="font-bold flex items-center gap-1.5">
                              <LogOut className="w-4 h-4 text-rose-600" />
                              Active Stay Checkout
                            </p>
                            <p className="text-rose-700">
                              Guest is currently{" "}
                              <strong className="uppercase">
                                {booking.status}
                              </strong>
                              . Finalize checkout and mark room as dirty for housekeeping.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setCheckoutBookingTarget(booking);
                              setIsCheckoutModalOpen(true);
                            }}
                            className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition shadow-2xs whitespace-nowrap inline-flex items-center gap-1.5 shrink-0"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Checkout Guest</span>
                          </button>
                        </div>
                      );
                    })()}

                    {/* Notes (if any) */}
                    {selectedBillDetails.notes && (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                          Folio Notes
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                          {selectedBillDetails.notes}
                        </p>
                      </div>
                    )}

                    {/* Payment Records Section & Recording Form */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-blue-600" />
                          Payment Records ({selectedBillDetails.payments?.length || 0})
                        </h3>

                        {canMutate &&
                          selectedBillDetails.status !== "paid" &&
                          selectedBillDetails.status !== "voided" &&
                          selectedBillDetails.status !== "refunded" &&
                          !isRecordingPayment && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsRecordingPayment(true);
                                setPaymentAmount(selectedBillDetails.balance_due);
                                setPaymentMethod("cash");
                                setPaymentType("charge");
                                setPaymentGatewayProvider("");
                                setPaymentGatewayTxnId("");
                                setPaymentError(null);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Record Payment</span>
                            </button>
                          )}
                      </div>

                      {/* Status Notice for Settled or Inactive Bills */}
                      {selectedBillDetails.status === "paid" && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-medium">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>This invoice is fully paid. Outstanding balance is $0.00.</span>
                        </div>
                      )}

                      {(selectedBillDetails.status === "voided" ||
                        selectedBillDetails.status === "refunded") && (
                        <div className="p-3 bg-gray-100 border border-gray-300 rounded-xl text-xs text-gray-700 flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-gray-500 shrink-0" />
                          <span>
                            Cannot record payments on a {selectedBillDetails.status} bill.
                          </span>
                        </div>
                      )}

                      {/* RECORD PAYMENT FORM */}
                      {isRecordingPayment && (
                        <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-xl space-y-4">
                          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                            <div>
                              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                                Record Folio Payment
                              </h4>
                              <p className="text-[11px] text-gray-500">
                                Outstanding balance:{" "}
                                <strong className="font-mono text-amber-700">
                                  {formatCurrency(selectedBillDetails.balance_due)}
                                </strong>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRecordingPayment(false);
                                setPaymentError(null);
                              }}
                              className="text-gray-400 hover:text-gray-600 p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {paymentError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
                              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                              <span>{paymentError}</span>
                            </div>
                          )}

                          <form onSubmit={handleRecordPayment} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Payment Amount */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
                                    Amount ($) <span className="text-red-500">*</span>
                                  </label>
                                  {parseFloat(selectedBillDetails.balance_due) > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPaymentAmount(
                                          selectedBillDetails.balance_due
                                        )
                                      }
                                      className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline"
                                    >
                                      Pay Full Balance
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  required
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                                />
                              </div>

                              {/* Payment Method */}
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                  Payment Method <span className="text-red-500">*</span>
                                </label>
                                <select
                                  value={paymentMethod}
                                  onChange={(e) =>
                                    setPaymentMethod(
                                      e.target.value as PaymentMethod
                                    )
                                  }
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                                >
                                  <option value="cash">Cash</option>
                                  <option value="credit_card">Credit Card</option>
                                  <option value="debit_card">Debit Card</option>
                                  <option value="bank_transfer">Bank Transfer</option>
                                  <option value="upi">UPI</option>
                                  <option value="online">Online Payment</option>
                                </select>
                              </div>

                              {/* Payment Type */}
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                  Payment Type <span className="text-red-500">*</span>
                                </label>
                                <select
                                  value={paymentType}
                                  onChange={(e) =>
                                    setPaymentType(
                                      e.target.value as PaymentType
                                    )
                                  }
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                                >
                                  <option value="charge">Charge (Payment)</option>
                                  <option value="refund">Refund</option>
                                  <option value="deposit">Deposit</option>
                                </select>
                              </div>

                              {/* Gateway Provider (Optional) */}
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                  Gateway / Provider (Optional)
                                </label>
                                <input
                                  type="text"
                                  maxLength={50}
                                  value={paymentGatewayProvider}
                                  onChange={(e) =>
                                    setPaymentGatewayProvider(e.target.value)
                                  }
                                  placeholder="e.g. Stripe, FrontDesk POS, Manual"
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                />
                              </div>
                            </div>

                            {/* Gateway Txn ID (Optional) */}
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                External Reference / Txn ID (Optional)
                              </label>
                              <input
                                type="text"
                                maxLength={100}
                                value={paymentGatewayTxnId}
                                onChange={(e) =>
                                  setPaymentGatewayTxnId(e.target.value)
                                }
                                placeholder="e.g. txn_0918294819"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                              />
                            </div>

                            {/* Security Notice */}
                            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-500">
                              <p>
                                <strong>Security Notice:</strong> Do not enter credit card numbers, CVV, or card credentials. This transaction record will generate an audit reference automatically.
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsRecordingPayment(false);
                                  setPaymentError(null);
                                }}
                                disabled={isSubmittingPayment}
                                className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                              >
                                Cancel
                              </button>

                              <button
                                type="submit"
                                disabled={isSubmittingPayment}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
                              >
                                {isSubmittingPayment ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Recording...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Submit Payment</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </form>
                        </div>
                      )}

                      {/* Payment History List */}
                      {!selectedBillDetails.payments ||
                      selectedBillDetails.payments.length === 0 ? (
                        <div className="p-6 text-center border border-dashed border-gray-300 rounded-xl bg-gray-50">
                          <CreditCard className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-700">
                            No payments recorded yet
                          </p>
                          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                            Guest payments recorded against this invoice will appear here with full audit details.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {selectedBillDetails.payments.map((pmt) => (
                            <div
                              key={pmt.payment_id}
                              className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-2xs flex items-center justify-between"
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-gray-900">
                                    {pmt.payment_ref}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {pmt.status}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500">
                                  Method:{" "}
                                  <strong className="text-gray-700 capitalize">
                                    {pmt.payment_method.replace("_", " ")}
                                  </strong>{" "}
                                  • Type: {pmt.payment_type}
                                </p>
                                <p className="text-[11px] text-gray-400">
                                  Recorded: {formatDate(pmt.paid_at || pmt.created_at)}
                                  {pmt.gateway_provider ? ` • ${pmt.gateway_provider}` : ""}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-base font-bold font-mono text-emerald-600">
                                  +{formatCurrency(pmt.amount)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Timeline Metadata */}
                    <div className="pt-4 border-t border-gray-200 text-xs text-gray-400 space-y-1">
                      <p>
                        Issued: {formatDate(selectedBillDetails.issued_date)}
                      </p>
                      <p>
                        Created in system:{" "}
                        {formatDate(selectedBillDetails.created_at)}
                      </p>
                      {selectedBillDetails.updated_at && (
                        <p>
                          Last Updated:{" "}
                          {formatDate(selectedBillDetails.updated_at)}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end">
                <button
                  onClick={handleCloseBillDetails}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition shadow-2xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Confirmation Modal */}
      {isCheckoutModalOpen && (
        <CheckoutModal
          isOpen={isCheckoutModalOpen}
          onClose={() => {
            setIsCheckoutModalOpen(false);
            setCheckoutBookingTarget(null);
          }}
          booking={checkoutBookingTarget}
          guest={
            checkoutBookingTarget
              ? guestMap.get(checkoutBookingTarget.guest_id) || null
              : null
          }
          room={
            checkoutBookingTarget?.room_id
              ? roomMap.get(checkoutBookingTarget.room_id) || null
              : null
          }
          bill={selectedBillDetails}
          onSuccess={async () => {
            await loadData();
            if (selectedBillId) {
              handleOpenBillDetails(selectedBillId);
            }
          }}
          onViewBill={(billId) => {
            handleOpenBillDetails(billId);
          }}
        />
      )}

      {/* Generate Bill Modal */}
      {isGenerateModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => !isGenerating && setIsGenerateModalOpen(false)}
            aria-hidden="true"
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      Generate Bill / Folio
                    </h2>
                    <p className="text-xs text-gray-500">
                      Create an official invoice from an eligible booking
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => !isGenerating && setIsGenerateModalOpen(false)}
                  disabled={isGenerating}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleGenerateBill}>
                <div className="p-6 space-y-4">
                  {/* Duplicate Bill Conflict Banner (409) */}
                  {duplicateExistingBill && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                      <div className="flex items-start gap-2.5 text-amber-800">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-bold">
                            Bill Already Exists For This Booking
                          </p>
                          <p className="mt-0.5">
                            Invoice:{" "}
                            <strong className="font-mono">
                              {duplicateExistingBill.invoice_number}
                            </strong>{" "}
                            (Total:{" "}
                            {formatCurrency(duplicateExistingBill.total_amount)}
                            , Balance:{" "}
                            {formatCurrency(duplicateExistingBill.balance_due)})
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsGenerateModalOpen(false);
                          handleOpenBillDetails(
                            duplicateExistingBill.bill_id
                          );
                        }}
                        className="w-full mt-2 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition"
                      >
                        <span>Open Existing Bill</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* General Error Banner */}
                  {generateError && !duplicateExistingBill && (
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 font-medium">
                        {generateError}
                      </p>
                    </div>
                  )}

                  {/* Select Booking */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                      Select Booking <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedBookingId}
                      onChange={(e) => {
                        setSelectedBookingId(e.target.value);
                        setGenerateError(null);
                        setDuplicateExistingBill(null);
                      }}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      <option value="">-- Choose a reservation --</option>
                      {bookings.map((b) => {
                        const guest = guestMap.get(b.guest_id);
                        const hasBill = billedBookingIds.has(b.booking_id);
                        const guestName = guest
                          ? `${guest.first_name} ${guest.last_name}`
                          : `Guest #${b.guest_id}`;
                        return (
                          <option key={b.booking_id} value={b.booking_id}>
                            {b.booking_ref} — {guestName} ({b.status})
                            {hasBill ? " [Has Bill]" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Choose an existing reservation to generate an authoritative folio.
                    </p>
                  </div>

                  {/* Selected Booking Info Preview */}
                  {selectedBookingId && (
                    <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs space-y-1">
                      {(() => {
                        const bId = parseInt(selectedBookingId, 10);
                        const b = bookingMap.get(bId);
                        const g = b ? guestMap.get(b.guest_id) : null;
                        if (!b) return <p>Booking data not found</p>;
                        return (
                          <>
                            <p className="font-semibold text-blue-900">
                              Selected: {b.booking_ref} (Booking ID #{b.booking_id})
                            </p>
                            <p className="text-blue-800">
                              Guest: {g?.first_name} {g?.last_name} • Rate: {formatCurrency(b.nightly_rate)}/night
                            </p>
                            <p className="text-blue-800 font-medium">
                              Base Stay Total on Booking: {formatCurrency(b.total_amount)}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Financial Parameters */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                        Tax Amount ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={taxAmount}
                        onChange={(e) => setTaxAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                        Discount Amount ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Status Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                      Bill Status
                    </label>
                    <select
                      value={billStatus}
                      onChange={(e) =>
                        setBillStatus(e.target.value as "draft" | "issued")
                      }
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      <option value="issued">Issued (Ready for payment)</option>
                      <option value="draft">Draft (Preliminary folio)</option>
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                      Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={billNotes}
                      onChange={(e) => setBillNotes(e.target.value)}
                      placeholder="e.g. Standard rate, airport transfer voucher included..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Notice on Server-side calculation */}
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-500">
                    <p>
                      <strong>Notice:</strong> Financial totals, tax inclusion,
                      and balances are computed authoritatively by the backend
                      service upon bill generation.
                    </p>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsGenerateModalOpen(false)}
                    disabled={isGenerating}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition shadow-2xs"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isGenerating || !selectedBookingId}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-2xs disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Receipt className="w-4 h-4" />
                        <span>Confirm &amp; Generate</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "manager", "receptionist"]}>
      <AppShell title="Billing &amp; Folios">
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-gray-500 text-sm font-medium animate-pulse flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                <span>Loading Billing workspace...</span>
              </div>
            </div>
          }
        >
          <BillingContent />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}
