"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import {
  getGuests,
  createGuest,
  updateGuest,
  deleteGuest,
  Guest,
  GuestIdType,
  CreateGuestDto,
  UpdateGuestDto,
} from "@/lib/guestsApi";
import toast from "react-hot-toast";
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  Star,
  Phone,
  Mail,
  MapPin,
  CalendarPlus,
  Eye,
} from "lucide-react";

const ID_TYPE_LABELS: Record<GuestIdType, string> = {
  passport: "Passport",
  national_id: "National ID",
  driving_license: "Driver's License",
  other: "Other ID",
};

export default function GuestsPage() {
  const { role } = useAuth();
  const userRole = (role || "").toLowerCase();
  const canDelete = userRole === "admin" || userRole === "manager";
  const canModify = userRole === "admin" || userRole === "manager" || userRole === "receptionist";

  const [guests, setGuests] = useState<Guest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [vipOnlyFilter, setVipOnlyFilter] = useState(false);

  // Details Modal State
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Create / Edit Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Form Fields
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formIdType, setFormIdType] = useState<GuestIdType | "">("");
  const [formIdNumber, setFormIdNumber] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formCountry, setFormCountry] = useState("");
  const [formPostalCode, setFormPostalCode] = useState("");
  const [formVipStatus, setFormVipStatus] = useState(false);
  const [formNotes, setFormNotes] = useState("");

  // Delete Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [guestToDelete, setGuestToDelete] = useState<Guest | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch guests (with backend search query if provided)
  const loadGuests = useCallback(async (showToast = false, search?: string) => {
    try {
      const data = await getGuests(search);
      setGuests(data);
      setFetchError(null);
      if (showToast) {
        toast.success("Guest directory updated");
      }
    } catch (error: unknown) {
      console.error("Failed to load guests:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to load guest records";
      setFetchError(msg);
      if (showToast) {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let isMounted = true;

    getGuests()
      .then((data) => {
        if (isMounted) {
          setGuests(data);
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          console.error("Initial load guests error:", error);
          const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
          setFetchError(
            axiosErr.response?.data?.error ||
              axiosErr.message ||
              "Failed to load guest directory"
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle Search Input (Backend + Client fallback)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    loadGuests(false, searchQuery);
  };

  const handleResetSearch = () => {
    setSearchQuery("");
    setVipOnlyFilter(false);
    setIsLoading(true);
    loadGuests(false, "");
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingGuest(null);
    setFormFirstName("");
    setFormLastName("");
    setFormPhone("");
    setFormEmail("");
    setFormIdType("");
    setFormIdNumber("");
    setFormAddress("");
    setFormCity("");
    setFormCountry("");
    setFormPostalCode("");
    setFormVipStatus(false);
    setFormNotes("");
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (guest: Guest) => {
    setEditingGuest(guest);
    setFormFirstName(guest.first_name);
    setFormLastName(guest.last_name);
    setFormPhone(guest.phone);
    setFormEmail(guest.email || "");
    setFormIdType(guest.id_type || "");
    setFormIdNumber(guest.id_number || "");
    setFormAddress(guest.address || "");
    setFormCity(guest.city || "");
    setFormCountry(guest.country || "");
    setFormPostalCode(guest.postal_code || "");
    setFormVipStatus(guest.vip_status);
    setFormNotes(guest.notes || "");
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open Details Modal
  const handleOpenDetails = (guest: Guest) => {
    setSelectedGuest(guest);
    setIsDetailModalOpen(true);
  };

  // Form Validation
  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formFirstName.trim()) {
      errors.first_name = "First name is required";
    } else if (formFirstName.trim().length > 50) {
      errors.first_name = "First name must not exceed 50 characters";
    }

    if (!formLastName.trim()) {
      errors.last_name = "Last name is required";
    } else if (formLastName.trim().length > 50) {
      errors.last_name = "Last name must not exceed 50 characters";
    }

    if (!formPhone.trim()) {
      errors.phone = "Phone number is required";
    } else if (formPhone.trim().length > 25) {
      errors.phone = "Phone number must not exceed 25 characters";
    }

    if (formEmail.trim()) {
      if (formEmail.trim().length > 120 || !formEmail.includes("@")) {
        errors.email = "Please enter a valid email address with '@'";
      }
    }

    if (formIdType && !formIdNumber.trim()) {
      errors.id_number = "ID Number is required when ID Type is specified";
    } else if (formIdNumber.trim().length > 50) {
      errors.id_number = "ID number must not exceed 50 characters";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Save (Create / Update)
  const handleSaveGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      if (editingGuest) {
        // Update
        const payload: UpdateGuestDto = {
          first_name: formFirstName.trim(),
          last_name: formLastName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim() || null,
          id_type: formIdType ? (formIdType as GuestIdType) : null,
          id_number: formIdNumber.trim() || null,
          address: formAddress.trim() || null,
          city: formCity.trim() || null,
          country: formCountry.trim() || null,
          postal_code: formPostalCode.trim() || null,
          vip_status: formVipStatus,
          notes: formNotes.trim() || null,
        };

        const res = await updateGuest(editingGuest.guest_id, payload);
        toast.success(res.message || "Guest profile updated");
      } else {
        // Create
        const payload: CreateGuestDto = {
          first_name: formFirstName.trim(),
          last_name: formLastName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim() || null,
          id_type: formIdType ? (formIdType as GuestIdType) : null,
          id_number: formIdNumber.trim() || null,
          address: formAddress.trim() || null,
          city: formCity.trim() || null,
          country: formCountry.trim() || null,
          postal_code: formPostalCode.trim() || null,
          vip_status: formVipStatus,
          notes: formNotes.trim() || null,
        };

        const res = await createGuest(payload);
        toast.success(res.message || "Guest registered successfully");
      }

      setIsFormModalOpen(false);
      loadGuests(false, searchQuery);
    } catch (error: unknown) {
      console.error("Save guest error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to save guest";
      toast.error(msg);
      setFormErrors((prev) => ({ ...prev, api: msg }));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete Prompt
  const handleOpenDelete = (guest: Guest) => {
    setGuestToDelete(guest);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!guestToDelete) return;

    setIsDeleting(true);
    try {
      const res = await deleteGuest(guestToDelete.guest_id);
      toast.success(res.message || "Guest record deleted");
      setIsDeleteModalOpen(false);
      setGuestToDelete(null);
      if (selectedGuest?.guest_id === guestToDelete.guest_id) {
        setIsDetailModalOpen(false);
      }
      loadGuests(false, searchQuery);
    } catch (error: unknown) {
      console.error("Delete guest error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to delete guest";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter in memory for quick VIP filtering or instant typing
  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      if (vipOnlyFilter && !g.vip_status) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        g.first_name.toLowerCase().includes(q) ||
        g.last_name.toLowerCase().includes(q) ||
        g.phone.toLowerCase().includes(q) ||
        (g.email && g.email.toLowerCase().includes(q)) ||
        (g.id_number && g.id_number.toLowerCase().includes(q)) ||
        (g.city && g.city.toLowerCase().includes(q))
      );
    });
  }, [guests, searchQuery, vipOnlyFilter]);

  return (
    <ProtectedRoute allowedRoles={["admin", "manager", "receptionist"]}>
      <AppShell title="Guests">
        <div className="space-y-6">
          {/* Header Banner & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                  Guest Directory
                </h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Maintain guest profiles, contact records, ID verification, and VIP preferences.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadGuests(true, searchQuery)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition shadow-2xs"
                title="Refresh guest records"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {canModify && (
                <button
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register Guest</span>
                </button>
              )}
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <form onSubmit={handleSearchSubmit} className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, phone, email, or ID document..."
                className="w-full pl-9 pr-16 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50/50 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleResetSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              )}
            </form>

            <div className="flex items-center gap-4 shrink-0">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={vipOnlyFilter}
                  onChange={(e) => setVipOnlyFilter(e.target.checked)}
                  className="h-4 w-4 text-amber-500 focus:ring-amber-400 border-gray-300 rounded"
                />
                <span className="inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> VIP Only
                </span>
              </label>

              <span className="text-xs text-gray-400 font-medium">
                {filteredGuests.length} guest{filteredGuests.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* Guest Table & States */}
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
                <h3 className="text-sm font-bold text-red-800">Error Loading Guest Directory</h3>
                <p className="text-sm text-red-700 mt-1">{fetchError}</p>
                <button
                  onClick={() => loadGuests(true)}
                  className="mt-3 text-xs font-semibold text-red-800 underline hover:text-red-900 inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry Loading
                </button>
              </div>
            </div>
          ) : filteredGuests.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">No Guests Found</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                {searchQuery || vipOnlyFilter
                  ? "No guest profiles match the current filter or search criteria."
                  : "No guests are currently registered in the system."}
              </p>
              {canModify && (
                <button
                  onClick={handleOpenCreate}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                >
                  <Plus className="w-4 h-4" /> Register New Guest
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4 sm:px-6">Guest Name</th>
                      <th className="py-3.5 px-4">Contact Info</th>
                      <th className="py-3.5 px-4">Identification</th>
                      <th className="py-3.5 px-4">Location</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {filteredGuests.map((guest) => {
                      const fullName = `${guest.first_name} ${guest.last_name}`;

                      return (
                        <tr
                          key={guest.guest_id}
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => handleOpenDetails(guest)}
                        >
                          {/* Name & Initial Avatar */}
                          <td className="py-4 px-4 sm:px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                                {guest.first_name.charAt(0)}
                                {guest.last_name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-gray-900 flex items-center gap-1.5">
                                  <span>{fullName}</span>
                                  {guest.vip_status && (
                                    <span
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                                      title="VIP Guest"
                                    >
                                      <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                                      VIP
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400">ID #{guest.guest_id}</span>
                              </div>
                            </div>
                          </td>

                          {/* Contact Info */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-xs text-gray-800">
                              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="font-medium">{guest.phone}</span>
                            </div>
                            {guest.email && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                                <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="truncate max-w-xs">{guest.email}</span>
                              </div>
                            )}
                          </td>

                          {/* Identification */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            {guest.id_type && guest.id_number ? (
                              <div>
                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
                                  {ID_TYPE_LABELS[guest.id_type] || guest.id_type}
                                </span>
                                <div className="text-xs font-mono text-gray-600 mt-0.5">
                                  {guest.id_number}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Not on file</span>
                            )}
                          </td>

                          {/* Location */}
                          <td className="py-4 px-4 text-xs text-gray-600 whitespace-nowrap">
                            {guest.city || guest.country ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span>{[guest.city, guest.country].filter(Boolean).join(", ")}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">-</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            {guest.vip_status ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> VIP
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                Regular
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td
                            className="py-4 px-4 sm:px-6 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Create Booking for guest shortcut */}
                              <Link
                                href={`/bookings?guest_id=${guest.guest_id}&action=new`}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
                                title="Book Room for this Guest"
                              >
                                <CalendarPlus className="w-4 h-4" />
                              </Link>

                              <button
                                onClick={() => handleOpenDetails(guest)}
                                className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {canModify && (
                                <button
                                  onClick={() => handleOpenEdit(guest)}
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="Edit Profile"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}

                              {canDelete && (
                                <button
                                  onClick={() => handleOpenDelete(guest)}
                                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                  title="Delete Guest"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GUEST DETAILS MODAL */}
          {isDetailModalOpen && selectedGuest && (
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
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">
                        {selectedGuest.first_name.charAt(0)}
                        {selectedGuest.last_name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold text-gray-900">
                            {selectedGuest.first_name} {selectedGuest.last_name}
                          </h3>
                          {selectedGuest.vip_status && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-600" /> VIP
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">Guest ID: #{selectedGuest.guest_id}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsDetailModalOpen(false)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                      aria-label="Close details"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Attributes Grid */}
                  <div className="space-y-4 text-sm text-gray-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div>
                        <span className="block text-[11px] font-semibold text-gray-400 uppercase">
                          Phone Number
                        </span>
                        <span className="font-semibold text-gray-900">{selectedGuest.phone}</span>
                      </div>
                      <div>
                        <span className="block text-[11px] font-semibold text-gray-400 uppercase">
                          Email Address
                        </span>
                        <span className="text-gray-800">{selectedGuest.email || "Not provided"}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div>
                        <span className="block text-[11px] font-semibold text-gray-400 uppercase">
                          ID Document
                        </span>
                        <span className="font-medium text-gray-800">
                          {selectedGuest.id_type
                            ? ID_TYPE_LABELS[selectedGuest.id_type] || selectedGuest.id_type
                            : "None"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] font-semibold text-gray-400 uppercase">
                          ID Number
                        </span>
                        <span className="font-mono text-gray-800">
                          {selectedGuest.id_number || "-"}
                        </span>
                      </div>
                    </div>

                    {/* Address & City */}
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5 text-xs">
                      <span className="block text-[11px] font-semibold text-gray-400 uppercase">
                        Address & Location
                      </span>
                      <p className="text-gray-800 font-medium">
                        {selectedGuest.address || "No street address recorded"}
                      </p>
                      <p className="text-gray-500">
                        {[selectedGuest.city, selectedGuest.country, selectedGuest.postal_code]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </p>
                    </div>

                    {/* Notes */}
                    {selectedGuest.notes && (
                      <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 text-xs">
                        <span className="block text-[11px] font-semibold text-blue-700 uppercase mb-1">
                          Guest Preferences & Notes
                        </span>
                        <p className="text-gray-700">{selectedGuest.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-6 border-t border-gray-200 mt-6">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/bookings?guest_id=${selectedGuest.guest_id}&action=new`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" /> Book Room
                      </Link>

                      {canModify && (
                        <button
                          onClick={() => {
                            setIsDetailModalOpen(false);
                            handleOpenEdit(selectedGuest);
                          }}
                          className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                        >
                          Edit Profile
                        </button>
                      )}
                    </div>

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

          {/* CREATE / EDIT GUEST MODAL */}
          {isFormModalOpen && (
            <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => !isSaving && setIsFormModalOpen(false)}
                aria-hidden="true"
              />

              <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Users className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {editingGuest ? "Edit Guest Profile" : "Register New Guest"}
                      </h3>
                    </div>
                    <button
                      onClick={() => !isSaving && setIsFormModalOpen(false)}
                      disabled={isSaving}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
                      aria-label="Close modal"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {formErrors.api && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>{formErrors.api}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveGuest} className="space-y-4">
                    {/* Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={50}
                          value={formFirstName}
                          onChange={(e) => setFormFirstName(e.target.value)}
                          placeholder="e.g. John"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.first_name && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.first_name}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={50}
                          value={formLastName}
                          onChange={(e) => setFormLastName(e.target.value)}
                          placeholder="e.g. Doe"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.last_name && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.last_name}</p>
                        )}
                      </div>
                    </div>

                    {/* Phone & Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          maxLength={25}
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value)}
                          placeholder="e.g. +1 555-0199"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.phone && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          maxLength={120}
                          value={formEmail}
                          onChange={(e) => setFormEmail(e.target.value)}
                          placeholder="e.g. john.doe@example.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.email && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>
                        )}
                      </div>
                    </div>

                    {/* ID Document Type & Number */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          ID Document Type
                        </label>
                        <select
                          value={formIdType}
                          onChange={(e) => setFormIdType(e.target.value as GuestIdType | "")}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">None / Unspecified</option>
                          <option value="passport">Passport</option>
                          <option value="national_id">National ID</option>
                          <option value="driving_license">Driver&apos;s License</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          ID Number
                        </label>
                        <input
                          type="text"
                          maxLength={50}
                          value={formIdNumber}
                          onChange={(e) => setFormIdNumber(e.target.value)}
                          placeholder="e.g. A12345678"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 uppercase"
                        />
                        {formErrors.id_number && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.id_number}</p>
                        )}
                      </div>
                    </div>

                    {/* Location fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                        <input
                          type="text"
                          maxLength={50}
                          value={formCity}
                          onChange={(e) => setFormCity(e.target.value)}
                          placeholder="e.g. New York"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Country</label>
                        <input
                          type="text"
                          maxLength={50}
                          value={formCountry}
                          onChange={(e) => setFormCountry(e.target.value)}
                          placeholder="e.g. United States"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Postal Code</label>
                        <input
                          type="text"
                          maxLength={20}
                          value={formPostalCode}
                          onChange={(e) => setFormPostalCode(e.target.value)}
                          placeholder="e.g. 10001"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Street Address */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={formAddress}
                        onChange={(e) => setFormAddress(e.target.value)}
                        placeholder="e.g. 742 Evergreen Terrace"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* VIP Checkbox */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="form-vip-status"
                        checked={formVipStatus}
                        onChange={(e) => setFormVipStatus(e.target.checked)}
                        className="h-4 w-4 text-amber-500 focus:ring-amber-400 border-gray-300 rounded"
                      />
                      <label htmlFor="form-vip-status" className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        VIP Guest Recognition
                      </label>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Special Preferences or Remarks
                      </label>
                      <textarea
                        rows={2}
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="e.g. Quiet room preferred, allergic to feather pillows..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
                      <button
                        type="button"
                        onClick={() => setIsFormModalOpen(false)}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
                      >
                        {isSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                        <span>{editingGuest ? "Save Changes" : "Register Guest"}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* DELETE CONFIRMATION MODAL */}
          {isDeleteModalOpen && guestToDelete && (
            <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => !isDeleting && setIsDeleteModalOpen(false)}
                aria-hidden="true"
              />

              <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
                  <div className="flex items-center gap-3 text-red-600 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Delete Guest Record
                    </h3>
                  </div>

                  <p className="text-sm text-gray-600">
                    Are you sure you want to remove{" "}
                    <span className="font-bold text-gray-900">
                      {guestToDelete.first_name} {guestToDelete.last_name}
                    </span>{" "}
                    from the directory?
                  </p>

                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Notice: If this guest has any existing or past bookings or billing folios,
                      the deletion will be rejected by the backend to preserve financial audit integrity.
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsDeleteModalOpen(false)}
                      disabled={isDeleting}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50"
                    >
                      {isDeleting && <RefreshCw className="w-4 h-4 animate-spin" />}
                      <span>Confirm Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
