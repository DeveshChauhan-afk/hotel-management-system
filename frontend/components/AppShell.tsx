"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import HealthIndicator from "@/components/HealthIndicator";
import toast from "react-hot-toast";
import {
  LayoutDashboard,
  Users,
  BedDouble,
  DoorOpen,
  CalendarCheck,
  Receipt,
  Sparkles,
  Wrench,
  LogOut,
  Menu,
  X,
  Hotel,
  User as UserIcon,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Guests",
    href: "/guests",
    icon: Users,
    roles: ["admin", "manager", "receptionist"],
  },
  {
    name: "Room Types",
    href: "/room-types",
    icon: BedDouble,
    roles: ["admin", "manager"],
  },
  {
    name: "Rooms",
    href: "/rooms",
    icon: DoorOpen,
    roles: ["admin", "manager", "receptionist", "housekeeper", "maintenance"],
  },
  {
    name: "Bookings",
    href: "/bookings",
    icon: CalendarCheck,
    roles: ["admin", "manager", "receptionist"],
  },
  {
    name: "Billing",
    href: "/billing",
    icon: Receipt,
    roles: ["admin", "manager", "receptionist"],
  },
  {
    name: "Housekeeping",
    href: "/housekeeping",
    icon: Sparkles,
    roles: ["admin", "manager", "housekeeper"],
  },
  {
    name: "Maintenance",
    href: "/maintenance",
    icon: Wrench,
    roles: ["admin", "manager", "receptionist", "housekeeper", "maintenance"],
  },
];

const getRoleBadgeClasses = (role: string | null) => {
  switch (role?.toLowerCase()) {
    case "admin":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "manager":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "receptionist":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "housekeeper":
      return "bg-teal-100 text-teal-800 border-teal-200";
    case "maintenance":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

export default function AppShell({ children, title }: AppShellProps) {
  const { user, role, logout } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    toast.success("Signed out successfully");
    logout();
  };

  const userRole = (role || "").toLowerCase();
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    if (userRole === "admin") return true;
    return item.roles.map((r) => r.toLowerCase()).includes(userRole);
  });

  const isItemActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  const renderNavContent = (onItemClick?: () => void) => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200">
        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
          <Hotel className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-gray-900 tracking-tight truncate">
            Grand Luxe PMS
          </h1>
          <p className="text-xs text-gray-500 font-medium truncate">
            Hotel Operations
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 pb-2 text-[11px] font-semibold text-gray-400 tracking-wider uppercase">
          Menu
        </p>
        {visibleNavItems.map((item) => {
          const active = isItemActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onItemClick}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600 pl-2.5"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  active ? "text-blue-600" : "text-gray-500 group-hover:text-gray-700"
                }`}
              />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-semibold text-sm">
              {user?.username ? user.username.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.username || "Staff User"}
              </p>
              <span
                className={`inline-block border text-[10px] font-semibold px-2 py-0.2 rounded-full uppercase ${getRoleBadgeClasses(
                  role
                )}`}
              >
                {role || "Unknown"}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            aria-label="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-64 md:flex md:flex-col bg-white border-r border-gray-200 shadow-xs">
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer Backdrop & Panel */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[80vw] bg-white shadow-2xl flex flex-col z-50">
            {/* Close button header */}
            <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              {renderNavContent(() => setMobileMenuOpen(false))}
            </div>
          </div>
        </div>
      )}

      {/* Main Layout Area */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {title && (
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                {title}
              </h1>
            )}
          </div>

          {/* Top Header Actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            <HealthIndicator />

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200">
              <span className="text-sm font-medium text-gray-700">
                {user?.username}
              </span>
              <span
                className={`border text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${getRoleBadgeClasses(
                  role
                )}`}
              >
                {role}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-red-700 transition shadow-2xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Page Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
