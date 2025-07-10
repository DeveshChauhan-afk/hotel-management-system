import tkinter as tk
from tkinter import ttk
from db_config import get_connection
from guests import GuestManagement
from rooms import RoomManagement
from booking import BookingSystem
from billing import Billing

def open_dashboard(master, role):
    for widget in master.winfo_children():
        widget.destroy()

    master.geometry("1100x700")  # ⬅️ Bigger window
    master.title(f"Dashboard - {role.capitalize()}")

    frame = tk.Frame(master, bg="#f0f0f0", padx=20, pady=20)
    frame.pack(fill="both", expand=True)

    title_label = tk.Label(
        frame, text=f"🏨 Dashboard ({role.capitalize()})",
        font=("Segoe UI", 24, "bold"),
        bg="#f0f0f0"
    )
    title_label.pack(pady=20)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as total FROM rooms")
    total_rooms = cursor.fetchone()['total']

    cursor.execute("SELECT COUNT(*) as available FROM rooms WHERE status='available' AND cleaned=1")
    available_rooms = cursor.fetchone()['available']

    cursor.execute("SELECT COUNT(*) as occupied FROM rooms WHERE status='occupied'")
    occupied_rooms = cursor.fetchone()['occupied']

    cursor.execute("SELECT room_id, room_type FROM rooms WHERE status='occupied'")
    occupied_list = cursor.fetchall()

    conn.close()

    info_frame = tk.Frame(frame, bg="#f0f0f0")
    info_frame.pack(pady=20)

    def card(title, value, bg):
        card = tk.Frame(info_frame, bg=bg, padx=25, pady=15, bd=1, relief="solid")
        tk.Label(card, text=title, font=("Segoe UI", 13, "bold"), bg=bg, fg="white").pack()
        tk.Label(card, text=value, font=("Segoe UI", 24, "bold"), bg=bg, fg="white").pack()
        card.pack(side="left", padx=20)

    card("Total Rooms", total_rooms, "#6c757d")
    card("Available Rooms", available_rooms, "#198754")
    card("Occupied Rooms", occupied_rooms, "#dc3545")

    # Occupied room list
    table_frame = tk.Frame(frame, bg="#f0f0f0")
    table_frame.pack(pady=30)

    tk.Label(
        table_frame, text="📋 Currently Occupied Rooms",
        font=("Segoe UI", 16, "bold"), bg="#f0f0f0"
    ).pack(pady=10)

    columns = ("Room ID", "Room Type")
    tree = ttk.Treeview(table_frame, columns=columns, show='headings', height=8)
    for col in columns:
        tree.heading(col, text=col)
        tree.column(col, width=200, anchor='center')
    for row in occupied_list:
        tree.insert('', 'end', values=(row['room_id'], row['room_type']))
    tree.pack()

    # Navigation buttons
    nav = tk.Frame(frame, bg="#f0f0f0")
    nav.pack(pady=40)

    button_style = {"font": ("Segoe UI", 12), "width": 18, "padding": 6}
    ttk.Button(nav, text="Guest Management", command=lambda: GuestManagement(master, role)).pack(side="left", padx=10)
    ttk.Button(nav, text="Room Management", command=lambda: RoomManagement(master, role)).pack(side="left", padx=10)
    ttk.Button(nav, text="Booking", command=lambda: BookingSystem(master, role)).pack(side="left", padx=10)
    ttk.Button(nav, text="Billing", command=lambda: Billing(master, role)).pack(side="left", padx=10)

    def logout():
        for widget in master.winfo_children():
            widget.destroy()
        from login import LoginWindow  # ✅ Import only when needed to avoid circular import
        LoginWindow(master)

    ttk.Button(frame, text="Logout", command=logout).pack(pady=20)



