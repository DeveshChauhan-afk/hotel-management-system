from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.role_required import role_required
from app.services.room_type_service import (
    create_room_type,
    get_room_types,
    get_room_type_by_id,
    update_room_type,
    delete_room_type,
)

room_type_bp = Blueprint("room_types", __name__)


@room_type_bp.route("/room-types", methods=["POST"])
@jwt_required()
@role_required("admin", "manager")
def add_room_type():
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    response, status_code = create_room_type(data)
    return jsonify(response), status_code


@room_type_bp.route("/room-types", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def list_room_types():
    active_only = request.args.get("active_only", "false").lower() in ("true", "1")
    response, status_code = get_room_types(active_only=active_only)
    return jsonify(response), status_code


@room_type_bp.route("/room-types/<int:room_type_id>", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def retrieve_room_type(room_type_id):
    response, status_code = get_room_type_by_id(room_type_id)
    return jsonify(response), status_code


@room_type_bp.route("/room-types/<int:room_type_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "manager")
def edit_room_type(room_type_id):
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    response, status_code = update_room_type(room_type_id, data)
    return jsonify(response), status_code


@room_type_bp.route("/room-types/<int:room_type_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin", "manager")
def remove_room_type(room_type_id):
    response, status_code = delete_room_type(room_type_id)
    return jsonify(response), status_code
