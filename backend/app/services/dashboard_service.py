from app.models.room_model import Room
from app.models.booking_model import Booking

def get_dashboard_stats():

    total_rooms = Room.query.count()

    available_rooms = Room.query.filter_by(
        status="available"
    ).count()

    occupied_rooms = Room.query.filter_by(
        status="occupied"
    ).count()

    total_bookings = Booking.query.count()

    return {
        "total_rooms": total_rooms,
        "available_rooms": available_rooms,
        "occupied_rooms": occupied_rooms,
        "total_bookings": total_bookings
    }