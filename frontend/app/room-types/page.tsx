"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import {
  getRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  RoomType,
  CreateRoomTypeDto,
  UpdateRoomTypeDto,
} from "@/lib/roomTypesApi";
import { getRooms, Room } from "@/lib/roomsApi";
import toast from "react-hot-toast";
import {
  BedDouble,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Users,
  X,
  Info,
} from "lucide-react";

const COMMON_AMENITIES = [
  "Free WiFi",
  "Air Conditioning",
  "Flat-Screen TV",
  "Mini Fridge",
  "Coffee Maker",
  "In-Room Safe",
  "Hairdryer",
  "Work Desk",
  "Balcony",
  "City View",
];

export default function RoomTypesPage() {
  const { role } = useAuth();
  const canManage = role === "admin" || role === "manager";

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formBasePrice, setFormBasePrice] = useState("");
  const [formMaxOccupancy, setFormMaxOccupancy] = useState("2");
  const [formBedConfig, setFormBedConfig] = useState("1 Queen Bed");
  const [formDescription, setFormDescription] = useState("");
  const [formAmenities, setFormAmenities] = useState<string[]>([]);
  const [customAmenity, setCustomAmenity] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  // Delete Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<RoomType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch data
  const loadData = useCallback(async (showToast = false) => {
    try {
      const [rtData, roomsData] = await Promise.all([
        getRoomTypes(),
        getRooms().catch(() => [] as Room[]),
      ]);
      setRoomTypes(rtData);
      setRooms(roomsData);
      setFetchError(null);
      if (showToast) {
        toast.success("Room types refreshed");
      }
    } catch (error: unknown) {
      console.error("Failed to load room types:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to load room types";
      setFetchError(msg);
      if (showToast) {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getRoomTypes(),
      getRooms().catch(() => [] as Room[]),
    ])
      .then(([rtData, roomsData]) => {
        if (isMounted) {
          setRoomTypes(rtData);
          setRooms(roomsData);
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          console.error("Failed to load room types:", error);
          const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
          setFetchError(
            axiosErr.response?.data?.error ||
              axiosErr.message ||
              "Failed to load room types"
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Calculate room counts per room type
  const roomCountMap = rooms.reduce<Record<number, number>>((acc, room) => {
    if (room.room_type_id) {
      acc[room.room_type_id] = (acc[room.room_type_id] || 0) + 1;
    }
    return acc;
  }, {});

  // Handle open create modal
  const handleOpenCreate = () => {
    setEditingType(null);
    setFormName("");
    setFormCode("");
    setFormBasePrice("100.00");
    setFormMaxOccupancy("2");
    setFormBedConfig("1 Queen Bed");
    setFormDescription("");
    setFormAmenities(["Free WiFi", "Air Conditioning", "Flat-Screen TV"]);
    setCustomAmenity("");
    setFormIsActive(true);
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEdit = (rt: RoomType) => {
    setEditingType(rt);
    setFormName(rt.name);
    setFormCode(rt.code);
    setFormBasePrice(String(rt.base_price));
    setFormMaxOccupancy(String(rt.max_occupancy));
    setFormBedConfig(rt.bed_config);
    setFormDescription(rt.description || "");
    const amenitiesArr = Array.isArray(rt.amenities)
      ? (rt.amenities as string[])
      : [];
    setFormAmenities(amenitiesArr);
    setCustomAmenity("");
    setFormIsActive(rt.is_active);
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Toggle amenity selection
  const toggleAmenity = (amenity: string) => {
    if (formAmenities.includes(amenity)) {
      setFormAmenities(formAmenities.filter((a) => a !== amenity));
    } else {
      setFormAmenities([...formAmenities, amenity]);
    }
  };

  // Add custom amenity
  const handleAddCustomAmenity = () => {
    const trimmed = customAmenity.trim();
    if (trimmed && !formAmenities.includes(trimmed)) {
      setFormAmenities([...formAmenities, trimmed]);
      setCustomAmenity("");
    }
  };

  // Validate form
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formName.trim()) {
      errors.name = "Room type name is required";
    } else if (formName.trim().length > 50) {
      errors.name = "Name must not exceed 50 characters";
    }

    if (formCode.trim() && formCode.trim().length > 20) {
      errors.code = "Code must not exceed 20 characters";
    }

    const price = parseFloat(formBasePrice);
    if (isNaN(price) || price < 0) {
      errors.base_price = "Base price must be a valid non-negative number";
    }

    const occ = parseInt(formMaxOccupancy, 10);
    if (isNaN(occ) || occ < 1) {
      errors.max_occupancy = "Max occupancy must be an integer of at least 1";
    }

    if (!formBedConfig.trim()) {
      errors.bed_config = "Bed configuration is required";
    } else if (formBedConfig.trim().length > 60) {
      errors.bed_config = "Bed config must not exceed 60 characters";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Save
  const handleSaveRoomType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      if (editingType) {
        // Update existing
        const updatePayload: UpdateRoomTypeDto = {
          name: formName.trim(),
          base_price: formBasePrice.trim(),
          max_occupancy: parseInt(formMaxOccupancy, 10),
          bed_config: formBedConfig.trim(),
          description: formDescription.trim() || null,
          amenities: formAmenities,
          is_active: formIsActive,
        };
        if (formCode.trim()) {
          updatePayload.code = formCode.trim().toUpperCase();
        }

        const res = await updateRoomType(editingType.room_type_id, updatePayload);
        toast.success(res.message || "Room type updated successfully");
      } else {
        // Create new
        const createPayload: CreateRoomTypeDto = {
          name: formName.trim(),
          base_price: formBasePrice.trim(),
          max_occupancy: parseInt(formMaxOccupancy, 10),
          bed_config: formBedConfig.trim(),
          description: formDescription.trim() || null,
          amenities: formAmenities,
          is_active: formIsActive,
        };
        if (formCode.trim()) {
          createPayload.code = formCode.trim().toUpperCase();
        }

        const res = await createRoomType(createPayload);
        toast.success(res.message || "Room type created successfully");
      }

      setIsModalOpen(false);
      loadData();
    } catch (error: unknown) {
      console.error("Save room type error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to save room type";
      toast.error(msg);
      setFormErrors((prev) => ({ ...prev, api: msg }));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete Prompt
  const handleOpenDelete = (rt: RoomType) => {
    setTypeToDelete(rt);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!typeToDelete) return;

    setIsDeleting(true);
    try {
      const res = await deleteRoomType(typeToDelete.room_type_id);
      toast.success(res.message || "Room type deleted successfully");
      setIsDeleteModalOpen(false);
      setTypeToDelete(null);
      loadData();
    } catch (error: unknown) {
      console.error("Delete room type error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to delete room type";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered list
  const filteredRoomTypes = roomTypes.filter((rt) => {
    const matchesSearch =
      rt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rt.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rt.description && rt.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && rt.is_active) ||
      (statusFilter === "inactive" && !rt.is_active);

    return matchesSearch && matchesStatus;
  });

  return (
    <ProtectedRoute allowedRoles={["admin", "manager", "receptionist"]}>
      <AppShell title="Room Types">
        <div className="space-y-6">
          {/* Header Controls & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <BedDouble className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                  Room Type Catalog
                </h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Define room categories, base pricing, bed setups, and guest capacity.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadData(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition shadow-2xs"
                title="Refresh list"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {canManage ? (
                <button
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Room Type</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <Info className="w-3.5 h-3.5" /> Read-Only Mode
                </span>
              )}
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, code, or description..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="status-filter" className="text-xs font-semibold text-gray-500 shrink-0">
                Status:
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                className="py-2 px-3 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>

          {/* Table Content / Loading / Error */}
          {isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-2xs space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                  <div className="h-8 bg-gray-200 rounded w-20" />
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-800">Error Loading Room Types</h3>
                <p className="text-sm text-red-700 mt-1">{fetchError}</p>
                <button
                  onClick={() => loadData(true)}
                  className="mt-3 text-xs font-semibold text-red-800 underline hover:text-red-900 inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry Loading
                </button>
              </div>
            </div>
          ) : filteredRoomTypes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <BedDouble className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">No Room Types Found</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                {searchQuery || statusFilter !== "all"
                  ? "No room types match your current search or filter criteria."
                  : "No room types are currently configured in the hotel catalog."}
              </p>
              {canManage && !searchQuery && statusFilter === "all" && (
                <button
                  onClick={handleOpenCreate}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                >
                  <Plus className="w-4 h-4" /> Add First Room Type
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4 sm:px-6">Room Type & Code</th>
                      <th className="py-3.5 px-4">Base Rate / Night</th>
                      <th className="py-3.5 px-4">Capacity & Bedding</th>
                      <th className="py-3.5 px-4">Amenities</th>
                      <th className="py-3.5 px-4 text-center">Rooms</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      {canManage && <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {filteredRoomTypes.map((rt) => {
                      const count = roomCountMap[rt.room_type_id] || 0;
                      const amenitiesList = Array.isArray(rt.amenities)
                        ? (rt.amenities as string[])
                        : [];

                      return (
                        <tr key={rt.room_type_id} className="hover:bg-gray-50/50 transition-colors">
                          {/* Name & Code */}
                          <td className="py-4 px-4 sm:px-6">
                            <div className="font-bold text-gray-900">{rt.name}</div>
                            <div className="text-xs text-gray-500 font-mono mt-0.5">
                              {rt.code}
                            </div>
                            {rt.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-1 max-w-xs">
                                {rt.description}
                              </p>
                            )}
                          </td>

                          {/* Base Price */}
                          <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">
                            ${parseFloat(rt.base_price || "0").toFixed(2)}
                          </td>

                          {/* Capacity & Bedding */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-gray-800">
                              <Users className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">{rt.max_occupancy} Guests</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {rt.bed_config}
                            </div>
                          </td>

                          {/* Amenities */}
                          <td className="py-4 px-4 max-w-xs">
                            {amenitiesList.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {amenitiesList.slice(0, 3).map((a, i) => (
                                  <span
                                    key={i}
                                    className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100"
                                  >
                                    {a}
                                  </span>
                                ))}
                                {amenitiesList.length > 3 && (
                                  <span
                                    className="inline-block px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600"
                                    title={amenitiesList.slice(3).join(", ")}
                                  >
                                    +{amenitiesList.length - 3}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">None specified</span>
                            )}
                          </td>

                          {/* Rooms Count */}
                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span className="inline-flex items-center justify-center min-w-6 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800">
                              {count}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            {rt.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle className="w-3 h-3" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                <XCircle className="w-3 h-3" /> Inactive
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          {canManage && (
                            <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleOpenEdit(rt)}
                                  className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="Edit Room Type"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleOpenDelete(rt)}
                                  className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                  title="Delete Room Type"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CREATE / EDIT MODAL */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => !isSaving && setIsModalOpen(false)}
                aria-hidden="true"
              />

              <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden transform transition-all p-6 sm:p-8">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <BedDouble className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {editingType ? "Edit Room Type" : "Create Room Type"}
                      </h3>
                    </div>
                    <button
                      onClick={() => !isSaving && setIsModalOpen(false)}
                      disabled={isSaving}
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

                  {/* Form */}
                  <form onSubmit={handleSaveRoomType} className="space-y-4">
                    {/* Name & Code */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={50}
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="e.g. Deluxe Suite"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.name && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Code <span className="text-gray-400 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          maxLength={20}
                          value={formCode}
                          onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                          placeholder="e.g. DLX_STE"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 uppercase"
                        />
                        {formErrors.code && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.code}</p>
                        )}
                      </div>
                    </div>

                    {/* Price, Occupancy, Bed Config */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Base Price ($) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={formBasePrice}
                          onChange={(e) => setFormBasePrice(e.target.value)}
                          placeholder="120.00"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.base_price && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.base_price}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Max Occupancy <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={formMaxOccupancy}
                          onChange={(e) => setFormMaxOccupancy(e.target.value)}
                          placeholder="2"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.max_occupancy && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.max_occupancy}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Bed Setup <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={60}
                          value={formBedConfig}
                          onChange={(e) => setFormBedConfig(e.target.value)}
                          placeholder="1 King Bed"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.bed_config && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.bed_config}</p>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        rows={2}
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Brief overview of room amenities, layout, or location..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Amenities Selection */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Amenities
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {COMMON_AMENITIES.map((amenity) => {
                          const isSelected = formAmenities.includes(amenity);
                          return (
                            <button
                              key={amenity}
                              type="button"
                              onClick={() => toggleAmenity(amenity)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                isSelected
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                              }`}
                            >
                              {isSelected ? "✓ " : "+ "}
                              {amenity}
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom amenity input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customAmenity}
                          onChange={(e) => setCustomAmenity(e.target.value)}
                          placeholder="Add custom amenity..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddCustomAmenity();
                            }
                          }}
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomAmenity}
                          className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg border border-gray-300 transition"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="form-is-active"
                        checked={formIsActive}
                        onChange={(e) => setFormIsActive(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="form-is-active" className="text-sm font-medium text-gray-800">
                        Active in Booking & Inventory Catalog
                      </label>
                    </div>

                    {/* Modal Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
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
                        <span>{editingType ? "Save Changes" : "Create Room Type"}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* DELETE CONFIRMATION MODAL */}
          {isDeleteModalOpen && typeToDelete && (
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
                      Delete Room Type
                    </h3>
                  </div>

                  <p className="text-sm text-gray-600">
                    Are you sure you want to delete{" "}
                    <span className="font-bold text-gray-900">{typeToDelete.name}</span> (
                    {typeToDelete.code})?
                  </p>

                  {(roomCountMap[typeToDelete.room_type_id] || 0) > 0 && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Notice: There are currently {roomCountMap[typeToDelete.room_type_id]} room(s)
                        assigned to this type. The backend referential integrity rule will reject
                        this deletion until those rooms are reassigned or removed.
                      </span>
                    </div>
                  )}

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
