from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from sqlalchemy.exc import SQLAlchemyError
from app.extensions import db
from app.models.room_type_model import RoomType


def create_room_type(data):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    name = data.get("name")
    if not name or not isinstance(name, str) or not name.strip():
        return {"error": "name is required and cannot be empty"}, 400

    name = name.strip()
    if len(name) > 50:
        return {"error": "name must not exceed 50 characters"}, 400

    # Derive or validate code
    code = data.get("code")
    if code is not None:
        if not isinstance(code, str) or not code.strip():
            return {"error": "code cannot be empty string"}, 400
        code = code.strip().upper()
        if len(code) > 20:
            return {"error": "code must not exceed 20 characters"}, 400
    else:
        code = name.upper().replace(" ", "_")[:20]

    # Check duplicates for name and code
    if RoomType.query.filter_by(name=name).first():
        return {"error": f"Room type with name '{name}' already exists"}, 409

    if RoomType.query.filter_by(code=code).first():
        return {"error": f"Room type with code '{code}' already exists"}, 409

    # Validate base_price
    base_price_raw = data.get("base_price", "0.00")
    try:
        base_price = Decimal(str(base_price_raw).strip())
        if base_price < Decimal("0.00"):
            return {"error": "base_price must be a non-negative number"}, 400
    except (InvalidOperation, TypeError, ValueError):
        return {"error": "base_price must be a valid number"}, 400

    # Validate max_occupancy
    max_occ_raw = data.get("max_occupancy", 2)
    if isinstance(max_occ_raw, bool) or not isinstance(max_occ_raw, (int, str)):
        return {"error": "max_occupancy must be an integer of at least 1"}, 400
    try:
        max_occupancy = int(max_occ_raw)
        if max_occupancy < 1:
            return {"error": "max_occupancy must be an integer of at least 1"}, 400
    except (ValueError, TypeError):
        return {"error": "max_occupancy must be an integer of at least 1"}, 400

    bed_config = data.get("bed_config", "1 Queen Bed")
    if not isinstance(bed_config, str) or not bed_config.strip():
        bed_config = "1 Queen Bed"
    else:
        bed_config = bed_config.strip()
        if len(bed_config) > 60:
            return {"error": "bed_config must not exceed 60 characters"}, 400

    description = data.get("description")
    if isinstance(description, str):
        description = description.strip()
    else:
        description = None

    amenities = data.get("amenities")
    if not isinstance(amenities, (dict, list, type(None))):
        return {"error": "amenities must be a JSON array or object"}, 400

    is_active = bool(data.get("is_active", True))

    room_type = RoomType(
        name=name,
        code=code,
        description=description,
        base_price=base_price,
        max_occupancy=max_occupancy,
        bed_config=bed_config,
        amenities=amenities,
        is_active=is_active,
    )

    try:
        db.session.add(room_type)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while creating room type"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while creating room type"}, 500

    return {
        "message": "Room type created successfully",
        "room_type": room_type.to_dict(),
    }, 201


def get_room_types(active_only=False):
    query = RoomType.query
    if active_only:
        query = query.filter_by(is_active=True)

    room_types = query.order_by(RoomType.room_type_id).all()
    return [rt.to_dict() for rt in room_types], 200


def get_room_type_by_id(room_type_id):
    room_type = db.session.get(RoomType, room_type_id)
    if not room_type:
        return {"error": "Room type not found"}, 404
    return room_type.to_dict(), 200


def update_room_type(room_type_id, data):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    room_type = db.session.get(RoomType, room_type_id)
    if not room_type:
        return {"error": "Room type not found"}, 404

    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip():
            return {"error": "name cannot be empty"}, 400
        name = name.strip()
        if len(name) > 50:
            return {"error": "name must not exceed 50 characters"}, 400

        conflict = RoomType.query.filter(
            RoomType.name == name,
            RoomType.room_type_id != room_type_id,
        ).first()
        if conflict:
            return {"error": f"Room type with name '{name}' already exists"}, 409
        room_type.name = name

    if "code" in data:
        code = data["code"]
        if not isinstance(code, str) or not code.strip():
            return {"error": "code cannot be empty string"}, 400
        code = code.strip().upper()
        if len(code) > 20:
            return {"error": "code must not exceed 20 characters"}, 400

        conflict = RoomType.query.filter(
            RoomType.code == code,
            RoomType.room_type_id != room_type_id,
        ).first()
        if conflict:
            return {"error": f"Room type with code '{code}' already exists"}, 409
        room_type.code = code

    if "base_price" in data:
        try:
            base_price = Decimal(str(data["base_price"]).strip())
            if base_price < Decimal("0.00"):
                return {"error": "base_price must be a non-negative number"}, 400
            room_type.base_price = base_price
        except (InvalidOperation, TypeError, ValueError):
            return {"error": "base_price must be a valid number"}, 400

    if "max_occupancy" in data:
        max_occ_raw = data["max_occupancy"]
        if isinstance(max_occ_raw, bool) or not isinstance(max_occ_raw, (int, str)):
            return {"error": "max_occupancy must be an integer of at least 1"}, 400
        try:
            max_occ = int(max_occ_raw)
            if max_occ < 1:
                return {"error": "max_occupancy must be an integer of at least 1"}, 400
            room_type.max_occupancy = max_occ
        except (ValueError, TypeError):
            return {"error": "max_occupancy must be an integer of at least 1"}, 400

    if "bed_config" in data:
        bc = data["bed_config"]
        if not isinstance(bc, str) or not bc.strip():
            return {"error": "bed_config cannot be empty"}, 400
        if len(bc.strip()) > 60:
            return {"error": "bed_config must not exceed 60 characters"}, 400
        room_type.bed_config = bc.strip()

    if "description" in data:
        desc = data["description"]
        room_type.description = desc.strip() if isinstance(desc, str) else None

    if "amenities" in data:
        amenities = data["amenities"]
        if not isinstance(amenities, (dict, list, type(None))):
            return {"error": "amenities must be a JSON array or object"}, 400
        room_type.amenities = amenities

    if "is_active" in data:
        room_type.is_active = bool(data["is_active"])

    room_type.updated_at = datetime.now(timezone.utc)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while updating room type"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while updating room type"}, 500

    return {
        "message": "Room type updated successfully",
        "room_type": room_type.to_dict(),
    }, 200


def delete_room_type(room_type_id):
    room_type = db.session.get(RoomType, room_type_id)
    if not room_type:
        return {"error": "Room type not found"}, 404

    # Enforce referential integrity: reject delete if associated rooms or bookings exist
    if room_type.rooms and len(room_type.rooms) > 0:
        return {"error": "Cannot delete room type: referenced by existing rooms"}, 400

    if room_type.bookings and len(room_type.bookings) > 0:
        return {"error": "Cannot delete room type: referenced by existing bookings"}, 400

    try:
        db.session.delete(room_type)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while deleting room type"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while deleting room type"}, 500

    return {"message": "Room type deleted successfully"}, 200
