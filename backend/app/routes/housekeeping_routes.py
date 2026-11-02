from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app.utils.role_required import role_required
from app.services.housekeeping_service import (
    create_housekeeping_task,
    get_housekeeping_tasks,
    get_housekeeping_task_by_id,
    update_housekeeping_task,
    delete_housekeeping_task,
)

housekeeping_bp = Blueprint("housekeeping", __name__)


@housekeeping_bp.route("/housekeeping", methods=["POST"])
@jwt_required()
@role_required("admin", "manager")
def add_task():
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    response, status_code = create_housekeeping_task(data)
    return jsonify(response), status_code


@housekeeping_bp.route("/housekeeping", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist", "housekeeper")
def list_tasks():
    filters = {
        "room_id": request.args.get("room_id", type=int),
        "status": request.args.get("status", type=str),
        "assigned_to_user_id": request.args.get("assigned_to_user_id", type=int),
        "task_type": request.args.get("task_type", type=str),
        "priority": request.args.get("priority", type=str),
        "scheduled_date": request.args.get("scheduled_date", type=str),
    }
    response, status_code = get_housekeeping_tasks(filters=filters)
    return jsonify(response), status_code


@housekeeping_bp.route("/housekeeping/<int:task_id>", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist", "housekeeper")
def retrieve_task(task_id):
    response, status_code = get_housekeeping_task_by_id(task_id)
    return jsonify(response), status_code


@housekeeping_bp.route("/housekeeping/<int:task_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "manager", "housekeeper")
def edit_task(task_id):
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    claims = get_jwt()
    user_id = claims.get("user_id") if claims else None
    user_role = claims.get("role") if claims else None

    response, status_code = update_housekeeping_task(
        task_id,
        data,
        user_id=user_id,
        user_role=user_role,
    )
    return jsonify(response), status_code


@housekeeping_bp.route("/housekeeping/<int:task_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin", "manager")
def remove_task(task_id):
    response, status_code = delete_housekeeping_task(task_id)
    return jsonify(response), status_code
