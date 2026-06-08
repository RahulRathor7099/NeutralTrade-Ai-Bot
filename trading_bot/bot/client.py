import time
import hmac
import hashlib
import httpx
from typing import Dict, Any, Optional

from bot.logging_config import get_logger

logger = get_logger("client")

class BinanceClientError(Exception):
    pass

class BinanceFuturesClient:
    def __init__(self, api_key: str, api_secret: str, testnet: bool = True):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = "https://testnet.binancefuture.com" if testnet else "https://fapi.binance.com"
        self.client = httpx.Client(base_url=self.base_url, timeout=10.0)
        self.client.headers.update({"X-MBX-APIKEY": self.api_key})
        self.time_offset = 0
        logger.info(f"Initialized Binance Futures Client (Testnet: {testnet})")
        self._sync_time()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.client.close()

    def _sync_time(self):
        try:
            logger.info("Syncing time with Binance server...")
            response = self.client.get("/fapi/v1/time")
            if response.status_code == 200:
                server_time = response.json().get("serverTime")
                self.time_offset = server_time - int(time.time() * 1000)
                logger.info(f"Synced time with Binance server. Offset: {self.time_offset}ms")
        except Exception as e:
            logger.warning(f"Failed to sync time with Binance: {e}")

    def _sign(self, query_string: str) -> str:
        return hmac.new(
            self.api_secret.encode('utf-8'),
            query_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    def _signed_params(self, params: Dict[str, Any]) -> Dict[str, Any]:
        params['timestamp'] = int(time.time() * 1000) + self.time_offset
        params['recvWindow'] = 10000
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        params['signature'] = self._sign(query_string)
        return params

    def _request(self, method: str, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        params = params or {}
        
        try:
            req_params = params.copy()
            signed_params = self._signed_params(req_params)
            
            logger.debug(f"Making {method} request to {endpoint}")
            response = self.client.request(method, endpoint, params=signed_params)
            data = response.json()
            
            if 'code' in data and data['code'] < 0:
                if data['code'] == -1021:
                    logger.warning("Received -1021 (time sync). Re-syncing and retrying...")
                    self._sync_time()
                    req_params = params.copy()
                    signed_params = self._signed_params(req_params)
                    response = self.client.request(method, endpoint, params=signed_params)
                    data = response.json()
                    if 'code' in data and data['code'] < 0:
                        raise BinanceClientError(f"API Error {data['code']}: {data['msg']}")
                else:
                    raise BinanceClientError(f"API Error {data['code']}: {data['msg']}")
            
            response.raise_for_status()
            return data
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP Error: {e.response.text}")
            try:
                err_data = e.response.json()
                if 'code' in err_data:
                    raise BinanceClientError(f"API Error {err_data['code']}: {err_data.get('msg', '')}") from e
            except:
                pass
            raise BinanceClientError(f"HTTP Error: {e.response.status_code}") from e
        except httpx.RequestError as e:
            logger.error(f"Request Error: {str(e)}")
            raise BinanceClientError(f"Request Error: {str(e)}") from e

    def place_order(self, symbol: str, side: str, order_type: str, quantity: float, price: Optional[float] = None) -> Dict[str, Any]:
        params = {
            "symbol": symbol,
            "side": side,
            "type": order_type,
            "quantity": quantity
        }
        if price is not None and order_type == 'LIMIT':
            params["price"] = price
            params["timeInForce"] = "GTC"
            
        logger.info(f"Placing {order_type} {side} order for {quantity} {symbol}")
        return self._request("POST", "/fapi/v1/order", params)

    def get_account_info(self) -> Dict[str, Any]:
        logger.info("Fetching account info")
        return self._request("GET", "/fapi/v2/account")

    def get_open_orders(self, symbol: Optional[str] = None) -> Any:
        params = {}
        if symbol:
            params['symbol'] = symbol
        logger.info("Fetching open orders")
        return self._request("GET", "/fapi/v1/openOrders", params)
        
    def cancel_order(self, symbol: str, orderId: int) -> Dict[str, Any]:
        params = {"symbol": symbol, "orderId": orderId}
        logger.info(f"Canceling order {orderId} for {symbol}")
        return self._request("DELETE", "/fapi/v1/order", params)
