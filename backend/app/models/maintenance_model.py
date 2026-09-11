from datetime import datetime, timezone
from decimal import Decimal
from app.extensions import db


class Maintenance(db.Model):
    __tablename__ = "maintenance"

    maintenance_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    room_id = db.Column(
        db.Integer,
        db.ForeignKey("rooms.room_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=False)
    category = db.Column(
        db.Enum(
            "plumbing",
            "electrical",
            "hvac",
            "furniture",
            "appliance",
            "structural",
            "other",
            name="maintenance_category_enum",
        ),
        nullable=False,
    )
    priority = db.Column(
        db.Enum("low", "medium", "high", "critical", name="maintenance_priority_enum"),
        default="medium",
        nullable=False,
    )
    status = db.Column(
        db.Enum(
            "reported",
            "scheduled",
            "in_progress",
            "completed",
            "cancelled",
            name="maintenance_status_enum",
        ),
        default="reported",
        nullable=False,
        index=True,
    )
    blocks_room_occupancy = db.Column(db.Boolean, default=False, nullable=False)
    reported_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_to_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    estimated_cost = db.Column(db.Numeric(10, 2), default=Decimal("0.00"), nullable=True)
    actual_cost = db.Column(db.Numeric(10, 2), default=Decimal("0.00"), nullable=True)

    reported_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    resolution_notes = db.Column(db.Text, nullable=True)

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
        db.CheckConstraint("resolved_at IS NULL OR resolved_at >= reported_at", name="chk_maint_resolved"),
        db.CheckConstraint("actual_cost IS NULL OR actual_cost >= 0", name="chk_maint_actual_cost"),
        db.CheckConstraint("estimated_cost IS NULL OR estimated_cost >= 0", name="chk_maint_est_cost"),
        db.Index("idx_maint_room_status", "room_id", "status"),
        db.Index("idx_maint_assigned_status", "assigned_to_user_id", "status"),
        db.Index("idx_maint_priority_status", "priority", "status"),
    )

    # Relationships
    room = db.relationship("Room", back_populates="maintenance_records")
    reported_by = db.relationship(
        "User",
        back_populates="maintenance_reported",
        foreign_keys=[reported_by_user_id],
    )
    assigned_to = db.relationship(
        "User",
        back_populates="maintenance_assigned",
        foreign_keys=[assigned_to_user_id],
    )

    def to_dict(self):
        return {
            "maintenance_id": self.maintenance_id,
            "room_id": self.room_id,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "priority": self.priority,
            "status": self.status,
            "blocks_room_occupancy": self.blocks_room_occupancy,
            "reported_by_user_id": self.reported_by_user_id,
            "assigned_to_user_id": self.assigned_to_user_id,
            "estimated_cost": str(self.estimated_cost) if self.estimated_cost is not None else "0.00",
            "actual_cost": str(self.actual_cost) if self.actual_cost is not None else "0.00",
            "reported_at": self.reported_at.isoformat() if self.reported_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolution_notes": self.resolution_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
