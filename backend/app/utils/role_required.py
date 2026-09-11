from functools import wraps

from flask_jwt_extended import get_jwt

from flask import jsonify

def role_required(*roles):

    allowed_roles = set()
    for role in roles:
        if isinstance(role, (list, tuple, set)):
            allowed_roles.update(role)
        else:
            allowed_roles.add(role)

    def decorator(fn):

        @wraps(fn)
        def wrapper(*args, **kwargs):

            claims = get_jwt()
            user_role = claims.get("role") if claims else None

            if not user_role or user_role not in allowed_roles:

                return jsonify({
                    "error": "Access denied"
                }), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator