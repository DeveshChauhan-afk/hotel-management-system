🏨 Hotel Management System (Tkinter + MySQL + ReportLab)



This is a simple Hotel Management System desktop application built using Python's Tkinter for GUI, MySQL for database, and ReportLab for generating PDF bills/reports.



---



# 🚀 Features



- Guest check-in / check-out

- Room availability tracking

- Booking management

- PDF bill generation using ReportLab

- Admin and receptionist login system



---



# 📦 Tech Stack



Frontend: Tkinter (Python GUI)

Backend: Python

Database: MySQL

PDF Reporting: ReportLab



---



# 📁 Project Structure (Flat)



hotel-management-system/

├── app.py   #Entry point of the app

├── db_config.py   # MySQL database connection setup

├── requirements.txt   # Required Python packages

├── hotel_db.sql     # SQL script to create and populate DB

├── README.md

├── .gitignore

├── billing.py

├── booking.py

├── dashboard.py

├── guests.py

├── login.py

├── receipt.py

├── rooms.py

---



## 🛠️ Installation \& Setup



1. Clone the Repository



```bash

git clone https://github.com/your-username/hotel-management-system.git

cd hotel-management-system



2. Install Required Packages

pip install -r requirements.txt




3. Setup MySQL Database

  1.Make sure MySQL is installed and running.

  2.Run the SQL script to create tables and insert sample data:


     mysql -u root -p < hotel_db.sql



###Make sure db_config.py has your correct MySQL credentials:


conn = mysql.connector.connect(

   host="localhost",

   user="root",

   password="0000",         # Replace with your MySQL password

   database="hotel_db"

)



###▶️ How to Run

python app.py





🔐 Default Credentials

Username	Password	Role

admin	        admin123	admin



(You can change or add users manually in the users table.)



🧑‍💻 Author

Devesh Chauhan

Email: chauhandevesh88@gmail.com

GitHub: @DeveshChauhan-afk





## 📃 License



This project is licensed under the [MIT License](LICENSE).






