from app.extensions import db

from app.models.room_model import Room
from app.models.booking_model import Booking

def create_booking(guest_id, room_id):

    room = Room.query.filter_by(room_id=room_id).first()

    if not room:
        return {
            "error": "Room not found"
        }, 404

    if room.status != "available":
        return {
            "error": "Room not available"
        }, 400

    if not room.cleaned:
        return {
            "error": "Room not cleaned"
        }, 400

    booking = Booking(
        guest_id=guest_id,
        room_id=room_id
    )

    room.status = "occupied"

    db.session.add(booking)

    db.session.commit()

    return {
        "message": "Room booked successfully",
        "booking": booking.to_dict()
    }, 201