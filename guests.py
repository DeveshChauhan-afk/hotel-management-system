import tkinter as tk
from tkinter import ttk, messagebox
from db_config import get_connection

class GuestManagement:
    def __init__(self, master, role):
        self.master = master
        self.role = role

        for widget in master.winfo_children():
            widget.destroy()

        tk.Label(master, text="Guest Management", font=("Helvetica", 18, "bold")).pack(pady=10)

        search_frame = tk.Frame(master)
        search_frame.pack(pady=10)

        tk.Label(search_frame, text="Search by Name or Phone:").pack(side="left")
        self.search_var = tk.StringVar()
        tk.Entry(search_frame, textvariable=self.search_var).pack(side="left", padx=5)
        ttk.Button(search_frame, text="Search", command=self.search_guests).pack(side="left", padx=5)
        ttk.Button(search_frame, text="Clear", command=self.load_guests).pack(side="left", padx=5)

        self.tree = ttk.Treeview(master, columns=("ID", "Name", "Phone"), show="headings")
        self.tree.heading("ID", text="Guest ID")
        self.tree.heading("Name", text="Name")
        self.tree.heading("Phone", text="Phone")

        self.tree.pack(pady=10)

        form_frame = tk.Frame(master)
        form_frame.pack(pady=10)

        tk.Label(form_frame, text="Name:").grid(row=0, column=0)
        self.name_entry = tk.Entry(form_frame)
        self.name_entry.grid(row=0, column=1, padx=5)

        tk.Label(form_frame, text="Phone:").grid(row=0, column=2)
        self.phone_entry = tk.Entry(form_frame)
        self.phone_entry.grid(row=0, column=3, padx=5)

        ttk.Button(form_frame, text="Add Guest", command=self.add_guest).grid(row=0, column=4, padx=5)

        ttk.Button(master, text="Back to Dashboard", command=self.back).pack(pady=10)

        self.load_guests()

    def load_guests(self):
        for row in self.tree.get_children():
            self.tree.delete(row)

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT guest_id, name, phone FROM guests")
        for guest_id, name, phone in cursor.fetchall():
            self.tree.insert('', 'end', values=(guest_id, name, phone))
        conn.close()

    def add_guest(self):
        name = self.name_entry.get().strip()
        phone = self.phone_entry.get().strip()

        if not name or not phone:
            messagebox.showerror("Error", "Please enter both name and phone number")
            return

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO guests (name, phone) VALUES (%s, %s)", (name, phone))
        conn.commit()
        conn.close()
        messagebox.showinfo("Success", "Guest added successfully")
        self.load_guests()
        self.name_entry.delete(0, tk.END)
        self.phone_entry.delete(0, tk.END)

    def search_guests(self):
        keyword = self.search_var.get().strip()

        if not keyword:
            messagebox.showerror("Error", "Enter name or phone to search")
            return

        for row in self.tree.get_children():
            self.tree.delete(row)

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT guest_id, name, phone FROM guests WHERE name LIKE %s OR phone LIKE %s",
                       (f'%{keyword}%', f'%{keyword}%'))
        for guest_id, name, phone in cursor.fetchall():
            self.tree.insert('', 'end', values=(guest_id, name, phone))
        conn.close()

    def back(self):
        from dashboard import open_dashboard
        open_dashboard(self.master, self.role)
