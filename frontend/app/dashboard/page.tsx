"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import toast from "react-hot-toast";
import { getDashboardStats, DashboardStats } from "@/lib/dashboardApi";
import { getHousekeepingTasks, HousekeepingTask } from "@/lib/housekeepingApi";
import { getMaintenanceRecords, MaintenanceRecord } from "@/lib/maintenanceApi";
import {
  DoorOpen,
  CalendarCheck,
  Users,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Receipt,
  Sparkles,
  Wrench,
  AlertCircle,
  Clock,
  ClipboardList,
  ShieldAlert,
} from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [hkTasks, setHkTasks] = useState<HousekeepingTask[] | null>(null);
  const [isLoadingHk, setIsLoadingHk] = useState<boolean>(false);
  const [hkError, setHkError] = useState<string | null>(null);

  const [maintRecords, setMaintRecords] = useState<MaintenanceRecord[] | null>(null);
  const [isLoadingMaint, setIsLoadingMaint] = useState<boolean>(false);
  const [maintError, setMaintError] = useState<string | null>(null);

  const { user, role, isLoading: authLoading } = useAuth();
  const userRole = (role || "").toLowerCase();

  const canViewHousekeeping =
    userRole === "admin" ||
    userRole === "manager" ||
    userRole === "receptionist" ||
    userRole === "housekeeper";

  const canViewMaintenance =
    userRole === "admin" ||
    userRole === "manager" ||
    userRole === "receptionist" ||
    userRole === "maintenance";

  const extractErrorMessage = (error: unknown, fallback: string): string => {
    const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
    return axiosErr.response?.data?.error || axiosErr.message || fallback;
  };

  const loadStats = useCallback(async (isManual = false) => {
    setIsLoadingStats(true);
    try {
      const data = await getDashboardStats();
      setStats(data);
      setFetchError(null);
      if (isManual) {
        toast.success("Hotel metrics updated");
      }
    } catch (error: unknown) {
      const msg = extractErrorMessage(error, "Failed to load dashboard metrics");
      setFetchError(msg);
      if (isManual) {
        toast.error(msg);
      }
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const loadHousekeeping = useCallback(async (isManual = false) => {
    if (!canViewHousekeeping) return;
    setIsLoadingHk(true);
    try {
      const data = await getHousekeepingTasks();
      setHkTasks(data);
      setHkError(null);
      if (isManual) {
        toast.success("Housekeeping tasks updated");
      }
    } catch (error: unknown) {
      const msg = extractErrorMessage(error, "Failed to load housekeeping tasks");
      setHkError(msg);
      if (isManual) {
        toast.error(msg);
      }
    } finally {
      setIsLoadingHk(false);
    }
  }, [canViewHousekeeping]);

  const loadMaintenance = useCallback(async (isManual = false) => {
    if (!canViewMaintenance) return;
    setIsLoadingMaint(true);
    try {
      const data = await getMaintenanceRecords();
      setMaintRecords(data);
      setMaintError(null);
      if (isManual) {
        toast.success("Maintenance records updated");
      }
    } catch (error: unknown) {
      const msg = extractErrorMessage(error, "Failed to load maintenance records");
      setMaintError(msg);
      if (isManual) {
        toast.error(msg);
      }
    } finally {
      setIsLoadingMaint(false);
    }
  }, [canViewMaintenance]);

  useEffect(() => {
    if (authLoading) return;
    let isMounted = true;

    getDashboardStats()
      .then((data) => {
        if (isMounted) {
          setStats(data);
          setFetchError(null);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setFetchError(extractErrorMessage(error, "Failed to load dashboard metrics"));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingStats(false);
        }
      });

    if (canViewHousekeeping) {
      getHousekeepingTasks()
        .then((data) => {
          if (isMounted) {
            setHkTasks(data);
            setHkError(null);
          }
        })
        .catch((error: unknown) => {
          if (isMounted) {
            setHkError(extractErrorMessage(error, "Failed to load housekeeping tasks"));
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingHk(false);
          }
        });
    }

    if (canViewMaintenance) {
      getMaintenanceRecords()
        .then((data) => {
          if (isMounted) {
            setMaintRecords(data);
            setMaintError(null);
          }
        })
        .catch((error: unknown) => {
          if (isMounted) {
            setMaintError(extractErrorMessage(error, "Failed to load maintenance records"));
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingMaint(false);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [authLoading, canViewHousekeeping, canViewMaintenance]);

  const isStatsLoading = isLoadingStats || (stats === null && !fetchError);
  const isHkLoading = isLoadingHk || (canViewHousekeeping && hkTasks === null && !hkError);
  const isMaintLoading = isLoadingMaint || (canViewMaintenance && maintRecords === null && !maintError);

  const isRefreshing = isStatsLoading || isHkLoading || isMaintLoading;

  const handleRefreshAll = async () => {
    const promises: Promise<unknown>[] = [loadStats()];
    if (canViewHousekeeping) {
      promises.push(loadHousekeeping());
    }
    if (canViewMaintenance) {
      promises.push(loadMaintenance());
    }
    await Promise.allSettled(promises);
    toast.success("Metrics updated");
  };

  // Operational metrics derivation
  const pendingHkTasks = hkTasks?.filter((t) => t.status === "pending").length ?? 0;
  const inProgressHkTasks = hkTasks?.filter((t) => t.status === "in_progress").length ?? 0;
  const completedHkTasks =
    hkTasks?.filter((t) => t.status === "completed" || t.status === "verified").length ?? 0;

  const reportedMaintOrders = maintRecords?.filter((r) => r.status === "reported").length ?? 0;
  const inProgressMaintOrders = maintRecords?.filter((r) => r.status === "in_progress").length ?? 0;
  const activeBlockingMaintOrders =
    maintRecords?.filter(
      (r) =>
        Boolean(r.blocks_room_occupancy) &&
        r.status !== "completed" &&
        r.status !== "cancelled"
    ).length ?? 0;

  return (
    <ProtectedRoute>
      <AppShell title="Dashboard">
        <div className="space-y-8">
          {/* Welcome Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                Welcome back, {user?.username || "Staff Member"}!
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Here is a live summary of room inventory and guest operations.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshAll}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-hidden disabled:opacity-50 transition shadow-2xs cursor-pointer"
              >
                <RefreshCw
                  className={`w-4 h-4 text-gray-500 ${
                    isRefreshing ? "animate-spin text-blue-600" : ""
                  }`}
                />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Key Hotel Metrics Grid */}
          <section aria-label="Key Hotel Metrics">
            {isStatsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-white p-6 rounded-xl border border-gray-200 shadow-2xs animate-pulse space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-4 bg-gray-200 rounded w-24" />
                      <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                    </div>
                    <div className="h-8 bg-gray-200 rounded w-16" />
                    <div className="h-3 bg-gray-100 rounded w-32" />
                  </div>
                ))}
              </div>
            ) : fetchError ? (
              <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-red-800">
                    Failed to load metrics
                  </h3>
                  <p className="text-sm text-red-700 mt-1">{fetchError}</p>
                  <button
                    onClick={() => loadStats(true)}
                    className="mt-3 text-sm font-semibold text-red-800 hover:text-red-900 inline-flex items-center gap-1.5 underline cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Request
                  </button>
                </div>
              </div>
            ) : stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Rooms */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-2xs hover:shadow-xs transition">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Total Rooms
                    </span>
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <DoorOpen className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-extrabold text-gray-900 mt-3 tracking-tight">
                    {stats.total_rooms}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Configured inventory</p>
                </div>

                {/* Available Rooms */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-2xs hover:shadow-xs transition">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Available Rooms
                    </span>
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-extrabold text-emerald-600 mt-3 tracking-tight">
                    {stats.available_rooms}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Ready for check-in</p>
                </div>

                {/* Occupied Rooms */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-2xs hover:shadow-xs transition">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Occupied Rooms
                    </span>
                    <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-extrabold text-amber-600 mt-3 tracking-tight">
                    {stats.occupied_rooms}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">In-house guests</p>
                </div>

                {/* Total Bookings */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-2xs hover:shadow-xs transition">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Total Bookings
                    </span>
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <CalendarCheck className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-extrabold text-indigo-600 mt-3 tracking-tight">
                    {stats.total_bookings}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">All-time reservations</p>
                </div>
              </div>
            ) : null}
          </section>

          {/* Operational Summaries Section */}
          {(canViewHousekeeping || canViewMaintenance) && (
            <section aria-label="Operational Summaries" className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                  Operational Summaries
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Real-time status overview of room turnover and maintenance activity.
                </p>
              </div>

              <div
                className={`grid grid-cols-1 ${
                  canViewHousekeeping && canViewMaintenance
                    ? "lg:grid-cols-2"
                    : "max-w-2xl"
                } gap-6`}
              >
                {/* Housekeeping Summary Widget */}
                {canViewHousekeeping && (
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
                    <div>
                      {/* Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-gray-900">
                              Housekeeping Summary
                            </h4>
                            <p className="text-xs text-gray-500">
                              Room cleaning & turnover activity
                            </p>
                          </div>
                        </div>
                        <Link
                          href="/housekeeping"
                          className="text-xs font-semibold text-teal-600 hover:text-teal-700 inline-flex items-center gap-1 group"
                        >
                          <span>Manage Tasks</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      </div>

                      {/* Content */}
                      <div className="mt-4">
                        {isHkLoading ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[...Array(3)].map((_, i) => (
                              <div
                                key={i}
                                className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 animate-pulse space-y-2"
                              >
                                <div className="h-3 bg-gray-200 rounded w-16" />
                                <div className="h-7 bg-gray-200 rounded w-10" />
                                <div className="h-2 bg-gray-100 rounded w-20" />
                              </div>
                            ))}
                          </div>
                        ) : hkError ? (
                          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <h5 className="text-sm font-semibold text-red-800">
                                Failed to load housekeeping tasks
                              </h5>
                              <p className="text-xs text-red-700 mt-0.5">{hkError}</p>
                              <button
                                onClick={() => loadHousekeeping(true)}
                                className="mt-2 text-xs font-semibold text-red-800 hover:text-red-900 inline-flex items-center gap-1 underline cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" /> Retry Request
                              </button>
                            </div>
                          </div>
                        ) : hkTasks && hkTasks.length === 0 ? (
                          <div className="py-8 px-4 text-center rounded-xl bg-gray-50/70 border border-dashed border-gray-200">
                            <CheckCircle2 className="w-8 h-8 text-teal-600 mx-auto mb-2 opacity-80" />
                            <p className="text-sm font-medium text-gray-900">
                              No housekeeping tasks recorded
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              All rooms are serviced or no tasks scheduled.
                            </p>
                            <Link
                              href="/housekeeping"
                              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"
                            >
                              <span>Open Housekeeping</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* Pending tasks */}
                            <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-amber-800">
                                  Pending Tasks
                                </span>
                                <Clock className="w-4 h-4 text-amber-500" />
                              </div>
                              <p className="text-2xl font-extrabold text-amber-900 mt-2 tracking-tight">
                                {pendingHkTasks}
                              </p>
                              <p className="text-[11px] text-amber-700 mt-0.5">
                                Awaiting start
                              </p>
                            </div>

                            {/* In-progress tasks */}
                            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/40">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-blue-800">
                                  In-Progress
                                </span>
                                <RefreshCw className="w-4 h-4 text-blue-500" />
                              </div>
                              <p className="text-2xl font-extrabold text-blue-900 mt-2 tracking-tight">
                                {inProgressHkTasks}
                              </p>
                              <p className="text-[11px] text-blue-700 mt-0.5">
                                Currently cleaning
                              </p>
                            </div>

                            {/* Completed tasks */}
                            <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-emerald-800">
                                  Completed / Verified
                                </span>
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              </div>
                              <p className="text-2xl font-extrabold text-emerald-900 mt-2 tracking-tight">
                                {completedHkTasks}
                              </p>
                              <p className="text-[11px] text-emerald-700 mt-0.5">
                                Cleaned & inspection ready
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Maintenance Summary Widget */}
                {canViewMaintenance && (
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
                    <div>
                      {/* Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <Wrench className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-gray-900">
                              Maintenance Summary
                            </h4>
                            <p className="text-xs text-gray-500">
                              Work orders & equipment repairs
                            </p>
                          </div>
                        </div>
                        <Link
                          href="/maintenance"
                          className="text-xs font-semibold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1 group"
                        >
                          <span>Manage Orders</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      </div>

                      {/* Content */}
                      <div className="mt-4">
                        {isMaintLoading ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[...Array(3)].map((_, i) => (
                              <div
                                key={i}
                                className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 animate-pulse space-y-2"
                              >
                                <div className="h-3 bg-gray-200 rounded w-16" />
                                <div className="h-7 bg-gray-200 rounded w-10" />
                                <div className="h-2 bg-gray-100 rounded w-20" />
                              </div>
                            ))}
                          </div>
                        ) : maintError ? (
                          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <h5 className="text-sm font-semibold text-red-800">
                                Failed to load maintenance records
                              </h5>
                              <p className="text-xs text-red-700 mt-0.5">{maintError}</p>
                              <button
                                onClick={() => loadMaintenance(true)}
                                className="mt-2 text-xs font-semibold text-red-800 hover:text-red-900 inline-flex items-center gap-1 underline cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" /> Retry Request
                              </button>
                            </div>
                          </div>
                        ) : maintRecords && maintRecords.length === 0 ? (
                          <div className="py-8 px-4 text-center rounded-xl bg-gray-50/70 border border-dashed border-gray-200">
                            <CheckCircle2 className="w-8 h-8 text-amber-600 mx-auto mb-2 opacity-80" />
                            <p className="text-sm font-medium text-gray-900">
                              No maintenance work orders recorded
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              All facilities operating normally with no open work orders.
                            </p>
                            <Link
                              href="/maintenance"
                              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700"
                            >
                              <span>Open Maintenance</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* Reported work orders */}
                            <div className="p-4 rounded-xl border border-sky-100 bg-sky-50/40">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-sky-800">
                                  Reported Orders
                                </span>
                                <ClipboardList className="w-4 h-4 text-sky-500" />
                              </div>
                              <p className="text-2xl font-extrabold text-sky-900 mt-2 tracking-tight">
                                {reportedMaintOrders}
                              </p>
                              <p className="text-[11px] text-sky-700 mt-0.5">
                                Newly filed orders
                              </p>
                            </div>

                            {/* In-progress work orders */}
                            <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-amber-800">
                                  In-Progress
                                </span>
                                <RefreshCw className="w-4 h-4 text-amber-500" />
                              </div>
                              <p className="text-2xl font-extrabold text-amber-900 mt-2 tracking-tight">
                                {inProgressMaintOrders}
                              </p>
                              <p className="text-[11px] text-amber-700 mt-0.5">
                                Repairs underway
                              </p>
                            </div>

                            {/* Active work orders blocking room occupancy */}
                            <div
                              className={`p-4 rounded-xl border ${
                                activeBlockingMaintOrders > 0
                                  ? "border-rose-200 bg-rose-50/50"
                                  : "border-emerald-100 bg-emerald-50/40"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-xs font-medium ${
                                    activeBlockingMaintOrders > 0
                                      ? "text-rose-800"
                                      : "text-emerald-800"
                                  }`}
                                >
                                  Blocking Occupancy
                                </span>
                                {activeBlockingMaintOrders > 0 ? (
                                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                )}
                              </div>
                              <p
                                className={`text-2xl font-extrabold mt-2 tracking-tight ${
                                  activeBlockingMaintOrders > 0
                                    ? "text-rose-900"
                                    : "text-emerald-900"
                                }`}
                              >
                                {activeBlockingMaintOrders}
                              </p>
                              <p
                                className={`text-[11px] mt-0.5 ${
                                  activeBlockingMaintOrders > 0
                                    ? "text-rose-700 font-medium"
                                    : "text-emerald-700"
                                }`}
                              >
                                {activeBlockingMaintOrders > 0
                                  ? "Rooms out of order"
                                  : "No rooms blocked"}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Quick Operations Section */}
          <section className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-2xs">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                Quick Actions & Operational Workflows
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Navigate directly to core management modules according to your role permissions.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Front Desk / Bookings */}
              {(userRole === "admin" ||
                userRole === "manager" ||
                userRole === "receptionist") && (
                <>
                  <Link
                    href="/bookings"
                    className="group p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                        <CalendarCheck className="w-5 h-5" />
                      </div>
                      <h4 className="text-base font-semibold text-gray-900 group-hover:text-blue-700 transition">
                        Reservations & Bookings
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Create reservations, auto-assign rooms, check in/out guests.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 gap-1">
                      <span>View Bookings</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>

                  <Link
                    href="/guests"
                    className="group p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                        <Users className="w-5 h-5" />
                      </div>
                      <h4 className="text-base font-semibold text-gray-900 group-hover:text-blue-700 transition">
                        Guest Profiles
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Register new guests, manage contact details, search records.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 gap-1">
                      <span>View Guests</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>

                  <Link
                    href="/billing"
                    className="group p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <h4 className="text-base font-semibold text-gray-900 group-hover:text-blue-700 transition">
                        Billing & Checkout
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Review folios, process cash/card payments, finalize checkout.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 gap-1">
                      <span>Manage Folios</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                </>
              )}

              {/* Room Inventory */}
              <Link
                href="/rooms"
                className="group p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 transition flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <DoorOpen className="w-5 h-5" />
                  </div>
                  <h4 className="text-base font-semibold text-gray-900 group-hover:text-blue-700 transition">
                    Rooms & Inventory
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Check room occupancy, cleanliness status, and availability.
                  </p>
                </div>
                <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 gap-1">
                  <span>Explore Rooms</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Housekeeping Quick Action: admin, manager, receptionist, housekeeper */}
              {(userRole === "admin" ||
                userRole === "manager" ||
                userRole === "receptionist" ||
                userRole === "housekeeper") && (
                <Link
                  href="/housekeeping"
                  className="group p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h4 className="text-base font-semibold text-gray-900 group-hover:text-blue-700 transition">
                      Housekeeping Tasks
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Assign cleaning orders, update room sanitation statuses.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 gap-1">
                    <span>Manage Tasks</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              )}

              {/* Maintenance Quick Action: admin, manager, receptionist, maintenance */}
              {(userRole === "admin" ||
                userRole === "manager" ||
                userRole === "receptionist" ||
                userRole === "maintenance") && (
                <Link
                  href="/maintenance"
                  className="group p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                      <Wrench className="w-5 h-5" />
                    </div>
                    <h4 className="text-base font-semibold text-gray-900 group-hover:text-blue-700 transition">
                      Maintenance Tickets
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Report equipment defects, track work orders, restore room status.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 gap-1">
                    <span>View Tickets</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              )}
            </div>
          </section>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}