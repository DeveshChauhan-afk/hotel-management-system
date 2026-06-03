from app.extensions import db

class User(db.Model):

    __tablename__ = "users"

    user_id = db.Column(db.Integer, primary_key=True)

    username = db.Column(db.String(50), unique=True)

    password = db.Column(db.String(100))

    role = db.Column(db.String(20))

    def to_dict(self):

        return {
            "user_id": self.user_id,
            "username": self.username,
            "role": self.role
        }