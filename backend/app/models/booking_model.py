import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from app.extensions import db


def generate_booking_ref():
    return f"BK-{uuid.uuid4().hex[:10].upper()}"


class Booking(db.Model):
    __tablename__ = "bookings"

    booking_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    booking_ref = db.Column(
        db.String(32),
        unique=True,
        nullable=False,
        index=True,
        default=generate_booking_ref,
    )
    guest_id = db.Column(
        db.Integer,
        db.ForeignKey("guests.guest_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    room_type_id = db.Column(
        db.Integer,
        db.ForeignKey("room_types.room_type_id", ondelete="RESTRICT"),
        nullable=True,
    )
    room_id = db.Column(
        db.Integer,
        db.ForeignKey("rooms.room_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    check_in_date = db.Column(db.Date, default=date.today, nullable=False)
    check_out_date = db.Column(db.Date, nullable=True)
    actual_check_in = db.Column(db.DateTime(timezone=True), nullable=True)
    actual_check_out = db.Column(db.DateTime(timezone=True), nullable=True)
    num_adults = db.Column(db.Integer, default=1, nullable=False)
    num_children = db.Column(db.Integer, default=0, nullable=False)
    nightly_rate = db.Column(db.Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    total_amount = db.Column(db.Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    status = db.Column(
        db.Enum(
            "pending",
            "confirmed",
            "checked_in",
            "checked_out",
            "cancelled",
            "no_show",
            name="booking_status_enum",
        ),
        default="confirmed",
        nullable=False,
        index=True,
    )
    special_requests = db.Column(db.Text, nullable=True)
    cancellation_reason = db.Column(db.Text, nullable=True)
    created_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.CheckConstraint("check_out_date IS NULL OR check_out_date > check_in_date", name="chk_booking_dates"),
        db.CheckConstraint("actual_check_out IS NULL OR actual_check_out >= actual_check_in", name="chk_actual_dates"),
        db.CheckConstraint("num_adults > 0", name="chk_booking_adults"),
        db.CheckConstraint("num_children >= 0", name="chk_booking_children"),
        db.Index("idx_bookings_room_dates", "room_id", "check_in_date", "check_out_date", "status"),
        db.Index("idx_bookings_dates", "check_in_date", "check_out_date"),
    )

    # Relationships with back_populates
    guest = db.relationship("Guest", back_populates="bookings")
    room_type = db.relationship("RoomType", back_populates="bookings")
    room = db.relationship("Room", back_populates="bookings")
    creator = db.relationship(
        "User",
        back_populates="bookings_created",
        foreign_keys=[created_by_user_id],
    )
    bill = db.relationship(
        "Bill",
        back_populates="booking",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        return {
            "booking_id": self.booking_id,
            "booking_ref": self.booking_ref,
            "guest_id": self.guest_id,
            "room_type_id": self.room_type_id,
            "room_id": self.room_id,
            "check_in_date": str(self.check_in_date) if self.check_in_date else None,
            "check_out_date": str(self.check_out_date) if self.check_out_date else None,
            "actual_check_in": self.actual_check_in.isoformat() if self.actual_check_in else None,
            "actual_check_out": self.actual_check_out.isoformat() if self.actual_check_out else None,
            "num_adults": self.num_adults,
            "num_children": self.num_children,
            "nightly_rate": str(self.nightly_rate) if self.nightly_rate is not None else "0.00",
            "total_amount": str(self.total_amount) if self.total_amount is not None else "0.00",
            "status": self.status,
            "special_requests": self.special_requests,
            "cancellation_reason": self.cancellation_reason,
            "created_by_user_id": self.created_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }