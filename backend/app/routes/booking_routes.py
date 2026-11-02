from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app.services.booking_service import (
    create_booking,
    get_bookings,
    get_booking_by_id,
    checkin_booking,
    cancel_booking,
)
from app.utils.role_required import role_required

booking_bp = Blueprint("booking", __name__)


@booking_bp.route("/book-room", methods=["POST"])
@booking_bp.route("/bookings", methods=["POST"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def book_room():
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Missing required fields"}), 400

    guest_id = data.get("guest_id")
    room_id = data.get("room_id")

    if not guest_id or not room_id:
        return jsonify({"error": "Missing required fields"}), 400

    claims = get_jwt()
    user_id = claims.get("user_id") if claims else None

    response, status_code = create_booking(data, user_id=user_id)
    return jsonify(response), status_code


@booking_bp.route("/bookings", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def list_bookings():
    guest_id = request.args.get("guest_id", default=None)
    room_id = request.args.get("room_id", default=None)
    status = request.args.get("status", default=None)

    response, status_code = get_bookings(guest_id=guest_id, room_id=room_id, status=status)
    return jsonify(response), status_code


@booking_bp.route("/bookings/<int:booking_id>", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def retrieve_booking(booking_id):
    response, status_code = get_booking_by_id(booking_id)
    return jsonify(response), status_code


@booking_bp.route("/bookings/<int:booking_id>/check-in", methods=["POST"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def checkin(booking_id):
    response, status_code = checkin_booking(booking_id)
    return jsonify(response), status_code


@booking_bp.route("/bookings/<int:booking_id>/cancel", methods=["POST"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def cancel(booking_id):
    data = request.get_json(silent=True)
    cancellation_reason = None
    if isinstance(data, dict):
        cancellation_reason = data.get("cancellation_reason")

    response, status_code = cancel_booking(booking_id, cancellation_reason=cancellation_reason)
    return jsonify(response), status_code
