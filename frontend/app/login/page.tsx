"use client";

import { useState } from "react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

export default function LoginPage() {

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  // ADD THIS HERE 👇
  const handleLogin = async () => {

    try {

      const response = await api.post("/login", {
        username,
        password
      });

      localStorage.setItem(
        "token",
        response.data.token
      );

      router.push("/dashboard");

      localStorage.setItem(
        "token",
        response.data.token
      );

alert("Login Successful");

    } catch (error) {

      console.error(error);

      alert("Login Failed");

    }
  };
  
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">

      <div className="bg-white p-8 rounded-xl shadow-lg w-96">

        <h1 className="text-2xl font-bold mb-6 text-center text-black">
          Hotel Login
        </h1>

        <input
          type="text"
          placeholder="Username"
          className="w-full border p-3 rounded mb-4 text-black"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border p-3 rounded mb-4 text-black"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}   // ADD THIS 👈
          className="w-full bg-blue-600 text-white p-3 rounded"
        >
          Login
        </button>

      </div>

    </main>
  );
}