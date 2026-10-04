"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import toast from "react-hot-toast";
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
} from "lucide-react";

interface DashboardStats {
  total_rooms: number;
  available_rooms: number;
  occupied_rooms: number;
  total_bookings: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { user, role } = useAuth();

  const loadStats = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsLoadingStats(true);
    }
    try {
      // Authorization header is automatically attached by our Axios request interceptor
      const response = await api.get<DashboardStats>("/dashboard/stats");
      setStats(response.data);
      setFetchError(null);
      if (isManualRefresh) {
        toast.success("Metrics updated");
      }
    } catch (error: unknown) {
      console.error("Failed to load dashboard metrics:", error);
      const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to load dashboard metrics";
      setFetchError(errorMessage);
      if (isManualRefresh) {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    api
      .get<DashboardStats>("/dashboard/stats")
      .then((response) => {
        if (isMounted) {
          setStats(response.data);
          setFetchError(null);
          setIsLoadingStats(false);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          console.error("Failed to load dashboard metrics:", error);
          const axiosErr = error as { response?: { data?: { error?: string } }; message?: string };
          setFetchError(
            axiosErr.response?.data?.error ||
              axiosErr.message ||
              "Failed to load dashboard metrics"
          );
          setIsLoadingStats(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const userRole = (role || "").toLowerCase();

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
                onClick={() => loadStats(true)}
                disabled={isLoadingStats}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-hidden disabled:opacity-50 transition shadow-2xs"
              >
                <RefreshCw
                  className={`w-4 h-4 text-gray-500 ${
                    isLoadingStats ? "animate-spin text-blue-600" : ""
                  }`}
                />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <section aria-label="Key Hotel Metrics">
            {isLoadingStats ? (
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
                    className="mt-3 text-sm font-semibold text-red-800 hover:text-red-900 inline-flex items-center gap-1.5 underline"
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

              {/* Housekeeping */}
              {(userRole === "admin" ||
                userRole === "manager" ||
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

              {/* Maintenance */}
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
            </div>
          </section>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}