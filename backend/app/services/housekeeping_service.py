from datetime import date, datetime, timezone
from sqlalchemy.exc import SQLAlchemyError
from app.extensions import db
from app.models.housekeeping_model import Housekeeping
from app.models.room_model import Room
from app.models.user_model import User


VALID_TASK_TYPES = {
    "checkout_cleaning",
    "stayover_cleaning",
    "deep_clean",
    "inspection",
    "turndown",
}
VALID_PRIORITIES = {"low", "medium", "high", "urgent"}
VALID_STATUSES = {"pending", "in_progress", "completed", "verified", "cancelled"}


def create_housekeeping_task(data):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    room_id_raw = data.get("room_id")
    if room_id_raw is None:
        return {"error": "room_id is required"}, 400
    try:
        room_id = int(room_id_raw)
    except (ValueError, TypeError):
        return {"error": "room_id must be an integer"}, 400

    room = db.session.get(Room, room_id)
    if not room:
        return {"error": "Room not found"}, 404

    task_type = data.get("task_type")
    if not task_type or task_type not in VALID_TASK_TYPES:
        return {"error": f"task_type must be one of {sorted(list(VALID_TASK_TYPES))}"}, 400

    priority = data.get("priority", "medium")
    if priority not in VALID_PRIORITIES:
        return {"error": f"priority must be one of {sorted(list(VALID_PRIORITIES))}"}, 400

    assigned_to_user_id = data.get("assigned_to_user_id")
    if assigned_to_user_id is not None:
        try:
            assigned_to_user_id = int(assigned_to_user_id)
        except (ValueError, TypeError):
            return {"error": "assigned_to_user_id must be an integer"}, 400

        staff = db.session.get(User, assigned_to_user_id)
        if not staff:
            return {"error": "Assigned staff user not found"}, 404

    sched_raw = data.get("scheduled_date")
    if sched_raw is None:
        scheduled_date = date.today()
    elif isinstance(sched_raw, str):
        try:
            scheduled_date = datetime.strptime(sched_raw.strip(), "%Y-%m-%d").date()
        except ValueError:
            return {"error": "Invalid scheduled_date format (YYYY-MM-DD expected)"}, 400
    elif isinstance(sched_raw, date):
        scheduled_date = sched_raw
    else:
        return {"error": "Invalid scheduled_date format"}, 400

    remarks = data.get("remarks")
    if isinstance(remarks, str):
        remarks = remarks.strip()
    else:
        remarks = None

    task = Housekeeping(
        room_id=room_id,
        task_type=task_type,
        priority=priority,
        status="pending",
        assigned_to_user_id=assigned_to_user_id,
        scheduled_date=scheduled_date,
        remarks=remarks,
    )

    try:
        db.session.add(task)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while creating housekeeping task"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while creating housekeeping task"}, 500

    return {
        "message": "Housekeeping task created successfully",
        "task": task.to_dict(),
    }, 201


def get_housekeeping_tasks(filters=None):
    query = Housekeeping.query

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

        assigned_to_user_id = filters.get("assigned_to_user_id")
        if assigned_to_user_id is not None:
            try:
                query = query.filter_by(assigned_to_user_id=int(assigned_to_user_id))
            except (ValueError, TypeError):
                pass

        task_type = filters.get("task_type")
        if task_type and task_type in VALID_TASK_TYPES:
            query = query.filter_by(task_type=task_type)

        priority = filters.get("priority")
        if priority and priority in VALID_PRIORITIES:
            query = query.filter_by(priority=priority)

        sched_raw = filters.get("scheduled_date")
        if sched_raw:
            try:
                sched_date = datetime.strptime(str(sched_raw).strip(), "%Y-%m-%d").date()
                query = query.filter_by(scheduled_date=sched_date)
            except ValueError:
                pass

    tasks = query.order_by(Housekeeping.scheduled_date.asc(), Housekeeping.task_id.desc()).all()
    return [t.to_dict() for t in tasks], 200


def get_housekeeping_task_by_id(task_id):
    task = db.session.get(Housekeeping, task_id)
    if not task:
        return {"error": "Housekeeping task not found"}, 404
    return task.to_dict(), 200


