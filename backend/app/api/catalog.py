from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.demo import DEMO_STORE_ID
from app.db.session import get_db_session
from app.repositories.retail import list_expenses, list_products
from app.schemas.catalog import ExpenseList, ExpenseQuery, PaginationQuery, ProductList
from app.schemas.common import ErrorResponse
from app.services.dashboard import demo_source

router = APIRouter(prefix="/api", tags=["store data"], responses={503: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})


@router.get("/products", response_model=ProductList)
def products(session: Annotated[Session, Depends(get_db_session)], query: Annotated[PaginationQuery, Query()]) -> ProductList:
    items, total = list_products(session, query.limit, query.offset)
    return ProductList(items=items, total=total, limit=query.limit, offset=query.offset,
                       store_id=DEMO_STORE_ID, data_source=demo_source())


@router.get("/expenses", response_model=ExpenseList)
def expenses(session: Annotated[Session, Depends(get_db_session)], query: Annotated[ExpenseQuery, Query()]) -> ExpenseList:
    period = query.period()
    items, total = list_expenses(session, period.start, period.end, query.limit, query.offset)
    return ExpenseList(items=items, total=total, limit=query.limit, offset=query.offset,
                       store_id=DEMO_STORE_ID, data_source=demo_source(), reporting_period=period)
