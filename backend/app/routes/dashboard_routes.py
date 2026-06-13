from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.services.dashboard_service import get_dashboard_stats

dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/dashboard/stats", methods=["GET"])
@jwt_required()
def dashboard_stats():

    stats = get_dashboard_stats()

    return jsonify(stats)