def update_housekeeping_task(task_id, data, user_id=None, user_role=None):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    task = db.session.get(Housekeeping, task_id)
    if not task:
        return {"error": "Housekeeping task not found"}, 404

    now = datetime.now(timezone.utc)

    # Privileged fields: only admin/manager may reassign, change room, priority, task_type
    if user_role in ("admin", "manager"):
        if "room_id" in data:
            try:
                new_room_id = int(data["room_id"])
            except (ValueError, TypeError):
                return {"error": "room_id must be an integer"}, 400
            room = db.session.get(Room, new_room_id)
            if not room:
                return {"error": "Room not found"}, 404
            task.room_id = new_room_id

        if "task_type" in data:
            tt = data["task_type"]
            if tt not in VALID_TASK_TYPES:
                return {"error": f"task_type must be one of {sorted(list(VALID_TASK_TYPES))}"}, 400
            task.task_type = tt

        if "priority" in data:
            pr = data["priority"]
            if pr not in VALID_PRIORITIES:
                return {"error": f"priority must be one of {sorted(list(VALID_PRIORITIES))}"}, 400
            task.priority = pr

        if "assigned_to_user_id" in data:
            assigned_raw = data["assigned_to_user_id"]
            if assigned_raw is None:
                task.assigned_to_user_id = None
            else:
                try:
                    assigned_uid = int(assigned_raw)
                except (ValueError, TypeError):
                    return {"error": "assigned_to_user_id must be an integer"}, 400
                staff = db.session.get(User, assigned_uid)
                if not staff:
                    return {"error": "Assigned staff user not found"}, 404
                task.assigned_to_user_id = assigned_uid

        if "inspected_by_user_id" in data:
            insp_raw = data["inspected_by_user_id"]
            if insp_raw is None:
                task.inspected_by_user_id = None
            else:
                try:
                    insp_uid = int(insp_raw)
                except (ValueError, TypeError):
                    return {"error": "inspected_by_user_id must be an integer"}, 400
                inspector = db.session.get(User, insp_uid)
                if not inspector:
                    return {"error": "Inspector user not found"}, 404
                task.inspected_by_user_id = insp_uid

        if "scheduled_date" in data:
            s_raw = data["scheduled_date"]
            if isinstance(s_raw, str):
                try:
                    task.scheduled_date = datetime.strptime(s_raw.strip(), "%Y-%m-%d").date()
                except ValueError:
                    return {"error": "Invalid scheduled_date format (YYYY-MM-DD expected)"}, 400
            elif isinstance(s_raw, date):
                task.scheduled_date = s_raw

    # Remarks can be updated by staff
    if "remarks" in data:
        remarks = data["remarks"]
        task.remarks = remarks.strip() if isinstance(remarks, str) else None

    # Status transitions
    if "status" in data:
        new_status = data["status"]
        if new_status not in VALID_STATUSES:
            return {"error": f"status must be one of {sorted(list(VALID_STATUSES))}"}, 400

        if new_status == "in_progress":
            if not task.started_at:
                task.started_at = now
            if task.room:
                task.room.cleanliness_status = "cleaning_in_progress"
                task.room.updated_at = now

        elif new_status in ("completed", "verified"):
            if not task.started_at:
                task.started_at = task.created_at if task.created_at else now
            if not task.completed_at:
                task.completed_at = now

            if new_status == "verified":
                task.verified_at = now
                if user_id and not task.inspected_by_user_id:
                    task.inspected_by_user_id = user_id

            # Updating room cleanliness to clean
            if task.room:
                task.room.cleanliness_status = "clean"
                task.room.updated_at = now

        elif new_status == "cancelled":
            if task.room and task.room.cleanliness_status == "cleaning_in_progress":
                other_in_prog = Housekeeping.query.filter(
                    Housekeeping.room_id == task.room_id,
                    Housekeeping.task_id != task.task_id,
                    Housekeeping.status == "in_progress",
                ).first()
                if not other_in_prog:
                    task.room.cleanliness_status = "dirty"
                    task.room.updated_at = now

        task.status = new_status

    task.updated_at = now

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while updating housekeeping task"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while updating housekeeping task"}, 500

    return {
        "message": "Housekeeping task updated successfully",
        "task": task.to_dict(),
    }, 200


def delete_housekeeping_task(task_id):
    task = db.session.get(Housekeeping, task_id)
    if not task:
        return {"error": "Housekeeping task not found"}, 404

    try:
        db.session.delete(task)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while deleting housekeeping task"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while deleting housekeeping task"}, 500

    return {"message": "Housekeeping task deleted successfully"}, 200
