"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

interface DashboardStats {
  total_rooms: number;
  available_rooms: number;
  occupied_rooms: number;
  total_bookings: number;
}

export default function Dashboard() {

  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {

    const fetchStats = async () => {

      try {

        const token = localStorage.getItem("token");

        const response = await api.get(
          "/dashboard/stats",
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        setStats(response.data);

      } catch (error) {
        console.error(error);
      }

    };

    fetchStats();

  }, []);

  if (!stats) {
    return (
      <div className="p-10">
        Loading Dashboard...
      </div>
    );
  }

  return (
    <main className="p-10">

      <h1 className="text-4xl font-bold mb-8 text-white">
        Hotel Dashboard
      </h1>

      <div className="grid grid-cols-4 gap-6">

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-gray-500">Total Rooms</h2>
          <p className="text-3xl font-bold text-black">
            {stats.total_rooms}
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-gray-500">Available Rooms</h2>
          <p className="text-3xl font-bold text-green-600">
            {stats.available_rooms}
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-gray-500">Occupied Rooms</h2>
          <p className="text-3xl font-bold text-red-600">
            {stats.occupied_rooms}
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-gray-500">Total Bookings</h2>
          <p className="text-3xl font-bold text-blue-600">
            {stats.total_bookings}
          </p>
        </div>

      </div>

    </main>
  );
}