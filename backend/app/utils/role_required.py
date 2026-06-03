from functools import wraps

from flask_jwt_extended import get_jwt

from flask import jsonify

def role_required(required_role):

    def decorator(fn):

        @wraps(fn)
        def wrapper(*args, **kwargs):

            claims = get_jwt()

            if claims["role"] != required_role:

                return jsonify({
                    "error": "Access denied"
                }), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator