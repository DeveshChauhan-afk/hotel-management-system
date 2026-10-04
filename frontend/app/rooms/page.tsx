"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import {
  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  Room,
  RoomFilters,
  CreateRoomDto,
  UpdateRoomDto,
  OperationalStatus,
  CleanlinessStatus,
} from "@/lib/roomsApi";
import { getRoomTypes, RoomType } from "@/lib/roomTypesApi";
import toast from "react-hot-toast";
import {
  DoorOpen,
  Plus,
  RefreshCw,
  Search,
  Filter,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Ban,
  Sparkles,
  Users,
  BedDouble,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  Eye,
  LayoutGrid,
  List,
  Layers,
  Cigarette,
  CigaretteOff,
} from "lucide-react";

export default function RoomsPage() {
  const { role } = useAuth();
  const canManage = role === "admin" || role === "manager";

  // Data states
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // View state: 'rack' (visual card grid) or 'table' (data table)
  const [viewMode, setViewMode] = useState<"rack" | "table">("rack");
  const [groupByFloor, setGroupByFloor] = useState<boolean>(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOperational, setFilterOperational] = useState<string>("");
  const [filterCleanliness, setFilterCleanliness] = useState<string>("");
  const [filterRoomTypeId, setFilterRoomTypeId] = useState<string>("");
  const [filterFloor, setFilterFloor] = useState<string>("");
  const [filterAvailableOnly, setFilterAvailableOnly] = useState<boolean>(false);

  // Detail Modal State
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isQuickUpdating, setIsQuickUpdating] = useState(false);

  // Create / Edit Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Form Fields
  const [formRoomNumber, setFormRoomNumber] = useState("");
  const [formRoomTypeId, setFormRoomTypeId] = useState<string>("");
  const [formFloor, setFormFloor] = useState("1");
  const [formOperationalStatus, setFormOperationalStatus] = useState<OperationalStatus>("available");
  const [formCleanlinessStatus, setFormCleanlinessStatus] = useState<CleanlinessStatus>("clean");
  const [formIsSmoking, setFormIsSmoking] = useState(false);
  const [formNotes, setFormNotes] = useState("");

  // Delete Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Map of room types by ID for quick lookup
  const roomTypeMap = useMemo(() => {
    const map = new Map<number, RoomType>();
    roomTypes.forEach((rt) => map.set(rt.room_type_id, rt));
    return map;
  }, [roomTypes]);

  // Available floors from rooms
  const floorList = useMemo(() => {
    const floors = new Set<number>();
    rooms.forEach((r) => floors.add(r.floor));
    return Array.from(floors).sort((a, b) => a - b);
  }, [rooms]);

  // Load rooms with current filters
  const loadRooms = useCallback(
    async (showToast = false) => {
      try {
        const filters: RoomFilters = {};
        if (filterOperational) filters.operational_status = filterOperational;
        if (filterCleanliness) filters.cleanliness_status = filterCleanliness;
        if (filterRoomTypeId) filters.room_type_id = parseInt(filterRoomTypeId, 10);
        if (filterFloor) filters.floor = parseInt(filterFloor, 10);
        if (filterAvailableOnly) filters.available = "true";

        const [roomsData, rtData] = await Promise.all([
          getRooms(filters),
          getRoomTypes(),
        ]);

        setRooms(roomsData);
        setRoomTypes(rtData);
        setFetchError(null);
        if (showToast) {
          toast.success("Rooms updated");
        }
      } catch (error: unknown) {
        console.error("Failed to load rooms:", error);
        const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
        const msg =
          axiosErr.response?.data?.error ||
          axiosErr.message ||
          "Failed to load rooms";
        setFetchError(msg);
        if (showToast) {
          toast.error(msg);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [filterOperational, filterCleanliness, filterRoomTypeId, filterFloor, filterAvailableOnly]
  );

  // Initial load
  useEffect(() => {
    let isMounted = true;

    Promise.all([getRooms(), getRoomTypes()])
      .then(([roomsData, rtData]) => {
        if (isMounted) {
          setRooms(roomsData);
          setRoomTypes(rtData);
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          console.error("Initial load rooms error:", error);
          const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
          setFetchError(
            axiosErr.response?.data?.error ||
              axiosErr.message ||
              "Failed to load room inventory"
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Filter change effect
  const handleApplyFilter = () => {
    setIsLoading(true);
    loadRooms();
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setFilterOperational("");
    setFilterCleanliness("");
    setFilterRoomTypeId("");
    setFilterFloor("");
    setFilterAvailableOnly(false);

    setIsLoading(true);
    Promise.all([getRooms(), getRoomTypes()])
      .then(([roomsData, rtData]) => {
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

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingRoom(null);
    setFormRoomNumber("");
    setFormRoomTypeId(roomTypes.length > 0 ? String(roomTypes[0].room_type_id) : "");
    setFormFloor("1");
    setFormOperationalStatus("available");
    setFormCleanlinessStatus("clean");
    setFormIsSmoking(false);
    setFormNotes("");
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (room: Room) => {
    setEditingRoom(room);
    setFormRoomNumber(room.room_number);
    setFormRoomTypeId(String(room.room_type_id || ""));
    setFormFloor(String(room.floor));
    setFormOperationalStatus(room.operational_status);
    setFormCleanlinessStatus(room.cleanliness_status);
    setFormIsSmoking(room.is_smoking);
    setFormNotes(room.notes || "");
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open Details Modal
  const handleOpenDetails = (room: Room) => {
    setSelectedRoom(room);
    setIsDetailModalOpen(true);
  };

  // Save Room (Create / Edit)
  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!formRoomNumber.trim()) {
      errors.room_number = "Room number is required";
    } else if (formRoomNumber.trim().length > 20) {
      errors.room_number = "Room number must not exceed 20 characters";
    }

    if (!formRoomTypeId) {
      errors.room_type_id = "Please select a room type";
    }

    const floorNum = parseInt(formFloor, 10);
    if (isNaN(floorNum) || floorNum < -2) {
      errors.floor = "Floor must be an integer of at least -2";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      if (editingRoom) {
        // Edit Room
        const payload: UpdateRoomDto = {
          room_number: formRoomNumber.trim(),
          room_type_id: parseInt(formRoomTypeId, 10),
          floor: floorNum,
          operational_status: formOperationalStatus,
          cleanliness_status: formCleanlinessStatus,
          is_smoking: formIsSmoking,
          notes: formNotes.trim() || null,
        };
        const res = await updateRoom(editingRoom.room_id, payload);
        toast.success(res.message || "Room updated successfully");
      } else {
        // Create Room
        const payload: CreateRoomDto = {
          room_number: formRoomNumber.trim(),
          room_type_id: parseInt(formRoomTypeId, 10),
          floor: floorNum,
          operational_status: formOperationalStatus,
          cleanliness_status: formCleanlinessStatus,
          is_smoking: formIsSmoking,
          notes: formNotes.trim() || null,
        };
        const res = await createRoom(payload);
        toast.success(res.message || "Room created successfully");
      }

      setIsFormModalOpen(false);
      loadRooms();
    } catch (error: unknown) {
      console.error("Save room error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to save room";
      toast.error(msg);
      setFormErrors((prev) => ({ ...prev, api: msg }));
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Status Update from Details Modal
  const handleQuickStatusChange = async (
    updates: { operational_status?: OperationalStatus; cleanliness_status?: CleanlinessStatus }
  ) => {
    if (!selectedRoom) return;

    setIsQuickUpdating(true);
    try {
      const res = await updateRoom(selectedRoom.room_id, updates);
      toast.success(res.message || "Room status updated");
      setSelectedRoom(res.room);
      loadRooms();
    } catch (error: unknown) {
      console.error("Quick status update error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to update room status";
      toast.error(msg);
    } finally {
      setIsQuickUpdating(false);
    }
  };

  // Delete Room
  const handleOpenDelete = (room: Room) => {
    setRoomToDelete(room);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!roomToDelete) return;

    setIsDeleting(true);
    try {
      const res = await deleteRoom(roomToDelete.room_id);
      toast.success(res.message || "Room deleted successfully");
      setIsDeleteModalOpen(false);
      setRoomToDelete(null);
      if (selectedRoom?.room_id === roomToDelete.room_id) {
        setIsDetailModalOpen(false);
      }
      loadRooms();
    } catch (error: unknown) {
      console.error("Delete room error:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to delete room";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered rooms in memory for text search
  const visibleRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        room.room_number.toLowerCase().includes(q) ||
        (room.room_type && room.room_type.toLowerCase().includes(q)) ||
        (room.notes && room.notes.toLowerCase().includes(q))
      );
    });
  }, [rooms, searchQuery]);

  // Group rooms by floor
  const roomsByFloor = useMemo(() => {
    const map = new Map<number, Room[]>();
    visibleRooms.forEach((r) => {
      const list = map.get(r.floor) || [];
      list.push(r);
      map.set(r.floor, list);
    });
    // Sort floors ascending
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [visibleRooms]);

  // Status Badge Renderers
  const renderOperationalBadge = (status: OperationalStatus) => {
    switch (status) {
      case "available":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Available
          </span>
        );
      case "occupied":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Users className="w-3 h-3 text-blue-500" /> Occupied
          </span>
        );
      case "under_maintenance":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300">
            <Wrench className="w-3 h-3 text-amber-600" /> Maintenance
          </span>
        );
      case "out_of_service":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <Ban className="w-3 h-3 text-rose-500" /> Out of Service
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  const renderCleanlinessBadge = (status: CleanlinessStatus) => {
    switch (status) {
      case "clean":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <Sparkles className="w-3 h-3 text-teal-500" /> Clean
          </span>
        );
      case "dirty":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> Dirty
          </span>
        );
      case "cleaning_in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 animate-pulse">
            <RefreshCw className="w-3 h-3 text-sky-500 animate-spin" /> In Progress
          </span>
        );
      case "inspecting":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Eye className="w-3 h-3 text-purple-500" /> Inspecting
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "manager", "receptionist", "housekeeper", "maintenance"]}>
      <AppShell title="Room Rack">
        <div className="space-y-6">
          {/* Top Overview & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <DoorOpen className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                  Room Rack & Inventory
                </h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Live visualization of room availability, operational status, and housekeeping cleanliness.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* View mode toggle */}
              <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-gray-50">
                <button
                  onClick={() => setViewMode("rack")}
                  className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition ${
                    viewMode === "rack"
                      ? "bg-white text-blue-700 shadow-2xs"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                  title="Visual Room Rack"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">Rack</span>
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition ${
                    viewMode === "table"
                      ? "bg-white text-blue-700 shadow-2xs"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                  title="Table View"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">Table</span>
                </button>
              </div>

              {/* Group by floor toggle (only in rack view) */}
              {viewMode === "rack" && (
                <button
                  onClick={() => setGroupByFloor(!groupByFloor)}
                  className={`inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border transition ${
                    groupByFloor
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                  title="Group cards by floor"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">By Floor</span>
                </button>
              )}

              {/* Refresh */}
              <button
                onClick={() => loadRooms(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition shadow-2xs"
                title="Refresh rooms"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {/* Create Room button */}
              {canManage && (
                <button
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Room</span>
                </button>
              )}
            </div>
          </div>

          {/* Filtering Bar */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5" /> Filter Room Rack
              </div>
              <button
                onClick={handleResetFilters}
                className="text-xs font-semibold text-gray-500 hover:text-blue-600 inline-flex items-center gap-1 transition"
              >
                <RotateCcw className="w-3 h-3" /> Reset Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Text Search */}
              <div className="lg:col-span-2 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Quick search room # or type..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs bg-gray-50/50 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Operational Status */}
              <div>
                <select
                  value={filterOperational}
                  onChange={(e) => setFilterOperational(e.target.value)}
                  className="w-full py-2 px-2.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Operational</option>
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                  <option value="under_maintenance">Maintenance</option>
                  <option value="out_of_service">Out of Service</option>
                </select>
              </div>

              {/* Cleanliness Status */}
              <div>
                <select
                  value={filterCleanliness}
                  onChange={(e) => setFilterCleanliness(e.target.value)}
                  className="w-full py-2 px-2.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Cleanliness</option>
                  <option value="clean">Clean</option>
                  <option value="dirty">Dirty</option>
                  <option value="cleaning_in_progress">Cleaning In Progress</option>
                  <option value="inspecting">Inspecting</option>
                </select>
              </div>

              {/* Room Type */}
              <div>
                <select
                  value={filterRoomTypeId}
                  onChange={(e) => setFilterRoomTypeId(e.target.value)}
                  className="w-full py-2 px-2.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 truncate"
                >
                  <option value="">All Room Types</option>
                  {roomTypes.map((rt) => (
                    <option key={rt.room_type_id} value={rt.room_type_id}>
                      {rt.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Floor */}
              <div>
                <select
                  value={filterFloor}
                  onChange={(e) => setFilterFloor(e.target.value)}
                  className="w-full py-2 px-2.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Floors</option>
                  {floorList.map((f) => (
                    <option key={f} value={f}>
                      Floor {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bottom filter options & apply */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-gray-100 gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterAvailableOnly}
                  onChange={(e) => setFilterAvailableOnly(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-xs font-semibold text-gray-700">
                  Ready for Check-in Only (Operational Available + Clean)
                </span>
              </label>

              <button
                onClick={handleApplyFilter}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Apply Backend Filters</span>
              </button>
            </div>
          </div>

          {/* Room Rack Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs animate-pulse space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <div className="h-6 bg-gray-200 rounded w-16" />
                    <div className="h-4 bg-gray-200 rounded w-20" />
                  </div>
                  <div className="h-4 bg-gray-100 rounded w-32" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-5 bg-gray-200 rounded-full w-20" />
                    <div className="h-5 bg-gray-200 rounded-full w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-800">Error Loading Room Rack</h3>
                <p className="text-sm text-red-700 mt-1">{fetchError}</p>
                <button
                  onClick={() => loadRooms(true)}
                  className="mt-3 text-xs font-semibold text-red-800 underline hover:text-red-900 inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry Loading
                </button>
              </div>
            </div>
          ) : visibleRooms.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <DoorOpen className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">No Rooms Found</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                No rooms match the selected filters or search keyword. Try clearing filters or creating a new room.
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  Reset All Filters
                </button>
                {canManage && (
                  <button
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Room
                  </button>
                )}
              </div>
            </div>
          ) : viewMode === "rack" ? (
            /* Visual Room Rack (Card Grid) */
            <div className="space-y-8">
              {(groupByFloor ? roomsByFloor : [[null, visibleRooms]] as [number | null, Room[]][]).map(
                ([floorNum, floorRooms]) => (
                  <div key={floorNum !== null ? `floor-${floorNum}` : "all-rooms"} className="space-y-3">
                    {floorNum !== null && (
                      <div className="flex items-center gap-2 pb-1 border-b border-gray-200">
                        <span className="text-sm font-bold text-gray-900 tracking-tight">
                          Floor {floorNum}
                        </span>
                        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {floorRooms.length} room{floorRooms.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {floorRooms.map((room) => {
                        const matchedType = room.room_type_id
                          ? roomTypeMap.get(room.room_type_id)
                          : null;
                        const price = matchedType
                          ? `$${parseFloat(matchedType.base_price).toFixed(2)}`
                          : null;

                        // Border styling by operational state
                        let borderAccent = "border-l-4 border-gray-300";
                        if (room.operational_status === "occupied") {
                          borderAccent = "border-l-4 border-blue-500";
                        } else if (room.operational_status === "under_maintenance") {
                          borderAccent = "border-l-4 border-amber-500";
                        } else if (room.operational_status === "out_of_service") {
                          borderAccent = "border-l-4 border-rose-500";
                        } else if (room.is_available) {
                          borderAccent = "border-l-4 border-emerald-500";
                        } else if (room.cleanliness_status === "dirty") {
                          borderAccent = "border-l-4 border-amber-400";
                        }

                        return (
                          <div
                            key={room.room_id}
                            onClick={() => handleOpenDetails(room)}
                            className={`bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs hover:shadow-md transition cursor-pointer flex flex-col justify-between ${borderAccent}`}
                          >
                            <div>
                              {/* Top row: Room Number & Overall Ready status */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <span className="text-2xl font-black text-gray-900 tracking-tight">
                                    {room.room_number}
                                  </span>
                                  <span className="block text-[11px] font-semibold text-gray-400">
                                    Floor {room.floor}
                                  </span>
                                </div>

                                <div className="text-right">
                                  {room.is_available ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3" /> Ready
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                                      Unavailable
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Room Type & Rate */}
                              <div className="flex items-center justify-between text-xs text-gray-600 mt-2 pb-3 border-b border-gray-100">
                                <div className="flex items-center gap-1 font-medium truncate">
                                  <BedDouble className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                  <span className="truncate">{room.room_type || "Standard"}</span>
                                </div>
                                {price && (
                                  <span className="font-semibold text-gray-900 shrink-0 ml-2">
                                    {price}
                                  </span>
                                )}
                              </div>

                              {/* Independent State Badges */}
                              <div className="pt-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-gray-400 font-medium">Ops:</span>
                                  {renderOperationalBadge(room.operational_status)}
                                </div>

                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-gray-400 font-medium">Clean:</span>
                                  {renderCleanlinessBadge(room.cleanliness_status)}
                                </div>
                              </div>
                            </div>

                            {/* Card Footer info */}
                            <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100 text-[11px] text-gray-400">
                              <span className="flex items-center gap-1">
                                {room.is_smoking ? (
                                  <span className="inline-flex items-center gap-0.5 text-amber-700">
                                    <Cigarette className="w-3 h-3" /> Smoking
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-gray-500">
                                    <CigaretteOff className="w-3 h-3" /> Non-Smoking
                                  </span>
                                )}
                              </span>

                              <span className="text-blue-600 font-semibold hover:underline">
                                Details →
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            /* Table View */
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4 sm:px-6">Room #</th>
                      <th className="py-3.5 px-4">Floor</th>
                      <th className="py-3.5 px-4">Room Type</th>
                      <th className="py-3.5 px-4">Base Rate</th>
                      <th className="py-3.5 px-4">Operational</th>
                      <th className="py-3.5 px-4">Cleanliness</th>
                      <th className="py-3.5 px-4">Availability</th>
                      <th className="py-3.5 px-4 text-center">Smoking</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {visibleRooms.map((room) => {
                      const matchedType = room.room_type_id
                        ? roomTypeMap.get(room.room_type_id)
                        : null;
                      const price = matchedType
                        ? `$${parseFloat(matchedType.base_price).toFixed(2)}`
                        : "-";

                      return (
                        <tr key={room.room_id} className="hover:bg-gray-50/50 transition">
                          <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-900">
                            {room.room_number}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-gray-600">
                            Floor {room.floor}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-gray-800">
                            {room.room_type || "-"}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-gray-900 whitespace-nowrap">
                            {price}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {renderOperationalBadge(room.operational_status)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {renderCleanlinessBadge(room.cleanliness_status)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {room.is_available ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                Not Ready
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center text-xs text-gray-500 whitespace-nowrap">
                            {room.is_smoking ? "Yes" : "No"}
                          </td>
                          <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenDetails(room)}
                                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {canManage && (
                                <>
                                  <button
                                    onClick={() => handleOpenEdit(room)}
                                    className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                    title="Edit Room"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleOpenDelete(room)}
                                    className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                    title="Delete Room"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
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

          {/* ROOM DETAILS & QUICK STATUS DRAWER / MODAL */}
          {isDetailModalOpen && selectedRoom && (
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
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl">
                        {selectedRoom.room_number}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">
                          Room {selectedRoom.room_number}
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">
                          {selectedRoom.room_type || "Standard Room"} • Floor {selectedRoom.floor}
                        </p>
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

                  {/* Summary Badges */}
                  <div className="grid grid-cols-2 gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div>
                      <span className="block text-[11px] font-semibold text-gray-400 uppercase">
                        Operational Status
                      </span>
                      <div className="mt-1">
                        {renderOperationalBadge(selectedRoom.operational_status)}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-semibold text-gray-400 uppercase">
                        Cleanliness Status
                      </span>
                      <div className="mt-1">
                        {renderCleanlinessBadge(selectedRoom.cleanliness_status)}
                      </div>
                    </div>
                  </div>

                  {/* Overall Availability Callout */}
                  <div
                    className={`p-3.5 rounded-xl border mb-6 flex items-start gap-2.5 ${
                      selectedRoom.is_available
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}
                  >
                    {selectedRoom.is_available ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs">
                      <p className="font-bold">
                        {selectedRoom.is_available
                          ? "Ready for Immediate Guest Assignment"
                          : "Room Currently Not Assignable"}
                      </p>
                      <p className="mt-0.5 text-gray-600">
                        {selectedRoom.operational_status === "occupied"
                          ? "Guest is currently checked-in. Checkout required to release room."
                          : selectedRoom.operational_status === "under_maintenance"
                          ? "Active maintenance issue blocks occupancy."
                          : selectedRoom.operational_status === "out_of_service"
                          ? "Room marked out of service for administration."
                          : selectedRoom.cleanliness_status !== "clean"
                          ? "Housekeeping cleaning required before check-in."
                          : "Room is fully prepared."}
                      </p>
                    </div>
                  </div>

                  {/* Room Attributes */}
                  <div className="space-y-2.5 text-xs text-gray-600 mb-6 border-b border-gray-200 pb-6">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Base Price / Night:</span>
                      <span className="font-semibold text-gray-900">
                        {selectedRoom.room_type_id && roomTypeMap.get(selectedRoom.room_type_id)
                          ? `$${parseFloat(roomTypeMap.get(selectedRoom.room_type_id)!.base_price).toFixed(2)}`
                          : "Standard Rate"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Smoking Policy:</span>
                      <span className="font-medium text-gray-800">
                        {selectedRoom.is_smoking ? "Smoking Allowed" : "Non-Smoking"}
                      </span>
                    </div>
                    {selectedRoom.notes && (
                      <div className="pt-2">
                        <span className="block text-gray-400 mb-1">Notes:</span>
                        <p className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                          {selectedRoom.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* QUICK STATUS ACTIONS (Staff & Manager) */}
                  <div className="space-y-4 mb-6">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Quick Status Management
                    </h4>

                    {/* Housekeeping Updates */}
                    <div>
                      <span className="block text-[11px] text-gray-400 mb-1.5 font-medium">
                        Housekeeping & Cleanliness:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleQuickStatusChange({ cleanliness_status: "clean" })}
                          disabled={isQuickUpdating || selectedRoom.cleanliness_status === "clean"}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 transition"
                        >
                          Mark Clean
                        </button>
                        <button
                          onClick={() => handleQuickStatusChange({ cleanliness_status: "dirty" })}
                          disabled={isQuickUpdating || selectedRoom.cleanliness_status === "dirty"}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 disabled:opacity-50 transition"
                        >
                          Mark Dirty
                        </button>
                        <button
                          onClick={() => handleQuickStatusChange({ cleanliness_status: "cleaning_in_progress" })}
                          disabled={isQuickUpdating || selectedRoom.cleanliness_status === "cleaning_in_progress"}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 disabled:opacity-50 transition"
                        >
                          Start Cleaning
                        </button>
                      </div>
                    </div>

                    {/* Manager / Admin Operational Updates */}
                    {canManage && (
                      <div>
                        <span className="block text-[11px] text-gray-400 mb-1.5 font-medium">
                          Operational Condition:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleQuickStatusChange({ operational_status: "available" })}
                            disabled={
                              isQuickUpdating ||
                              selectedRoom.operational_status === "available" ||
                              selectedRoom.operational_status === "occupied"
                            }
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition"
                            title={
                              selectedRoom.operational_status === "occupied"
                                ? "Occupied room cannot be marked available without checkout"
                                : "Mark as available"
                            }
                          >
                            Set Available
                          </button>
                          <button
                            onClick={() => handleQuickStatusChange({ operational_status: "under_maintenance" })}
                            disabled={isQuickUpdating || selectedRoom.operational_status === "under_maintenance"}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 disabled:opacity-50 transition"
                          >
                            Send to Maintenance
                          </button>
                          <button
                            onClick={() => handleQuickStatusChange({ operational_status: "out_of_service" })}
                            disabled={isQuickUpdating || selectedRoom.operational_status === "out_of_service"}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition"
                          >
                            Out of Service
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Modal Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsDetailModalOpen(false);
                            handleOpenEdit(selectedRoom);
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition inline-flex items-center gap-1.5"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Full Edit
                        </button>
                        <button
                          onClick={() => handleOpenDelete(selectedRoom)}
                          className="px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    ) : (
                      <div />
                    )}

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

          {/* CREATE / FULL EDIT MODAL */}
          {isFormModalOpen && (
            <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => !isSaving && setIsFormModalOpen(false)}
                aria-hidden="true"
              />

              <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <DoorOpen className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {editingRoom ? `Edit Room ${editingRoom.room_number}` : "Add New Room"}
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

                  <form onSubmit={handleSaveRoom} className="space-y-4">
                    {/* Room Number & Floor */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Room Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={20}
                          value={formRoomNumber}
                          onChange={(e) => setFormRoomNumber(e.target.value)}
                          placeholder="e.g. 101, 204B"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-bold"
                        />
                        {formErrors.room_number && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.room_number}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Floor <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min="-2"
                          value={formFloor}
                          onChange={(e) => setFormFloor(e.target.value)}
                          placeholder="1"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.floor && (
                          <p className="text-xs text-red-600 mt-1">{formErrors.floor}</p>
                        )}
                      </div>
                    </div>

                    {/* Room Type */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Room Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formRoomTypeId}
                        onChange={(e) => setFormRoomTypeId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select a Room Type...</option>
                        {roomTypes.map((rt) => (
                          <option key={rt.room_type_id} value={rt.room_type_id}>
                            {rt.name} (${parseFloat(rt.base_price).toFixed(2)}/night, {rt.max_occupancy} guests)
                          </option>
                        ))}
                      </select>
                      {formErrors.room_type_id && (
                        <p className="text-xs text-red-600 mt-1">{formErrors.room_type_id}</p>
                      )}
                    </div>

                    {/* Operational & Cleanliness Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Operational Status <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formOperationalStatus}
                          onChange={(e) => setFormOperationalStatus(e.target.value as OperationalStatus)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="available">Available</option>
                          {editingRoom && <option value="occupied">Occupied</option>}
                          <option value="under_maintenance">Under Maintenance</option>
                          <option value="out_of_service">Out of Service</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Cleanliness Status <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formCleanlinessStatus}
                          onChange={(e) => setFormCleanlinessStatus(e.target.value as CleanlinessStatus)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="clean">Clean</option>
                          <option value="dirty">Dirty</option>
                          <option value="cleaning_in_progress">Cleaning In Progress</option>
                          <option value="inspecting">Inspecting</option>
                        </select>
                      </div>
                    </div>

                    {/* Smoking Policy */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="form-is-smoking"
                        checked={formIsSmoking}
                        onChange={(e) => setFormIsSmoking(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="form-is-smoking" className="text-sm font-medium text-gray-800">
                        Designated Smoking Room
                      </label>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Operational Notes
                      </label>
                      <textarea
                        rows={2}
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="Special location details, connecting room notes, or inventory remarks..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Actions */}
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
                        <span>{editingRoom ? "Save Room Specs" : "Create Room"}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* DELETE ROOM MODAL */}
          {isDeleteModalOpen && roomToDelete && (
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
                      Delete Room {roomToDelete.room_number}
                    </h3>
                  </div>

                  <p className="text-sm text-gray-600">
                    Are you sure you want to delete Room{" "}
                    <span className="font-bold text-gray-900">{roomToDelete.room_number}</span>?
                  </p>

                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Notice: If this room has active or historical bookings, housekeeping logs, or
                      maintenance tickets, the backend database constraint will reject the deletion.
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
