from typing import Optional
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from bot.client import BinanceFuturesClient

console = Console()

def _format_order_summary(symbol: str, side: str, order_type: str, quantity: float, price: Optional[float] = None):
    grid = Table.grid(padding=(0, 2))
    grid.add_column(style="cyan", justify="left", min_width=15)
    grid.add_column(style="white", justify="left")
    
    grid.add_row("Symbol", symbol)
    grid.add_row("Side", f"{side} [green]●[/]" if side == 'BUY' else f"{side} [red]●[/]")
    grid.add_row("Order Type", order_type)
    grid.add_row("Quantity", f"{quantity:.2f}")
    if price is not None:
        grid.add_row("Price", f"${price:,.4f}")
        
    console.print(Panel(grid, title="📋 Order Request Summary", border_style="blue", expand=False))

def _format_order_response(response: dict):
    grid = Table.grid(padding=(0, 2))
    grid.add_column(style="cyan", justify="left", min_width=15)
    grid.add_column(style="white", justify="left")
    
    order_id = response.get("orderId", "N/A")
    status = response.get("status", "N/A")
    exec_qty = float(response.get("executedQty", 0))
    avg_price = float(response.get("avgPrice", 0))
    
    status_indicator = "[green]●[/]" if status in ["FILLED", "NEW"] else "[yellow]●[/]"
    
    grid.add_row("Order ID", str(order_id))
    grid.add_row("Status", f"{status} {status_indicator}")
    grid.add_row("Exec Quantity", f"{exec_qty:.3f}")
    
    if avg_price > 0:
        grid.add_row("Avg Price", f"${avg_price:,.4f}")
    else:
        grid.add_row("Avg Price", "$0.0000 (pending)")
        
    console.print(Panel(grid, title="✅ Order Response", border_style="green", expand=False))

def dispatch_order(client: BinanceFuturesClient, symbol: str, side: str, order_type: str, quantity: float, price: Optional[float] = None):
    _format_order_summary(symbol, side, order_type, quantity, price)
    
    with console.status(f"[bold green]Placing {order_type} order...") as status:
        response = client.place_order(symbol, side, order_type, quantity, price)
        
    _format_order_response(response)
    
    if order_type == "MARKET":
        console.print(f"🚀 [bold green]MARKET order submitted successfully![/]\n")
    else:
        console.print(f"📌 [bold blue]LIMIT order placed successfully![/]\n")
