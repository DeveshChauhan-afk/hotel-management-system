"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import {
  getHousekeepingTasks,
  getHousekeepingTask,
  createHousekeepingTask,
  updateHousekeepingTask,
  deleteHousekeepingTask,
  HousekeepingTask,
  HousekeepingTaskType,
  HousekeepingPriority,
  HousekeepingStatus,
  HousekeepingFilters,
  CreateHousekeepingTaskRequest,
} from "@/lib/housekeepingApi";
import { getRooms, Room } from "@/lib/roomsApi";
import toast from "react-hot-toast";
import {
  Sparkles,
  Plus,
  Filter,
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
  CheckCheck,
  Play,
  XCircle,
} from "lucide-react";

const TASK_TYPE_CONFIG: Record<
  HousekeepingTaskType,
  { label: string; bg: string; text: string; border: string }
> = {
  checkout_cleaning: {
    label: "Checkout Cleaning",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  stayover_cleaning: {
    label: "Stayover Cleaning",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  deep_clean: {
    label: "Deep Clean",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  inspection: {
    label: "Inspection",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  turndown: {
    label: "Turndown Service",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
};

const PRIORITY_CONFIG: Record<
  HousekeepingPriority,
  { label: string; bg: string; text: string; border: string; badge: string }
> = {
  low: {
    label: "Low",
    bg: "bg-gray-50",
    text: "text-gray-700",
    border: "border-gray-200",
    badge: "bg-gray-100 text-gray-800 border-gray-200",
  },
  medium: {
    label: "Medium",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
  },
  high: {
    label: "High",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  urgent: {
    label: "Urgent",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    badge: "bg-red-100 text-red-800 border-red-200",
  },
};

const STATUS_CONFIG: Record<
  HousekeepingStatus,
  { label: string; bg: string; text: string; border: string; badge: string }
> = {
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  in_progress: {
    label: "In Progress",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
  },
  completed: {
    label: "Completed",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  verified: {
    label: "Verified",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-300",
    badge: "bg-gray-100 text-gray-800 border-gray-300",
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

export default function HousekeepingPage() {
  const { role } = useAuth();
  const normalizedRole = (role || "").toLowerCase();

  // Role permissions
  const isAdminOrManager = normalizedRole === "admin" || normalizedRole === "manager";
  const isHousekeeper = normalizedRole === "housekeeper";
  const canMutateStatus = isAdminOrManager || isHousekeeper;
  const canManageTasks = isAdminOrManager;

  // Data states
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("");
  const [roomIdFilter, setRoomIdFilter] = useState<string>("");
  const [scheduledDateFilter, setScheduledDateFilter] = useState<string>("");

  // Drawer / Modal states
  const [selectedTask, setSelectedTask] = useState<HousekeepingTask | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoadingDrawerDetails, setIsLoadingDrawerDetails] = useState(false);

  // Create Task Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createForm, setCreateForm] = useState<{
    room_id: string;
    task_type: HousekeepingTaskType;
    priority: HousekeepingPriority;
    assigned_to_user_id: string;
    scheduled_date: string;
    remarks: string;
  }>({
    room_id: "",
    task_type: "checkout_cleaning",
    priority: "medium",
    assigned_to_user_id: "",
    scheduled_date: new Date().toISOString().split("T")[0],
    remarks: "",
  });

  // Action confirmations & dialogs
  const [taskToDelete, setTaskToDelete] = useState<HousekeepingTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [taskToCancel, setTaskToCancel] = useState<HousekeepingTask | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Reassignment & remarks state in drawer
  const [drawerRemarks, setDrawerRemarks] = useState("");
  const [drawerStaffId, setDrawerStaffId] = useState("");
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);

  // Map rooms for quick display
  const roomsMap = useMemo(() => {
    const map = new Map<number, Room>();
    rooms.forEach((r) => map.set(r.room_id, r));
    return map;
  }, [rooms]);

  // Load rooms for dropdowns and display
  useEffect(() => {
    getRooms()
      .then((res) => setRooms(res))
      .catch(() => {
        // Silently tolerate if rooms listing has temporary issue
      });
  }, []);

  // Fetch housekeeping tasks with active filters
  const loadTasks = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setIsLoading(true);
      }
      try {
        const filters: HousekeepingFilters = {};
        if (statusFilter) filters.status = statusFilter;
        if (priorityFilter) filters.priority = priorityFilter;
        if (taskTypeFilter) filters.task_type = taskTypeFilter;
        if (roomIdFilter) filters.room_id = parseInt(roomIdFilter, 10);
        if (scheduledDateFilter) filters.scheduled_date = scheduledDateFilter;

        const data = await getHousekeepingTasks(filters);
        setTasks(data);
        setFetchError(null);
        if (isManualRefresh) {
          toast.success("Housekeeping tasks refreshed");
        }
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
        const msg =
          axiosErr.response?.data?.error ||
          axiosErr.message ||
          "Failed to load housekeeping tasks";
        setFetchError(msg);
        if (isManualRefresh) {
          toast.error(msg);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter, priorityFilter, taskTypeFilter, roomIdFilter, scheduledDateFilter]
  );

  useEffect(() => {
    let isMounted = true;
    const filters: HousekeepingFilters = {};
    if (statusFilter) filters.status = statusFilter;
    if (priorityFilter) filters.priority = priorityFilter;
    if (taskTypeFilter) filters.task_type = taskTypeFilter;
    if (roomIdFilter) filters.room_id = parseInt(roomIdFilter, 10);
    if (scheduledDateFilter) filters.scheduled_date = scheduledDateFilter;

    getHousekeepingTasks(filters)
      .then((data) => {
        if (isMounted) {
          setTasks(data);
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
          const msg =
            axiosErr.response?.data?.error ||
            axiosErr.message ||
            "Failed to load housekeeping tasks";
          setFetchError(msg);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [statusFilter, priorityFilter, taskTypeFilter, roomIdFilter, scheduledDateFilter]);

  // Reset filters
  const handleResetFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setTaskTypeFilter("");
    setRoomIdFilter("");
    setScheduledDateFilter("");
  };

  // KPI Calculations
  const kpiStats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let highOrUrgent = 0;

    tasks.forEach((t) => {
      if (t.status === "pending") pending++;
      else if (t.status === "in_progress") inProgress++;
      else if (t.status === "completed" || t.status === "verified") completed++;

      if (t.priority === "high" || t.priority === "urgent") highOrUrgent++;
    });

    return { pending, inProgress, completed, highOrUrgent };
  }, [tasks]);

  // Open Drawer with fresh GET /housekeeping/<id>
  const handleOpenDrawer = async (task: HousekeepingTask) => {
    setSelectedTask(task);
    setDrawerRemarks(task.remarks || "");
    setDrawerStaffId(task.assigned_to_user_id ? String(task.assigned_to_user_id) : "");
    setIsDrawerOpen(true);
    setIsLoadingDrawerDetails(true);

    try {
      const detailedTask = await getHousekeepingTask(task.task_id);
      setSelectedTask(detailedTask);
      setDrawerRemarks(detailedTask.remarks || "");
      setDrawerStaffId(
        detailedTask.assigned_to_user_id ? String(detailedTask.assigned_to_user_id) : ""
      );
    } catch {
      toast.error("Failed to load latest task details");
    } finally {
      setIsLoadingDrawerDetails(false);
    }
  };

  // Status transitions
  const handleStatusTransition = async (
    taskId: number,
    nextStatus: HousekeepingStatus,
    successMessage?: string
  ) => {
    if (!canMutateStatus) {
      toast.error("Your role is not permitted to update task statuses.");
      return;
    }

    if (nextStatus === "cancelled") {
      setIsCancelling(true);
    } else {
      setIsUpdatingStatus(true);
    }

    try {
      const response = await updateHousekeepingTask(taskId, { status: nextStatus });
      toast.success(successMessage || `Task status updated to ${nextStatus}`);

      // Refresh task list
      await loadTasks();

      // If drawer is open with this task, refresh drawer
      if (selectedTask && selectedTask.task_id === taskId) {
        setSelectedTask(response.task);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to update task status";
      toast.error(msg);
    } finally {
      setIsUpdatingStatus(false);
      setIsCancelling(false);
      setTaskToCancel(null);
    }
  };

  // Drawer save remarks / staff reassignment
  const handleSaveDrawerDetails = async () => {
    if (!selectedTask) return;

    setIsSavingDrawer(true);
    try {
      const payload: {
        remarks?: string | null;
        assigned_to_user_id?: number | null;
      } = {
        remarks: drawerRemarks.trim() || null,
      };

      if (canManageTasks) {
        payload.assigned_to_user_id = drawerStaffId.trim()
          ? parseInt(drawerStaffId.trim(), 10)
          : null;
      }

      const response = await updateHousekeepingTask(selectedTask.task_id, payload);
      toast.success("Task updated successfully");
      setSelectedTask(response.task);
      await loadTasks();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to update task";
      toast.error(msg);
    } finally {
      setIsSavingDrawer(false);
    }
  };

  // Create Task Submission
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTasks) {
      toast.error("Only administrators and managers may create housekeeping tasks.");
      return;
    }

    if (!createForm.room_id) {
      toast.error("Please select a room for this housekeeping task.");
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const payload: CreateHousekeepingTaskRequest = {
        room_id: parseInt(createForm.room_id, 10),
        task_type: createForm.task_type,
        priority: createForm.priority,
        scheduled_date: createForm.scheduled_date || null,
        remarks: createForm.remarks.trim() || null,
      };

      if (createForm.assigned_to_user_id.trim()) {
        payload.assigned_to_user_id = parseInt(createForm.assigned_to_user_id.trim(), 10);
      }

      await createHousekeepingTask(payload);
      toast.success("Housekeeping task scheduled successfully!");
      setIsCreateModalOpen(false);
      setCreateForm({
        room_id: "",
        task_type: "checkout_cleaning",
        priority: "medium",
        assigned_to_user_id: "",
        scheduled_date: new Date().toISOString().split("T")[0],
        remarks: "",
      });
      await loadTasks();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to create housekeeping task";
      toast.error(msg);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Delete Task
  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    if (!canManageTasks) {
      toast.error("Only administrators and managers may delete housekeeping tasks.");
      return;
    }

    setIsDeleting(true);
    try {
      await deleteHousekeepingTask(taskToDelete.task_id);
      toast.success("Housekeeping task deleted successfully");
      setTaskToDelete(null);
      if (selectedTask && selectedTask.task_id === taskToDelete.task_id) {
        setIsDrawerOpen(false);
        setSelectedTask(null);
      }
      await loadTasks();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to delete housekeeping task";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "manager", "receptionist", "housekeeper"]}>
      <AppShell title="Housekeeping">
        <div className="space-y-6">
          {/* Top Actions & Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-teal-50 text-teal-600">
                  <Sparkles className="w-5 h-5" />
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  Housekeeping Operations
                </h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Manage room turnover, hygiene inspections, and staff cleaning assignments.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadTasks(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition shadow-2xs"
              >
                <RefreshCw className={`w-4 h-4 text-gray-500 ${isLoading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {canManageTasks && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 focus:outline-hidden transition shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Cleaning Task</span>
                </button>
              )}
            </div>
          </div>

          {/* KPI Summary Cards */}
          <section aria-label="Housekeeping Metrics">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {/* Pending */}
              <div className="bg-white p-5 sm:p-6 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-medium text-gray-500">Pending Tasks</span>
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-3 tracking-tight">
                  {kpiStats.pending}
                </p>
                <p className="text-xs text-gray-400 mt-1">Awaiting staff pickup</p>
              </div>

              {/* In Progress */}
              <div className="bg-white p-5 sm:p-6 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-medium text-gray-500">In Progress</span>
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Play className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-blue-600 mt-3 tracking-tight">
                  {kpiStats.inProgress}
                </p>
                <p className="text-xs text-gray-400 mt-1">Rooms being cleaned now</p>
              </div>

              {/* Completed */}
              <div className="bg-white p-5 sm:p-6 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-medium text-gray-500">Completed / Verified</span>
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-3 tracking-tight">
                  {kpiStats.completed}
                </p>
                <p className="text-xs text-gray-400 mt-1">Sanitized & ready</p>
              </div>

              {/* High / Urgent */}
              <div className="bg-white p-5 sm:p-6 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-medium text-gray-500">High / Urgent</span>
                  <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-rose-600 mt-3 tracking-tight">
                  {kpiStats.highOrUrgent}
                </p>
                <p className="text-xs text-gray-400 mt-1">Priority turnover</p>
              </div>
            </div>
          </section>

          {/* Filter Bar */}
          <section className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Filter className="w-4 h-4 text-gray-500" />
                <span>Filter Tasks</span>
              </div>
              {(statusFilter || priorityFilter || taskTypeFilter || roomIdFilter || scheduledDateFilter) && (
                <button
                  onClick={handleResetFilters}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition"
                >
                  Reset all filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Status Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="verified">Verified</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                >
                  <option value="">All Priorities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {/* Task Type Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Task Type</label>
                <select
                  value={taskTypeFilter}
                  onChange={(e) => setTaskTypeFilter(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                >
                  <option value="">All Types</option>
                  <option value="checkout_cleaning">Checkout Cleaning</option>
                  <option value="stayover_cleaning">Stayover Cleaning</option>
                  <option value="deep_clean">Deep Clean</option>
                  <option value="inspection">Inspection</option>
                  <option value="turndown">Turndown Service</option>
                </select>
              </div>

              {/* Room ID Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Room</label>
                <select
                  value={roomIdFilter}
                  onChange={(e) => setRoomIdFilter(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                >
                  <option value="">All Rooms</option>
                  {rooms.map((r) => (
                    <option key={r.room_id} value={r.room_id}>
                      Room {r.room_number} (Floor {r.floor})
                    </option>
                  ))}
                </select>
              </div>

              {/* Scheduled Date Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Scheduled Date</label>
                <input
                  type="date"
                  value={scheduledDateFilter}
                  onChange={(e) => setScheduledDateFilter(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>
            </div>
          </section>

          {/* Error Alert */}
          {fetchError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-5 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-red-800">Failed to load housekeeping tasks</h4>
                <p className="text-xs text-red-700 mt-1">{fetchError}</p>
                <button
                  onClick={() => loadTasks(true)}
                  className="mt-2 text-xs font-semibold text-red-800 hover:text-red-900 inline-flex items-center gap-1 underline"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            </div>
          )}

          {/* Task Table & List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                      <div className="space-y-2">
                        <div className="w-32 h-4 bg-gray-200 rounded" />
                        <div className="w-20 h-3 bg-gray-100 rounded" />
                      </div>
                    </div>
                    <div className="w-24 h-6 bg-gray-200 rounded-full" />
                  </div>
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-gray-900">No Housekeeping Tasks Found</h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  {statusFilter || priorityFilter || taskTypeFilter || roomIdFilter || scheduledDateFilter
                    ? "No tasks match the selected filter criteria. Try adjusting your filters."
                    : "All rooms are clean or no cleaning work orders have been scheduled yet."}
                </p>
                {canManageTasks && (
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition mt-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Task</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Task</th>
                      <th className="py-3.5 px-4">Room</th>
                      <th className="py-3.5 px-4">Type</th>
                      <th className="py-3.5 px-4">Priority</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Scheduled</th>
                      <th className="py-3.5 px-4">Staff</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {tasks.map((task) => {
                      const typeConfig = TASK_TYPE_CONFIG[task.task_type] || {
                        label: task.task_type,
                        bg: "bg-gray-50",
                        text: "text-gray-700",
                        border: "border-gray-200",
                      };
                      const priorityConfig = PRIORITY_CONFIG[task.priority] || {
                        label: task.priority,
                        badge: "bg-gray-100 text-gray-800 border-gray-200",
                      };
                      const statusConfig = STATUS_CONFIG[task.status] || {
                        label: task.status,
                        badge: "bg-gray-100 text-gray-800 border-gray-200",
                      };
                      const roomObj = roomsMap.get(task.room_id);

                      return (
                        <tr key={task.task_id} className="hover:bg-gray-50/60 transition-colors">
                          {/* Task ID */}
                          <td className="py-3.5 px-4 font-semibold text-gray-900">
                            #{task.task_id}
                          </td>

                          {/* Room */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <DoorOpen className="w-4 h-4 text-gray-400" />
                              <span className="font-medium text-gray-900">
                                {roomObj ? `Room ${roomObj.room_number}` : `Room #${task.room_id}`}
                              </span>
                              {roomObj && (
                                <span className="text-xs text-gray-400">
                                  (Fl {roomObj.floor})
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Task Type */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${typeConfig.bg} ${typeConfig.text} ${typeConfig.border}`}
                            >
                              {typeConfig.label}
                            </span>
                          </td>

                          {/* Priority */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${priorityConfig.badge}`}
                            >
                              {priorityConfig.label}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusConfig.badge}`}
                            >
                              {task.status === "in_progress" && <Play className="w-3 h-3 animate-pulse" />}
                              {task.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                              {task.status === "verified" && <CheckCheck className="w-3 h-3" />}
                              <span>{statusConfig.label}</span>
                            </span>
                          </td>

                          {/* Scheduled Date */}
                          <td className="py-3.5 px-4 text-gray-600 text-xs">
                            {formatDate(task.scheduled_date)}
                          </td>

                          {/* Assigned Staff */}
                          <td className="py-3.5 px-4 text-xs text-gray-600">
                            {task.assigned_to_user_id ? (
                              <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                                <User className="w-3.5 h-3.5 text-gray-400" />
                                Staff #{task.assigned_to_user_id}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">Unassigned</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Workflow Action Buttons */}
                              {canMutateStatus && task.status === "pending" && (
                                <button
                                  onClick={() =>
                                    handleStatusTransition(task.task_id, "in_progress", "Cleaning started!")
                                  }
                                  disabled={isUpdatingStatus}
                                  title="Start Cleaning"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition shadow-2xs"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Start</span>
                                </button>
                              )}

                              {canMutateStatus && task.status === "in_progress" && (
                                <button
                                  onClick={() =>
                                    handleStatusTransition(task.task_id, "completed", "Room marked clean and complete!")
                                  }
                                  disabled={isUpdatingStatus}
                                  title="Mark Completed"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition shadow-2xs"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Done</span>
                                </button>
                              )}

                              {canMutateStatus && task.status === "completed" && (
                                <button
                                  onClick={() =>
                                    handleStatusTransition(task.task_id, "verified", "Cleaning verified successfully!")
                                  }
                                  disabled={isUpdatingStatus}
                                  title="Verify Inspection"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition shadow-2xs"
                                >
                                  <CheckCheck className="w-3 h-3" />
                                  <span>Verify</span>
                                </button>
                              )}

                              {/* Details / Drawer Trigger */}
                              <button
                                onClick={() => handleOpenDrawer(task)}
                                title="View Task Details"
                                className="p-1.5 text-gray-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Delete button (Admin/Manager only) */}
                              {canManageTasks && (
                                <button
                                  onClick={() => setTaskToDelete(task)}
                                  title="Delete Task"
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
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
            )}
          </div>
        </div>

        {/* Task Details Drawer */}
        {isDrawerOpen && selectedTask && (
          <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setIsDrawerOpen(false)}
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <div className="w-screen max-w-md sm:max-w-lg bg-white shadow-2xl flex flex-col">
                {/* Drawer Header */}
                <div className="px-6 py-5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-gray-900">
                        Task #{selectedTask.task_id}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          STATUS_CONFIG[selectedTask.status]?.badge || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {STATUS_CONFIG[selectedTask.status]?.label || selectedTask.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {TASK_TYPE_CONFIG[selectedTask.task_type]?.label || selectedTask.task_type}
                    </p>
                  </div>

                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Drawer Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {isLoadingDrawerDetails && (
                    <div className="p-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-lg text-xs flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Fetching latest task updates...</span>
                    </div>
                  )}

                  {/* Room & Assignment Card */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Location Details
                      </span>
                      <DoorOpen className="w-4 h-4 text-gray-400" />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 block">Room Number</span>
                        <span className="font-bold text-gray-900">
                          {roomsMap.get(selectedTask.room_id)
                            ? `Room ${roomsMap.get(selectedTask.room_id)?.room_number}`
                            : `Room #${selectedTask.room_id}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Floor</span>
                        <span className="font-semibold text-gray-800">
                          {roomsMap.get(selectedTask.room_id)?.floor ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Operational Status</span>
                        <span className="font-semibold text-gray-800 capitalize">
                          {roomsMap.get(selectedTask.room_id)?.operational_status?.replace("_", " ") ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Room Cleanliness</span>
                        <span className="font-semibold text-teal-700 capitalize">
                          {roomsMap.get(selectedTask.room_id)?.cleanliness_status?.replace("_", " ") ?? "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Execution Timeline */}
                  <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                      Execution Timeline
                    </span>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-500">Scheduled Date:</span>
                        <span className="font-medium text-gray-900">{formatDate(selectedTask.scheduled_date)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-500">Started At:</span>
                        <span className="font-medium text-gray-900">{formatDateTime(selectedTask.started_at)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-500">Completed At:</span>
                        <span className="font-medium text-gray-900">{formatDateTime(selectedTask.completed_at)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-500">Verified At:</span>
                        <span className="font-medium text-gray-900">{formatDateTime(selectedTask.verified_at)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-gray-500">Inspector ID:</span>
                        <span className="font-medium text-gray-900">
                          {selectedTask.inspected_by_user_id ? `User #${selectedTask.inspected_by_user_id}` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Staff Assignment & Remarks Editing */}
                  <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                      Task Settings & Remarks
                    </span>

                    {/* Staff reassignment (Admin/Manager only) */}
                    {canManageTasks && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Assigned Staff User ID
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. 2 (Leave blank for unassigned)"
                          value={drawerStaffId}
                          onChange={(e) => setDrawerStaffId(e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                        />
                      </div>
                    )}

                    {/* Remarks input */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Remarks & Cleaning Notes
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Add special cleaning instructions or notes..."
                        value={drawerRemarks}
                        onChange={(e) => setDrawerRemarks(e.target.value)}
                        disabled={!canMutateStatus}
                        className="w-full text-sm border border-gray-300 rounded-lg p-2.5 text-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden disabled:bg-gray-100"
                      />
                    </div>

                    {canMutateStatus && (
                      <button
                        onClick={handleSaveDrawerDetails}
                        disabled={isSavingDrawer}
                        className="w-full py-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition disabled:opacity-50"
                      >
                        {isSavingDrawer ? "Saving Updates..." : "Save Notes & Assignment"}
                      </button>
                    )}
                  </div>

                  {/* Workflow Actions Section */}
                  {canMutateStatus && (
                    <div className="space-y-3 pt-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                        Lifecycle Actions
                      </span>

                      {selectedTask.status === "pending" && (
                        <button
                          onClick={() =>
                            handleStatusTransition(selectedTask.task_id, "in_progress", "Cleaning started!")
                          }
                          disabled={isUpdatingStatus}
                          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition shadow-2xs disabled:opacity-50"
                        >
                          <Play className="w-4 h-4" />
                          <span>Start Cleaning (Mark In Progress)</span>
                        </button>
                      )}

                      {selectedTask.status === "in_progress" && (
                        <button
                          onClick={() =>
                            handleStatusTransition(
                              selectedTask.task_id,
                              "completed",
                              "Cleaning completed! Room is now marked clean."
                            )
                          }
                          disabled={isUpdatingStatus}
                          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm transition shadow-2xs disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Mark Cleaning Complete (Sets Room Clean)</span>
                        </button>
                      )}

                      {selectedTask.status === "completed" && (
                        <button
                          onClick={() =>
                            handleStatusTransition(
                              selectedTask.task_id,
                              "verified",
                              "Hygiene inspection verified successfully!"
                            )
                          }
                          disabled={isUpdatingStatus}
                          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-sm transition shadow-2xs disabled:opacity-50"
                        >
                          <CheckCheck className="w-4 h-4" />
                          <span>Verify Hygiene Inspection</span>
                        </button>
                      )}

                      {selectedTask.status !== "cancelled" && selectedTask.status !== "verified" && (
                        <button
                          onClick={() => setTaskToCancel(selectedTask)}
                          disabled={isUpdatingStatus || isCancelling}
                          className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 text-xs font-semibold text-gray-700 hover:text-red-700 bg-gray-100 hover:bg-red-50 rounded-lg transition"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Cancel This Task</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Drawer Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  {canManageTasks && (
                    <button
                      onClick={() => setTaskToDelete(selectedTask)}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 transition"
                    >
                      Delete Task
                    </button>
                  )}
                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="ml-auto px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Task Modal (Admin/Manager only) */}
        {isCreateModalOpen && canManageTasks && (
          <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => setIsCreateModalOpen(false)}
              />

              <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

              <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div className="px-6 py-5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-teal-50 text-teal-600">
                      <Sparkles className="w-5 h-5" />
                    </span>
                    <h3 className="text-lg font-bold text-gray-900">Schedule Cleaning Task</h3>
                  </div>
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateTask} className="p-6 space-y-4">
                  {/* Room Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Room <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={createForm.room_id}
                      onChange={(e) => setCreateForm({ ...createForm, room_id: e.target.value })}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    >
                      <option value="">Select a room to clean...</option>
                      {rooms.map((r) => (
                        <option key={r.room_id} value={r.room_id}>
                          Room {r.room_number} (Floor {r.floor} • {r.cleanliness_status} • {r.operational_status})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Task Type & Priority Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Task Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={createForm.task_type}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            task_type: e.target.value as HousekeepingTaskType,
                          })
                        }
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      >
                        <option value="checkout_cleaning">Checkout Cleaning</option>
                        <option value="stayover_cleaning">Stayover Cleaning</option>
                        <option value="deep_clean">Deep Clean</option>
                        <option value="inspection">Inspection</option>
                        <option value="turndown">Turndown Service</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Priority</label>
                      <select
                        value={createForm.priority}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            priority: e.target.value as HousekeepingPriority,
                          })
                        }
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  {/* Scheduled Date & Staff ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Scheduled Date</label>
                      <input
                        type="date"
                        value={createForm.scheduled_date}
                        onChange={(e) => setCreateForm({ ...createForm, scheduled_date: e.target.value })}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Assigned Staff User ID
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 2 (Optional)"
                        value={createForm.assigned_to_user_id}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, assigned_to_user_id: e.target.value })
                        }
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Special Remarks</label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Guest requested extra fresh towels and hypoallergenic pillows."
                      value={createForm.remarks}
                      onChange={(e) => setCreateForm({ ...createForm, remarks: e.target.value })}
                      className="w-full text-sm border border-gray-300 rounded-lg p-2.5 text-gray-900 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Submit / Cancel Buttons */}
                  <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingCreate}
                      className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition shadow-2xs disabled:opacity-50"
                    >
                      {isSubmittingCreate ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Scheduling...</span>
                        </>
                      ) : (
                        <span>Schedule Task</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {taskToDelete && canManageTasks && (
          <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => setTaskToDelete(null)}
              />

              <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

              <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md w-full p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Delete Housekeeping Task</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Are you sure you want to permanently delete Task #{taskToDelete.task_id}?
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  This task for Room{" "}
                  <strong>
                    {roomsMap.get(taskToDelete.room_id)?.room_number || taskToDelete.room_id}
                  </strong>{" "}
                  will be removed from staff schedules. This action cannot be undone.
                </p>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setTaskToDelete(null)}
                    disabled={isDeleting}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    Keep Task
                  </button>
                  <button
                    onClick={handleDeleteTask}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition shadow-2xs disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Delete Permanently"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Task Confirmation Modal */}
        {taskToCancel && canMutateStatus && (
          <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={() => setTaskToCancel(null)}
              />

              <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

              <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md w-full p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Cancel Housekeeping Task</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Mark Task #{taskToCancel.task_id} as cancelled?
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  If this room was in progress, cancelling will return the room cleanliness to{" "}
                  <strong>dirty</strong> if no other active cleaning tasks exist for it.
                </p>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setTaskToCancel(null)}
                    disabled={isUpdatingStatus || isCancelling}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    Keep Active
                  </button>
                  <button
                    onClick={() =>
                      handleStatusTransition(taskToCancel.task_id, "cancelled", "Task has been cancelled.")
                    }
                    disabled={isUpdatingStatus || isCancelling}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition shadow-2xs disabled:opacity-50"
                  >
                    {isCancelling ? "Cancelling..." : "Confirm Cancellation"}
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
