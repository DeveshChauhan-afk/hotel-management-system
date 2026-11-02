from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy.exc import SQLAlchemyError
from app.extensions import db
from app.models.room_model import Room
from app.models.booking_model import Booking
from app.models.guest_model import Guest
from app.models.bill_model import Bill


def create_booking(data, user_id=None):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    guest_id = data.get("guest_id")
    room_id = data.get("room_id")

    if not guest_id or not room_id:
        return {"error": "Missing required fields"}, 400

    try:
        guest_id = int(guest_id)
        room_id = int(room_id)
    except (ValueError, TypeError):
        return {"error": "guest_id and room_id must be valid integers"}, 400

    guest = db.session.get(Guest, guest_id)
    if not guest:
        return {"error": "Guest not found"}, 404

    room = db.session.get(Room, room_id)
    if not room:
        return {"error": "Room not found"}, 404

    # 1. Parse and validate dates
    check_in_raw = data.get("check_in_date")
    check_out_raw = data.get("check_out_date")

    if check_in_raw is None:
        check_in_date = date.today()
    elif isinstance(check_in_raw, str):
        try:
            check_in_date = datetime.strptime(check_in_raw.strip(), "%Y-%m-%d").date()
        except ValueError:
            return {"error": "Invalid check_in_date format (YYYY-MM-DD expected)"}, 400
    elif isinstance(check_in_raw, date):
        check_in_date = check_in_raw
    else:
        return {"error": "Invalid check_in_date format"}, 400

    if check_out_raw is None:
        check_out_date = check_in_date + timedelta(days=1)
    elif isinstance(check_out_raw, str):
        try:
            check_out_date = datetime.strptime(check_out_raw.strip(), "%Y-%m-%d").date()
        except ValueError:
            return {"error": "Invalid check_out_date format (YYYY-MM-DD expected)"}, 400
    elif isinstance(check_out_raw, date):
        check_out_date = check_out_raw
    else:
        return {"error": "Invalid check_out_date format"}, 400

    if check_out_date <= check_in_date:
        return {"error": "check_out_date must be after check_in_date"}, 400

    # 2. Parse and validate occupancy
    num_adults_raw = data.get("num_adults", 1)
    num_children_raw = data.get("num_children", 0)

    try:
        num_adults = int(num_adults_raw)
        num_children = int(num_children_raw)
    except (ValueError, TypeError):
        return {"error": "num_adults and num_children must be integers"}, 400

    if num_adults <= 0:
        return {"error": "num_adults must be greater than 0"}, 400
    if num_children < 0:
        return {"error": "num_children cannot be negative"}, 400

    if room.room_type and room.room_type.max_occupancy:
        if (num_adults + num_children) > room.room_type.max_occupancy:
            return {
                "error": f"Total guests ({num_adults + num_children}) exceeds maximum room occupancy of {room.room_type.max_occupancy}"
            }, 400

    # 3. Validate room_type_id consistency
    provided_type_id = data.get("room_type_id")
    if provided_type_id is not None:
        try:
            provided_type_id = int(provided_type_id)
        except (ValueError, TypeError):
            return {"error": "room_type_id must be a valid integer"}, 400
        if provided_type_id != room.room_type_id:
            return {
                "error": f"Provided room_type_id {provided_type_id} does not match room's room_type_id {room.room_type_id}"
            }, 400
    room_type_id = room.room_type_id

    # 4. Check room operational status
    if room.operational_status in ("out_of_service", "under_maintenance"):
        return {"error": f"Room is currently {room.operational_status}"}, 400

    # 5. Check date conflicts with existing non-cancelled bookings
    conflict = Booking.query.filter(
        Booking.room_id == room.room_id,
        Booking.status.in_(["confirmed", "checked_in", "pending"]),
        Booking.check_in_date < check_out_date,
        (Booking.check_out_date.is_(None) | (Booking.check_out_date > check_in_date))
    ).first()

    if conflict:
        return {
            "error": f"Room {room.room_number} is already booked from {conflict.check_in_date} to {conflict.check_out_date}"
        }, 409

    # 6. Pricing calculation
    nightly_rate = room.room_type.base_price if (room.room_type and room.room_type.base_price is not None) else Decimal("100.00")
    nights = max((check_out_date - check_in_date).days, 1)
    total_amount = Decimal(nightly_rate) * Decimal(nights)

    special_requests = data.get("special_requests")
    if isinstance(special_requests, str):
        special_requests = special_requests.strip()
    else:
        special_requests = None

    from app.models.user_model import User
    valid_user_id = None
    if user_id:
        u = db.session.get(User, user_id)
        if u:
            valid_user_id = u.user_id

    booking = Booking(
        guest_id=guest_id,
        room_id=room_id,
        room_type_id=room_type_id,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
        num_adults=num_adults,
        num_children=num_children,
        nightly_rate=nightly_rate,
        total_amount=total_amount,
        status="confirmed",
        special_requests=special_requests,
        created_by_user_id=valid_user_id
    )

    try:
        db.session.add(booking)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while creating booking"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Failed to create booking"}, 500

    return {
        "message": "Room booked successfully",
        "booking": booking.to_dict()
    }, 201


