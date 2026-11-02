from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.role_required import role_required
from app.services.guest_service import (
    create_guest,
    get_guests,
    get_guest_by_id,
    update_guest,
    delete_guest,
)

guest_bp = Blueprint("guests", __name__)


@guest_bp.route("/guests", methods=["POST"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def add_guest():
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    response, status_code = create_guest(data)
    return jsonify(response), status_code


@guest_bp.route("/guests", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def list_guests():
    search = request.args.get("search", default=None, type=str)
    response, status_code = get_guests(search_query=search)
    return jsonify(response), status_code


@guest_bp.route("/guests/<int:guest_id>", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def retrieve_guest(guest_id):
    response, status_code = get_guest_by_id(guest_id)
    return jsonify(response), status_code


@guest_bp.route("/guests/<int:guest_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def edit_guest(guest_id):
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    response, status_code = update_guest(guest_id, data)
    return jsonify(response), status_code


@guest_bp.route("/guests/<int:guest_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin", "manager")
def remove_guest(guest_id):
    response, status_code = delete_guest(guest_id)
    return jsonify(response), status_code
