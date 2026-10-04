"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import {
  getBookings,
  createBooking,
  Booking,
  BookingStatus,
  CreateBookingDto,
} from "@/lib/bookingsApi";
import { getGuests, createGuest, Guest, GuestIdType } from "@/lib/guestsApi";
import { getRooms, Room } from "@/lib/roomsApi";
import { getRoomTypes, RoomType } from "@/lib/roomTypesApi";
import toast from "react-hot-toast";
import {
  CalendarCheck,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  X,
  Users,
  DoorOpen,
  Calendar,
  CheckCircle2,
  Clock,
  RotateCcw,
  Eye,
  Star,
  DollarSign,
  AlertTriangle,
  UserPlus,
} from "lucide-react";

const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  confirmed: {
    label: "Confirmed",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  checked_in: {
    label: "Checked In",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  checked_out: {
    label: "Checked Out",
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-200",
  },
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  no_show: {
    label: "No Show",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
};

function BookingsContent() {
  const searchParams = useSearchParams();

  // Data states
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [roomFilter, setRoomFilter] = useState<string>("");

  // Details Modal
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // New Booking Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // New Booking Form Fields
  const [bookingGuestId, setBookingGuestId] = useState<string>("");
  const [bookingRoomId, setBookingRoomId] = useState<string>("");
  const [checkInDate, setCheckInDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [checkOutDate, setCheckOutDate] = useState<string>(() => {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    return tmrw.toISOString().split("T")[0];
  });
  const [numAdults, setNumAdults] = useState<string>("1");
  const [numChildren, setNumChildren] = useState<string>("0");
  const [specialRequests, setSpecialRequests] = useState<string>("");

  // Quick Register Guest tab in New Booking Modal
  const [isQuickRegisterOpen, setIsQuickRegisterOpen] = useState(false);
  const [quickFirstName, setQuickFirstName] = useState("");
  const [quickLastName, setQuickLastName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [quickIdType, setQuickIdType] = useState<GuestIdType | "">("");
  const [quickIdNumber, setQuickIdNumber] = useState("");
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [quickErrors, setQuickErrors] = useState<Record<string, string>>({});

  // Maps for fast lookups
  const guestMap = useMemo(() => {
    const map = new Map<number, Guest>();
    guests.forEach((g) => map.set(g.guest_id, g));
    return map;
  }, [guests]);

  const roomMap = useMemo(() => {
    const map = new Map<number, Room>();
    rooms.forEach((r) => map.set(r.room_id, r));
    return map;
  }, [rooms]);

  const roomTypeMap = useMemo(() => {
    const map = new Map<number, RoomType>();
    roomTypes.forEach((rt) => map.set(rt.room_type_id, rt));
    return map;
  }, [roomTypes]);

  // Load all data
  const loadData = useCallback(async (showToast = false) => {
    try {
      const filters = statusFilter ? { status: statusFilter } : undefined;
      const [bookingsData, guestsData, roomsData, rtData] = await Promise.all([
        getBookings(filters),
        getGuests(),
        getRooms(),
        getRoomTypes(),
      ]);

      setBookings(bookingsData);
      setGuests(guestsData);
      setRooms(roomsData);
      setRoomTypes(rtData);
      setFetchError(null);
      if (showToast) {
        toast.success("Bookings updated");
      }
    } catch (error: unknown) {
      console.error("Failed to load booking workspace data:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to load bookings";
      setFetchError(msg);
      if (showToast) {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  // Initial load
  useEffect(() => {
    let isMounted = true;

    Promise.all([getBookings(), getGuests(), getRooms(), getRoomTypes()])
      .then(([bookingsData, guestsData, roomsData, rtData]) => {
        if (isMounted) {
          setBookings(bookingsData);
          setGuests(guestsData);
          setRooms(roomsData);
          setRoomTypes(rtData);
          setFetchError(null);
          setIsLoading(false);

          // Check if navigated from guest list with ?guest_id=X&action=new
          const paramGuestId = searchParams.get("guest_id");
          const paramAction = searchParams.get("action");
          if (paramAction === "new" && paramGuestId) {
            setBookingGuestId(paramGuestId);
            setIsCreateModalOpen(true);
          }
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          console.error("Initial load bookings error:", error);
          const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
          setFetchError(
            axiosErr.response?.data?.error ||
              axiosErr.message ||
              "Failed to initialize booking workspace"
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  // Handle Filter Change
  const handleApplyFilter = () => {
    setIsLoading(true);
    loadData();
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("");
    setRoomFilter("");
    setIsLoading(true);
    Promise.all([getBookings(), getGuests(), getRooms(), getRoomTypes()])
      .then(([bookingsData, guestsData, roomsData, rtData]) => {
        setBookings(bookingsData);
        setGuests(guestsData);
        setRooms(roomsData);
        setRoomTypes(rtData);
        setFetchError(null);
        setIsLoading(false);
        toast.success("Filters reset");
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  };

  // Open Details Modal
  const handleOpenDetails = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsDetailModalOpen(true);
  };

  // Open New Booking Modal
  const handleOpenCreate = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = tmrw.toISOString().split("T")[0];

    setBookingGuestId(guests.length > 0 ? String(guests[0].guest_id) : "");
    // Find first available room if possible
    const firstAvailable = rooms.find((r) => r.is_available) || rooms[0];
    setBookingRoomId(firstAvailable ? String(firstAvailable.room_id) : "");
    setCheckInDate(todayStr);
    setCheckOutDate(tmrwStr);
    setNumAdults("1");
    setNumChildren("0");
    setSpecialRequests("");
    setFormErrors({});
    setIsQuickRegisterOpen(false);
    setIsCreateModalOpen(true);
  };

  // Quick Register Guest Action
  const handleQuickRegisterGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!quickFirstName.trim()) errors.first_name = "First name is required";
    if (!quickLastName.trim()) errors.last_name = "Last name is required";
    if (!quickPhone.trim()) errors.phone = "Phone number is required";
    if (quickEmail.trim() && !quickEmail.includes("@")) {
      errors.email = "Valid email with '@' required";
    }

    if (Object.keys(errors).length > 0) {
      setQuickErrors(errors);
      return;
    }

    setIsQuickSaving(true);
    try {
      const res = await createGuest({
        first_name: quickFirstName.trim(),
        last_name: quickLastName.trim(),
        phone: quickPhone.trim(),
        email: quickEmail.trim() || null,
        id_type: quickIdType ? (quickIdType as GuestIdType) : null,
        id_number: quickIdNumber.trim() || null,
      });

      toast.success(`Guest ${res.guest.first_name} ${res.guest.last_name} registered`);
      // Update guests list and auto-select new guest
      setGuests((prev) => [...prev, res.guest]);
      setBookingGuestId(String(res.guest.guest_id));
      setIsQuickRegisterOpen(false);
      setQuickFirstName("");
      setQuickLastName("");
      setQuickPhone("");
      setQuickEmail("");
      setQuickIdType("");
      setQuickIdNumber("");
      setQuickErrors({});
    } catch (error: unknown) {
      console.error("Quick guest register error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to register guest";
      setQuickErrors((prev) => ({ ...prev, api: msg }));
    } finally {
      setIsQuickSaving(false);
    }
  };

  // Calculated nights
  const nightsCount = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 1;
    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
    return diff > 0 ? diff : 0;
  }, [checkInDate, checkOutDate]);

  // Selected Room for pricing calculation
  const selectedRoomForBooking = useMemo(() => {
    if (!bookingRoomId) return null;
    return roomMap.get(parseInt(bookingRoomId, 10)) || null;
  }, [bookingRoomId, roomMap]);

  const selectedRoomTypeForBooking = useMemo(() => {
    if (!selectedRoomForBooking || !selectedRoomForBooking.room_type_id) return null;
    return roomTypeMap.get(selectedRoomForBooking.room_type_id) || null;
  }, [selectedRoomForBooking, roomTypeMap]);

  const estimatedTotal = useMemo(() => {
    if (!selectedRoomTypeForBooking) return 0;
    const rate = parseFloat(selectedRoomTypeForBooking.base_price || "100.00");
    return rate * Math.max(nightsCount, 1);
  }, [selectedRoomTypeForBooking, nightsCount]);

  // Submit New Booking
  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!bookingGuestId) errors.guest_id = "Please select a guest";
    if (!bookingRoomId) errors.room_id = "Please select a room";

    if (!checkInDate) errors.check_in_date = "Check-in date is required";
    if (!checkOutDate) errors.check_out_date = "Check-out date is required";
    if (checkOutDate <= checkInDate) {
      errors.check_out_date = "Check-out date must be after check-in date";
    }

    const adults = parseInt(numAdults, 10);
    const children = parseInt(numChildren, 10);
    if (isNaN(adults) || adults <= 0) errors.num_adults = "Adults must be at least 1";
    if (isNaN(children) || children < 0) errors.num_children = "Children cannot be negative";

    // Capacity validation
    if (selectedRoomTypeForBooking && selectedRoomTypeForBooking.max_occupancy) {
      if (adults + children > selectedRoomTypeForBooking.max_occupancy) {
        errors.num_adults = `Total guests (${adults + children}) exceeds room capacity (${selectedRoomTypeForBooking.max_occupancy})`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateBookingDto = {
        guest_id: parseInt(bookingGuestId, 10),
        room_id: parseInt(bookingRoomId, 10),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        num_adults: adults,
        num_children: children,
        special_requests: specialRequests.trim() || null,
      };

      const res = await createBooking(payload);
      toast.success(res.message || "Booking created successfully");
      setIsCreateModalOpen(false);
      loadData();
    } catch (error: unknown) {
      console.error("Create booking error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to create booking";
      toast.error(msg);
      setFormErrors((prev) => ({ ...prev, api: msg }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered Bookings in memory for quick text search
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Room filter
      if (roomFilter && b.room_id !== parseInt(roomFilter, 10)) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();

      const guest = b.guest_id ? guestMap.get(b.guest_id) : null;
      const guestName = guest ? `${guest.first_name} ${guest.last_name}`.toLowerCase() : "";
      const room = b.room_id ? roomMap.get(b.room_id) : null;
      const roomNum = room ? room.room_number.toLowerCase() : "";

      return (
        b.booking_ref.toLowerCase().includes(q) ||
        guestName.includes(q) ||
        roomNum.includes(q) ||
        b.status.toLowerCase().includes(q)
      );
    });
  }, [bookings, searchQuery, roomFilter, guestMap, roomMap]);

  return (
    <ProtectedRoute allowedRoles={["admin", "manager", "receptionist"]}>
      <AppShell title="Bookings">
        <div className="space-y-6">
          {/* Header Banner & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                  Reservation Workspace
                </h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Manage guest reservations, room assignments, stay dates, and booking lifecycles.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadData(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition shadow-2xs"
                title="Refresh booking list"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Booking</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by reference, guest name, or room #..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50/50 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="status-filter" className="text-xs font-semibold text-gray-500">
                  Status:
                </label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-2 px-3 border border-gray-300 rounded-lg text-xs bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked_in">Checked In</option>
                  <option value="checked_out">Checked Out</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No Show</option>
                </select>
              </div>

              {/* Room Filter */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="room-filter" className="text-xs font-semibold text-gray-500">
                  Room:
                </label>
                <select
                  id="room-filter"
                  value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)}
                  className="py-2 px-3 border border-gray-300 rounded-lg text-xs bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Rooms</option>
                  {rooms.map((r) => (
                    <option key={r.room_id} value={r.room_id}>
                      Room {r.room_number} (Fl {r.floor})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleApplyFilter}
                className="px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition flex items-center gap-1"
              >
                <Filter className="w-3.5 h-3.5" /> Filter
              </button>

              <button
                onClick={handleResetFilters}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                title="Reset filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bookings Table & States */}
          {isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-2xs space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                  <div className="h-8 bg-gray-200 rounded w-24" />
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-800">Error Loading Bookings</h3>
                <p className="text-sm text-red-700 mt-1">{fetchError}</p>
                <button
                  onClick={() => loadData(true)}
                  className="mt-3 text-xs font-semibold text-red-800 underline hover:text-red-900 inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry Loading
                </button>
              </div>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">No Reservations Found</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                {searchQuery || statusFilter || roomFilter
                  ? "No bookings match your current filter parameters."
                  : "No reservations are currently recorded in the system."}
              </p>
              <button
                onClick={handleOpenCreate}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
              >
                <Plus className="w-4 h-4" /> Create First Booking
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4 sm:px-6">Booking Ref</th>
                      <th className="py-3.5 px-4">Guest</th>
                      <th className="py-3.5 px-4">Room & Type</th>
                      <th className="py-3.5 px-4">Stay Dates</th>
                      <th className="py-3.5 px-4">Guests</th>
                      <th className="py-3.5 px-4">Total Amount</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {filteredBookings.map((b) => {
                      const guest = b.guest_id ? guestMap.get(b.guest_id) : null;
                      const room = b.room_id ? roomMap.get(b.room_id) : null;
                      const statusCfg =
                        BOOKING_STATUS_CONFIG[b.status] || {
                          label: b.status,
                          bg: "bg-gray-100",
                          text: "text-gray-700",
                          border: "border-gray-200",
                        };

                      return (
                        <tr
                          key={b.booking_id}
                          className="hover:bg-gray-50/50 transition cursor-pointer"
                          onClick={() => handleOpenDetails(b)}
                        >
                          {/* Reference */}
                          <td className="py-4 px-4 sm:px-6">
                            <span className="font-mono font-bold text-gray-900 block">
                              {b.booking_ref}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {b.created_at ? new Date(b.created_at).toLocaleDateString() : ""}
                            </span>
                          </td>

                          {/* Guest */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            {guest ? (
                              <div>
                                <span className="font-semibold text-gray-900 flex items-center gap-1">
                                  {guest.first_name} {guest.last_name}
                                  {guest.vip_status && (
                                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                  )}
                                </span>
                                <span className="text-xs text-gray-500">{guest.phone}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Guest #{b.guest_id}</span>
                            )}
                          </td>

                          {/* Room */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            {room ? (
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                                  {room.room_number}
                                </div>
                                <div>
                                  <span className="font-medium text-gray-900 block">
                                    Room {room.room_number}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {room.room_type || "Standard Room"}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Unassigned</span>
                            )}
                          </td>

                          {/* Stay Dates */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-xs text-gray-800 font-medium">
                              <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>{b.check_in_date}</span>
                              <span className="text-gray-400">→</span>
                              <span>{b.check_out_date || "Open"}</span>
                            </div>
                          </td>

                          {/* Guests */}
                          <td className="py-4 px-4 text-xs text-gray-600 whitespace-nowrap">
                            <span>{b.num_adults} Adult{b.num_adults === 1 ? "" : "s"}</span>
                            {b.num_children > 0 && <span>, {b.num_children} Child</span>}
                          </td>

                          {/* Total Amount */}
                          <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">
                            ${parseFloat(b.total_amount || "0").toFixed(2)}
                            <span className="block text-[11px] text-gray-400 font-normal">
                              ${parseFloat(b.nightly_rate || "0").toFixed(2)}/nt
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                            >
                              {b.status === "confirmed" && <CheckCircle2 className="w-3 h-3" />}
                              {b.status === "pending" && <Clock className="w-3 h-3" />}
                              {statusCfg.label}
                            </span>
                          </td>

                          {/* Actions */}
                          <td
                            className="py-4 px-4 sm:px-6 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleOpenDetails(b)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="View Booking Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BOOKING DETAILS MODAL */}
          {isDetailModalOpen && selectedBooking && (
            <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => setIsDetailModalOpen(false)}
                aria-hidden="true"
              />

              <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
                  {/* Header */}
                  <div className="flex items-start justify-between pb-4 border-b border-gray-200 mb-6">
                    <div>
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                        Reservation Details
                      </span>
                      <h3 className="text-xl font-mono font-bold text-gray-900 mt-0.5">
                        {selectedBooking.booking_ref}
                      </h3>
                    </div>

                    <button
                      onClick={() => setIsDetailModalOpen(false)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                      aria-label="Close modal"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Booking Status Banner */}
                  <div className="mb-6 flex items-center justify-between bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                    <span className="text-xs font-semibold text-gray-500">Booking Status:</span>
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                        BOOKING_STATUS_CONFIG[selectedBooking.status]?.bg || "bg-gray-100"
                      } ${BOOKING_STATUS_CONFIG[selectedBooking.status]?.text || "text-gray-700"} ${
                        BOOKING_STATUS_CONFIG[selectedBooking.status]?.border || "border-gray-200"
                      }`}
                    >
                      {BOOKING_STATUS_CONFIG[selectedBooking.status]?.label || selectedBooking.status}
                    </span>
                  </div>

                  {/* Guest & Room Breakdown */}
                  <div className="space-y-4 text-xs text-gray-700">
                    {/* Guest Details */}
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                      <span className="font-bold text-gray-900 block text-sm flex items-center gap-1">
                        <Users className="w-4 h-4 text-blue-600" /> Guest Information
                      </span>
                      {guestMap.get(selectedBooking.guest_id) ? (
                        (() => {
                          const g = guestMap.get(selectedBooking.guest_id)!;
                          return (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <div>
                                <span className="text-gray-400 block">Name:</span>
                                <span className="font-semibold text-gray-900">
                                  {g.first_name} {g.last_name}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">Phone:</span>
                                <span className="font-medium text-gray-800">{g.phone}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">Email:</span>
                                <span className="text-gray-800">{g.email || "None"}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">ID Document:</span>
                                <span className="text-gray-800 font-mono">
                                  {g.id_type ? `${g.id_type}: ${g.id_number}` : "None"}
                                </span>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <p className="text-gray-500">Guest ID: #{selectedBooking.guest_id}</p>
                      )}
                    </div>

                    {/* Room Details */}
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                      <span className="font-bold text-gray-900 block text-sm flex items-center gap-1">
                        <DoorOpen className="w-4 h-4 text-blue-600" /> Assigned Room
                      </span>
                      {selectedBooking.room_id && roomMap.get(selectedBooking.room_id) ? (
                        (() => {
                          const r = roomMap.get(selectedBooking.room_id)!;
                          return (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <div>
                                <span className="text-gray-400 block">Room Number:</span>
                                <span className="font-bold text-gray-900 text-sm">
                                  Room {r.room_number}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">Floor:</span>
                                <span className="font-medium text-gray-800">Floor {r.floor}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">Room Type:</span>
                                <span className="text-gray-800">{r.room_type || "Standard"}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">Policy:</span>
                                <span className="text-gray-800">
                                  {r.is_smoking ? "Smoking" : "Non-Smoking"}
                                </span>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <p className="text-gray-500">No room currently assigned</p>
                      )}
                    </div>

                    {/* Dates & Financials */}
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div>
                        <span className="text-gray-400 block">Check-In:</span>
                        <span className="font-semibold text-gray-900">
                          {selectedBooking.check_in_date}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Check-Out:</span>
                        <span className="font-semibold text-gray-900">
                          {selectedBooking.check_out_date || "Open"}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-gray-200">
                        <span className="text-gray-400 block">Nightly Rate:</span>
                        <span className="font-medium text-gray-800">
                          ${parseFloat(selectedBooking.nightly_rate).toFixed(2)}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-gray-200">
                        <span className="text-gray-400 block">Total Amount:</span>
                        <span className="font-bold text-gray-900 text-sm text-blue-700">
                          ${parseFloat(selectedBooking.total_amount).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Special Requests */}
                    {selectedBooking.special_requests && (
                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                        <span className="font-semibold text-blue-800 block mb-0.5">
                          Special Requests:
                        </span>
                        <p className="text-gray-700">{selectedBooking.special_requests}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end pt-6 border-t border-gray-200 mt-6">
                    <button
                      onClick={() => setIsDetailModalOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CREATE BOOKING WORKFLOW MODAL */}
          {isCreateModalOpen && (
            <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => !isSubmitting && setIsCreateModalOpen(false)}
                aria-hidden="true"
              />

              <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <CalendarCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          Create New Reservation
                        </h3>
                        <p className="text-xs text-gray-500">
                          Assign an available room to a guest and confirm reservation details.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => !isSubmitting && setIsCreateModalOpen(false)}
                      disabled={isSubmitting}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
                      aria-label="Close modal"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* API Error Banner if any */}
                  {formErrors.api && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>{formErrors.api}</span>
                    </div>
                  )}

                  {/* Quick Register Guest Sub-Form */}
                  {isQuickRegisterOpen ? (
                    <div className="mb-6 p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                          <UserPlus className="w-4 h-4" /> Quick Register New Guest
                        </h4>
                        <button
                          type="button"
                          onClick={() => setIsQuickRegisterOpen(false)}
                          className="text-xs text-gray-500 hover:text-gray-700 underline"
                        >
                          Cancel
                        </button>
                      </div>

                      {quickErrors.api && (
                        <p className="text-xs text-red-600">{quickErrors.api}</p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">First Name *</label>
                          <input
                            type="text"
                            required
                            value={quickFirstName}
                            onChange={(e) => setQuickFirstName(e.target.value)}
                            placeholder="e.g. Jane"
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                          />
                          {quickErrors.first_name && (
                            <p className="text-red-600 mt-0.5">{quickErrors.first_name}</p>
                          )}
                        </div>

                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">Last Name *</label>
                          <input
                            type="text"
                            required
                            value={quickLastName}
                            onChange={(e) => setQuickLastName(e.target.value)}
                            placeholder="e.g. Smith"
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                          />
                          {quickErrors.last_name && (
                            <p className="text-red-600 mt-0.5">{quickErrors.last_name}</p>
                          )}
                        </div>

                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">Phone Number *</label>
                          <input
                            type="tel"
                            required
                            value={quickPhone}
                            onChange={(e) => setQuickPhone(e.target.value)}
                            placeholder="+1 555-0144"
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                          />
                          {quickErrors.phone && (
                            <p className="text-red-600 mt-0.5">{quickErrors.phone}</p>
                          )}
                        </div>

                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">Email</label>
                          <input
                            type="email"
                            value={quickEmail}
                            onChange={(e) => setQuickEmail(e.target.value)}
                            placeholder="jane.smith@example.com"
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                          />
                          {quickErrors.email && (
                            <p className="text-red-600 mt-0.5">{quickErrors.email}</p>
                          )}
                        </div>

                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">ID Document Type</label>
                          <select
                            value={quickIdType}
                            onChange={(e) => setQuickIdType(e.target.value as GuestIdType | "")}
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                          >
                            <option value="">None</option>
                            <option value="passport">Passport</option>
                            <option value="national_id">National ID</option>
                            <option value="driving_license">Driver&apos;s License</option>
                            <option value="other">Other</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">ID Number</label>
                          <input
                            type="text"
                            value={quickIdNumber}
                            onChange={(e) => setQuickIdNumber(e.target.value)}
                            placeholder="e.g. P12345678"
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={handleQuickRegisterGuest}
                          disabled={isQuickSaving}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                          {isQuickSaving ? "Registering..." : "Save & Select Guest"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Form */}
                  <form onSubmit={handleSaveBooking} className="space-y-4">
                    {/* Step 1: Guest Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-gray-700">
                          1. Select Guest <span className="text-red-500">*</span>
                        </label>
                        {!isQuickRegisterOpen && (
                          <button
                            type="button"
                            onClick={() => setIsQuickRegisterOpen(true)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Quick Register Guest
                          </button>
                        )}
                      </div>

                      <select
                        required
                        value={bookingGuestId}
                        onChange={(e) => setBookingGuestId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose a registered guest...</option>
                        {guests.map((g) => (
                          <option key={g.guest_id} value={g.guest_id}>
                            {g.first_name} {g.last_name} ({g.phone}) {g.vip_status ? "★ VIP" : ""}
                          </option>
                        ))}
                      </select>
                      {formErrors.guest_id && (
                        <p className="text-xs text-red-600 mt-1">{formErrors.guest_id}</p>
                      )}
                    </div>

                    {/* Step 2: Stay Dates */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Check-in Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={checkInDate}
                          onChange={(e) => setCheckInDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.check_in_date && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.check_in_date}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Check-out Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={checkOutDate}
                          min={checkInDate}
                          onChange={(e) => setCheckOutDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.check_out_date && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.check_out_date}</p>
                        )}
                      </div>
                    </div>

                    {/* Duration badge */}
                    <div className="text-xs text-gray-500 flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>Duration: {nightsCount} night(s)</span>
                    </div>

                    {/* Step 3: Occupancy */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Adults (Age 13+) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={numAdults}
                          onChange={(e) => setNumAdults(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.num_adults && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.num_adults}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Children (Age 0-12)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={numChildren}
                          onChange={(e) => setNumChildren(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.num_children && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.num_children}</p>
                        )}
                      </div>
                    </div>

                    {/* Step 4: Room Selection */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Select Room Assignment <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={bookingRoomId}
                        onChange={(e) => setBookingRoomId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose an available room...</option>
                        {rooms.map((r) => {
                          const rt = r.room_type_id ? roomTypeMap.get(r.room_type_id) : null;
                          const priceStr = rt ? `$${parseFloat(rt.base_price).toFixed(2)}/nt` : "";
                          const capStr = rt ? `Max ${rt.max_occupancy} guests` : "";

                          let label = `Room ${r.room_number} — ${r.room_type || "Standard"} (${priceStr}, ${capStr})`;
                          if (!r.is_available) {
                            label += ` [${r.operational_status} / ${r.cleanliness_status}]`;
                          }
                          return (
                            <option key={r.room_id} value={r.room_id}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                      {formErrors.room_id && (
                        <p className="text-xs text-red-600 mt-1">{formErrors.room_id}</p>
                      )}

                      {/* Room selection warning if not ready */}
                      {selectedRoomForBooking && !selectedRoomForBooking.is_available && (
                        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            Notice: Room {selectedRoomForBooking.room_number} is currently{" "}
                            <strong>{selectedRoomForBooking.operational_status}</strong> and{" "}
                            <strong>{selectedRoomForBooking.cleanliness_status}</strong>. If check-in
                            is scheduled for today, cleaning or maintenance must be completed prior to guest arrival.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Step 5: Pricing Preview */}
                    {selectedRoomTypeForBooking && (
                      <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-blue-600" />
                          <div>
                            <span className="font-bold text-gray-900 block">
                              Estimated Total: ${estimatedTotal.toFixed(2)}
                            </span>
                            <span className="text-gray-500">
                              ${parseFloat(selectedRoomTypeForBooking.base_price).toFixed(2)}/night ×{" "}
                              {nightsCount} night(s)
                            </span>
                          </div>
                        </div>

                        <span className="text-blue-700 font-semibold text-[11px] bg-blue-100 px-2.5 py-0.5 rounded-full">
                          Standard Folio
                        </span>
                      </div>
                    )}

                    {/* Step 6: Special Requests */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Special Requests / Guest Notes
                      </label>
                      <textarea
                        rows={2}
                        value={specialRequests}
                        onChange={(e) => setSpecialRequests(e.target.value)}
                        placeholder="e.g. Late check-in requested, high floor, feather-free pillows..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
                      <button
                        type="button"
                        onClick={() => setIsCreateModalOpen(false)}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
                      >
                        {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                        <span>Confirm & Create Booking</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

export default function BookingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-500 text-sm font-medium animate-pulse">
            Loading reservations...
          </div>
        </div>
      }
    >
      <BookingsContent />
    </Suspense>
  );
}
