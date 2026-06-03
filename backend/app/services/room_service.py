from app.models.room_model import Room

def auto_assign_room(room_type):

    room = Room.query.filter_by(
        room_type=room_type,
        status="available",
        cleaned=True
    ).first()

    if not room:

        return {
            "error": "No available cleaned room found"
        }, 404

    return room.to_dict(), 200