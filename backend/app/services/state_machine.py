from fastapi import HTTPException


ALLOWED_TRANSITIONS = {
    "pending": {"accepted", "cancelled"},
    "accepted": {"arrived", "cancelled"},
    "arrived": {"in_progress", "cancelled"},
    "in_progress": {"completed"},
    "completed": set(),
    "cancelled": set(),
}


def assert_transition(current: str, target: str) -> None:
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ride state transition: {current} -> {target}",
        )
