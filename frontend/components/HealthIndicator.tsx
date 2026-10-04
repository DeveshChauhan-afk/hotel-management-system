"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { RefreshCw } from "lucide-react";

interface HealthData {
  status: "healthy" | "unhealthy" | "unknown";
  database?: string;
  checkedAt?: Date;
}

export default function HealthIndicator() {
  const [health, setHealth] = useState<HealthData>({
    status: "unknown",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHealthStatus = async () => {
    try {
      // /health is public and verifies both web server and database connectivity
      const response = await api.get<{ status: string; database?: string }>("/health", {
        // Short timeout for health probe so it fails fast if server is offline
        timeout: 5000,
      });

      if (response.data && response.data.status === "healthy") {
        return {
          status: "healthy" as const,
          database: response.data.database || "connected",
          checkedAt: new Date(),
        };
      } else {
        return {
          status: "unhealthy" as const,
          database: response.data?.database || "disconnected",
          checkedAt: new Date(),
        };
      }
    } catch {
      return {
        status: "unhealthy" as const,
        database: "disconnected",
        checkedAt: new Date(),
      };
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    const result = await fetchHealthStatus();
    setHealth(result);
    setIsRefreshing(false);
  };

  useEffect(() => {
    let isMounted = true;

    const performPeriodicCheck = () => {
      fetchHealthStatus().then((result) => {
        if (isMounted) {
          setHealth(result);
        }
      });
    };

    // Initial health probe
    performPeriodicCheck();

    // Low-frequency polling: every 60 seconds
    const interval = setInterval(performPeriodicCheck, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const isHealthy = health.status === "healthy";
  const isUnhealthy = health.status === "unhealthy";

  return (
    <div
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 transition-colors bg-white shadow-2xs"
      title={`Backend Status: ${health.status} (${health.database || "unknown"})${
        health.checkedAt ? `\nLast checked: ${health.checkedAt.toLocaleTimeString()}` : ""
      }`}
    >
      {/* Animated status dot */}
      <span className="relative flex h-2 w-2">
        {isHealthy && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isHealthy
              ? "bg-emerald-500"
              : isUnhealthy
              ? "bg-rose-500"
              : "bg-amber-400 animate-pulse"
          }`}
        />
      </span>

      {/* Status label */}
      <span
        className={`hidden sm:inline ${
          isHealthy
            ? "text-emerald-700"
            : isUnhealthy
            ? "text-rose-700"
            : "text-amber-700"
        }`}
      >
        {isHealthy ? "API Operational" : isUnhealthy ? "API Offline" : "Checking..."}
      </span>

      {/* Quick manual refresh button */}
      <button
        onClick={handleManualRefresh}
        disabled={isRefreshing}
        aria-label="Refresh API health status"
        className="text-gray-400 hover:text-gray-600 disabled:opacity-50 p-0.5 rounded transition"
      >
        <RefreshCw
          className={`w-3 h-3 ${isRefreshing ? "animate-spin text-blue-600" : ""}`}
        />
      </button>
    </div>
  );
}
