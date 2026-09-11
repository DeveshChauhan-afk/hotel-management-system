from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash

from app.models.user_model import User

def login_user(username, password):

    user = User.query.filter_by(
        username=username
    ).first()

    if not user or not check_password_hash(user.password, password):

        return {
            "error": "Invalid username or password"
        }, 401

    access_token = create_access_token(
        identity=user.username,
        additional_claims={
            "user_id": user.user_id,
            "role": user.role
        }
    )

    return {
        "message": "Login successful",
        "token": access_token,
        "user": user.to_dict()
    }, 200