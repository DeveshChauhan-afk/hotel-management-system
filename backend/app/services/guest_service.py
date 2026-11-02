from datetime import datetime, timezone
from sqlalchemy.exc import SQLAlchemyError
from app.extensions import db
from app.models.guest_model import Guest


VALID_ID_TYPES = {"passport", "national_id", "driving_license", "other"}


def create_guest(data):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    first_name = data.get("first_name")
    last_name = data.get("last_name")
    phone = data.get("phone")

    if not first_name or not isinstance(first_name, str) or not first_name.strip():
        return {"error": "first_name is required and cannot be empty"}, 400

    if not last_name or not isinstance(last_name, str) or not last_name.strip():
        return {"error": "last_name is required and cannot be empty"}, 400

    if not phone or not isinstance(phone, str) or not phone.strip():
        return {"error": "phone is required and cannot be empty"}, 400

    first_name = first_name.strip()
    last_name = last_name.strip()
    phone = phone.strip()

    if len(first_name) > 50:
        return {"error": "first_name must not exceed 50 characters"}, 400
    if len(last_name) > 50:
        return {"error": "last_name must not exceed 50 characters"}, 400
    if len(phone) > 25:
        return {"error": "phone must not exceed 25 characters"}, 400

    email = data.get("email")
    if email is not None:
        if not isinstance(email, str) or len(email.strip()) == 0:
            email = None
        else:
            email = email.strip()
            if len(email) > 120 or "@" not in email:
                return {"error": "Invalid email address"}, 400

    id_type = data.get("id_type")
    if id_type is not None:
        if not isinstance(id_type, str) or id_type not in VALID_ID_TYPES:
            return {"error": f"id_type must be one of {sorted(list(VALID_ID_TYPES))}"}, 400

    id_number = data.get("id_number")
    if id_number is not None:
        if not isinstance(id_number, str):
            id_number = str(id_number).strip()
        else:
            id_number = id_number.strip()
        if len(id_number) == 0:
            id_number = None
        elif len(id_number) > 50:
            return {"error": "id_number must not exceed 50 characters"}, 400

    # Enforce UniqueConstraint("id_type", "id_number", name="uq_guest_id_doc")
    if id_type and id_number:
        existing_doc = Guest.query.filter_by(id_type=id_type, id_number=id_number).first()
        if existing_doc:
            return {"error": "A guest with this ID document already exists"}, 409

    vip_status = bool(data.get("vip_status", False))
    address = data.get("address")
    city = data.get("city")
    country = data.get("country")
    postal_code = data.get("postal_code")
    notes = data.get("notes")

    guest = Guest(
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        email=email,
        id_type=id_type,
        id_number=id_number,
        address=address.strip() if isinstance(address, str) else address,
        city=city.strip() if isinstance(city, str) else city,
        country=country.strip() if isinstance(country, str) else country,
        postal_code=postal_code.strip() if isinstance(postal_code, str) else postal_code,
        vip_status=vip_status,
        notes=notes.strip() if isinstance(notes, str) else notes,
    )

    try:
        db.session.add(guest)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while creating guest"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while creating guest"}, 500

    return {
        "message": "Guest created successfully",
        "guest": guest.to_dict()
    }, 201


def get_guests(search_query=None):
    query = Guest.query
    if search_query and isinstance(search_query, str) and search_query.strip():
        term = f"%{search_query.strip()}%"
        query = query.filter(
            Guest.first_name.ilike(term) |
            Guest.last_name.ilike(term) |
            Guest.phone.ilike(term) |
            Guest.email.ilike(term) |
            Guest.id_number.ilike(term)
        )

    guests = query.order_by(Guest.last_name, Guest.first_name).all()
    return [g.to_dict() for g in guests], 200


def get_guest_by_id(guest_id):
    guest = db.session.get(Guest, guest_id)
    if not guest:
        return {"error": "Guest not found"}, 404
    return guest.to_dict(), 200


def update_guest(guest_id, data):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    guest = db.session.get(Guest, guest_id)
    if not guest:
        return {"error": "Guest not found"}, 404

    if "first_name" in data:
        fn = data["first_name"]
        if not isinstance(fn, str) or not fn.strip():
            return {"error": "first_name cannot be empty"}, 400
        if len(fn.strip()) > 50:
            return {"error": "first_name must not exceed 50 characters"}, 400
        guest.first_name = fn.strip()

    if "last_name" in data:
        ln = data["last_name"]
        if not isinstance(ln, str) or not ln.strip():
            return {"error": "last_name cannot be empty"}, 400
        if len(ln.strip()) > 50:
            return {"error": "last_name must not exceed 50 characters"}, 400
        guest.last_name = ln.strip()

    if "phone" in data:
        ph = data["phone"]
        if not isinstance(ph, str) or not ph.strip():
            return {"error": "phone cannot be empty"}, 400
        if len(ph.strip()) > 25:
            return {"error": "phone must not exceed 25 characters"}, 400
        guest.phone = ph.strip()

    if "email" in data:
        em = data["email"]
        if em is None or (isinstance(em, str) and not em.strip()):
            guest.email = None
        elif isinstance(em, str):
            em = em.strip()
            if len(em) > 120 or "@" not in em:
                return {"error": "Invalid email address"}, 400
            guest.email = em
        else:
            return {"error": "Invalid email address"}, 400

    new_id_type = data.get("id_type", guest.id_type)
    new_id_number = data.get("id_number", guest.id_number)

    if "id_type" in data:
        if new_id_type is not None and (not isinstance(new_id_type, str) or new_id_type not in VALID_ID_TYPES):
            return {"error": f"id_type must be one of {sorted(list(VALID_ID_TYPES))}"}, 400
        guest.id_type = new_id_type

    if "id_number" in data:
        if new_id_number is not None:
            new_id_number = str(new_id_number).strip()
            if len(new_id_number) > 50:
                return {"error": "id_number must not exceed 50 characters"}, 400
            if len(new_id_number) == 0:
                new_id_number = None
        guest.id_number = new_id_number

    if guest.id_type and guest.id_number:
        conflict = Guest.query.filter(
            Guest.id_type == guest.id_type,
            Guest.id_number == guest.id_number,
            Guest.guest_id != guest.guest_id
        ).first()
        if conflict:
            return {"error": "A guest with this ID document already exists"}, 409

    if "address" in data:
        guest.address = data["address"]
    if "city" in data:
        guest.city = data["city"]
    if "country" in data:
        guest.country = data["country"]
    if "postal_code" in data:
        guest.postal_code = data["postal_code"]
    if "vip_status" in data:
        guest.vip_status = bool(data["vip_status"])
    if "notes" in data:
        guest.notes = data["notes"]

    guest.updated_at = datetime.now(timezone.utc)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while updating guest"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while updating guest"}, 500

    return {
        "message": "Guest updated successfully",
        "guest": guest.to_dict()
    }, 200


def delete_guest(guest_id):
    guest = db.session.get(Guest, guest_id)
    if not guest:
        return {"error": "Guest not found"}, 404

    if guest.bookings and len(guest.bookings) > 0:
        return {"error": "Cannot delete guest with existing bookings"}, 400

    if guest.bills and len(guest.bills) > 0:
        return {"error": "Cannot delete guest with existing bills"}, 400

    try:
        db.session.delete(guest)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while deleting guest"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while deleting guest"}, 500

    return {"message": "Guest deleted successfully"}, 200
