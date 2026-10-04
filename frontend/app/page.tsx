import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md border border-gray-200">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-3">
          Hotel Management System
        </h1>
        <p className="text-gray-600 mb-6">
          Welcome to the hotel administration portal. Please sign in to manage rooms, bookings, and operations.
        </p>
        <Link
          href="/login"
          className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition duration-150"
        >
          Sign In to Portal
        </Link>
      </div>
    </main>
  );
}