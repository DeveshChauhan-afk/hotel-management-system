from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from sqlalchemy.exc import SQLAlchemyError
from app.extensions import db
from app.models.maintenance_model import Maintenance
from app.models.room_model import Room
from app.models.user_model import User
from app.models.booking_model import Booking


VALID_CATEGORIES = {
    "plumbing",
    "electrical",
    "hvac",
    "furniture",
    "appliance",
    "structural",
    "other",
}
VALID_PRIORITIES = {"low", "medium", "high", "critical"}
VALID_STATUSES = {"reported", "scheduled", "in_progress", "completed", "cancelled"}


def create_maintenance_work_order(data, reported_by_user_id=None):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    title = data.get("title")
    if not title or not isinstance(title, str) or not title.strip():
        return {"error": "title is required and cannot be empty"}, 400
    title = title.strip()
    if len(title) > 150:
        return {"error": "title must not exceed 150 characters"}, 400

    description = data.get("description")
    if not description or not isinstance(description, str) or not description.strip():
        return {"error": "description is required and cannot be empty"}, 400
    description = description.strip()

    category = data.get("category")
    if not category or category not in VALID_CATEGORIES:
        return {"error": f"category must be one of {sorted(list(VALID_CATEGORIES))}"}, 400

    priority = data.get("priority", "medium")
    if priority not in VALID_PRIORITIES:
        return {"error": f"priority must be one of {sorted(list(VALID_PRIORITIES))}"}, 400

    blocks_room_occupancy = bool(data.get("blocks_room_occupancy", False))

    room_id = data.get("room_id")
    room = None
    if room_id is not None:
        try:
            room_id = int(room_id)
        except (ValueError, TypeError):
            return {"error": "room_id must be an integer"}, 400
        room = db.session.get(Room, room_id)
        if not room:
            return {"error": "Room not found"}, 404

    assigned_to_user_id = data.get("assigned_to_user_id")
    if assigned_to_user_id is not None:
        try:
            assigned_to_user_id = int(assigned_to_user_id)
        except (ValueError, TypeError):
            return {"error": "assigned_to_user_id must be an integer"}, 400
        assigned_user = db.session.get(User, assigned_to_user_id)
        if not assigned_user:
            return {"error": "Assigned staff user not found"}, 404

    est_cost_raw = data.get("estimated_cost", "0.00")
    try:
        estimated_cost = Decimal(str(est_cost_raw).strip())
        if estimated_cost < Decimal("0.00"):
            return {"error": "estimated_cost must be a non-negative number"}, 400
    except (InvalidOperation, TypeError, ValueError):
        return {"error": "estimated_cost must be a valid number"}, 400

    valid_reporter_id = None
    if reported_by_user_id:
        u = db.session.get(User, reported_by_user_id)
        if u:
            valid_reporter_id = u.user_id

    now = datetime.now(timezone.utc)

    # Block room occupancy if required
    if blocks_room_occupancy and room:
        room.operational_status = "under_maintenance"
        room.updated_at = now

    maint = Maintenance(
        room_id=room_id,
        title=title,
        description=description,
        category=category,
        priority=priority,
        status="reported",
        blocks_room_occupancy=blocks_room_occupancy,
        reported_by_user_id=valid_reporter_id,
        assigned_to_user_id=assigned_to_user_id,
        estimated_cost=estimated_cost,
        actual_cost=Decimal("0.00"),
        reported_at=now,
    )

    try:
        db.session.add(maint)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while creating maintenance work order"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while creating maintenance work order"}, 500

    return {
        "message": "Maintenance work order created successfully",
        "maintenance": maint.to_dict(),
    }, 201


def get_maintenance_records(filters=None):
    query = Maintenance.query

    if filters and isinstance(filters, dict):
        room_id = filters.get("room_id")
        if room_id is not None:
            try:
                query = query.filter_by(room_id=int(room_id))
            except (ValueError, TypeError):
                pass

        status = filters.get("status")
        if status and status in VALID_STATUSES:
            query = query.filter_by(status=status)

        category = filters.get("category")
        if category and category in VALID_CATEGORIES:
            query = query.filter_by(category=category)

        priority = filters.get("priority")
        if priority and priority in VALID_PRIORITIES:
            query = query.filter_by(priority=priority)

        assigned_to_user_id = filters.get("assigned_to_user_id")
        if assigned_to_user_id is not None:
            try:
                query = query.filter_by(assigned_to_user_id=int(assigned_to_user_id))
            except (ValueError, TypeError):
                pass

        blocks_occupancy = filters.get("blocks_room_occupancy")
        if blocks_occupancy is not None:
            val = str(blocks_occupancy).lower() in ("true", "1")
            query = query.filter_by(blocks_room_occupancy=val)

    records = query.order_by(Maintenance.reported_at.desc(), Maintenance.maintenance_id.desc()).all()
    return [r.to_dict() for r in records], 200


def get_maintenance_by_id(maintenance_id):
    maint = db.session.get(Maintenance, maintenance_id)
    if not maint:
        return {"error": "Maintenance record not found"}, 404
    return maint.to_dict(), 200


