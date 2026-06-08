import os
import typer
from typing import Optional
from rich.console import Console
from rich.table import Table
from dotenv import load_dotenv

from bot.client import BinanceFuturesClient, BinanceClientError
from bot.validators import validate_all, ValidationError
from bot.orders import dispatch_order
from bot.logging_config import get_logger

logger = get_logger("cli")
app = typer.Typer(help="Binance Futures Trading Bot CLI")
console = Console()

def _get_client() -> BinanceFuturesClient:
    load_dotenv()
    api_key = os.getenv("BINANCE_TESTNET_API_KEY")
    api_secret = os.getenv("BINANCE_TESTNET_API_SECRET")
    
    if not api_key or not api_secret:
        console.print("[red]Error: API keys not found in .env file.[/]")
        raise typer.Exit(1)
        
    return BinanceFuturesClient(api_key, api_secret, testnet=True)

@app.command()
def place(
    symbol: str = typer.Option(..., "--symbol", "-s", help="Trading pair symbol (e.g. BTCUSDT)"),
    side: str = typer.Option(..., "--side", "-d", help="BUY or SELL"),
    order_type: str = typer.Option(..., "--order-type", "-t", help="MARKET or LIMIT"),
    quantity: float = typer.Option(..., "--quantity", "-q", help="Order quantity"),
    price: Optional[float] = typer.Option(None, "--price", "-p", help="Order price (required for LIMIT)")
):
    """Place a new order."""
    try:
        sym, s, t, q, p = validate_all(symbol, side, order_type, quantity, price)
        with _get_client() as client:
            dispatch_order(client, sym, s, t, q, p)
    except ValidationError as e:
        console.print(f"[red]Validation Error: {e}[/]")
        raise typer.Exit(1)
    except BinanceClientError as e:
        console.print(f"[red]API Error: {e}[/]")
        raise typer.Exit(1)
    except Exception as e:
        console.print(f"[red]Unexpected Error: {e}[/]")
        logger.exception("Unexpected error during place order")
        raise typer.Exit(1)

@app.command()
def account():
    """View account balances and open positions."""
    try:
        with _get_client() as client:
            info = client.get_account_info()
            
            # Balances Table
            console.print("\n💰  [bold]Asset Balances[/]")
            bal_table = Table(show_header=True, header_style="bold cyan")
            bal_table.add_column("Asset")
            bal_table.add_column("Wallet Balance", justify="right")
            bal_table.add_column("Available", justify="right")
            bal_table.add_column("Unrealized PnL", justify="right")
            
            for asset in info.get('assets', []):
                wb = float(asset.get('walletBalance', 0))
                if wb > 0:
                    ab = float(asset.get('availableBalance', 0))
                    upnl = float(asset.get('unrealizedProfit', 0))
                    
                    pnl_color = "green" if upnl >= 0 else "red"
                    pnl_str = f"[{pnl_color}]{'+' if upnl > 0 else ''}{upnl:.4f}[/]"
                    
                    bal_table.add_row(
                        asset['asset'],
                        f"{wb:.4f}",
                        f"{ab:.4f}",
                        pnl_str
                    )
            console.print(bal_table)
            
            # Positions Table
            console.print("\n📊  [bold]Open Positions[/]")
            pos_table = Table(show_header=True, header_style="bold cyan")
            pos_table.add_column("Symbol")
            pos_table.add_column("Side")
            pos_table.add_column("Amount", justify="right")
            pos_table.add_column("Entry", justify="right")
            pos_table.add_column("Unr. PnL", justify="right")
            
            has_positions = False
            for pos in info.get('positions', []):
                amt = float(pos.get('positionAmt', 0))
                if amt != 0:
                    has_positions = True
                    side = "LONG" if amt > 0 else "SHORT"
                    entry = float(pos.get('entryPrice', 0))
                    upnl = float(pos.get('unrealizedProfit', 0))
                    
                    pnl_color = "green" if upnl >= 0 else "red"
                    pnl_str = f"[{pnl_color}]{'+' if upnl > 0 else ''}{upnl:.2f}[/]"
                    
                    pos_table.add_row(
                        pos['symbol'],
                        f"[green]LONG[/]" if amt > 0 else f"[red]SHORT[/]",
                        f"{abs(amt):.3f}",
                        f"${entry:,.2f}",
                        pnl_str
                    )
            if not has_positions:
                pos_table.add_row("No open positions", "", "", "", "")
            console.print(pos_table)
            console.print()
            
    except BinanceClientError as e:
        console.print(f"[red]API Error: {e}[/]")
        raise typer.Exit(1)

@app.command()
def open_orders(symbol: Optional[str] = typer.Option(None, "--symbol", "-s", help="Filter by symbol")):
    """View open orders."""
    try:
        with _get_client() as client:
            orders = client.get_open_orders(symbol)
            console.print("\n📋  [bold]Open Orders[/]")
            
            table = Table(show_header=True, header_style="bold cyan")
            table.add_column("ID")
            table.add_column("Symbol")
            table.add_column("Side")
            table.add_column("Type")
            table.add_column("Quantity", justify="right")
            table.add_column("Price", justify="right")
            
            for o in orders:
                side = f"[green]BUY[/]" if o['side'] == 'BUY' else f"[red]SELL[/]"
                table.add_row(
                    str(o['orderId']),
                    o['symbol'],
                    side,
                    o['type'],
                    o['origQty'],
                    f"${float(o['price']):,.2f}"
                )
                
            if not orders:
                table.add_row("No open orders found", "", "", "", "", "")
                
            console.print(table)
            console.print()
            
    except BinanceClientError as e:
        console.print(f"[red]API Error: {e}[/]")
        raise typer.Exit(1)

def _print_banner():
    banner = """[bold cyan]
🤖 Binance Futures Typer Bot
[/]"""
    console.print(banner)

if __name__ == "__main__":
    _print_banner()
    app()
