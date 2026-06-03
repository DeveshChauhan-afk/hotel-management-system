from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from db_config import get_connection

def generate_receipt(booking_id):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT g.name, g.phone, r.room_type, b.check_in_date, b.check_out_date, bi.amount
        FROM bookings b
        JOIN guests g ON b.guest_id = g.guest_id
        JOIN rooms r ON b.room_id = r.room_id
        JOIN bills bi ON b.booking_id = bi.booking_id
        WHERE b.booking_id = %s
    """, (booking_id,))
    data = cursor.fetchone()
    conn.close()

    if not data:
        print("No data found for receipt.")
        return

    name, phone, room_type, check_in_date, check_out_date, amount = data

    filename = f"receipt_{booking_id}.pdf"
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2.0, height - 50, "Hotel Booking Receipt")

    c.setFont("Helvetica", 12)
    y = height - 100
    lines = [
        f"Booking ID: {booking_id}",
        f"Guest Name: {name}",
        f"Phone: {phone}",
        f"Room Type: {room_type}",
        f"Check-in Date: {check_in_date}",
        f"Check-out Date: {check_out_date}",
        f"Total Amount: ₹{amount}",
    ]

    for line in lines:
        c.drawString(100, y, line)
        y -= 25

    c.drawString(100, y - 10, "Thank you for staying with us!")
    c.save()
    print(f"Receipt generated: {filename}")
