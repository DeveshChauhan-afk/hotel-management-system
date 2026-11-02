from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app.utils.role_required import role_required
from app.services.maintenance_service import (
    create_maintenance_work_order,
    get_maintenance_records,
    get_maintenance_by_id,
    update_maintenance_record,
    delete_maintenance_record,
)

maintenance_bp = Blueprint("maintenance", __name__)


@maintenance_bp.route("/maintenance", methods=["POST"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def add_work_order():
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    claims = get_jwt()
    user_id = claims.get("user_id") if claims else None

    response, status_code = create_maintenance_work_order(data, reported_by_user_id=user_id)
    return jsonify(response), status_code


@maintenance_bp.route("/maintenance", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist", "maintenance")
def list_records():
    filters = {
        "room_id": request.args.get("room_id", type=int),
        "status": request.args.get("status", type=str),
        "priority": request.args.get("priority", type=str),
        "category": request.args.get("category", type=str),
        "assigned_to_user_id": request.args.get("assigned_to_user_id", type=int),
        "blocks_room_occupancy": request.args.get("blocks_room_occupancy", type=str),
    }
    response, status_code = get_maintenance_records(filters=filters)
    return jsonify(response), status_code


@maintenance_bp.route("/maintenance/<int:maintenance_id>", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist", "maintenance")
def retrieve_record(maintenance_id):
    response, status_code = get_maintenance_by_id(maintenance_id)
    return jsonify(response), status_code


@maintenance_bp.route("/maintenance/<int:maintenance_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "manager", "maintenance")
def edit_record(maintenance_id):
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    claims = get_jwt()
    user_id = claims.get("user_id") if claims else None
    user_role = claims.get("role") if claims else None

    response, status_code = update_maintenance_record(
        maintenance_id,
        data,
        user_id=user_id,
        user_role=user_role,
    )
    return jsonify(response), status_code


@maintenance_bp.route("/maintenance/<int:maintenance_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin", "manager")
def remove_record(maintenance_id):
    response, status_code = delete_maintenance_record(maintenance_id)
    return jsonify(response), status_code
