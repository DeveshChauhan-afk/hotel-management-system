from datetime import datetime, timezone
from app.extensions import db
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import RelationshipProperty
from app.models.room_type_model import RoomType


class RoomTypeComparator(RelationshipProperty.Comparator):
    def __eq__(self, other):
        if isinstance(other, str):
            return self.has(RoomType.name == other)
        return super().__eq__(other)


class Room(db.Model):
    __tablename__ = "rooms"

    room_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    room_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    floor = db.Column(db.Integer, nullable=False, default=1)
    room_type_id = db.Column(
        db.Integer,
        db.ForeignKey("room_types.room_type_id", ondelete="RESTRICT"),
        nullable=True,
    )
    operational_status = db.Column(
        db.Enum(
            "available",
            "occupied",
            "out_of_service",
            "under_maintenance",
            name="operational_status_enum",
        ),
        default="available",
        nullable=False,
    )
    cleanliness_status = db.Column(
        db.Enum(
            "clean",
            "dirty",
            "inspecting",
            "cleaning_in_progress",
            name="cleanliness_status_enum",
        ),
        default="clean",
        nullable=False,
    )
    is_smoking = db.Column(db.Boolean, default=False, nullable=False)
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
        db.CheckConstraint("floor >= -2", name="chk_room_floor"),
        db.Index("idx_rooms_type_status", "room_type_id", "operational_status", "cleanliness_status"),
        db.Index("idx_rooms_floor", "floor"),
    )

    # Hybrid properties for backward compatibility with existing codebase
    @hybrid_property
    def status(self):
        return self.operational_status

    @status.setter
    def status(self, value):
        self.operational_status = value

    @status.expression
    def status(cls):
        return cls.operational_status

    @hybrid_property
    def cleaned(self):
        return self.cleanliness_status == "clean"

    @cleaned.setter
    def cleaned(self, value):
        if isinstance(value, bool):
            self.cleanliness_status = "clean" if value else "dirty"
        elif isinstance(value, int):
            self.cleanliness_status = "clean" if value == 1 else "dirty"
        else:
            self.cleanliness_status = value

    @cleaned.expression
    def cleaned(cls):
        return cls.cleanliness_status == "clean"

    # Relationships with back_populates
    room_type = db.relationship(
        "RoomType",
        back_populates="rooms",
        comparator_factory=RoomTypeComparator,
    )
    bookings = db.relationship("Booking", back_populates="room")
    housekeeping_records = db.relationship(
        "Housekeeping",
        back_populates="room",
        cascade="all, delete-orphan",
    )
    maintenance_records = db.relationship("Maintenance", back_populates="room")

    def to_dict(self):
        return {
            "room_id": self.room_id,
            "room_number": self.room_number,
            "floor": self.floor,
            "room_type_id": self.room_type_id,
            "room_type": self.room_type.name if self.room_type else None,
            "operational_status": self.operational_status,
            "cleanliness_status": self.cleanliness_status,
            "status": self.operational_status,
            "cleaned": self.cleanliness_status == "clean",
            "is_smoking": self.is_smoking,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }