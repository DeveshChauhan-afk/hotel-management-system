import tkinter as tk
from tkinter import ttk, messagebox
from db_config import get_connection
from datetime import date
from tkinter import Toplevel, Label, Entry, Button, messagebox

class BookingWindow:
    def __init__(self, master):
        self.window = Toplevel(master)
        self.window.title("Booking")
        self.window.geometry("400x300")

        Label(self.window, text="Booking Window (Under Construction)").pack(pady=50)

        Button(self.window, text="Close", command=self.window.destroy).pack(pady=20)

class BookingSystem:
    def __init__(self, master, role):
        self.master = master
        self.role = role

        for widget in master.winfo_children():
            widget.destroy()

        tk.Label(master, text="Room Booking", font=("Helvetica", 18, "bold")).pack(pady=10)

        form_frame = tk.Frame(master)
        form_frame.pack(pady=10)

        tk.Label(form_frame, text="Select Guest:").grid(row=0, column=0)
        self.guest_var = tk.StringVar()
        self.guest_dropdown = ttk.Combobox(form_frame, textvariable=self.guest_var, width=30)
        self.guest_dropdown.grid(row=0, column=1, padx=10)

        tk.Label(form_frame, text="Room Type:").grid(row=1, column=0)
        self.room_type_var = ttk.Combobox(form_frame, values=["Single", "Deluxe", "Suite"])
        self.room_type_var.grid(row=1, column=1, padx=10)

        tk.Label(form_frame, text="Room ID (Auto-filled, editable):").grid(row=2, column=0)
        self.room_id_entry = tk.Entry(form_frame)
        self.room_id_entry.grid(row=2, column=1, padx=10)

        ttk.Button(form_frame, text="Auto Assign Room", command=self.auto_assign_room).grid(row=2, column=2, padx=10)

        ttk.Button(master, text="Book Room", command=self.book_room).pack(pady=10)
        ttk.Button(master, text="Back to Dashboard", command=self.back).pack()

        self.load_guests()

    def load_guests(self):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT guest_id, name FROM guests")
        self.guest_map = {f"{name} (ID: {guest_id})": guest_id for guest_id, name in cursor.fetchall()}
        self.guest_dropdown['values'] = list(self.guest_map.keys())
        conn.close()

    def auto_assign_room(self):
        room_type = self.room_type_var.get()
        if not room_type:
            messagebox.showerror("Error", "Select room type first")
            return

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT room_id FROM rooms WHERE room_type=%s AND status='available' AND cleaned=1 LIMIT 1", (room_type,))
        result = cursor.fetchone()
        conn.close()

        if result:
            self.room_id_entry.delete(0, tk.END)
            self.room_id_entry.insert(0, result[0])
        else:
            messagebox.showwarning("Unavailable", "No available & cleaned room for selected type")

    def book_room(self):
        guest_label = self.guest_var.get()
        guest_id = self.guest_map.get(guest_label)
        room_id = self.room_id_entry.get()
        room_type = self.room_type_var.get()

        if not guest_id or not room_id or not room_type:
            messagebox.showerror("Error", "Please fill in all fields")
            return

        conn = get_connection()
        cursor = conn.cursor()

        # Check if room is still available and cleaned
        cursor.execute("SELECT status, cleaned FROM rooms WHERE room_id=%s", (room_id,))
        result = cursor.fetchone()
        print("DEBUG: Room status and cleaned value:", result)

        if not result or result[0] != 'Available' or int(result[1]) != 1:
            messagebox.showerror("Error", "Selected room is not available or cleaned")
            conn.close()
            return

        # Insert booking
        cursor.execute(
            "INSERT INTO bookings (guest_id, room_id, check_in, check_out) VALUES (%s, %s, %s, NULL)",
            (guest_id, room_id, date.today())
        )

        # Mark room as occupied
        cursor.execute("UPDATE rooms SET status='occupied' WHERE room_id=%s", (room_id,))
        conn.commit()
        conn.close()

        messagebox.showinfo("Success", f"Room {room_id} booked for Guest ID {guest_id}")
        self.room_id_entry.delete(0, tk.END)
        self.room_type_var.set('')
        self.guest_var.set('')

    def back(self):
        from dashboard import open_dashboard
        open_dashboard(self.master, self.role)