def get_bookings(guest_id=None, room_id=None, status=None):
    query = Booking.query

    if guest_id:
        try:
            query = query.filter_by(guest_id=int(guest_id))
        except (ValueError, TypeError):
            pass

    if room_id:
        try:
            query = query.filter_by(room_id=int(room_id))
        except (ValueError, TypeError):
            pass

    if status and isinstance(status, str) and status.strip():
        query = query.filter_by(status=status.strip())

    bookings = query.order_by(Booking.created_at.desc()).all()
    return [b.to_dict() for b in bookings], 200


def get_booking_by_id(booking_id):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return {"error": "Booking not found"}, 404
    return booking.to_dict(), 200


def checkin_booking(booking_id):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return {"error": "Booking not found"}, 404

    if booking.status == "checked_in":
        return {"error": "Booking is already checked in"}, 400

    if booking.status != "confirmed":
        return {"error": f"Cannot check in booking with status '{booking.status}'. Booking must be confirmed"}, 400

    room = booking.room
    if not room:
        return {"error": "Booking does not have an assigned room"}, 400

    if room.cleanliness_status != "clean":
        return {"error": f"Room {room.room_number} is not cleaned (cleanliness status: {room.cleanliness_status})"}, 400

    if room.operational_status == "occupied":
        return {"error": f"Room {room.room_number} is already occupied"}, 400

    if room.operational_status in ("out_of_service", "under_maintenance"):
        return {"error": f"Room {room.room_number} is currently {room.operational_status}"}, 400

    now = datetime.now(timezone.utc)
    booking.status = "checked_in"
    booking.actual_check_in = now
    booking.updated_at = now

    room.operational_status = "occupied"
    room.updated_at = now

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error during check-in"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error during check-in"}, 500

    return {
        "message": "Booking checked in successfully",
        "booking": booking.to_dict(),
    }, 200


def cancel_booking(booking_id, cancellation_reason=None):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return {"error": "Booking not found"}, 404

    if booking.status == "cancelled":
        return {"error": "Booking is already cancelled"}, 400

    if booking.status not in ("pending", "confirmed"):
        return {"error": f"Cannot cancel booking with status '{booking.status}'"}, 400

    now = datetime.now(timezone.utc)
    booking.status = "cancelled"
    if cancellation_reason is not None and isinstance(cancellation_reason, str):
        booking.cancellation_reason = cancellation_reason.strip()
    booking.updated_at = now

    # Void associated unpaid bill if draft or issued
    bill = Bill.query.filter_by(booking_id=booking.booking_id).first()
    if bill and bill.status in ("draft", "issued"):
        bill.status = "voided"
        bill.updated_at = now

    # Room state ownership cannot be reliably established for pending or confirmed
    # bookings. Therefore, do not automatically alter room operational status upon
    # cancellation. Existing room states (occupied, under_maintenance, out_of_service, available)
    # are preserved. Date conflict resolution naturally frees future reservation slots.

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while cancelling booking"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Failed to cancel booking"}, 500

    return {
        "message": "Booking cancelled successfully",
        "booking": booking.to_dict(),
    }, 200
