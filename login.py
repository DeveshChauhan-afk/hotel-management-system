import tkinter as tk
from tkinter import messagebox
from db_config import get_connection
from dashboard import open_dashboard

class LoginWindow:
    def __init__(self, master):
        self.master = master
        self.frame = tk.Frame(master)
        self.frame.pack(pady=150)

        tk.Label(self.frame, text="Username", font=('Arial', 14)).grid(row=0, column=0, padx=10, pady=10)
        tk.Label(self.frame, text="Password", font=('Arial', 14)).grid(row=1, column=0, padx=10, pady=10)
        self.username = tk.Entry(self.frame, font=('Arial', 14), width=25)
        self.password = tk.Entry(self.frame, show='*', font=('Arial', 14), width=25)

        self.username.grid(row=0, column=1)
        self.password.grid(row=1, column=1)

        tk.Button(self.frame, text="Login", command=self.login, font=('Arial', 12), width=10, height=1).grid(row=2, column=1, pady=15)


    def login(self):
        uname = self.username.get()
        pwd = self.password.get()

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT role FROM users WHERE username=%s AND password=%s", (uname, pwd))
        result = cursor.fetchone()
        conn.close()

        if result:
            role = result[0]
            self.frame.destroy()
            open_dashboard(self.master, role)
        else:
            messagebox.showerror("Error", "Invalid credentials")
