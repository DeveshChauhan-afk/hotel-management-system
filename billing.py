import tkinter as tk
from tkinter import ttk, messagebox
from db_config import get_connection
from datetime import date,datetime
from receipt import generate_receipt  # Make sure this module exists

ROOM_PRICES = {
    "Single": 1000,
    "Deluxe": 2000,
    "Suite": 3000
}

class Billing:
    def __init__(self, master, role):
        self.master = master
        self.role = role

        for widget in master.winfo_children():
            widget.destroy()

        tk.Label(master, text="Billing & Checkout", font=("Helvetica", 18, "bold")).pack(pady=10)

        self.tree = ttk.Treeview(master, columns=("Booking ID", "Room", "Guest", "Type", "Check-in"), show="headings")
        self.tree.heading("Booking ID", text="Booking ID")
        self.tree.heading("Room", text="Room ID")
        self.tree.heading("Guest", text="Guest Name")
        self.tree.heading("Type", text="Room Type")
        self.tree.heading("Check-in", text="Check-in Date")
        self.tree.pack(pady=10)

        ttk.Button(master, text="Checkout Selected Booking", command=self.checkout_booking).pack(pady=10)
        ttk.Button(master, text="Back to Dashboard", command=self.back).pack(pady=5)

        self.load_bookings()

    def load_bookings(self):
        for row in self.tree.get_children():
            self.tree.delete(row)

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.booking_id, b.room_id, g.name, r.room_type, b.check_in_date
            FROM bookings b
            JOIN guests g ON b.guest_id = g.guest_id
            JOIN rooms r ON b.room_id = r.room_id
            WHERE b.check_out_date IS NULL
        """)
        for booking_id, room_id, name, room_type, check_in_date in cursor.fetchall():
            self.tree.insert('', 'end', values=(booking_id, room_id, name, room_type, check_in_date))
        conn.close()

    def checkout_booking(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showerror("Error", "Please select a booking")
            return

        values = self.tree.item(selected[0])["values"]
        booking_id, room_id, guest_name, room_type, check_in_date = values

        if isinstance(check_in_date, str):
            check_in_date = datetime.strptime(check_in_date, "%Y-%m-%d").date()
        today = date.today()
        days = (today - check_in_date).days or 1

        amount = days * ROOM_PRICES.get(room_type, 1000)

        confirm = messagebox.askyesno("Confirm", f"Checkout {guest_name}?\nStay: {days} days\nTotal: ₹{amount}")
        if not confirm:
            return

        conn = get_connection()
        cursor = conn.cursor()

        # Update booking with check-out
        cursor.execute("UPDATE bookings SET check_out_date=%s WHERE booking_id=%s", (today, booking_id))

        # Insert billing
        cursor.execute("INSERT INTO bills (booking_id, amount, billing_date) VALUES (%s, %s, %s)",
                       (booking_id, amount, today))

        # Update room to available and mark it not cleaned
        cursor.execute("UPDATE rooms SET status='available', cleaned=0 WHERE room_id=%s", (room_id,))

        conn.commit()
        conn.close()

        messagebox.showinfo("Success", f"Checked out and billed ₹{amount}")
        generate_receipt(booking_id)  # Create PDF
        self.load_bookings()

    def back(self):
        from dashboard import open_dashboard
        open_dashboard(self.master, self.role)
