"""The only store exposed by the unauthenticated Phase 02 demonstration."""

from datetime import date
from uuid import NAMESPACE_URL, uuid5

DEMO_NAMESPACE = uuid5(NAMESPACE_URL, "https://retail-decision-lab.example/synthetic-demo/v1")
DEMO_ORGANIZATION_ID = uuid5(DEMO_NAMESPACE, "organization")
DEMO_STORE_ID = uuid5(DEMO_NAMESPACE, "store")
DEMO_PERIOD_START = date(2026, 9, 1)
DEMO_PERIOD_END = date(2026, 9, 30)
