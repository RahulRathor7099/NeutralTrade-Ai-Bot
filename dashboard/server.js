import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.BINANCE_TESTNET_API_KEY;
const API_SECRET = process.env.BINANCE_TESTNET_API_SECRET;
const BASE_URL = 'https://testnet.binancefuture.com';

function sign(queryString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

let timeOffset = 0;

async function syncTime() {
  try {
    const res = await axios.get(`${BASE_URL}/fapi/v1/time`);
    const serverTime = res.data.serverTime;
    timeOffset = serverTime - Date.now();
    console.log(`Synced with Binance server time. Time offset: ${timeOffset}ms`);
  } catch (error) {
    console.error('Failed to sync time with Binance server:', error.message);
  }
}

// Initial sync
syncTime();
// Regular sync every 5 minutes
setInterval(syncTime, 5 * 60 * 1000);

function signedParams(params) {
  const timestamp = Date.now() + timeOffset;
  const recvWindow = 10000;
  const fullParams = { ...params, recvWindow, timestamp };
  const queryString = Object.entries(fullParams)
    .map(([key, val]) => `${key}=${val}`)
    .join('&');
  const signature = sign(queryString, API_SECRET);
  return { ...fullParams, signature };
}

async function binanceRequest(method, endpoint, params = {}) {
  let attempts = 0;
  while (attempts < 2) {
    try {
      const fullParams = signedParams(params);
      const url = `${BASE_URL}${endpoint}`;
      const config = {
        headers: { 'X-MBX-APIKEY': API_KEY }
      };

      let response;
      if (method.toUpperCase() === 'GET') {
        response = await axios.get(url, { ...config, params: fullParams });
      } else if (method.toUpperCase() === 'POST') {
        response = await axios.post(url, null, { ...config, params: fullParams });
      } else if (method.toUpperCase() === 'DELETE') {
        response = await axios.delete(url, { ...config, params: fullParams });
      }
      return response.data;
    } catch (error) {
      const apiCode = error.response?.data?.code;
      if (apiCode === -1021 && attempts === 0) {
        console.log('Received -1021 error (time sync issue). Re-syncing time and retrying request...');
        await syncTime();
        attempts++;
        continue;
      }
      throw error;
    }
  }
}

if (!API_KEY || !API_SECRET) {
  console.error('CRITICAL ERROR: Binance Testnet API keys not configured in .env');
}

app.get('/api/account', async (req, res) => {
  try {
    const data = await binanceRequest('GET', '/fapi/v2/account');
    res.json(data);
  } catch (error) {
    console.error('Account Error:', error.response?.data || error.message);
    res.status(500).json(error.response?.data || { error: error.message });
  }
});

app.get('/api/open-orders', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    const reqData = symbol ? { symbol } : {};
    const data = await binanceRequest('GET', '/fapi/v1/openOrders', reqData);
    res.json(data);
  } catch (error) {
    console.error('Open Orders Error:', error.response?.data || error.message);
    res.status(500).json(error.response?.data || { error: error.message });
  }
});

app.post('/api/order', async (req, res) => {
  try {
    const { symbol, side, type, quantity, price } = req.body;
    const orderParams = {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase(),
      type: type.toUpperCase(),
      quantity: Number(quantity)
    };
    
    if (type.toUpperCase() === 'LIMIT') {
      orderParams.price = Number(price);
      orderParams.timeInForce = 'GTC';
    }

    const data = await binanceRequest('POST', '/fapi/v1/order', orderParams);
    res.json(data);
  } catch (error) {
    console.error('Place Order Error:', error.response?.data || error.message);
    res.status(500).json(error.response?.data || { error: error.message });
  }
});

app.delete('/api/order', async (req, res) => {
  try {
    const { symbol, orderId } = req.query;
    const data = await binanceRequest('DELETE', '/fapi/v1/order', { symbol: symbol.toUpperCase(), orderId });
    res.json(data);
  } catch (error) {
    console.error('Cancel Order Error:', error.response?.data || error.message);
    res.status(500).json(error.response?.data || { error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend proxy running on http://localhost:${PORT}`);
});
