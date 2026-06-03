from app.extensions import db

class Room(db.Model):

    __tablename__ = "rooms"

    room_id = db.Column(db.Integer, primary_key=True)
    room_type = db.Column(db.String(50))
    status = db.Column(db.String(20))
    cleaned = db.Column(db.Boolean)

    def to_dict(self):
        return {
            "room_id": self.room_id,
            "room_type": self.room_type,
            "status": self.status,
            "cleaned": self.cleaned
        }