def update_maintenance_record(maintenance_id, data, user_id=None, user_role=None):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    maint = db.session.get(Maintenance, maintenance_id)
    if not maint:
        return {"error": "Maintenance record not found"}, 404

    now = datetime.now(timezone.utc)

    # Privileged fields: admin, manager, receptionist
    if user_role in ("admin", "manager", "receptionist"):
        if "title" in data:
            t = data["title"]
            if not isinstance(t, str) or not t.strip():
                return {"error": "title cannot be empty"}, 400
            maint.title = t.strip()[:150]

        if "description" in data:
            d = data["description"]
            if not isinstance(d, str) or not d.strip():
                return {"error": "description cannot be empty"}, 400
            maint.description = d.strip()

        if "category" in data:
            c = data["category"]
            if c not in VALID_CATEGORIES:
                return {"error": f"category must be one of {sorted(list(VALID_CATEGORIES))}"}, 400
            maint.category = c

        if "priority" in data:
            p = data["priority"]
            if p not in VALID_PRIORITIES:
                return {"error": f"priority must be one of {sorted(list(VALID_PRIORITIES))}"}, 400
            maint.priority = p

        if "blocks_room_occupancy" in data:
            new_blocks = bool(data["blocks_room_occupancy"])
            maint.blocks_room_occupancy = new_blocks
            if maint.room_id and maint.room:
                if new_blocks and maint.status in ("reported", "scheduled", "in_progress"):
                    maint.room.operational_status = "under_maintenance"
                    maint.room.updated_at = now
                elif not new_blocks and maint.room.operational_status == "under_maintenance":
                    # Check if other blocking maintenance exists
                    other_blocking = Maintenance.query.filter(
                        Maintenance.room_id == maint.room_id,
                        Maintenance.maintenance_id != maint.maintenance_id,
                        Maintenance.blocks_room_occupancy == True,
                        Maintenance.status.in_(["reported", "scheduled", "in_progress"]),
                    ).first()
                    if not other_blocking:
                        maint.room.operational_status = "available"
                        maint.room.updated_at = now

        if "assigned_to_user_id" in data:
            assigned_raw = data["assigned_to_user_id"]
            if assigned_raw is None:
                maint.assigned_to_user_id = None
            else:
                try:
                    assigned_uid = int(assigned_raw)
                except (ValueError, TypeError):
                    return {"error": "assigned_to_user_id must be an integer"}, 400
                staff = db.session.get(User, assigned_uid)
                if not staff:
                    return {"error": "Assigned staff user not found"}, 404
                maint.assigned_to_user_id = assigned_uid

        if "estimated_cost" in data:
            try:
                est_cost = Decimal(str(data["estimated_cost"]).strip())
                if est_cost < Decimal("0.00"):
                    return {"error": "estimated_cost must be a non-negative number"}, 400
                maint.estimated_cost = est_cost
            except (InvalidOperation, TypeError, ValueError):
                return {"error": "estimated_cost must be a valid number"}, 400

    # Fields updatable by staff / maintenance
    if "actual_cost" in data:
        try:
            act_cost = Decimal(str(data["actual_cost"]).strip())
            if act_cost < Decimal("0.00"):
                return {"error": "actual_cost must be a non-negative number"}, 400
            maint.actual_cost = act_cost
        except (InvalidOperation, TypeError, ValueError):
            return {"error": "actual_cost must be a valid number"}, 400

    if "resolution_notes" in data:
        r_notes = data["resolution_notes"]
        maint.resolution_notes = r_notes.strip() if isinstance(r_notes, str) else None

    # Status transition
    if "status" in data:
        new_status = data["status"]
        if new_status not in VALID_STATUSES:
            return {"error": f"status must be one of {sorted(list(VALID_STATUSES))}"}, 400

        if new_status == "in_progress":
            if not maint.started_at:
                maint.started_at = now
            if maint.blocks_room_occupancy and maint.room:
                maint.room.operational_status = "under_maintenance"
                maint.room.updated_at = now

        elif new_status in ("completed", "cancelled"):
            if new_status == "completed":
                maint.resolved_at = now

            # If room was blocked by this maintenance, check if it can be unblocked
            if maint.room_id and maint.blocks_room_occupancy and maint.room:
                other_blocking = Maintenance.query.filter(
                    Maintenance.room_id == maint.room_id,
                    Maintenance.maintenance_id != maint.maintenance_id,
                    Maintenance.blocks_room_occupancy == True,
                    Maintenance.status.in_(["reported", "scheduled", "in_progress"]),
                ).first()
                if not other_blocking and maint.room.operational_status == "under_maintenance":
                    today = date.today()
                    active_checked_in = Booking.query.filter(
                        Booking.room_id == maint.room_id,
                        Booking.status == "checked_in",
                        Booking.check_in_date <= today,
                        (Booking.check_out_date.is_(None) | (Booking.check_out_date >= today)),
                    ).first()
                    if active_checked_in:
                        maint.room.operational_status = "occupied"
                    else:
                        maint.room.operational_status = "available"
                    maint.room.updated_at = now
                    # Note: Cleanliness status is NOT altered by maintenance completion!

        maint.status = new_status

    maint.updated_at = now

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while updating maintenance record"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while updating maintenance record"}, 500

    return {
        "message": "Maintenance record updated successfully",
        "maintenance": maint.to_dict(),
    }, 200


def delete_maintenance_record(maintenance_id):
    maint = db.session.get(Maintenance, maintenance_id)
    if not maint:
        return {"error": "Maintenance record not found"}, 404

    now = datetime.now(timezone.utc)
    if maint.blocks_room_occupancy and maint.room_id and maint.status in ("reported", "scheduled", "in_progress"):
        other_blocking = Maintenance.query.filter(
            Maintenance.room_id == maint.room_id,
            Maintenance.maintenance_id != maint.maintenance_id,
            Maintenance.blocks_room_occupancy == True,
            Maintenance.status.in_(["reported", "scheduled", "in_progress"]),
        ).first()
        if not other_blocking and maint.room and maint.room.operational_status == "under_maintenance":
            maint.room.operational_status = "available"
            maint.room.updated_at = now

    try:
        db.session.delete(maint)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while deleting maintenance record"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while deleting maintenance record"}, 500

    return {"message": "Maintenance record deleted successfully"}, 200
