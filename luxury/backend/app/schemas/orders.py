from pydantic import BaseModel, Field

class CartUpdate(BaseModel):
    table_id: str
    cart: list[dict] = Field(default_factory=list)

class OrderCreate(BaseModel):
    table_id: str
    waiter_name: str = ""
    notes: str = ""
    items: list[dict] = Field(default_factory=list)
