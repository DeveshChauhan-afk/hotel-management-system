"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import {
  getMaintenanceRecords,
  getMaintenanceRecord,
  createMaintenanceWorkOrder,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
  MaintenanceRecord,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceFilters,
  CreateMaintenanceWorkOrderRequest,
  UpdateMaintenanceRecordRequest,
} from "@/lib/maintenanceApi";
import { getRooms, Room } from "@/lib/roomsApi";
import toast from "react-hot-toast";
import {
  Wrench,
  Plus,
  Filter,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DoorOpen,
  User,
  Trash2,
  Eye,
  Edit3,
  ShieldAlert,
  Check,
  Lock,
  Unlock,
} from "lucide-react";

const CATEGORY_CONFIG: Record<
  MaintenanceCategory,
  { label: string; badge: string }
> = {
  plumbing: {
    label: "Plumbing",
    badge: "bg-sky-50 text-sky-700 border-sky-200",
  },
  electrical: {
    label: "Electrical",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  hvac: {
    label: "HVAC",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
  },
  furniture: {
    label: "Furniture",
    badge: "bg-orange-50 text-orange-700 border-orange-200",
  },
  appliance: {
    label: "Appliance",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
  },
  structural: {
    label: "Structural",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
  },
  other: {
    label: "Other",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
  },
};

const PRIORITY_CONFIG: Record<
  MaintenancePriority,
  { label: string; badge: string }
> = {
  low: {
    label: "Low",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
  },
  medium: {
    label: "Medium",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
  },
  high: {
    label: "High",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  critical: {
    label: "Critical",
    badge: "bg-red-100 text-red-800 border-red-200 font-semibold",
  },
};

const STATUS_CONFIG: Record<
  MaintenanceStatus,
  { label: string; badge: string }
> = {
  reported: {
    label: "Reported",
    badge: "bg-slate-100 text-slate-800 border-slate-200",
  },
  scheduled: {
    label: "Scheduled",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-200",
  },
  in_progress: {
    label: "In Progress",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  completed: {
    label: "Completed",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-gray-100 text-gray-700 border-gray-300",
  },
};

const formatDate = (isoString: string | null | undefined): string => {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
};

const formatDateTime = (isoString: string | null | undefined): string => {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
};

const formatCurrency = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined || val === "") return "$0.00";
  const num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
};

const getErrorMessage = (err: unknown, defaultMsg: string): string => {
  const axiosErr = err as {
    response?: { data?: { error?: string; msg?: string }; status?: number };
    message?: string;
  };
  if (axiosErr.response?.status === 403) {
    return "Access Denied: You do not have permission for this maintenance operation.";
  }
  return (
    axiosErr.response?.data?.error ||
    axiosErr.response?.data?.msg ||
    axiosErr.message ||
    defaultMsg
  );
};

export default function MaintenancePage() {
  const { role } = useAuth();
  const normalizedRole = (role || "").toLowerCase();

  // Role permissions:
  // Allowed page roles: admin, manager, receptionist, maintenance (housekeeper denied by ProtectedRoute)
  // Create work order: admin, manager, receptionist
  // Update/resolve work order: admin, manager, maintenance
  // Delete work order: admin, manager
  const canCreate = ["admin", "manager", "receptionist"].includes(normalizedRole);
  const canUpdate = ["admin", "manager", "maintenance"].includes(normalizedRole);
  const canDelete = ["admin", "manager"].includes(normalizedRole);
  const isAdminOrManager = ["admin", "manager"].includes(normalizedRole);

  // Data states
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [roomIdFilter, setRoomIdFilter] = useState<string>("");
  const [blocksOccupancyFilter, setBlocksOccupancyFilter] = useState<string>("");

  // Drawer / View / Update states
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoadingDrawer, setIsLoadingDrawer] = useState(false);
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);

  // Drawer edit form fields
  const [drawerStatus, setDrawerStatus] = useState<MaintenanceStatus>("reported");
  const [drawerActualCost, setDrawerActualCost] = useState("0.00");
  const [drawerResolutionNotes, setDrawerResolutionNotes] = useState("");
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerDescription, setDrawerDescription] = useState("");
  const [drawerCategory, setDrawerCategory] = useState<MaintenanceCategory>("plumbing");
  const [drawerPriority, setDrawerPriority] = useState<MaintenancePriority>("medium");
  const [drawerBlocksOccupancy, setDrawerBlocksOccupancy] = useState(false);
  const [drawerAssignedStaffId, setDrawerAssignedStaffId] = useState("");
  const [drawerEstimatedCost, setDrawerEstimatedCost] = useState("0.00");

  // Create Work Order Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createForm, setCreateForm] = useState<{
    title: string;
    description: string;
    category: MaintenanceCategory;
    priority: MaintenancePriority;
    room_id: string;
    blocks_room_occupancy: boolean;
    assigned_to_user_id: string;
    estimated_cost: string;
  }>({
    title: "",
    description: "",
    category: "plumbing",
    priority: "medium",
    room_id: "",
    blocks_room_occupancy: false,
    assigned_to_user_id: "",
    estimated_cost: "0.00",
  });

  // Delete Confirmation state
  const [recordToDelete, setRecordToDelete] = useState<MaintenanceRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Quick action state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Rooms map for fast lookup
  const roomsMap = useMemo(() => {
    const map = new Map<number, Room>();
    rooms.forEach((r) => map.set(r.room_id, r));
    return map;
  }, [rooms]);

  // Load rooms for dropdown selection and status verification
  const loadRooms = useCallback(async () => {
    try {
      const data = await getRooms();
      setRooms(data);
    } catch {
      // Room load failures should not block maintenance workspace
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    getRooms()
      .then((data) => {
        if (isMounted) setRooms(data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Load maintenance records with active filters
  const loadRecords = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setIsLoading(true);
      }
      try {
        const filters: MaintenanceFilters = {};
        if (statusFilter) filters.status = statusFilter;
        if (priorityFilter) filters.priority = priorityFilter;
        if (categoryFilter) filters.category = categoryFilter;
        if (roomIdFilter) filters.room_id = parseInt(roomIdFilter, 10);
        if (blocksOccupancyFilter) {
          filters.blocks_room_occupancy = blocksOccupancyFilter === "true";
        }

        const data = await getMaintenanceRecords(filters);
        setRecords(data);
        setFetchError(null);
        if (isManualRefresh) {
          toast.success("Maintenance records refreshed");
        }
      } catch (err: unknown) {
        const msg = getErrorMessage(err, "Failed to load maintenance records");
        setFetchError(msg);
        if (isManualRefresh) {
          toast.error(msg);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter, priorityFilter, categoryFilter, roomIdFilter, blocksOccupancyFilter]
  );

  useEffect(() => {
    let isMounted = true;
    const filters: MaintenanceFilters = {};
    if (statusFilter) filters.status = statusFilter;
    if (priorityFilter) filters.priority = priorityFilter;
    if (categoryFilter) filters.category = categoryFilter;
    if (roomIdFilter) filters.room_id = parseInt(roomIdFilter, 10);
    if (blocksOccupancyFilter) {
      filters.blocks_room_occupancy = blocksOccupancyFilter === "true";
    }

    getMaintenanceRecords(filters)
      .then((data) => {
        if (isMounted) {
          setRecords(data);
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg = getErrorMessage(err, "Failed to load maintenance records");
          setFetchError(msg);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [statusFilter, priorityFilter, categoryFilter, roomIdFilter, blocksOccupancyFilter]);

  // KPI Summary Calculations
  const summaryStats = useMemo(() => {
    let reported = 0;
    let inProgress = 0;
    let completed = 0;
    let roomBlocked = 0;

    records.forEach((r) => {
      if (r.status === "reported") reported++;
      else if (r.status === "in_progress") inProgress++;
      else if (r.status === "completed") completed++;

      if (r.blocks_room_occupancy && r.status !== "completed" && r.status !== "cancelled") {
        roomBlocked++;
      }
    });

    return { reported, inProgress, completed, roomBlocked };
  }, [records]);

  // Reset all filters
  const handleResetFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setCategoryFilter("");
    setRoomIdFilter("");
    setBlocksOccupancyFilter("");
  };

  // Populate drawer form from record
  const populateDrawerFields = (rec: MaintenanceRecord) => {
    setDrawerStatus(rec.status);
    setDrawerActualCost(rec.actual_cost || "0.00");
    setDrawerResolutionNotes(rec.resolution_notes || "");
    setDrawerTitle(rec.title);
    setDrawerDescription(rec.description);
    setDrawerCategory(rec.category);
    setDrawerPriority(rec.priority);
    setDrawerBlocksOccupancy(rec.blocks_room_occupancy);
    setDrawerAssignedStaffId(
      rec.assigned_to_user_id ? String(rec.assigned_to_user_id) : ""
    );
    setDrawerEstimatedCost(rec.estimated_cost || "0.00");
  };

  // Open Details/Resolution Drawer with authoritative fresh GET /maintenance/<id>
  const handleOpenDrawer = async (rec: MaintenanceRecord) => {
    setSelectedRecord(rec);
    populateDrawerFields(rec);
    setIsDrawerOpen(true);
    setIsLoadingDrawer(true);

    try {
      const detailed = await getMaintenanceRecord(rec.maintenance_id);
      setSelectedRecord(detailed);
      populateDrawerFields(detailed);
    } catch {
      toast.error("Failed to load authoritative record details");
    } finally {
      setIsLoadingDrawer(false);
    }
  };

  // Save changes in Details/Resolution Drawer
  const handleSaveDrawer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    if (!canUpdate) {
      toast.error("Your role is not permitted to update maintenance work orders.");
      return;
    }

    // Validate actual cost
    const parsedActual = parseFloat(drawerActualCost);
    if (isNaN(parsedActual) || parsedActual < 0) {
      toast.error("Actual cost must be a valid non-negative number.");
      return;
    }

    setIsSavingDrawer(true);
    try {
      const payload: UpdateMaintenanceRecordRequest = {
        status: drawerStatus,
        actual_cost: drawerActualCost.trim() || "0.00",
        resolution_notes: drawerResolutionNotes.trim() || null,
      };

      // Admin & Manager can update full work order attributes
      if (isAdminOrManager) {
        if (!drawerTitle.trim()) {
          toast.error("Title cannot be empty.");
          setIsSavingDrawer(false);
          return;
        }
        if (drawerTitle.trim().length > 150) {
          toast.error("Title must not exceed 150 characters.");
          setIsSavingDrawer(false);
          return;
        }
        if (!drawerDescription.trim()) {
          toast.error("Description cannot be empty.");
          setIsSavingDrawer(false);
          return;
        }

        const parsedEst = parseFloat(drawerEstimatedCost);
        if (isNaN(parsedEst) || parsedEst < 0) {
          toast.error("Estimated cost must be a valid non-negative number.");
          setIsSavingDrawer(false);
          return;
        }

        payload.title = drawerTitle.trim();
        payload.description = drawerDescription.trim();
        payload.category = drawerCategory;
        payload.priority = drawerPriority;
        payload.blocks_room_occupancy = drawerBlocksOccupancy;
        payload.assigned_to_user_id = drawerAssignedStaffId.trim()
          ? parseInt(drawerAssignedStaffId.trim(), 10)
          : null;
        payload.estimated_cost = drawerEstimatedCost.trim() || "0.00";
      }

      const res = await updateMaintenanceRecord(selectedRecord.maintenance_id, payload);
      toast.success(res.message || "Maintenance record updated successfully");
      setSelectedRecord(res.maintenance);
      populateDrawerFields(res.maintenance);

      // Refresh list and room status authoritatively from backend
      await loadRecords();
      await loadRooms();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to update maintenance record");
      toast.error(msg);
    } finally {
      setIsSavingDrawer(false);
    }
  };

  // Quick status transition button
  const handleQuickTransition = async (
    targetStatus: MaintenanceStatus,
    targetRecord: MaintenanceRecord
  ) => {
    if (!canUpdate) {
      toast.error("Your role is not permitted to update work order status.");
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const payload: UpdateMaintenanceRecordRequest = {
        status: targetStatus,
      };
      if (targetStatus === "completed" && drawerResolutionNotes.trim()) {
        payload.resolution_notes = drawerResolutionNotes.trim();
      }

      const res = await updateMaintenanceRecord(targetRecord.maintenance_id, payload);
      toast.success(`Work order status updated to ${STATUS_CONFIG[targetStatus].label}`);

      if (selectedRecord && selectedRecord.maintenance_id === targetRecord.maintenance_id) {
        setSelectedRecord(res.maintenance);
        populateDrawerFields(res.maintenance);
      }

      await loadRecords();
      await loadRooms();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to transition status");
      toast.error(msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Create Work Order submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canCreate) {
      toast.error("Your role is not permitted to create maintenance work orders.");
      return;
    }

    if (!createForm.title.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (createForm.title.trim().length > 150) {
      toast.error("Title must not exceed 150 characters.");
      return;
    }
    if (!createForm.description.trim()) {
      toast.error("Description is required.");
      return;
    }

    const estCostNum = parseFloat(createForm.estimated_cost);
    if (isNaN(estCostNum) || estCostNum < 0) {
      toast.error("Estimated cost must be a valid non-negative number.");
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const payload: CreateMaintenanceWorkOrderRequest = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        category: createForm.category,
        priority: createForm.priority,
        blocks_room_occupancy: createForm.blocks_room_occupancy,
        estimated_cost: createForm.estimated_cost.trim() || "0.00",
      };

      if (createForm.room_id.trim()) {
        payload.room_id = parseInt(createForm.room_id.trim(), 10);
      }

      if (createForm.assigned_to_user_id.trim()) {
        payload.assigned_to_user_id = parseInt(createForm.assigned_to_user_id.trim(), 10);
      }

      const res = await createMaintenanceWorkOrder(payload);
      toast.success(res.message || "Maintenance work order created successfully");

      // Reset form & close
      setCreateForm({
        title: "",
        description: "",
        category: "plumbing",
        priority: "medium",
        room_id: "",
        blocks_room_occupancy: false,
        assigned_to_user_id: "",
        estimated_cost: "0.00",
      });
      setIsCreateModalOpen(false);

      // Refresh data
      await loadRecords();
      await loadRooms();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to create maintenance work order");
      toast.error(msg);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Delete Work Order
  const handleDeleteConfirm = async () => {
    if (!recordToDelete) return;
    if (!canDelete) {
      toast.error("Your role is not permitted to delete maintenance records.");
      return;
    }

    setIsDeleting(true);
    try {
      const res = await deleteMaintenanceRecord(recordToDelete.maintenance_id);
      toast.success(res.message || "Maintenance record deleted successfully");

      if (selectedRecord && selectedRecord.maintenance_id === recordToDelete.maintenance_id) {
        setIsDrawerOpen(false);
        setSelectedRecord(null);
      }

      setRecordToDelete(null);
      await loadRecords();
      await loadRooms();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to delete maintenance record");
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "manager", "receptionist", "maintenance"]}>
      <AppShell title="Maintenance Workspace">
        <div className="space-y-6 pb-12">
          {/* Top Header & Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Wrench className="w-6 h-6 text-blue-600" />
                Work Orders & Facility Repairs
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Track issues, schedule repairs, manage costs, and coordinate room occupancy blocks.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadRecords(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-2xs transition disabled:opacity-50"
                title="Refresh Work Orders"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
                <span>Refresh</span>
              </button>

              {canCreate && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Work Order</span>
                </button>
              )}
            </div>
          </div>

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Reported */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Reported
                </p>
                <h3 className="text-2xl font-bold text-slate-800 mt-1">
                  {isLoading ? "—" : summaryStats.reported}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Awaiting assignment/scheduling</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            {/* In Progress */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  In Progress
                </p>
                <h3 className="text-2xl font-bold text-amber-600 mt-1">
                  {isLoading ? "—" : summaryStats.inProgress}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Active ongoing repairs</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Wrench className="w-6 h-6" />
              </div>
            </div>

            {/* Completed */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Completed
                </p>
                <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                  {isLoading ? "—" : summaryStats.completed}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Repairs resolved & verified</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            {/* Room-blocked work orders */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Room Blocking
                </p>
                <h3 className="text-2xl font-bold text-rose-600 mt-1">
                  {isLoading ? "—" : summaryStats.roomBlocked}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Rooms blocked for occupancy</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                Filters
              </span>
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Status Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs font-medium bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                >
                  <option value="">All Statuses</option>
                  <option value="reported">Reported</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Priority</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full text-xs font-medium bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                >
                  <option value="">All Priorities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full text-xs font-medium bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                >
                  <option value="">All Categories</option>
                  <option value="plumbing">Plumbing</option>
                  <option value="electrical">Electrical</option>
                  <option value="hvac">HVAC</option>
                  <option value="furniture">Furniture</option>
                  <option value="appliance">Appliance</option>
                  <option value="structural">Structural</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Room Selector Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Room</label>
                <select
                  value={roomIdFilter}
                  onChange={(e) => setRoomIdFilter(e.target.value)}
                  className="w-full text-xs font-medium bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                >
                  <option value="">All Rooms</option>
                  {rooms.map((room) => (
                    <option key={room.room_id} value={room.room_id}>
                      Room {room.room_number} (Floor {room.floor})
                    </option>
                  ))}
                </select>
              </div>

              {/* Blocks Occupancy Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Blocks Room Occupancy
                </label>
                <select
                  value={blocksOccupancyFilter}
                  onChange={(e) => setBlocksOccupancyFilter(e.target.value)}
                  className="w-full text-xs font-medium bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                >
                  <option value="">All (Blocking & Non-blocking)</option>
                  <option value="true">Blocking Only</option>
                  <option value="false">Non-blocking Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Message with Retry */}
          {fetchError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-3 text-red-800">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold">Failed to fetch maintenance records</h4>
                  <p className="text-xs text-red-700 mt-0.5">{fetchError}</p>
                </div>
              </div>
              <button
                onClick={() => loadRecords(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-red-300 text-red-800 rounded-lg hover:bg-red-100 transition shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Work Orders List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            {isLoading ? (
              /* Loading Skeletons */
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="animate-pulse flex items-center justify-between py-3 border-b border-gray-100">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-3 bg-gray-100 rounded w-1/2"></div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-20"></div>
                  </div>
                ))}
              </div>
            ) : records.length === 0 ? (
              /* Empty State */
              <div className="p-12 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                  <Wrench className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-gray-900">No maintenance work orders found</h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1">
                  {statusFilter || priorityFilter || categoryFilter || roomIdFilter || blocksOccupancyFilter
                    ? "No work orders match the current filters. Try resetting the filters."
                    : "No maintenance records exist currently. Create a work order to get started."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  {(statusFilter || priorityFilter || categoryFilter || roomIdFilter || blocksOccupancyFilter) && (
                    <button
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                  {canCreate && (
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Work Order</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-600 uppercase tracking-wider text-[11px] border-b border-gray-200 font-semibold">
                      <tr>
                        <th className="px-4 py-3.5">ID</th>
                        <th className="px-4 py-3.5">Title & Description</th>
                        <th className="px-4 py-3.5">Room</th>
                        <th className="px-4 py-3.5">Category</th>
                        <th className="px-4 py-3.5">Priority</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-4 py-3.5">Occupancy Block</th>
                        <th className="px-4 py-3.5">Assigned</th>
                        <th className="px-4 py-3.5">Est. Cost</th>
                        <th className="px-4 py-3.5">Reported</th>
                        <th className="px-4 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {records.map((rec) => {
                        const room = rec.room_id ? roomsMap.get(rec.room_id) : undefined;
                        const cat = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG.other;
                        const pri = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.medium;
                        const sta = STATUS_CONFIG[rec.status] || STATUS_CONFIG.reported;

                        return (
                          <tr
                            key={rec.maintenance_id}
                            className="hover:bg-blue-50/40 transition cursor-pointer"
                            onClick={() => handleOpenDrawer(rec)}
                          >
                            {/* ID */}
                            <td className="px-4 py-3.5 font-bold text-gray-900">
                              #{rec.maintenance_id}
                            </td>

                            {/* Title & Description */}
                            <td className="px-4 py-3.5 max-w-xs">
                              <p className="font-semibold text-gray-900 truncate">{rec.title}</p>
                              <p className="text-gray-500 text-[11px] truncate mt-0.5">
                                {rec.description}
                              </p>
                            </td>

                            {/* Room */}
                            <td className="px-4 py-3.5">
                              {rec.room_id ? (
                                <div className="flex items-center gap-1.5">
                                  <DoorOpen className="w-3.5 h-3.5 text-gray-400" />
                                  <span className="font-semibold text-gray-800">
                                    {room?.room_number ? `Room ${room.room_number}` : `ID ${rec.room_id}`}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">General / None</span>
                              )}
                            </td>

                            {/* Category */}
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${cat.badge}`}
                              >
                                {cat.label}
                              </span>
                            </td>

                            {/* Priority */}
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${pri.badge}`}
                              >
                                {pri.label}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${sta.badge}`}
                              >
                                {sta.label}
                              </span>
                            </td>

                            {/* Occupancy Block Indicator */}
                            <td className="px-4 py-3.5">
                              {rec.blocks_room_occupancy ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                                  <Lock className="w-3 h-3" />
                                  Blocks Room
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-50 text-gray-600 border border-gray-200">
                                  <Unlock className="w-3 h-3 text-gray-400" />
                                  Non-blocking
                                </span>
                              )}
                            </td>

                            {/* Assigned User */}
                            <td className="px-4 py-3.5 text-gray-700">
                              {rec.assigned_to_user_id ? (
                                <div className="flex items-center gap-1 text-gray-700">
                                  <User className="w-3.5 h-3.5 text-gray-400" />
                                  <span>Staff #{rec.assigned_to_user_id}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">Unassigned</span>
                              )}
                            </td>

                            {/* Estimated Cost */}
                            <td className="px-4 py-3.5 font-semibold text-gray-900">
                              {formatCurrency(rec.estimated_cost)}
                            </td>

                            {/* Reported Date */}
                            <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                              {formatDate(rec.reported_at)}
                            </td>

                            {/* Actions */}
                            <td
                              className="px-4 py-3.5 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleOpenDrawer(rec)}
                                  className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {canUpdate && (
                                  <button
                                    onClick={() => handleOpenDrawer(rec)}
                                    className="p-1.5 text-gray-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                    title="Edit / Resolve"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}

                                {canDelete && (
                                  <button
                                    onClick={() => setRecordToDelete(rec)}
                                    className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                    title="Delete Work Order"
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

                {/* Mobile / Tablet Friendly Cards View */}
                <div className="lg:hidden divide-y divide-gray-100">
                  {records.map((rec) => {
                    const room = rec.room_id ? roomsMap.get(rec.room_id) : undefined;
                    const cat = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG.other;
                    const pri = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.medium;
                    const sta = STATUS_CONFIG[rec.status] || STATUS_CONFIG.reported;

                    return (
                      <div
                        key={rec.maintenance_id}
                        className="p-4 space-y-3 hover:bg-gray-50 transition cursor-pointer"
                        onClick={() => handleOpenDrawer(rec)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 text-sm">
                                #{rec.maintenance_id}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sta.badge}`}
                              >
                                {sta.label}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${pri.badge}`}
                              >
                                {pri.label}
                              </span>
                            </div>
                            <h4 className="text-sm font-semibold text-gray-900 mt-1">{rec.title}</h4>
                          </div>

                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${cat.badge}`}
                          >
                            {cat.label}
                          </span>
                        </div>

                        <p className="text-xs text-gray-600 line-clamp-2">{rec.description}</p>

                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-1 border-t border-gray-100">
                          <div>
                            <span className="block text-[10px] text-gray-400">Room:</span>
                            <span className="font-medium text-gray-800">
                              {rec.room_id ? (room?.room_number ? `Room ${room.room_number}` : `ID ${rec.room_id}`) : "General"}
                            </span>
                          </div>

                          <div>
                            <span className="block text-[10px] text-gray-400">Occupancy:</span>
                            {rec.blocks_room_occupancy ? (
                              <span className="font-semibold text-rose-600 inline-flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Blocks Room
                              </span>
                            ) : (
                              <span className="text-gray-500">Non-blocking</span>
                            )}
                          </div>

                          <div>
                            <span className="block text-[10px] text-gray-400">Est. Cost:</span>
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(rec.estimated_cost)}
                            </span>
                          </div>

                          <div>
                            <span className="block text-[10px] text-gray-400">Reported:</span>
                            <span>{formatDate(rec.reported_at)}</span>
                          </div>
                        </div>

                        {/* Mobile Actions */}
                        <div
                          className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleOpenDrawer(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>

                          {canUpdate && (
                            <button
                              onClick={() => handleOpenDrawer(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md transition"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Update</span>
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => setRecordToDelete(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* DETAILS / RESOLUTION DRAWER */}
        {isDrawerOpen && selectedRecord && (
          <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setIsDrawerOpen(false)}
            />

            {/* Slide-over panel */}
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col z-50">
                {/* Drawer Header */}
                <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <Wrench className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900 truncate">
                          Work Order #{selectedRecord.maintenance_id}
                        </h3>
                        {isLoadingDrawer && (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        Reported on {formatDateTime(selectedRecord.reported_at)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition"
                    aria-label="Close drawer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Drawer Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                  {/* Status & Priority Badge Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          STATUS_CONFIG[selectedRecord.status]?.badge || "bg-gray-100"
                        }`}
                      >
                        {STATUS_CONFIG[selectedRecord.status]?.label || selectedRecord.status}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                          PRIORITY_CONFIG[selectedRecord.priority]?.badge || "bg-gray-100"
                        }`}
                      >
                        Priority: {PRIORITY_CONFIG[selectedRecord.priority]?.label || selectedRecord.priority}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                          CATEGORY_CONFIG[selectedRecord.category]?.badge || "bg-gray-100"
                        }`}
                      >
                        {CATEGORY_CONFIG[selectedRecord.category]?.label || selectedRecord.category}
                      </span>
                    </div>

                    {selectedRecord.blocks_room_occupancy ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                        <Lock className="w-3.5 h-3.5" /> Blocks Occupancy
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                        <Unlock className="w-3.5 h-3.5 text-gray-400" /> Non-blocking
                      </span>
                    )}
                  </div>

                  {/* Room Status Warning (Authoritative Backend State) */}
                  {selectedRecord.room_id && (
                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                          <DoorOpen className="w-4 h-4 text-blue-700" />
                          Associated Room
                        </span>
                        {roomsMap.get(selectedRecord.room_id) && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-blue-200 text-blue-800">
                            Current Status: {roomsMap.get(selectedRecord.room_id)?.operational_status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-blue-800">
                        Room {roomsMap.get(selectedRecord.room_id)?.room_number || selectedRecord.room_id}
                        {selectedRecord.blocks_room_occupancy
                          ? " — Room occupancy is controlled by this work order. Backend will automatically unblock the room when completed or cancelled."
                          : " — Non-blocking work order. Room operational status is unaffected."}
                      </p>
                    </div>
                  )}

                  {/* Quick Action Transitions */}
                  {canUpdate && selectedRecord.status !== "completed" && selectedRecord.status !== "cancelled" && (
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                        Quick Status Transitions
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedRecord.status !== "in_progress" && (
                          <button
                            type="button"
                            onClick={() => handleQuickTransition("in_progress", selectedRecord)}
                            disabled={isUpdatingStatus}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition disabled:opacity-50"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>Start Work (In Progress)</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleQuickTransition("completed", selectedRecord)}
                          disabled={isUpdatingStatus}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark as Completed</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickTransition("cancelled", selectedRecord)}
                          disabled={isUpdatingStatus}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel Order</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Update Form (RBAC aware) */}
                  <form onSubmit={handleSaveDrawer} className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-100 pb-2">
                      {canUpdate ? "Record Details & Updates" : "Record Details (Read Only)"}
                    </h4>

                    {/* Status Dropdown */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Lifecycle Status
                      </label>
                      <select
                        value={drawerStatus}
                        onChange={(e) => setDrawerStatus(e.target.value as MaintenanceStatus)}
                        disabled={!canUpdate}
                        className="w-full text-xs font-medium bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white disabled:opacity-60 transition"
                      >
                        <option value="reported">Reported</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    {/* Financial Costs */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Estimated Cost ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={drawerEstimatedCost}
                          onChange={(e) => setDrawerEstimatedCost(e.target.value)}
                          disabled={!isAdminOrManager}
                          className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white disabled:opacity-60 transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Actual Cost ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={drawerActualCost}
                          onChange={(e) => setDrawerActualCost(e.target.value)}
                          disabled={!canUpdate}
                          className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white disabled:opacity-60 transition"
                        />
                      </div>
                    </div>

                    {/* Resolution Notes */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Resolution Notes
                      </label>
                      <textarea
                        rows={3}
                        value={drawerResolutionNotes}
                        onChange={(e) => setDrawerResolutionNotes(e.target.value)}
                        disabled={!canUpdate}
                        placeholder="Describe the steps taken, parts replaced, or root cause..."
                        className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white disabled:opacity-60 transition"
                      />
                    </div>

                    {/* Admin / Manager Exclusive Editable Attributes */}
                    {isAdminOrManager && (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                        <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block">
                          Manager Controls
                        </span>

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
                          <input
                            type="text"
                            maxLength={150}
                            value={drawerTitle}
                            onChange={(e) => setDrawerTitle(e.target.value)}
                            className="w-full text-xs bg-white border border-gray-300 rounded-lg p-2 text-gray-800 focus:ring-1 focus:ring-blue-500 transition"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                          <textarea
                            rows={2}
                            value={drawerDescription}
                            onChange={(e) => setDrawerDescription(e.target.value)}
                            className="w-full text-xs bg-white border border-gray-300 rounded-lg p-2 text-gray-800 focus:ring-1 focus:ring-blue-500 transition"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                            <select
                              value={drawerCategory}
                              onChange={(e) => setDrawerCategory(e.target.value as MaintenanceCategory)}
                              className="w-full text-xs bg-white border border-gray-300 rounded-lg p-2 text-gray-800"
                            >
                              <option value="plumbing">Plumbing</option>
                              <option value="electrical">Electrical</option>
                              <option value="hvac">HVAC</option>
                              <option value="furniture">Furniture</option>
                              <option value="appliance">Appliance</option>
                              <option value="structural">Structural</option>
                              <option value="other">Other</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Priority</label>
                            <select
                              value={drawerPriority}
                              onChange={(e) => setDrawerPriority(e.target.value as MaintenancePriority)}
                              className="w-full text-xs bg-white border border-gray-300 rounded-lg p-2 text-gray-800"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Assigned Staff User ID
                            </label>
                            <input
                              type="number"
                              min="1"
                              placeholder="Staff User ID"
                              value={drawerAssignedStaffId}
                              onChange={(e) => setDrawerAssignedStaffId(e.target.value)}
                              className="w-full text-xs bg-white border border-gray-300 rounded-lg p-2 text-gray-800"
                            />
                          </div>

                          <div className="flex items-center pt-5">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={drawerBlocksOccupancy}
                                onChange={(e) => setDrawerBlocksOccupancy(e.target.checked)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs font-semibold text-gray-700">
                                Blocks Room Occupancy
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Timestamps & Personnel Meta */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
                      <div>
                        <span className="block text-[10px] text-gray-400">Reported By:</span>
                        <span className="font-medium text-gray-700">
                          {selectedRecord.reported_by_user_id ? `User #${selectedRecord.reported_by_user_id}` : "System / None"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400">Assigned To:</span>
                        <span className="font-medium text-gray-700">
                          {selectedRecord.assigned_to_user_id ? `Staff #${selectedRecord.assigned_to_user_id}` : "Unassigned"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400">Started At:</span>
                        <span>{formatDateTime(selectedRecord.started_at)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400">Resolved At:</span>
                        <span>{formatDateTime(selectedRecord.resolved_at)}</span>
                      </div>
                    </div>

                    {/* Drawer Footer Actions */}
                    {canUpdate && (
                      <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-200">
                        <button
                          type="button"
                          onClick={() => setIsDrawerOpen(false)}
                          className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingDrawer}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs transition disabled:opacity-50"
                        >
                          {isSavingDrawer ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Save Changes</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CREATE WORK ORDER MODAL */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              onClick={() => !isSubmittingCreate && setIsCreateModalOpen(false)}
            />

            <div className="min-h-full flex items-center justify-center p-4">
              <div className="relative bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 space-y-5 z-50">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Create Maintenance Work Order</h3>
                      <p className="text-xs text-gray-500">Report an issue or schedule a repair</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    disabled={isSubmittingCreate}
                    className="p-1 text-gray-400 hover:text-gray-700 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={150}
                      placeholder="e.g. AC leaking water on floor"
                      value={createForm.title}
                      onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                      className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Detailed description of the issue..."
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                      className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800 focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                    />
                  </div>

                  {/* Category & Priority */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={createForm.category}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            category: e.target.value as MaintenanceCategory,
                          })
                        }
                        className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800"
                      >
                        <option value="plumbing">Plumbing</option>
                        <option value="electrical">Electrical</option>
                        <option value="hvac">HVAC</option>
                        <option value="furniture">Furniture</option>
                        <option value="appliance">Appliance</option>
                        <option value="structural">Structural</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Priority</label>
                      <select
                        value={createForm.priority}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            priority: e.target.value as MaintenancePriority,
                          })
                        }
                        className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  {/* Room Selector & Estimated Cost */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Room (Optional)
                      </label>
                      <select
                        value={createForm.room_id}
                        onChange={(e) => setCreateForm({ ...createForm, room_id: e.target.value })}
                        className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800"
                      >
                        <option value="">None / General Facility</option>
                        {rooms.map((room) => (
                          <option key={room.room_id} value={room.room_id}>
                            Room {room.room_number} (Floor {room.floor})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Estimated Cost ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={createForm.estimated_cost}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, estimated_cost: e.target.value })
                        }
                        className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800"
                      />
                    </div>
                  </div>

                  {/* Assigned User ID & Blocks Room Occupancy */}
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Assign Staff User ID (Optional)
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Staff User ID"
                        value={createForm.assigned_to_user_id}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, assigned_to_user_id: e.target.value })
                        }
                        className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-800"
                      />
                    </div>

                    <div className="pt-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createForm.blocks_room_occupancy}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              blocks_room_occupancy: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-gray-800">
                          Blocks Room Occupancy
                        </span>
                      </label>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Sets room to under_maintenance until completed
                      </p>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      disabled={isSubmittingCreate}
                      className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingCreate}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs transition disabled:opacity-50"
                    >
                      {isSubmittingCreate ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create Work Order</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* DELETE CONFIRMATION MODAL */}
        {recordToDelete && (
          <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              onClick={() => !isDeleting && setRecordToDelete(null)}
            />

            <div className="min-h-full flex items-center justify-center p-4">
              <div className="relative bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4 z-50">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6" />
                </div>

                <div className="text-center">
                  <h3 className="text-base font-bold text-gray-900">
                    Delete Maintenance Work Order #{recordToDelete.maintenance_id}?
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Are you sure you want to delete &quot;{recordToDelete.title}&quot;? If this work
                    order is blocking a room, deleting it will restore the room&apos;s availability.
                    This action cannot be undone.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setRecordToDelete(null)}
                    disabled={isDeleting}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Confirm Delete</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </ProtectedRoute>
  );
}
