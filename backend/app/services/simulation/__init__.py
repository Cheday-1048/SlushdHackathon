"""Pure aggregate sales-scenario engine and validated public value objects."""

from .calculations import SimulationParameterError, simulate
from .types import ScenarioParameters, SimulatedMetrics, SimulationCalculation, SimulationDifferences

__all__ = [
    "simulate", "ScenarioParameters", "SimulatedMetrics",
    "SimulationCalculation", "SimulationDifferences", "SimulationParameterError",
]
