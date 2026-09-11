from datetime import date, datetime, timezone
from app.extensions import db


class Housekeeping(db.Model):
    __tablename__ = "housekeeping"

    task_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    room_id = db.Column(
        db.Integer,
        db.ForeignKey("rooms.room_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_type = db.Column(
        db.Enum(
            "checkout_cleaning",
            "stayover_cleaning",
            "deep_clean",
            "inspection",
            "turndown",
            name="housekeeping_task_type_enum",
        ),
        nullable=False,
    )
    priority = db.Column(
        db.Enum("low", "medium", "high", "urgent", name="housekeeping_priority_enum"),
        default="medium",
        nullable=False,
    )
    status = db.Column(
        db.Enum(
            "pending",
            "in_progress",
            "completed",
            "verified",
            "cancelled",
            name="housekeeping_status_enum",
        ),
        default="pending",
        nullable=False,
        index=True,
    )
    assigned_to_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    inspected_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    scheduled_date = db.Column(db.Date, nullable=False, default=date.today)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    verified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    remarks = db.Column(db.Text, nullable=True)

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
        db.CheckConstraint("completed_at IS NULL OR completed_at >= started_at", name="chk_hk_timeline"),
        db.CheckConstraint("verified_at IS NULL OR verified_at >= completed_at", name="chk_hk_inspection"),
        db.Index("idx_hk_room_status", "room_id", "status"),
        db.Index("idx_hk_assigned_date", "assigned_to_user_id", "scheduled_date", "status"),
        db.Index("idx_hk_status_date", "status", "scheduled_date"),
    )

    # Relationships
    room = db.relationship("Room", back_populates="housekeeping_records")
    assigned_staff = db.relationship(
        "User",
        back_populates="housekeeping_tasks",
        foreign_keys=[assigned_to_user_id],
    )
    inspector = db.relationship(
        "User",
        back_populates="housekeeping_inspections",
        foreign_keys=[inspected_by_user_id],
    )

    def to_dict(self):
        return {
            "task_id": self.task_id,
            "room_id": self.room_id,
            "task_type": self.task_type,
            "priority": self.priority,
            "status": self.status,
            "assigned_to_user_id": self.assigned_to_user_id,
            "inspected_by_user_id": self.inspected_by_user_id,
            "scheduled_date": str(self.scheduled_date) if self.scheduled_date else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "remarks": self.remarks,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
