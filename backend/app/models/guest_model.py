from datetime import datetime, timezone
from app.extensions import db


class Guest(db.Model):
    __tablename__ = "guests"

    guest_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(120), nullable=True, index=True)
    phone = db.Column(db.String(25), nullable=False, index=True)
    id_type = db.Column(
        db.Enum("passport", "national_id", "driving_license", "other", name="guest_id_type_enum"),
        nullable=True,
    )
    id_number = db.Column(db.String(50), nullable=True)
    address = db.Column(db.Text, nullable=True)
    city = db.Column(db.String(50), nullable=True)
    country = db.Column(db.String(50), nullable=True)
    postal_code = db.Column(db.String(20), nullable=True)
    vip_status = db.Column(db.Boolean, default=False, nullable=False)
    notes = db.Column(db.Text, nullable=True)

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
        db.CheckConstraint("LENGTH(TRIM(phone)) > 0", name="chk_phone_not_empty"),
        db.Index("idx_guests_name", "last_name", "first_name"),
        db.UniqueConstraint("id_type", "id_number", name="uq_guest_id_doc"),
    )

    # Relationships
    bookings = db.relationship("Booking", back_populates="guest")
    bills = db.relationship("Bill", back_populates="guest")

    def to_dict(self):
        return {
            "guest_id": self.guest_id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "phone": self.phone,
            "id_type": self.id_type,
            "id_number": self.id_number,
            "address": self.address,
            "city": self.city,
            "country": self.country,
            "postal_code": self.postal_code,
            "vip_status": self.vip_status,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
