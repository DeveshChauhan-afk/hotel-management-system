from flask import Blueprint, jsonify, request
from app.utils.role_required import role_required
from app.models.room_model import Room
from app.services.room_service import auto_assign_room
from flask_jwt_extended import (
    jwt_required,
    get_jwt_identity,
    get_jwt
)
room_bp = Blueprint("rooms", __name__)

@room_bp.route("/rooms", methods=["GET"])
@jwt_required()
@role_required("admin", "receptionist")
def get_rooms():

    current_user = get_jwt_identity()

    claims = get_jwt()

    print("Username:", current_user)

    print("Claims:", claims)

    rooms = Room.query.all()

    return jsonify([
        room.to_dict() for room in rooms
    ])


@room_bp.route("/auto-assign-room", methods=["POST"])
@jwt_required()
@role_required("admin", "receptionist")
def assign_room():

    data = request.get_json()

    room_type = data.get("room_type")

    if not room_type:

        return jsonify({
            "error": "Room type required"
        }), 400

    response, status_code = auto_assign_room(room_type)

    return jsonify(response), status_code