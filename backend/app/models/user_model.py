from datetime import datetime, timezone
from app.extensions import db


class User(db.Model):
    __tablename__ = "users"

    user_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    password = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True, index=True)
    full_name = db.Column(db.String(100), nullable=True)
    role = db.Column(
        db.Enum("admin", "manager", "receptionist", "housekeeper", "maintenance", name="user_role_enum"),
        default="receptionist",
        nullable=False,
    )
    is_active = db.Column(db.Boolean, default=True, nullable=False)

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
        db.Index("idx_users_role_active", "role", "is_active"),
    )

    @property
    def password_hash(self):
        return self.password

    @password_hash.setter
    def password_hash(self, value):
        self.password = value

    # Relationships with back_populates
    bookings_created = db.relationship(
        "Booking",
        back_populates="creator",
        foreign_keys="Booking.created_by_user_id",
    )
    payments_recorded = db.relationship(
        "Payment",
        back_populates="recorded_by",
        foreign_keys="Payment.recorded_by_user_id",
    )
    housekeeping_tasks = db.relationship(
        "Housekeeping",
        back_populates="assigned_staff",
        foreign_keys="Housekeeping.assigned_to_user_id",
    )
    housekeeping_inspections = db.relationship(
        "Housekeeping",
        back_populates="inspector",
        foreign_keys="Housekeeping.inspected_by_user_id",
    )
    maintenance_reported = db.relationship(
        "Maintenance",
        back_populates="reported_by",
        foreign_keys="Maintenance.reported_by_user_id",
    )
    maintenance_assigned = db.relationship(
        "Maintenance",
        back_populates="assigned_to",
        foreign_keys="Maintenance.assigned_to_user_id",
    )

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }