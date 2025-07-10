import tkinter as tk
from login import LoginWindow

if __name__ == "__main__":
    root = tk.Tk()
    root.title("Hotel Management System")
    root.geometry("1000x600")
    app = LoginWindow(root)
    root.mainloop()
