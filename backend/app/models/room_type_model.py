from datetime import datetime, timezone
from decimal import Decimal
from app.extensions import db


class RoomType(db.Model):
    __tablename__ = "room_types"

    room_type_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    base_price = db.Column(db.Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    max_occupancy = db.Column(db.Integer, nullable=False, default=2)
    bed_config = db.Column(db.String(60), nullable=False, default="1 Queen Bed")
    amenities = db.Column(db.JSON, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)

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
        db.CheckConstraint("base_price >= 0", name="chk_room_type_base_price"),
        db.CheckConstraint("max_occupancy >= 1", name="chk_room_type_max_occupancy"),
    )

    # Relationships
    rooms = db.relationship("Room", back_populates="room_type")
    bookings = db.relationship("Booking", back_populates="room_type")

    def to_dict(self):
        return {
            "room_type_id": self.room_type_id,
            "name": self.name,
            "code": self.code,
            "description": self.description,
            "base_price": str(self.base_price) if self.base_price is not None else "0.00",
            "max_occupancy": self.max_occupancy,
            "bed_config": self.bed_config,
            "amenities": self.amenities,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
