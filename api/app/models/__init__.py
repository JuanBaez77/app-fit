# Importar todos los modelos acá para que Alembic y los tests vean la metadata completa.
from app.models.catalog import Exercise, ExerciseMuscle, Muscle
from app.models.log import BodyWeight, SetLog, TrainingSession
from app.models.routine import Routine, RoutineDay, RoutineDayExercise, RoutineMuscleTarget
from app.models.user import AppUser, RefreshToken, UserProfile

__all__ = [
    "AppUser",
    "BodyWeight",
    "Exercise",
    "ExerciseMuscle",
    "Muscle",
    "RefreshToken",
    "Routine",
    "RoutineDay",
    "RoutineDayExercise",
    "RoutineMuscleTarget",
    "SetLog",
    "TrainingSession",
    "UserProfile",
]
