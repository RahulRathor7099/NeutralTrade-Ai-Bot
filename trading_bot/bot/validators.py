from typing import Optional

class ValidationError(Exception):
    pass

def validate_symbol(symbol: str) -> str:
    s = symbol.upper()
    if not s.isalnum():
        raise ValidationError(f"Invalid symbol format: {symbol}")
    return s

def validate_side(side: str) -> str:
    s = side.upper()
    if s not in ['BUY', 'SELL']:
        raise ValidationError(f"Invalid side: {side}. Must be BUY or SELL.")
    return s

def validate_order_type(order_type: str) -> str:
    t = order_type.upper()
    if t not in ['MARKET', 'LIMIT']:
        raise ValidationError(f"Invalid order type: {order_type}. Must be MARKET or LIMIT.")
    return t

def validate_quantity(quantity: float) -> float:
    if quantity <= 0:
        raise ValidationError(f"Quantity must be greater than 0")
    return quantity

def validate_price(order_type: str, price: Optional[float]) -> Optional[float]:
    if order_type == 'LIMIT':
        if price is None or price <= 0:
            raise ValidationError(f"Price must be provided and > 0 for LIMIT orders")
        return price
    return None

def validate_all(symbol: str, side: str, order_type: str, quantity: float, price: Optional[float] = None):
    return (
        validate_symbol(symbol),
        validate_side(side),
        validate_order_type(order_type),
        validate_quantity(quantity),
        validate_price(order_type.upper(), price)
    )
