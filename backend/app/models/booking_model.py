from app.extensions import db
from datetime import date

class Booking(db.Model):

    __tablename__ = "bookings"

    booking_id = db.Column(db.Integer, primary_key=True)

    guest_id = db.Column(db.Integer)

    room_id = db.Column(db.Integer)

    check_in_date = db.Column(db.Date, default=date.today)

    check_out_date = db.Column(db.Date, nullable=True)

    def to_dict(self):

        return {
            "booking_id": self.booking_id,
            "guest_id": self.guest_id,
            "room_id": self.room_id,
            "check_in_date": str(self.check_in_date),
            "check_out_date": str(self.check_out_date)
        }