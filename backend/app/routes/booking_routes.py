from flask import Blueprint, request, jsonify

from app.services.booking_service import create_booking

booking_bp = Blueprint("booking", __name__)

@booking_bp.route("/book-room", methods=["POST"])
def book_room():

    data = request.get_json()

    guest_id = data.get("guest_id")
    room_id = data.get("room_id")

    if not guest_id or not room_id:

        return jsonify({
            "error": "Missing required fields"
        }), 400

    response, status_code = create_booking(
        guest_id,
        room_id
    )

    return jsonify(response), status_code