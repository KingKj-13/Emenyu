import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.config import get_settings
from app.core.dependencies import DbSession, require_roles
from app.models.order import ActiveCartState, Order, OrderItem
from app.schemas.orders import CartUpdate, OrderCreate
from app.ws.manager import ws_manager

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get(
    "/active",
    summary="Get all active orders",
    dependencies=[Depends(require_roles("owner", "manager", "waiter", "kitchen"))],
)
async def get_active_orders(db: DbSession) -> dict[str, Any]:
    """Get all orders currently not completed or cancelled."""
    settings = get_settings()
    rid = settings.restaurant_id

    result = await db.execute(
        select(Order).where(Order.restaurantId == rid, Order.status == "active")
    )
    orders = result.scalars().all()
    
    order_list = []
    for o in orders:
        items_result = await db.execute(select(OrderItem).where(OrderItem.orderId == o.id))
        items = items_result.scalars().all()
        order_list.append({
            "id": o.id,
            "table_id": o.tableId,
            "waiter_name": o.waiterName,
            "status": o.status,
            "kitchen_status": o.kitchenStatus,
            "total": o.total,
            "items": [{"id": i.id, "name": i.name, "quantity": i.quantity, "price": i.price, "note": i.note} for i in items]
        })

    return {"orders": order_list}


@router.post(
    "/",
    summary="Submit an order",
    dependencies=[Depends(require_roles("waiter", "manager"))],
)
async def create_order(body: OrderCreate, db: DbSession) -> dict[str, Any]:
    """Submit a new order from a table's active cart."""
    settings = get_settings()
    rid = settings.restaurant_id
    
    total = sum(item.get("price", 0) * item.get("quantity", 1) for item in body.items)

    new_order = Order(
        restaurantId=rid,
        filename=str(uuid.uuid4()),
        tableId=body.table_id,
        waiterName=body.waiter_name,
        notes=body.notes,
        status="active",
        kitchenStatus="new",
        subtotal=total,
        total=total,
        covers=0,
        raw={"items": body.items}
    )
    db.add(new_order)
    await db.commit()
    await db.refresh(new_order)

    for item in body.items:
        db.add(OrderItem(
            orderId=new_order.id,
            name=item.get("name", "Unknown"),
            price=item.get("price", 0),
            quantity=item.get("quantity", 1),
            note=item.get("note", ""),
            description=item.get("description", "")
        ))
        
    # Clear the active cart
    cart_result = await db.execute(
        select(ActiveCartState).where(ActiveCartState.tableId == body.table_id, ActiveCartState.restaurantId == rid)
    )
    cart_state = cart_result.scalar_one_or_none()
    if cart_state:
        cart_state.cart = []
        
    await db.commit()
    
    # Notify kitchen and others
    await ws_manager.broadcast_to_room(
        f"kitchen:{rid}",
        {
            "type": "new_order",
            "table_id": body.table_id,
            "order_id": new_order.id
        }
    )

    return {"order_id": new_order.id, "status": "success"}


@router.post(
    "/{order_id}/kitchen-status",
    summary="Update kitchen status (Mock)",
    dependencies=[Depends(require_roles("waiter", "manager", "kitchen"))],
)
async def update_kitchen_status(order_id: int, status: str, db: DbSession) -> dict[str, Any]:
    """Mock endpoint to simulate Kitchen Display updates."""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if order:
        order.kitchenStatus = status
        await db.commit()
        await ws_manager.broadcast_to_room(
            f"waiters:{order.restaurantId}",
            {
                "type": "kitchen_update",
                "order_id": order_id,
                "table_id": order.tableId,
                "kitchen_status": status
            }
        )
        return {"status": "success", "kitchen_status": status}
    return {"status": "error", "message": "Order not found"}


@router.get(
    "/cart/{table_id}",
    summary="Get active cart",
    dependencies=[Depends(require_roles("owner", "manager", "waiter", "tablet"))],
)
async def get_cart(table_id: str, db: DbSession) -> dict[str, Any]:
    settings = get_settings()
    rid = settings.restaurant_id

    result = await db.execute(
        select(ActiveCartState).where(ActiveCartState.restaurantId == rid, ActiveCartState.tableId == table_id)
    )
    cart = result.scalar_one_or_none()
    if cart:
        return {"cart": cart.cart}
    return {"cart": []}


@router.post(
    "/cart/update",
    summary="Update active cart",
    dependencies=[Depends(require_roles("owner", "manager", "waiter", "tablet"))],
)
async def update_cart(body: CartUpdate, db: DbSession) -> dict[str, Any]:
    settings = get_settings()
    rid = settings.restaurant_id

    result = await db.execute(
        select(ActiveCartState).where(ActiveCartState.restaurantId == rid, ActiveCartState.tableId == body.table_id)
    )
    cart = result.scalar_one_or_none()
    if not cart:
        cart = ActiveCartState(
            restaurantId=rid,
            tableId=body.table_id,
            cart={"items": body.cart}
        )
        db.add(cart)
    else:
        cart.cart = {"items": body.cart}

    await db.commit()

    # Inform the tablet or waiter app about the cart update (bidirectional sync)
    await ws_manager.broadcast_to_room(
        f"table:{body.table_id}",
        {
            "type": "cart_update",
            "table_id": body.table_id
        }
    )

    return {"status": "success"}
