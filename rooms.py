import tkinter as tk
from tkinter import ttk, messagebox
from db_config import get_connection

class RoomManagement:
    def __init__(self, master, role):
        self.master = master
        self.role = role

        for widget in master.winfo_children():
            widget.destroy()

        tk.Label(master, text="Room Management", font=("Helvetica", 18, "bold")).pack(pady=10)

        self.tree = ttk.Treeview(master, columns=("ID", "Type", "Status", "Cleaned"), show="headings")
        self.tree.heading("ID", text="Room ID")
        self.tree.heading("Type", text="Room Type")
        self.tree.heading("Status", text="Status")
        self.tree.heading("Cleaned", text="Cleaned")

        self.tree.pack(pady=10)

        self.load_rooms()

        form_frame = tk.Frame(master)
        form_frame.pack(pady=20)

        # Dropdown for room type
        tk.Label(form_frame, text="Room Type:").grid(row=0, column=0)
        self.room_type_var = ttk.Combobox(form_frame, values=["Single", "Deluxe", "Suite"])
        self.room_type_var.grid(row=0, column=1)

        # Only Admin can add rooms
        if self.role == 'admin':
            ttk.Button(form_frame, text="Add Room", command=self.add_room).grid(row=0, column=2, padx=10)

        # Update cleaned status
        ttk.Button(form_frame, text="Mark as Cleaned", command=self.mark_cleaned).grid(row=1, column=1, pady=10)
        ttk.Button(master, text="Back to Dashboard", command=self.back).pack(pady=10)

    def load_rooms(self):
        for row in self.tree.get_children():
            self.tree.delete(row)

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT room_id, room_type, status, cleaned FROM rooms")
        for (room_id, room_type, status, cleaned) in cursor.fetchall():
            cleaned_str = "Yes" if cleaned else "No"
            self.tree.insert('', 'end', values=(room_id, room_type, status, cleaned_str))
        conn.close()

    def add_room(self):
        room_type = self.room_type_var.get()
        if not room_type:
            messagebox.showerror("Error", "Select room type")
            return

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO rooms (room_type, status, cleaned) VALUES (%s, 'available', 1)", (room_type,))
        conn.commit()
        conn.close()
        messagebox.showinfo("Success", "Room added")
        self.load_rooms()

    def mark_cleaned(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showerror("Error", "Select a room")
            return

        room_id = self.tree.item(selected[0])['values'][0]

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE rooms SET cleaned=1 WHERE room_id=%s", (room_id,))
        conn.commit()
        conn.close()
        messagebox.showinfo("Success", f"Room {room_id} marked as cleaned.")
        self.load_rooms()

    def back(self):
        from dashboard import open_dashboard
        open_dashboard(self.master, self.role)
