import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';

const BACKEND_URL = '';

export default function App() {
  // Navigation State
  const [tab, setTab] = useState('terminal'); // 'terminal' | 'analysis' | 'bots' | 'assets' | 'config'
  
  // API & Sync States
  const [apiStatus, setApiStatus] = useState('connecting');
  const [accountData, setAccountData] = useState(null);
  const [openOrders, setOpenOrders] = useState([]);
  const [logs, setLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString(), type: 'system', msg: 'Neural core initialized. Switched telemetry channels.' }
  ]);
  const [chartData, setChartData] = useState([]);
  const [orderForm, setOrderForm] = useState({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01', price: '' });
  const [terminalCmd, setTerminalCmd] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('Type "help", "account", or "orders" to execute proxy commands.');
  const [placingOrder, setPlacingOrder] = useState(false);

  // Simulation Mode States
  const [tradeMode, setTradeMode] = useState('exchange'); // 'exchange' or 'simulation'
  const [simWallet, setSimWallet] = useState(10000.00);
  const [simPositions, setSimPositions] = useState([]);
  const [simOpenOrders, setSimOpenOrders] = useState([]);

  // Accrued Yield Staking State (Assets Tab)
  const [accruedYield, setAccruedYield] = useState(3492.10);
  const [claimLoading, setClaimLoading] = useState(false);

  // Analysis Tab States
  const [analysisTimeframe, setAnalysisTimeframe] = useState('4H');
  const [multiAssetData, setMultiAssetData] = useState([]);

  // Bots Tab States
  const [activeModelId, setActiveModelId] = useState('x14'); // 'x14' | 'k9'
  const [riskToleranceSlider, setRiskToleranceSlider] = useState(85);
  const [maxDrawdownSlider, setMaxDrawdownSlider] = useState(15);
  const [leverageSlider, setLeverageSlider] = useState(10);
  
  // Backtesting States
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);
  const [backtestRunCount, setBacktestRunCount] = useState(0);
  const [backtestChartData, setBacktestChartData] = useState([]);

  // Config Tab States
  const [apiBinanceActive, setApiBinanceActive] = useState(true);
  const [apiCoinbaseActive, setApiCoinbaseActive] = useState(false);
  const [security2faActive, setSecurity2faActive] = useState(true);
  const [securityBioActive, setSecurityBioActive] = useState(true);
  const [coreRiskSlider, setCoreRiskSlider] = useState(85);
  const [coreUpdateFrequency, setCoreUpdateFrequency] = useState(95);

  const logsEndRef = useRef(null);

  // Add Log
  const addLog = (msg, type = 'info') => {
    setLogs(prev => [
      ...prev,
      { id: Date.now(), time: new Date().toLocaleTimeString(), type, msg }
    ].slice(-50)); // Keep last 50
  };

  // Scroll to bottom of logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, tab]);

  // Fetch API Account Info and Open Orders from proxy server
  const fetchData = async () => {
    try {
      const accRes = await fetch(`${BACKEND_URL}/api/account`);
      if (!accRes.ok) throw new Error('Proxy server offline or API Keys invalid.');
      const accVal = await accRes.json();
      setAccountData(accVal);
      setApiStatus('online');

      const orderRes = await fetch(`${BACKEND_URL}/api/open-orders`);
      const orderVal = await orderRes.json();
      setOpenOrders(Array.isArray(orderVal) ? orderVal : []);
    } catch (error) {
      console.error(error);
      setApiStatus('offline');
      addLog(`Sync error: ${error.message}`, 'error');
    }
  };

  // Init Data Sync Loop for exchange mode
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (tradeMode === 'exchange') {
        fetchData();
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [tradeMode]);

  // Helper to open/adjust positions in simulation mode
  const openSimPosition = (symbol, side, qty, price) => {
    setSimPositions(prev => {
      const existing = prev.find(p => p.symbol === symbol);
      const directionMultiplier = side === 'BUY' ? 1 : -1;
      const orderAmt = qty * directionMultiplier;

      if (existing) {
        const currentAmt = parseFloat(existing.positionAmt);
        const currentEntry = parseFloat(existing.entryPrice);
        const newAmt = currentAmt + orderAmt;

        if (Math.abs(newAmt) < 0.0001) {
          const pnl = currentAmt * (price - currentEntry);
          setSimWallet(w => w + pnl);
          addLog(`[SIMULATOR] Position on ${symbol} CLOSED. Realized PnL: ${pnl.toFixed(4)} USDT`, 'success');
          return prev.filter(p => p.symbol !== symbol);
        } else {
          let newEntry = currentEntry;
          if ((currentAmt > 0 && orderAmt > 0) || (currentAmt < 0 && orderAmt < 0)) {
            newEntry = ((currentAmt * currentEntry) + (orderAmt * price)) / newAmt;
          } else {
            const closedQty = Math.min(Math.abs(currentAmt), Math.abs(qty)) * Math.sign(currentAmt);
            const partialPnl = closedQty * (price - currentEntry);
            setSimWallet(w => w + partialPnl);
            addLog(`[SIMULATOR] Position on ${symbol} PARTIALLY CLOSED. Realized PnL: ${partialPnl.toFixed(4)} USDT`, 'info');
          }
          return prev.map(p => p.symbol === symbol ? {
            ...p,
            positionAmt: newAmt.toFixed(4),
            entryPrice: newEntry.toFixed(2),
            unrealizedProfit: (newAmt * (price - newEntry)).toFixed(4)
          } : p);
        }
      } else {
        return [...prev, {
          symbol,
          positionAmt: orderAmt.toFixed(4),
          entryPrice: price.toFixed(2),
          leverage: 20,
          unrealizedProfit: '0.0000'
        }];
      }
    });
  };

  // Simulate Live Price Feeds for BTC, ETH, SOL
  useEffect(() => {
    const basePriceBTC = 64280;
    const basePriceETH = 3450;
    const basePriceSOL = 145;

    // Generate initial historical data
    const generateInitialData = () => {
      let currentPrice = basePriceBTC;
      const data = [];
      for (let i = 20; i >= 0; i--) {
        currentPrice += (Math.random() - 0.5) * 80;
        data.push({
          time: new Date(Date.now() - i * 5000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          price: Math.round(currentPrice * 100) / 100
        });
      }
      return data;
    };

    // Generate multi-coin analysis historical data
    const generateInitialMultiAssetData = () => {
      let btcPct = 0;
      let ethPct = 0;
      let solPct = 0;
      const data = [];
      const times = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
      
      for (let i = 0; i < 6; i++) {
        btcPct += (Math.random() * 8) - 2;
        ethPct += (Math.random() * 6) - 2.5;
        solPct += (Math.random() * 10) - 4;
        
        data.push({
          time: times[i],
          BTC: parseFloat(btcPct.toFixed(2)),
          ETH: parseFloat(ethPct.toFixed(2)),
          SOL: parseFloat(solPct.toFixed(2))
        });
      }
      return data;
    };

    setChartData(generateInitialData());
    setMultiAssetData(generateInitialMultiAssetData());

    const chartInterval = setInterval(() => {
      // Tick primary BTC chart data
      setChartData(prev => {
        const lastPrice = prev[prev.length - 1]?.price || basePriceBTC;
        const nextPrice = Math.round((lastPrice + (Math.random() - 0.5) * 50) * 100) / 100;
        const newEntry = {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          price: nextPrice
        };

        // Tick simulated positions
        setSimPositions(prevPos => {
          return prevPos.map(pos => {
            const amt = parseFloat(pos.positionAmt);
            const entry = parseFloat(pos.entryPrice);
            const pnl = amt * (nextPrice - entry);
            return {
              ...pos,
              unrealizedProfit: pnl.toFixed(4)
            };
          });
        });

        // Tick simulated open limit orders
        setSimOpenOrders(prevOrders => {
          const filled = [];
          const remaining = [];
          prevOrders.forEach(o => {
            const limitPrice = parseFloat(o.price);
            let isFilled = false;
            if (o.side === 'BUY' && nextPrice <= limitPrice) isFilled = true;
            if (o.side === 'SELL' && nextPrice >= limitPrice) isFilled = true;

            if (isFilled) {
              filled.push(o);
            } else {
              remaining.push(o);
            }
          });

          filled.forEach(o => {
            openSimPosition(o.symbol, o.side, parseFloat(o.origQty), parseFloat(o.price));
            addLog(`[SIMULATOR] LIMIT ${o.side} Order filled. Symbol: ${o.symbol}, Qty: ${o.origQty}, Price: ${o.price}`, 'success');
          });

          return remaining;
        });

        return [...prev.slice(1), newEntry];
      });

      // Slowly increment accrued staking yield in the background
      setAccruedYield(prev => parseFloat((prev + Math.random() * 0.05).toFixed(4)));

      // Randomly update multi-asset relative performance paths
      setMultiAssetData(prev => {
        const lastEntry = prev[prev.length - 1];
        const nextEntry = {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          BTC: parseFloat((lastEntry.BTC + (Math.random() - 0.48) * 2).toFixed(2)),
          ETH: parseFloat((lastEntry.ETH + (Math.random() - 0.5) * 1.8).toFixed(2)),
          SOL: parseFloat((lastEntry.SOL + (Math.random() - 0.52) * 3).toFixed(2))
        };
        return [...prev.slice(1), nextEntry];
      });

    }, 4000);

    return () => clearInterval(chartInterval);
  }, []);

  // Handle Trade Form Submission
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setPlacingOrder(true);
    addLog(`Transmitting order: ${orderForm.side} ${orderForm.quantity} ${orderForm.symbol} (${orderForm.type})`, 'system');

    if (tradeMode === 'simulation') {
      setTimeout(() => {
        const qty = parseFloat(orderForm.quantity);
        const currentPrice = chartData[chartData.length - 1]?.price || 64280;
        const requiredMargin = (qty * currentPrice) / 20;

        if (requiredMargin > simWallet) {
          addLog(`ORDER REJECTED: Margin insufficient. Needed: ${requiredMargin.toFixed(2)} USDT, Wallet: ${simWallet.toFixed(2)} USDT`, 'error');
          setPlacingOrder(false);
          return;
        }

        if (orderForm.type === 'MARKET') {
          openSimPosition(orderForm.symbol, orderForm.side, qty, currentPrice);
          addLog(`SUCCESS: Simulated MARKET order filled. ID: sim-${Date.now()}`, 'success');
        } else {
          const limitPrice = parseFloat(orderForm.price);
          if (!limitPrice || isNaN(limitPrice)) {
            addLog(`ORDER FAILED: Limit price is required.`, 'error');
            setPlacingOrder(false);
            return;
          }
          const newOrder = {
            orderId: `sim-limit-${Date.now()}`,
            symbol: orderForm.symbol,
            side: orderForm.side,
            type: 'LIMIT',
            origQty: orderForm.quantity,
            price: orderForm.price,
            status: 'NEW'
          };
          setSimOpenOrders(prev => [...prev, newOrder]);
          addLog(`SUCCESS: Simulated LIMIT order queued at $${limitPrice}. ID: ${newOrder.orderId}`, 'success');
        }
        setPlacingOrder(false);
      }, 500);
      return;
    }
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderForm)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.msg || data.error || 'Server error placing order');
      }

      addLog(`SUCCESS: ${orderForm.type} Order filled. Order ID: ${data.orderId}`, 'success');
      fetchData();
    } catch (err) {
      addLog(`ORDER FAILED: ${err.message}`, 'error');
    } finally {
      setPlacingOrder(false);
    }
  };

  // Handle Order Cancellation
  const handleCancelOrder = async (symbol, orderId) => {
    addLog(`Cancelling Order #${orderId}`, 'system');
    
    if (tradeMode === 'simulation') {
      setTimeout(() => {
        setSimOpenOrders(prev => prev.filter(o => o.orderId !== orderId));
        addLog(`SUCCESS: Cancelled Simulated Order #${orderId}`, 'success');
      }, 300);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/order?symbol=${symbol}&orderId=${orderId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to cancel order on exchange');
      addLog(`SUCCESS: Cancelled Order #${orderId}`, 'success');
      fetchData();
    } catch (err) {
      addLog(`CANCEL FAILED: ${err.message}`, 'error');
    }
  };

  // Handle Terminal CLI command
  const handleTerminalSubmit = (e) => {
    e.preventDefault();
    const cmd = terminalCmd.trim().toLowerCase();
    setTerminalCmd('');

    if (!cmd) return;

    setTerminalOutput(prev => prev + `\n$ ${terminalCmd}`);

    if (cmd === 'help') {
      setTerminalOutput(prev => prev + '\nAvailable commands:\n  help          - Show this guide\n  account       - Fetch current balances\n  orders        - Fetch list of open orders\n  clear         - Clear terminal display');
      return;
    }

    if (cmd === 'clear') {
      setTerminalOutput('');
      return;
    }

    if (cmd === 'account') {
      if (tradeMode === 'simulation') {
        const totalSimUnpnl = simPositions.reduce((acc, p) => acc + parseFloat(p.unrealizedProfit), 0);
        let out = '\n💰 Simulated Asset Balances:\n';
        out += `  USDT: Wallet Balance = $${simWallet.toFixed(2)} | Available Margin = $${(simWallet + totalSimUnpnl).toFixed(2)} | Net PnL = $${totalSimUnpnl.toFixed(4)}\n`;
        setTerminalOutput(prev => prev + out);
        return;
      }
      fetch(`${BACKEND_URL}/api/account`)
        .then(res => res.json())
        .then(data => {
          const activeAssets = data.assets?.filter(a => parseFloat(a.walletBalance) > 0) || [];
          let out = '\n💰 Asset Balances:\n';
          activeAssets.forEach(a => {
            out += `  ${a.asset}: Balance = ${a.walletBalance} | Available = ${a.availableBalance}\n`;
          });
          setTerminalOutput(prev => prev + out);
        })
        .catch(err => setTerminalOutput(prev => prev + `\nError: ${err.message}`));
      return;
    }

    if (cmd === 'orders') {
      if (tradeMode === 'simulation') {
        if (simOpenOrders.length === 0) {
          setTerminalOutput(prev => prev + '\nNo active open simulated orders.');
          return;
        }
        let out = '\n📋 Simulated Open Orders:\n';
        simOpenOrders.forEach(o => {
          out += `  ID: ${o.orderId} | ${o.symbol} | ${o.side} | Qty: ${o.origQty} | Price: ${o.price}\n`;
        });
        setTerminalOutput(prev => prev + out);
        return;
      }
      fetch(`${BACKEND_URL}/api/open-orders`)
        .then(res => res.json())
        .then(data => {
          if (!data || data.length === 0) {
            setTerminalOutput(prev => prev + '\nNo active open orders.');
            return;
          }
          let out = '\n📋 Open Orders:\n';
          data.forEach(o => {
            out += `  ID: ${o.orderId} | ${o.symbol} | ${o.side} | Qty: ${o.origQty} | Price: ${o.price}\n`;
          });
          setTerminalOutput(prev => prev + out);
        })
        .catch(err => setTerminalOutput(prev => prev + `\nError: ${err.message}`));
      return;
    }

    setTerminalOutput(prev => prev + `\nCommand '${cmd}' not recognized. Try 'help'.`);
  };

  // Accrued Yield Staking Claim Action
  const handleClaimYield = (e) => {
    e.preventDefault();
    if (accruedYield <= 0 || claimLoading) return;
    setClaimLoading(true);
    addLog(`Harvesting and claim request sent for $${accruedYield.toFixed(2)} USDT`, 'system');
    setTimeout(() => {
      addLog(`SUCCESS: Accrued staking yield of $${accruedYield.toFixed(2)} USDT transferred to wallet`, 'success');
      setSimWallet(w => w + accruedYield);
      setAccruedYield(0);
      setClaimLoading(false);
    }, 1000);
  };

  // Simulated Backtesting Run Trigger
  const handleRunBacktest = (e) => {
    e.preventDefault();
    if (isBacktesting) return;
    setIsBacktesting(true);
    setBacktestProgress(0);
    addLog(`Initiating neural backtest simulation for ${activeModelId === 'x14' ? 'X-14 Sentinel' : 'K-9 Maverick'}...`, 'system');
    
    let currentPct = 0;
    const progressInterval = setInterval(() => {
      currentPct += 10;
      setBacktestProgress(currentPct);
      if (currentPct >= 100) {
        clearInterval(progressInterval);
        
        // Generate a beautiful random equity curve representing backtest growth
        let startVal = 100;
        const curves = [];
        for (let i = 0; i <= 50; i++) {
          startVal += (Math.random() - 0.4) * 8 + (activeModelId === 'x14' ? 1.5 : 0.8);
          curves.push({
            trade: i,
            profit: parseFloat(startVal.toFixed(2))
          });
        }
        
        setBacktestChartData(curves);
        setBacktestRunCount(prev => prev + 1);
        setIsBacktesting(false);
        addLog(`SUCCESS: Backtesting completed. Run #${backtestRunCount + 1} generated. Core parameters updated.`, 'success');
      }
    }, 250);
  };

  // Dynamic values based on trade mode
  const isSim = tradeMode === 'simulation';
  const totalSimUnpnl = simPositions.reduce((acc, p) => acc + parseFloat(p.unrealizedProfit), 0);

  const activeBalance = isSim
    ? simWallet.toFixed(2)
    : (accountData?.assets?.find(a => a.asset === 'USDT')?.walletBalance || '0.00');

  const availableMargin = isSim
    ? (simWallet + totalSimUnpnl).toFixed(2)
    : (accountData?.assets?.find(a => a.asset === 'USDT')?.availableBalance || '0.00');

  const unrealizedPnL = isSim
    ? totalSimUnpnl.toFixed(4)
    : (accountData?.totalUnrealizedProfit || '0.00');

  const activePositions = isSim
    ? simPositions
    : (accountData?.positions?.filter(p => parseFloat(p.positionAmt) !== 0) || []);

  const openOrdersList = isSim
    ? simOpenOrders
    : openOrders;

  // Render variables
  const currentPriceBTC = chartData[chartData.length - 1]?.price || 64280;
  const currentRiskLabel = riskToleranceSlider > 70 ? 'Aggressive' : riskToleranceSlider < 30 ? 'Conservative' : 'Balanced';
  const displayTotalPortfolioValue = parseFloat(activeBalance) + parseFloat(unrealizedPnL) + accruedYield;

  return (
    <div className="min-h-screen flex flex-col font-body-md selection:bg-secondary-container selection:text-on-secondary-container">
      {/* Background Cyber Glow Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-secondary-container/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary-container/3 blur-[150px]" />
      </div>

      {/* TopAppBar Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-surface/70 backdrop-blur-xl border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
        <div className="flex justify-between items-center px-margin-mobile h-16 max-w-container-max mx-auto">
          {/* Logo and Brand */}
          <div 
            onClick={() => setTab('terminal')} 
            className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              memory
            </span>
            <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary drop-shadow-[0_0_8px_rgba(164,230,255,0.3)] tracking-tighter md:font-headline-lg md:text-headline-lg font-bold hidden min-[400px]:inline">
              NEURAL_X_TRADE
            </span>
            <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary drop-shadow-[0_0_8px_rgba(164,230,255,0.3)] tracking-tighter font-bold min-[400px]:hidden">
              NXT
            </span>
          </div>

          {/* Connected Server Indicator and User Toggles */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* Live Ticker price display */}
            <div className="hidden lg:flex items-baseline gap-1.5 px-3 py-1 bg-surface-container/60 rounded border border-white/5 font-label-mono text-[11px]">
              <span className="text-on-surface-variant">BTC/USDT</span>
              <span className="text-tertiary font-bold tracking-tighter">${currentPriceBTC.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {/* Trade Mode Switcher */}
            <div className="flex bg-surface-container-low border border-white/10 rounded-lg p-0.5 md:p-1 text-[10px] md:text-[11px] font-label-mono font-bold">
              <button
                onClick={() => {
                  setTradeMode('exchange');
                  addLog('Switched core engine to Binance Testnet Mode.', 'system');
                }}
                className={`px-2 md:px-3 py-1 rounded transition-colors ${
                  tradeMode === 'exchange' 
                    ? 'bg-primary/20 text-primary border border-primary/20 shadow-[0_0_8px_rgba(76,214,255,0.2)]' 
                    : 'text-on-surface-variant hover:text-white'
                }`}
              >
                <span className="hidden sm:inline">EXCHANGE</span>
                <span className="sm:hidden">EXCH</span>
              </button>
              <button
                onClick={() => {
                  setTradeMode('simulation');
                  addLog('Switched core engine to Local Simulation Mode.', 'system');
                }}
                className={`px-2 md:px-3 py-1 rounded transition-colors ${
                  tradeMode === 'simulation' 
                    ? 'bg-secondary/20 text-secondary border border-secondary/20 shadow-[0_0_8px_rgba(206,93,255,0.2)]' 
                    : 'text-on-surface-variant hover:text-white'
                }`}
              >
                <span className="hidden sm:inline">SIMULATOR</span>
                <span className="sm:hidden">SIM</span>
              </button>
            </div>

            {/* Proxy Server Indicator */}
            <div className="flex items-center gap-1.5 px-2 md:px-3 py-1 bg-surface-container rounded-full border border-tertiary/20">
              <span className={`w-2 h-2 rounded-full ${apiStatus === 'online' ? 'bg-tertiary animate-pulse shadow-[0_0_8px_#00f7d9]' : 'bg-error shadow-[0_0_8px_#ffb4ab]'}`}></span>
              <span className={`font-label-mono text-[10px] uppercase font-bold ${apiStatus === 'online' ? 'text-tertiary' : 'text-error'} hidden sm:inline`}>
                {apiStatus === 'online' ? 'Proxy Online' : 'Offline'}
              </span>
            </div>
            
            <span className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-colors cursor-pointer active:scale-90 text-[20px] md:text-[24px]">
              sensors
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-grow w-full max-w-container-max mx-auto p-margin-mobile md:p-margin-desktop pt-24 pb-28 md:pb-16 flex flex-col gap-gutter">
        <AnimatePresence mode="wait">
          {tab === 'terminal' && (
            <motion.div
              key="terminal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-gutter auto-rows-min"
            >
              {/* Portfolio Performance Summary Hero Card */}
              <section className="md:col-span-12 glass-panel rounded-xl p-6 relative">
                <div className="scan-line"></div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                  <div>
                    <span className="font-label-mono text-on-surface-variant uppercase text-[10px] tracking-[0.2em]">Primary Portfolio Balance</span>
                    <h2 className="font-display-lg text-display-lg text-primary mt-1 tracking-tighter">
                      ${displayTotalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                  </div>
                  
                  <div className="mt-4 md:mt-0 glass-panel border-tertiary/30 px-4 py-2 rounded-lg flex items-center gap-3">
                    <div className="text-right font-label-mono">
                      <span className="text-[10px] text-tertiary block font-bold">ACC APY YIELD</span>
                      <span className="text-tertiary font-bold text-data-lg">+${accruedYield.toFixed(2)} USDT</span>
                    </div>
                    <div className="h-10 w-24 flex items-end gap-[2px] pb-1">
                      {/* Mini Neon Graph */}
                      <div className="w-1 bg-tertiary/20 h-[40%]" style={{ boxShadow: '0 0 5px #00f7d9' }} />
                      <div className="w-1 bg-tertiary/40 h-[60%]" />
                      <div className="w-1 bg-tertiary/60 h-[50%]" />
                      <div className="w-1 bg-tertiary/80 h-[80%]" />
                      <div className="w-1 bg-tertiary h-[70%] shadow-[0_0_10px_#00f7d9]" />
                      <div className="w-1 bg-tertiary/80 h-[90%]" />
                      <div className="w-1 bg-tertiary h-full shadow-[0_0_10px_#00f7d9]" />
                    </div>
                  </div>
                </div>

                <div className="h-32 w-full bg-surface-container-lowest/50 rounded flex items-center justify-center border border-white/5 relative group cursor-crosshair overflow-hidden">
                  <img 
                    className="absolute inset-0 w-full h-full object-cover opacity-15 mix-blend-screen group-hover:opacity-35 transition-opacity duration-700" 
                    alt="Cybernetic trading grid visualization" 
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCE7tqWZJDuSQazNC7UC354v7GjErlqh1gs0NV24-V0lwna1rt_StDCAwQB4ko34gR-FR5clLd94rRR--fMmmkXxibuT8COb8GwVYSdlSnkbEJPTMkNpvOJrDtWCYXgWMQ-FIpLzIYn9Rr8Rwi-0W0nrwEtW_HdD6X7iakkU8KdnrMpR_Y5fxt-lMgbY1bDpc1Rl_zf_obOORVEmDpyxxeZmKggCD12r0Ue6Y1qQ3L2t2J5virLIy3Dd1baAljPVzR4wNyensMFzdE"
                  />
                  <div className="z-10 font-label-mono text-[10px] text-on-surface-variant flex flex-col items-center select-none">
                    <span className="material-symbols-outlined mb-1 animate-pulse">query_stats</span>
                    SYSTEM_CORE_LOAD_ACTIVE (AI ARB DEPLOYED)
                  </div>
                </div>
              </section>

              {/* Bot status panel & Mini predicting gauge */}
              <div className="md:col-span-4 flex flex-col gap-gutter">
                <section className="glass-panel border-secondary/30 rounded-xl p-5 flex flex-col h-full justify-between">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="font-label-mono text-[10px] text-secondary tracking-widest uppercase font-bold">Bot Matching Engine</span>
                      <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mt-1 uppercase font-bold">
                        {activeModelId === 'x14' ? 'X-14 SENTINEL' : 'K-9 MAVERICK'}
                      </h3>
                    </div>
                    <div className="pulse-hologram w-12 h-12 rounded-full border-2 border-secondary/50 flex items-center justify-center bg-secondary/10">
                      <span className="material-symbols-outlined text-secondary text-[24px]">smart_toy</span>
                    </div>
                  </div>

                  <div className="space-y-3.5 flex-grow font-label-mono">
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-[11px] text-on-surface-variant">CORE STATUS</span>
                      <span className="text-[11px] text-secondary font-bold flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-ping"></span>
                        ACTIVE
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-[11px] text-on-surface-variant">RISK MATRIX</span>
                      <span className="text-[11px] text-primary font-bold uppercase">{currentRiskLabel}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-[11px] text-on-surface-variant">LEVERAGE MULTIPLIER</span>
                      <span className="text-[11px]">{leverageSlider}x</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-[11px] text-on-surface-variant">STAKING APY</span>
                      <span className="text-[11px] text-tertiary">14.8% APY</span>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-surface-container-highest/40 rounded border border-secondary/10">
                    <div className="flex justify-between mb-1 text-label-mono text-[9px] text-secondary font-bold">
                      <span>NEURAL SIGNAL INTENSITY</span>
                      <span>92%</span>
                    </div>
                    <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                      <div className="bg-secondary h-full w-[92%] shadow-[0_0_8px_#ebb2ff]"></div>
                    </div>
                  </div>
                </section>

                <section className="glass-panel border-primary/20 rounded-xl p-5 bg-gradient-to-br from-surface to-primary/5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-primary text-sm">hub</span>
                    <span className="font-label-mono text-[10px] text-primary uppercase tracking-tighter">AI NEURAL SENTIMENT</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display-lg text-headline-lg text-on-surface">74%</span>
                    <span className="font-label-mono text-tertiary text-[12px] font-bold">BULLISH</span>
                  </div>
                  <p className="font-label-mono text-[10px] text-on-surface-variant mt-2">Core confidence vector: T+240m WINDOW</p>
                  
                  {/* Gauge bar graphs */}
                  <div className="mt-4 grid grid-cols-5 gap-1">
                    <div className="h-8 bg-tertiary/30 rounded-sm"></div>
                    <div className="h-10 bg-tertiary/40 rounded-sm"></div>
                    <div className="h-12 bg-tertiary/60 rounded-sm"></div>
                    <div className="h-14 bg-tertiary rounded-sm shadow-[0_0_10px_#00f7d9]"></div>
                    <div className="h-16 bg-primary rounded-sm shadow-[0_0_10px_#a4e6ff] animate-pulse"></div>
                  </div>
                </section>
              </div>

              {/* Real-time Ticker Area Chart */}
              <section className="md:col-span-8 glass-panel rounded-xl p-0 flex flex-col">
                <div className="p-5 flex justify-between items-center border-b border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#F7931A] flex items-center justify-center overflow-hidden">
                        <img 
                          className="w-full h-full object-cover" 
                          alt="Bitcoin coin" 
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2Pbiu-evDUYJ6A5eHETl9rang7PXUEQQUuV1BG_4bf3ncXdRAqvoEAu7Eyj_UK6-tdtU-TPdzQL-_2QzPzvNeO93GWnulqYeHw1lJQjXJ1kAZm2T-0-xGj9ICPOWNTjkn2D8LUmhQGl1AOzAG5__s1IkKYJyJu3T8blnQuJ-idEWztIX09M034Hiso2u7eozUg-cwQIYTgSMsubU07gjmii2R9J_So-YtXyvBZsDKN_lHOKyHD8fvIKsnusciePRqtMf1e0-QHUQ"
                        />
                      </div>
                      <div>
                        <span className="font-headline-lg-mobile text-sm block font-bold">BTC / USDT</span>
                        <span className="font-label-mono text-[10px] text-on-surface-variant uppercase">Binance Realtime Proxy</span>
                      </div>
                    </div>
                    <div className="text-tertiary">
                      <span className="font-data-lg text-lg tracking-tighter">${currentPriceBTC.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <span className="font-label-mono text-[10px] ml-1.5 font-bold">+2.45%</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button className="px-2.5 py-1 bg-surface-container rounded font-label-mono text-[10px] border border-white/10 text-on-surface-variant hover:text-white">15M</button>
                    <button className="px-2.5 py-1 bg-primary/20 text-primary rounded font-label-mono text-[10px] border border-primary/40">1H</button>
                    <button className="px-2.5 py-1 bg-surface-container rounded font-label-mono text-[10px] border border-white/10 text-on-surface-variant hover:text-white">4H</button>
                  </div>
                </div>

                {/* Primary Chart View */}
                <div className="p-5 min-h-[300px] flex-grow relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-95">
                  <div className="w-full h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorBTCPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00f7d9" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#00f7d9" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.03)" />
                        <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                        <YAxis domain={['auto', 'auto']} stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'rgba(18, 18, 18, 0.9)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '6px' }}
                          labelStyle={{ color: '#859399', fontSize: '10px', fontFamily: 'JetBrains Mono' }}
                          itemStyle={{ color: '#00f7d9', fontSize: '12px', fontFamily: 'JetBrains Mono' }}
                        />
                        <Area type="monotone" dataKey="price" stroke="#00f7d9" strokeWidth={2} fillOpacity={1} fill="url(#colorBTCPrice)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Live indicators footer */}
                <div className="p-4 bg-surface-container-low flex justify-between items-center border-t border-white/5 rounded-b-xl">
                  <div className="flex gap-4 font-label-mono text-[10px] text-on-surface-variant uppercase">
                    <span>VOL: <span className="text-on-surface">1.4B</span></span>
                    <span>RSI (14): <span className="text-tertiary">64.2</span></span>
                    <span>MACD: <span className="text-error">-12.5</span></span>
                  </div>
                  <div className="font-label-mono text-[10px] text-primary flex items-center gap-1 font-bold">
                    <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                    LIVE TELEMETRY
                  </div>
                </div>
              </section>

              {/* Order Placement and Positions Panel */}
              <section className="md:col-span-8 glass-panel rounded-xl p-5 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-primary">layers</span>
                  <h3 className="font-headline-lg-mobile text-[16px] text-on-surface font-bold uppercase tracking-wider">
                    {isSim ? 'SIMULATED ACTIVE POSITIONS' : 'LIVE LEVERAGED POSITIONS'}
                  </h3>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left font-label-mono text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-on-surface-variant uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Side</th>
                        <th className="py-3 px-4">Lev</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Entry Price</th>
                        <th className="py-3 px-4">Unrealized PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePositions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-on-surface-variant text-sm">
                            No leveraged contracts open. Place requests using the core terminal.
                          </td>
                        </tr>
                      ) : (
                        activePositions.map((pos, idx) => {
                          const amt = parseFloat(pos.positionAmt);
                          const isLong = amt > 0;
                          const pnl = parseFloat(pos.unrealizedProfit);
                          return (
                            <tr key={idx} className="border-b border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                              <td className="py-3 px-4 font-bold text-on-surface">{pos.symbol}</td>
                              <td className="py-3 px-4">
                                <span className={`font-bold ${isLong ? 'text-tertiary' : 'text-error'}`}>
                                  {isLong ? 'LONG ▲' : 'SHORT ▼'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-primary font-bold">{pos.leverage || leverageSlider}x</td>
                              <td className="py-3 px-4">{Math.abs(amt)}</td>
                              <td className="py-3 px-4">${parseFloat(pos.entryPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className={`py-3 px-4 font-bold ${pnl >= 0 ? 'text-tertiary glow-text-positive' : 'text-error'}`}>
                                {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} USDT
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Trading Terminal placement sidebar */}
              <section className="md:col-span-4 glass-panel rounded-xl p-5 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-primary">zap</span>
                  <h3 className="font-headline-lg-mobile text-[16px] text-on-surface font-bold uppercase tracking-wider">QUANT TRADING TERMINAL</h3>
                </div>

                <form onSubmit={handlePlaceOrder} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-mono text-[10px] text-on-surface-variant uppercase font-bold">Asset Target</label>
                    <select
                      value={orderForm.symbol}
                      onChange={e => setOrderForm(p => ({ ...p, symbol: e.target.value }))}
                      className="bg-background border border-white/10 rounded-lg text-on-surface p-2.5 outline-none font-label-mono text-sm focus:border-primary"
                    >
                      <option value="BTCUSDT">BTCUSDT</option>
                      <option value="ETHUSDT">ETHUSDT</option>
                      <option value="BNBUSDT">BNBUSDT</option>
                      <option value="SOLUSDT">SOLUSDT</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-mono text-[10px] text-on-surface-variant uppercase font-bold">Execution Direction</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setOrderForm(p => ({ ...p, side: 'BUY' }))}
                        className={`py-2 rounded-lg font-label-mono font-bold text-xs uppercase transition-colors outline-none ${
                          orderForm.side === 'BUY' 
                            ? 'bg-tertiary text-background shadow-[0_0_12px_rgba(0,247,217,0.4)]' 
                            : 'bg-white/5 hover:bg-white/10 text-on-surface'
                        }`}
                      >
                        Buy (Long)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderForm(p => ({ ...p, side: 'SELL' }))}
                        className={`py-2 rounded-lg font-label-mono font-bold text-xs uppercase transition-colors outline-none ${
                          orderForm.side === 'SELL' 
                            ? 'bg-error text-background shadow-[0_0_12px_rgba(255,180,171,0.4)]' 
                            : 'bg-white/5 hover:bg-white/10 text-on-surface'
                        }`}
                      >
                        Sell (Short)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-mono text-[10px] text-on-surface-variant uppercase font-bold">Order Type</label>
                      <select
                        value={orderForm.type}
                        onChange={e => setOrderForm(p => ({ ...p, type: e.target.value }))}
                        className="bg-background border border-white/10 rounded-lg text-on-surface p-2.5 outline-none font-label-mono text-xs focus:border-primary"
                      >
                        <option value="MARKET">MARKET</option>
                        <option value="LIMIT">LIMIT</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-mono text-[10px] text-on-surface-variant uppercase font-bold">Quantity</label>
                      <input
                        type="number"
                        step="0.001"
                        value={orderForm.quantity}
                        onChange={e => setOrderForm(p => ({ ...p, quantity: e.target.value }))}
                        className="bg-background border border-white/10 rounded-lg text-on-surface p-2.5 outline-none font-label-mono text-xs focus:border-primary"
                      />
                    </div>
                  </div>

                  {orderForm.type === 'LIMIT' && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="flex flex-col gap-1.5 overflow-hidden"
                    >
                      <label className="font-label-mono text-[10px] text-on-surface-variant uppercase font-bold">Limit Trigger Price (USDT)</label>
                      <input
                        type="number"
                        value={orderForm.price}
                        onChange={e => setOrderForm(p => ({ ...p, price: e.target.value }))}
                        placeholder="e.g. 64200"
                        className="bg-background border border-white/10 rounded-lg text-on-surface p-2.5 outline-none font-label-mono text-xs focus:border-primary"
                      />
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={placingOrder || (!isSim && apiStatus === 'offline')}
                    className={`mt-2 py-3 rounded-lg font-label-mono font-bold text-xs uppercase transition-all duration-300 flex items-center justify-center gap-2 outline-none ${
                      orderForm.side === 'BUY'
                        ? 'bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30'
                        : 'bg-error/20 text-error border border-error/40 hover:bg-error/30'
                    }`}
                  >
                    {placingOrder ? (
                      <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm">play_arrow</span>
                    )}
                    {placingOrder ? 'TRANSMITTING ORDER...' : `TRANSMIT ${orderForm.side} ORDER`}
                  </button>
                </form>
              </section>

              {/* System logs telemetry stream (bottom of dashboard) */}
              <section className="md:col-span-12 glass-panel rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-primary">terminal</span>
                  <h3 className="font-headline-lg-mobile text-[16px] text-on-surface font-bold uppercase tracking-wider">SYSTEM TELEMETRY CONSOLE</h3>
                </div>

                <div className="bg-surface-container-lowest/80 border border-white/5 rounded-lg p-4 h-44 overflow-y-auto font-label-mono text-[11px] flex flex-col gap-2">
                  {logs.map((log) => {
                    let logColor = 'text-on-surface';
                    if (log.type === 'error') logColor = 'text-error';
                    if (log.type === 'success') logColor = 'text-tertiary';
                    if (log.type === 'system') logColor = 'text-primary';
                    return (
                      <div key={log.id} className="flex gap-4 border-b border-white/[0.02] pb-1.5 last:border-0">
                        <span className="text-on-surface-variant">[{log.time}]</span>
                        <span className="text-outline-variant uppercase font-bold">[{log.type}]</span>
                        <span className={logColor}>{log.msg}</span>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </section>
            </motion.div>
          )}

          {tab === 'analysis' && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-gutter auto-rows-min"
            >
              {/* Header section title */}
              <div className="col-span-1 md:col-span-12 flex justify-between items-center mb-2">
                <div>
                  <h2 className="font-display-lg text-display-lg text-primary tracking-tighter uppercase">AI Analytics Panel</h2>
                  <p className="font-label-mono text-label-mono text-on-surface-variant uppercase mt-1">Multi-asset volatility matrices & patterns</p>
                </div>
                <span className="font-label-mono text-label-mono text-tertiary uppercase flex items-center gap-1 holographic-glow font-bold">
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    online_prediction
                  </span> 
                  Live Stream
                </span>
              </div>

              {/* Multi-asset performance chart */}
              <div className="glass-panel rounded-xl col-span-1 md:col-span-8 row-span-2 flex flex-col relative overflow-hidden">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-surface-container-low/50">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">monitoring</span>
                    <h3 className="font-label-mono text-label-mono text-on-surface uppercase tracking-widest font-bold">
                      Multi-Asset Vector Analysis
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    {['1H', '4H', '1D'].map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setAnalysisTimeframe(tf)}
                        className={`font-label-mono text-label-mono px-3 py-1 rounded transition-colors uppercase ${
                          analysisTimeframe === tf 
                            ? 'bg-primary text-background font-bold' 
                            : 'text-on-surface-variant hover:text-white bg-surface-variant/40'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Multi coin chart rendering */}
                <div className="flex-grow p-4 min-h-[350px] relative chart-line-gradient flex flex-col justify-end">
                  <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={multiAssetData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.02)" />
                        <XAxis dataKey="time" stroke="rgba(255, 255, 255, 0.3)" fontSize={9} tickLine={false} />
                        <YAxis stroke="rgba(255, 255, 255, 0.3)" fontSize={9} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'rgba(18, 18, 18, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '6px' }}
                          labelStyle={{ color: '#859399', fontSize: '10px', fontFamily: 'JetBrains Mono' }}
                          itemStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }}
                        />
                        <Line type="monotone" dataKey="BTC" stroke="#00d1ff" strokeWidth={2} dot={false} name="BTC Alpha" />
                        <Line type="monotone" dataKey="ETH" stroke="#00f7d9" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="ETH Beta" />
                        <Line type="monotone" dataKey="SOL" stroke="#ce5dff" strokeWidth={1.5} dot={false} name="SOL Gamma" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Floating tooltip simulation */}
                  <div className="absolute top-[20%] left-[68%] bg-surface border border-primary/30 rounded-lg p-3 z-10 hidden md:block shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
                    <div className="font-label-mono text-[9px] text-primary uppercase font-bold mb-1">BTC/USDT Vector</div>
                    <div className="font-data-lg text-sm text-on-surface">${currentPriceBTC.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>

              {/* Circular Net Sentiment Gauge */}
              <div className="glass-panel rounded-xl col-span-1 md:col-span-4 p-6 flex flex-col justify-between items-center text-center">
                <div className="w-full flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                  <span className="font-label-mono text-label-mono text-on-surface-variant uppercase flex items-center gap-2 font-bold">
                    <span className="material-symbols-outlined text-[16px]">psychology</span> 
                    Neural Net Sentiment
                  </span>
                  <span className="font-label-mono text-label-mono text-tertiary bg-tertiary/10 px-2 py-0.5 rounded border border-tertiary/20">LIVE</span>
                </div>

                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    {/* Background track */}
                    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="8" strokeDasharray="188 251" strokeLinecap="round" />
                    {/* Progress track */}
                    <circle cx="50" cy="50" r="40" fill="none" stroke="url(#gradientSentiment)" strokeWidth="8" strokeDasharray="155 251" strokeLinecap="round" className="transition-all duration-1000" style={{ filter: 'drop-shadow(0 0 6px rgba(0, 247, 217, 0.5))' }} />
                    <defs>
                      <linearGradient id="gradientSentiment" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#00d1ff" />
                        <stop offset="100%" stopColor="#00f7d9" />
                      </linearGradient>
                    </defs>
                  </svg>
                  {/* Center percentage indicator */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display-lg text-[40px] font-bold text-tertiary holographic-glow">74%</span>
                    <span className="font-label-mono text-[9px] text-tertiary tracking-widest uppercase mt-1">Bullish Bias</span>
                  </div>
                </div>

                <div className="w-full flex justify-between mt-4 font-label-mono text-[10px] text-on-surface-variant opacity-60 font-bold uppercase">
                  <span>Extreme Fear (0)</span>
                  <span>Euphoria (100)</span>
                </div>
              </div>

              {/* Detected patterns AI component */}
              <div className="glass-panel rounded-xl col-span-1 md:col-span-4 pulse-border p-5 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgoJPHJlY3Qgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0ibm9uZSI+PC9yZWN0PgoJPHBhdGggZD0iTTAgMEwyIDJNMCA0TDIgMiIgc3Ryb2tlPSJyZ2JhKDIwNiwgOTMsIDI1NSwgMC4wNSkiIHN0cm9rZS13aWR0aD0iMC41IiBmaWxsPSJub25lIj48L3BhdGg+Cjwvc3ZnPg==')] opacity-30 z-0 pointer-events-none"></div>
                <div className="flex justify-between items-center mb-4 z-10">
                  <h3 className="font-label-mono text-label-mono text-secondary uppercase tracking-widest flex items-center gap-2 font-bold">
                    <span className="material-symbols-outlined text-[16px]">auto_awesome</span> 
                    AI Detected Patterns
                  </h3>
                  <span className="font-label-mono text-[9px] bg-secondary/10 text-secondary px-2 py-0.5 rounded border border-secondary/30 font-bold">NEURAL CORES ACTIVE</span>
                </div>

                <div className="flex flex-col gap-3 z-10 flex-grow">
                  {/* Pattern list */}
                  <div className="bg-surface-container-low/80 p-3 rounded border border-white/5 flex justify-between items-center group hover:border-tertiary/40 transition-all duration-300 cursor-pointer">
                    <div>
                      <div className="font-body-md text-sm text-on-surface group-hover:text-tertiary transition-colors font-bold">Falling Wedge (Reversal)</div>
                      <div className="font-label-mono text-[9px] text-on-surface-variant mt-1 uppercase">ETH/USDT • 4H Timeframe</div>
                    </div>
                    <div className="text-right">
                      <div className="font-data-lg text-sm text-tertiary font-bold">92%</div>
                      <div className="font-label-mono text-[8px] text-tertiary/70 uppercase">Confidence</div>
                    </div>
                  </div>

                  <div className="bg-surface-container-low/80 p-3 rounded border border-white/5 flex justify-between items-center group hover:border-primary/40 transition-all duration-300 cursor-pointer">
                    <div>
                      <div className="font-body-md text-sm text-on-surface group-hover:text-primary transition-colors font-bold">Bull Flag (Continuation)</div>
                      <div className="font-label-mono text-[9px] text-on-surface-variant mt-1 uppercase">SOL/USDT • 1H Timeframe</div>
                    </div>
                    <div className="text-right">
                      <div className="font-data-lg text-sm text-primary font-bold">87%</div>
                      <div className="font-label-mono text-[8px] text-primary/70 uppercase">Confidence</div>
                    </div>
                  </div>

                  <div className="bg-surface-container-low/80 p-3 rounded border border-white/5 flex justify-between items-center group hover:border-error/40 transition-all duration-300 cursor-pointer">
                    <div>
                      <div className="font-body-md text-sm text-on-surface group-hover:text-error transition-colors font-bold">Head &amp; Shoulders</div>
                      <div className="font-label-mono text-[9px] text-on-surface-variant mt-1 uppercase">ADA/USDT • 1D Timeframe</div>
                    </div>
                    <div className="text-right">
                      <div className="font-data-lg text-sm text-error font-bold">76%</div>
                      <div className="font-label-mono text-[8px] text-error/70 uppercase">Confidence</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'bots' && (
            <motion.div
              key="bots"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-gutter auto-rows-min"
            >
              {/* Header info */}
              <header className="col-span-1 md:col-span-12 mb-4">
                <h1 className="font-display-lg text-display-lg text-on-surface tracking-tighter">AI Bot Controls</h1>
                <p className="font-body-md text-body-md text-on-surface-variant">Deploy, adjust, and backtest autonomous neural models.</p>
              </header>

              {/* Bot Selection Carousel */}
              <section className="md:col-span-8 glass-panel rounded-xl p-6 relative overflow-hidden ai-pulse border border-[#ce5dff]/30">
                <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-container/5 blur-[40px] pointer-events-none" />
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-secondary font-bold uppercase tracking-wider">Models Directory</h2>
                  <span className="font-label-mono text-label-mono bg-secondary-container/10 text-secondary px-3 py-1 rounded-full flex items-center gap-2 border border-secondary/20 font-bold">
                    <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(235,178,255,0.8)]"></span>
                    ONLINE
                  </span>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-2 snap-x hide-scrollbar">
                  {/* Model 1: X-14 */}
                  <div
                    onClick={() => {
                      setActiveModelId('x14');
                      addLog('Core trading engine switched to X-14 Sentinel.', 'system');
                    }}
                    className={`min-w-[280px] p-5 rounded-lg border transition-all duration-300 relative snap-center cursor-pointer flex-grow ${
                      activeModelId === 'x14' 
                        ? 'border-secondary bg-surface-container-high' 
                        : 'border-white/5 bg-surface-container-low opacity-50 hover:opacity-100'
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent rounded-lg pointer-events-none"></div>
                    <div className="flex justify-between items-start mb-4">
                      <span className={`material-symbols-outlined text-3xl ${activeModelId === 'x14' ? 'text-secondary' : 'text-on-surface-variant'}`}>
                        smart_toy
                      </span>
                      <span className="font-data-lg text-data-lg text-secondary font-bold">+14.2% APY</span>
                    </div>
                    <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1 font-bold">X-14 Sentinel</h3>
                    <p className="font-label-mono text-[10px] text-on-surface-variant mb-4 uppercase">High Frequency Trend Following</p>
                    <div className="flex gap-2">
                      <span className="text-[9px] uppercase font-label-mono bg-surface-bright px-2 py-0.5 rounded text-outline-variant font-bold">Crypto</span>
                      <span className="text-[9px] uppercase font-label-mono bg-surface-bright px-2 py-0.5 rounded text-outline-variant font-bold">Forex</span>
                    </div>
                  </div>

                  {/* Model 2: K-9 */}
                  <div
                    onClick={() => {
                      setActiveModelId('k9');
                      addLog('Core trading engine switched to K-9 Maverick.', 'system');
                    }}
                    className={`min-w-[280px] p-5 rounded-lg border transition-all duration-300 relative snap-center cursor-pointer flex-grow ${
                      activeModelId === 'k9' 
                        ? 'border-secondary bg-surface-container-high' 
                        : 'border-white/5 bg-surface-container-low opacity-50 hover:opacity-100'
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent rounded-lg pointer-events-none"></div>
                    <div className="flex justify-between items-start mb-4">
                      <span className={`material-symbols-outlined text-3xl ${activeModelId === 'k9' ? 'text-secondary' : 'text-on-surface-variant'}`}>
                        precision_manufacturing
                      </span>
                      <span className="font-data-lg text-data-lg text-secondary font-bold">+8.7% APY</span>
                    </div>
                    <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1 font-bold">K-9 Maverick</h3>
                    <p className="font-label-mono text-[10px] text-on-surface-variant mb-4 uppercase">Mean Reversion Arbitrage</p>
                    <div className="flex gap-2">
                      <span className="text-[9px] uppercase font-label-mono bg-surface-bright px-2 py-0.5 rounded text-outline-variant font-bold">Equities</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Sliders Parameters panel */}
              <section className="md:col-span-4 glass-panel rounded-xl p-6 flex flex-col justify-between">
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-6 flex items-center gap-2 font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-outline">tune</span>
                  Parameters
                </h2>

                <div className="space-y-5">
                  {/* Risk Tolerance */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label className="font-label-mono text-[10px] text-on-surface-variant uppercase font-bold">Risk Tolerance</label>
                      <span className="font-data-lg text-sm text-secondary font-bold">{currentRiskLabel}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={riskToleranceSlider}
                      onChange={e => setRiskToleranceSlider(parseInt(e.target.value))}
                      className="w-full h-1 bg-surface-bright rounded-lg appearance-none cursor-pointer range-slider outline-none"
                    />
                  </div>

                  {/* Max Drawdown */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label className="font-label-mono text-[10px] text-on-surface-variant uppercase font-bold">Max Drawdown Limit</label>
                      <span className="font-data-lg text-sm text-on-surface font-bold">{maxDrawdownSlider}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={maxDrawdownSlider}
                      onChange={e => setMaxDrawdownSlider(parseInt(e.target.value))}
                      className="w-full h-1 bg-surface-bright rounded-lg appearance-none cursor-pointer range-slider outline-none"
                    />
                  </div>

                  {/* Leverage */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label className="font-label-mono text-[10px] text-on-surface-variant uppercase font-bold">Trading Leverage</label>
                      <span className="font-data-lg text-sm text-on-surface font-bold">{leverageSlider}x</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={leverageSlider}
                      onChange={e => setLeverageSlider(parseInt(e.target.value))}
                      className="w-full h-1 bg-surface-bright rounded-lg appearance-none cursor-pointer range-slider outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Simulation Backtesting */}
              <section className="md:col-span-12 glass-panel rounded-xl p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-white/5 pb-4">
                  <div>
                    <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface flex items-center gap-2 font-bold uppercase tracking-wider">
                      <span className="material-symbols-outlined text-outline">science</span>
                      Backtesting Simulator
                    </h2>
                    <p className="font-label-mono text-[10px] text-on-surface-variant uppercase mt-1">Validate neural matching configurations with historical vectors</p>
                  </div>
                  
                  <button
                    onClick={handleRunBacktest}
                    disabled={isBacktesting}
                    className="bg-secondary text-on-secondary font-label-mono text-label-mono uppercase px-6 py-3 rounded hover:bg-secondary-container transition-colors shadow-[0_0_15px_rgba(206,93,255,0.4)] flex items-center gap-2 outline-none font-bold"
                  >
                    {isBacktesting ? (
                      <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    )}
                    {isBacktesting ? `Simulating ${backtestProgress}%` : 'Run Backtest'}
                  </button>
                </div>

                {/* Simulation Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                  <div className="bg-surface-container-low p-4 rounded-lg border border-white/5">
                    <span className="font-label-mono text-[9px] text-on-surface-variant block mb-1 uppercase font-bold">Simulated Yield PnL</span>
                    <span className="font-data-lg text-lg text-tertiary font-bold">
                      {backtestRunCount > 0 ? '+24.5%' : '---'}
                    </span>
                  </div>
                  <div className="bg-surface-container-low p-4 rounded-lg border border-white/5">
                    <span className="font-label-mono text-[9px] text-on-surface-variant block mb-1 uppercase font-bold">Win Rate Quotient</span>
                    <span className="font-data-lg text-lg text-on-surface font-bold">
                      {backtestRunCount > 0 ? '68.2%' : '---'}
                    </span>
                  </div>
                  <div className="bg-surface-container-low p-4 rounded-lg border border-white/5">
                    <span className="font-label-mono text-[9px] text-on-surface-variant block mb-1 uppercase font-bold">Sharpe Ratio Metric</span>
                    <span className="font-data-lg text-lg text-on-surface font-bold">
                      {backtestRunCount > 0 ? '2.1' : '---'}
                    </span>
                  </div>
                  <div className="bg-surface-container-low p-4 rounded-lg border border-white/5">
                    <span className="font-label-mono text-[9px] text-on-surface-variant block mb-1 uppercase font-bold">Historical Vector Runs</span>
                    <span className="font-data-lg text-lg text-on-surface font-bold">
                      {backtestRunCount > 0 ? '1,402' : '---'}
                    </span>
                  </div>
                </div>

                {/* Backtesting simulation line chart */}
                <div className="h-56 w-full border border-white/10 rounded-lg relative overflow-hidden bg-[#0a0a0a] flex items-center justify-center">
                  <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .05) 25%, rgba(255, 255, 255, .05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .05) 75%, rgba(255, 255, 255, .05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, .05) 25%, rgba(255, 255, 255, .05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .05) 75%, rgba(255, 255, 255, .05) 76%, transparent 77%, transparent)', backgroundSize: '30px 30px' }} />
                  
                  {isBacktesting && (
                    <div className="absolute z-20 flex flex-col items-center gap-2 bg-background/80 backdrop-blur border border-white/10 rounded-lg p-5">
                      <span className="material-symbols-outlined text-4xl text-secondary animate-spin">sync</span>
                      <span className="font-label-mono text-xs text-secondary uppercase font-bold">GENERATING SIMULATED VECTOR PATHS...</span>
                    </div>
                  )}

                  {backtestRunCount === 0 && !isBacktesting ? (
                    <div className="z-10 font-label-mono text-xs text-on-surface-variant uppercase font-bold text-center">
                      <span className="material-symbols-outlined text-4xl block mb-2 opacity-50">analytics</span>
                      Execute backtest above to simulate mathematical trading model curves
                    </div>
                  ) : (
                    <div className="w-full h-full p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={backtestChartData}>
                          <defs>
                            <linearGradient id="backtestGlow" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ce5dff" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#ce5dff" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'rgba(10, 10, 10, 0.95)', border: '1px solid rgba(206,93,255,0.3)' }}
                            itemStyle={{ color: '#ce5dff' }}
                          />
                          <Area type="monotone" dataKey="profit" stroke="#ce5dff" strokeWidth={1.5} fillOpacity={1} fill="url(#backtestGlow)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {tab === 'assets' && (
            <motion.div
              key="assets"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-gutter auto-rows-min"
            >
              {/* Asset balances overview */}
              <div className="glass-panel p-6 flex flex-col gap-4 md:col-span-8 glass-panel-glow rounded-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest font-bold">Total Portfolio Value</h2>
                    <div className="flex items-baseline gap-3 mt-1.5">
                      <span className="font-display-lg text-display-lg text-on-background tracking-tighter">
                        ${displayTotalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="font-data-lg text-data-lg text-tertiary glow-text-positive font-bold">+4.2%</span>
                    </div>
                    <div className="font-data-lg text-sm text-outline mt-1 font-bold">
                      ≈ {(displayTotalPortfolioValue / currentPriceBTC).toFixed(4)} BTC
                    </div>
                  </div>
                  
                  {/* Faucet Trigger */}
                  <button 
                    onClick={() => {
                      setSimWallet(w => w + 10000);
                      addLog('[FAUCET] Injected 10,000.00 USDT into simulation account.', 'success');
                    }}
                    className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 px-4 py-2 rounded font-label-mono text-label-mono uppercase transition-all duration-300 flex items-center gap-2 outline-none font-bold active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span> 
                    Faucet Deposit
                  </button>
                </div>

                {/* Macro Sparkline simulation */}
                <div className="h-24 w-full mt-4 relative sparkline-positive border-b border-tertiary/30 rounded">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="macroGlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00f7d9" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#00f7d9" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="price" stroke="#00f7d9" strokeWidth={1.5} fillOpacity={1} fill="url(#macroGlow)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* AI Staking Farm panel */}
              <div className="glass-panel p-6 flex flex-col gap-4 md:col-span-4 border-secondary-container/30 relative overflow-hidden rounded-xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary-container via-primary to-secondary-container opacity-50" />
                <div className="flex justify-between items-center">
                  <h2 className="font-label-mono text-label-mono text-secondary uppercase tracking-widest flex items-center gap-2 font-bold">
                    <span className="material-symbols-outlined text-[16px]">psychology</span> 
                    AI Yield Farm
                  </h2>
                  <span className="font-label-mono text-[9px] bg-secondary-container/10 text-secondary px-2.5 py-1 rounded border border-secondary/20 font-bold">ACTIVE</span>
                </div>

                <div className="mt-2 font-label-mono">
                  <div className="text-on-surface-variant mb-1 text-[11px] uppercase">Current Neural APY</div>
                  <div className="font-headline-lg text-headline-lg text-on-background font-bold tracking-tighter">
                    14.8% <span className="text-tertiary text-xs font-bold uppercase ml-1">Variable Avg</span>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-center font-label-mono">
                  <div>
                    <div className="text-[9px] text-outline uppercase font-bold">Accrued Yield Value</div>
                    <div className="text-primary font-bold text-sm">+${accruedYield.toFixed(4)} USDT</div>
                  </div>
                  <button 
                    onClick={handleClaimYield}
                    disabled={accruedYield <= 0 || claimLoading}
                    className="text-secondary hover:text-white font-label-mono text-label-mono uppercase transition-colors outline-none font-bold active:scale-95 disabled:opacity-50"
                  >
                    {claimLoading ? 'Claiming...' : 'Claim Payout'}
                  </button>
                </div>
              </div>

              {/* Holdings breakdown table */}
              <div className="md:col-span-8 flex flex-col gap-gutter">
                <div className="glass-panel p-6 rounded-xl">
                  <h3 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-6 font-bold">Top Holdings Matrix</h3>
                  
                  <div className="flex flex-col gap-4 font-label-mono">
                    {/* Item 1: BTC */}
                    <div className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition-all border border-transparent hover:border-white/5 group">
                      <div className="flex items-center gap-4 w-1/3">
                        <div className="w-10 h-10 rounded-full bg-[#F7931A]/20 border border-[#F7931A]/50 flex items-center justify-center text-[#F7931A]">
                          <span className="material-symbols-outlined text-[20px]">currency_bitcoin</span>
                        </div>
                        <div>
                          <div className="font-bold text-on-background text-sm">BTC</div>
                          <div className="text-[10px] text-outline">Bitcoin</div>
                        </div>
                      </div>
                      <div className="w-1/4 h-8 sparkline-positive opacity-60 group-hover:opacity-100 transition-opacity">
                        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                          <path d="M0,80 Q20,60 40,75 T80,30 T100,15" fill="none" stroke="#00f7d9" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        </svg>
                      </div>
                      <div className="text-right w-1/3">
                        <div className="font-bold text-on-background text-sm">
                          {(parseFloat(activeBalance) / currentPriceBTC).toFixed(4)} BTC
                        </div>
                        <div className="text-[10px] text-tertiary font-bold">+${parseFloat(activeBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>

                    {/* Item 2: ETH */}
                    <div className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition-all border border-transparent hover:border-white/5 group">
                      <div className="flex items-center gap-4 w-1/3">
                        <div className="w-10 h-10 rounded-full bg-[#627EEA]/20 border border-[#627EEA]/50 flex items-center justify-center text-[#627EEA]">
                          <span className="material-symbols-outlined text-[20px]">diamond</span>
                        </div>
                        <div>
                          <div className="font-bold text-on-background text-sm">ETH</div>
                          <div className="text-[10px] text-outline">Ethereum</div>
                        </div>
                      </div>
                      <div className="w-1/4 h-8 sparkline-positive opacity-60 group-hover:opacity-100 transition-opacity">
                        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                          <path d="M0,90 Q15,70 35,80 T70,40 T100,10" fill="none" stroke="#00f7d9" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        </svg>
                      </div>
                      <div className="text-right w-1/3">
                        <div className="font-bold text-on-background text-sm">93.120 ETH</div>
                        <div className="text-[10px] text-tertiary font-bold">+$321,450.00</div>
                      </div>
                    </div>

                    {/* Item 3: SOL */}
                    <div className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition-all border border-transparent hover:border-white/5 group">
                      <div className="flex items-center gap-4 w-1/3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined text-[20px]">link</span>
                        </div>
                        <div>
                          <div className="font-bold text-on-background text-sm">SOL</div>
                          <div className="text-[10px] text-outline">Solana</div>
                        </div>
                      </div>
                      <div className="w-1/4 h-8 sparkline-negative opacity-60 group-hover:opacity-100 transition-opacity">
                        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                          <path d="M0,20 Q20,40 40,30 T80,75 T100,90" fill="none" stroke="#ffb4ab" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        </svg>
                      </div>
                      <div className="text-right w-1/3">
                        <div className="font-bold text-on-background text-sm">600.00 SOL</div>
                        <div className="text-[10px] text-error font-bold">-$86,933.42</div>
                      </div>
                    </div>
                  </div>

                  <button className="w-full mt-6 py-3 border border-white/10 hover:bg-white/5 rounded-lg font-label-mono text-label-mono text-on-surface-variant uppercase transition-colors outline-none font-bold">
                    View All Vault Assets
                  </button>
                </div>
              </div>

              {/* Staking transactions activity logger */}
              <div className="md:col-span-4 flex flex-col gap-gutter">
                <div className="glass-panel p-6 rounded-xl flex-grow">
                  <h3 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-6 font-bold">Recent Staking Logs</h3>
                  
                  <div className="flex flex-col gap-4 font-label-mono text-xs">
                    {/* Item 1 */}
                    <div className="flex items-start gap-3">
                      <div className="mt-1.5 w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_rgba(0,247,217,0.8)]"></div>
                      <div className="flex-grow">
                        <div className="flex justify-between items-baseline">
                          <div className="font-bold text-on-background">AI Arb Payout</div>
                          <div className="font-bold text-tertiary font-data-lg">+$420.50</div>
                        </div>
                        <div className="flex justify-between items-center mt-1 text-[10px]">
                          <span className="text-outline">ETH/USDC Pool B</span>
                          <span className="text-tertiary bg-tertiary/10 px-1 rounded font-bold">SUCCESS</span>
                        </div>
                      </div>
                    </div>

                    {/* Item 2 */}
                    <div className="flex items-start gap-3">
                      <div className="mt-1.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(164,230,255,0.8)] animate-pulse"></div>
                      <div className="flex-grow">
                        <div className="flex justify-between items-baseline">
                          <div className="font-bold text-on-background">Faucet Injection</div>
                          <div className="font-bold text-on-background">+$10,000.00</div>
                        </div>
                        <div className="flex justify-between items-center mt-1 text-[10px]">
                          <span className="text-outline">Proxy Faucet Channel</span>
                          <span className="text-primary bg-primary/10 px-1 rounded font-bold">PENDING 2/6</span>
                        </div>
                      </div>
                    </div>

                    {/* Item 3 */}
                    <div className="flex items-start gap-3">
                      <div className="mt-1.5 w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_rgba(0,247,217,0.8)]"></div>
                      <div className="flex-grow">
                        <div className="flex justify-between items-baseline">
                          <div className="font-bold text-on-background">Yield Harvested</div>
                          <div className="font-bold text-tertiary font-data-lg">+$85.20</div>
                        </div>
                        <div className="flex justify-between items-center mt-1 text-[10px]">
                          <span className="text-outline">Core Farm Vault</span>
                          <span className="text-tertiary bg-tertiary/10 px-1 rounded font-bold">SUCCESS</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'config' && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-gutter auto-rows-min font-label-mono"
            >
              {/* Header */}
              <div className="col-span-1 md:col-span-12 mb-4">
                <h2 className="font-headline-lg text-headline-lg text-primary drop-shadow-[0_0_8px_rgba(164,230,255,0.3)] font-bold">System Configuration</h2>
                <p className="text-on-surface-variant mt-2 text-label-mono uppercase tracking-widest opacity-80 font-bold">Adjust core preferences and connections</p>
              </div>

              {/* API Connections */}
              <section className="md:col-span-8 bg-surface/70 backdrop-blur-[20px] rounded-xl border border-white/10 p-6 flex flex-col gap-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-tertiary">api</span>
                  <h3 className="font-data-lg text-data-lg text-on-surface font-bold uppercase tracking-wider">Exchange API Outlets</h3>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Binance Toggle */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-high rounded border border-outline/20 hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#F3BA2F]/10 flex items-center justify-center border border-[#F3BA2F]/30 text-[#F3BA2F]">
                        <span className="material-symbols-outlined">currency_bitcoin</span>
                      </div>
                      <div>
                        <h4 className="font-data-lg text-on-surface text-base font-bold">Binance Futures Testnet</h4>
                        <p className="text-on-surface-variant uppercase text-[10px] font-bold">Latency connection: 12ms</p>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setApiBinanceActive(!apiBinanceActive);
                        addLog(`${apiBinanceActive ? 'Disconnected' : 'Connected'} Binance API proxy interface.`, 'system');
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none focus:outline-none ${
                        apiBinanceActive ? 'bg-primary' : 'bg-surface-container-low border border-white/10'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        apiBinanceActive ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {/* Coinbase Pro Toggle */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-high rounded border border-outline/20 hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#0052FF]/10 flex items-center justify-center border border-[#0052FF]/30 text-[#0052FF]">
                        <span className="material-symbols-outlined">account_balance</span>
                      </div>
                      <div>
                        <h4 className="font-data-lg text-on-surface text-base font-bold">Coinbase Pro API</h4>
                        <p className="text-on-surface-variant uppercase text-[10px] font-bold">Latency connection: 24ms</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setApiCoinbaseActive(!apiCoinbaseActive);
                        addLog(`${apiCoinbaseActive ? 'Disconnected' : 'Connected'} Coinbase Pro API proxy interface.`, 'system');
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none focus:outline-none ${
                        apiCoinbaseActive ? 'bg-primary' : 'bg-surface-container-low border border-white/10'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        apiCoinbaseActive ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Security Panel */}
              <section className="md:col-span-4 bg-surface/70 backdrop-blur-[20px] rounded-xl border border-white/10 p-6 flex flex-col gap-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-secondary">security</span>
                  <h3 className="font-data-lg text-data-lg text-on-surface font-bold uppercase tracking-wider">Security Protocols</h3>
                </div>

                <div className="flex flex-col gap-5 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-on-surface font-bold">Two-Factor Auth</span>
                      <span className="block text-on-surface-variant uppercase text-[10px] mt-0.5">YubiKey Hardware Active</span>
                    </div>
                    <button
                      onClick={() => {
                        setSecurity2faActive(!security2faActive);
                        addLog(`Yubikey 2FA status toggled to: ${!security2faActive ? 'ACTIVE' : 'INACTIVE'}`, 'system');
                      }}
                      className="bg-primary text-background font-label-mono text-[11px] uppercase px-4 py-2 rounded hover:bg-primary-container transition-colors shadow-[0_0_12px_rgba(76,214,255,0.3)] font-bold outline-none"
                    >
                      {security2faActive ? 'Disable' : 'Enable'}
                    </button>
                  </div>

                  <div className="h-[1px] w-full bg-white/5" />

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-on-surface font-bold">Biometric Logins</span>
                      <span className="block text-on-surface-variant uppercase text-[10px] mt-0.5">Fingerprint / Face ID lock</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSecurityBioActive(!securityBioActive);
                        addLog(`Biometrics lock status set to: ${!securityBioActive ? 'ACTIVE' : 'INACTIVE'}`, 'system');
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none focus:outline-none ${
                        securityBioActive ? 'bg-primary' : 'bg-surface-container-low border border-white/10'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        securityBioActive ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Neural core preferences sliders */}
              <section className="md:col-span-12 bg-surface/70 backdrop-blur-[20px] rounded-xl border border-secondary/30 p-6 flex flex-col gap-6 relative overflow-hidden">
                <div className="absolute inset-0 border-2 border-secondary/20 rounded-xl pointer-events-none animate-pulse" />
                
                <div className="flex items-center gap-3 mb-2 relative z-10">
                  <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 0" }}>
                    psychology
                  </span>
                  <h3 className="font-data-lg text-data-lg text-secondary drop-shadow-[0_0_8px_rgba(206,93,255,0.5)] font-bold uppercase tracking-wider">
                    Neural Core Preferences
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                  <div className="flex flex-col gap-6">
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-on-surface uppercase font-bold text-[11px]">Core Risk Matrix Threshold</label>
                        <span className="font-data-lg text-tertiary font-bold">0.{(coreRiskSlider)}</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="99"
                        value={coreRiskSlider}
                        onChange={e => setCoreRiskSlider(parseInt(e.target.value))}
                        className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-tertiary outline-none"
                      />
                      <div className="flex justify-between mt-2 text-[9px] text-on-surface-variant font-bold uppercase opacity-65">
                        <span>Conservative</span>
                        <span>Aggressive</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-on-surface uppercase font-bold text-[11px]">AI Update Sync Frequency</label>
                        <span className="font-data-lg text-primary font-bold">High (1ms)</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={coreUpdateFrequency}
                        onChange={e => setCoreUpdateFrequency(parseInt(e.target.value))}
                        className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary outline-none"
                      />
                    </div>
                  </div>

                  {/* Core Status details */}
                  <div className="bg-background rounded-lg border border-white/5 p-4 flex flex-col justify-center gap-4 relative overflow-hidden">
                    <div className="absolute inset-0 bg-secondary/5 z-0" />
                    <div className="relative z-10 flex justify-between items-center font-bold">
                      <span className="text-on-surface-variant text-[10px] uppercase">Core Status Matrix</span>
                      <span className="text-[10px] text-secondary bg-secondary/10 px-2.5 py-0.5 rounded uppercase flex items-center gap-1.5 border border-secondary/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" /> 
                        Active
                      </span>
                    </div>
                    <div className="relative z-10">
                      <div className="font-data-lg text-xl text-on-surface font-bold tracking-tight">Neural Model v4.2.1-beta</div>
                      <div className="text-[10px] text-outline mt-1 uppercase">LAST RE-TRAINED CORRELATION MATRIX: 12 MINS AGO</div>
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Unified Navigation Bar (Visible on all screens) */}
      <nav className="fixed bottom-0 left-0 right-0 w-full z-50 border-t border-white/10 bg-[#0c0d12]/90 backdrop-blur-2xl flex justify-center items-center h-16 shadow-[0_-10px_30px_rgba(0,0,0,0.6)] px-4 pb-safe">
        <div className="flex justify-between md:justify-center items-center w-full max-w-container-max md:gap-12 gap-1 overflow-x-auto hide-scrollbar select-none">
          {[
            { id: 'terminal', label: 'Terminal', icon: 'grid_view' },
            { id: 'analysis', label: 'Analysis', icon: 'insights' },
            { id: 'bots', label: 'Bots', icon: 'smart_toy' },
            { id: 'assets', label: 'Assets', icon: 'account_balance_wallet' },
            { id: 'config', label: 'Config', icon: 'settings_input_component' }
          ].map(item => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2 font-label-mono uppercase text-xs font-bold transition-all duration-300 px-3 py-1.5 rounded outline-none focus:outline-none shrink-0 ${
                  active 
                    ? 'text-tertiary drop-shadow-[0_0_8px_rgba(0,247,217,0.5)] scale-105' 
                    : 'text-on-surface-variant hover:text-tertiary/80'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
