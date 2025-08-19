# On-Chain CLOB DEX Frontend

Frontend interface cho hệ thống Central Limit Order Book (CLOB) DEX on-chain. Giao diện cho phép người dùng kết nối ví, đặt limit orders, và theo dõi order book real-time.

## Tính năng

- ✅ **Kết nối ví MetaMask**: Tích hợp với MetaMask để kết nối ví
- ✅ **Đặt Limit Orders**: Đặt lệnh mua/bán với giá cụ thể
- ✅ **EIP-712 Signatures**: Ký orders theo chuẩn EIP-712
- ✅ **Order Book Display**: Hiển thị order book (hiện tại trống, chờ orders thực tế)
- ✅ **User Orders Management**: Theo dõi và hủy orders của người dùng
- ✅ **Real-time Price Updates**: Cập nhật giá real-time
- ✅ **Responsive Design**: Giao diện responsive cho mobile và desktop

## Cài đặt

1. **Clone repository và cài đặt dependencies:**
```bash
cd frontend
npm install
```

2. **Cấu hình contract addresses:**
```bash
cp .env.example .env
```

Chỉnh sửa file `.env` với địa chỉ contracts đã deploy:
```env
VITE_VAULT_ADDRESS=0x...
VITE_FACTORY_ADDRESS=0x...
VITE_ROUTER_ADDRESS=0x...
VITE_ETH_TOKEN_ADDRESS=0x...
VITE_USDC_TOKEN_ADDRESS=0x...
```

3. **Chạy development server:**
```bash
npm run dev
```

## Cách sử dụng

### 1. Kết nối ví
- Click vào nút "Kết nối ví" ở góc trên bên phải
- Chọn MetaMask và xác nhận kết nối
- Đảm bảo bạn đang ở đúng network (localhost:8545 cho development)

### 2. Đặt Limit Order
- Chọn trading pair (ETH/USDC, BTC/USDC, etc.)
- Chọn loại lệnh: Buy (Mua) hoặc Sell (Bán)
- Nhập giá và số lượng
- Click "Mua" hoặc "Bán" để đặt lệnh
- Xác nhận signature trong MetaMask

### 3. Theo dõi Orders
- Orders của bạn sẽ hiển thị trong panel "Lệnh của tôi"
- Bạn có thể hủy orders đang chờ khớp
- Trạng thái orders sẽ được cập nhật real-time

### 4. Xem Order Book
- Order book hiển thị các lệnh mua/bán hiện tại
- Giá hiện tại được highlight ở giữa
- Orders được sắp xếp theo giá (tốt nhất ở trên)

## Cấu trúc Code

### Components chính:
- `TradingDashboard.jsx`: Component chính chứa toàn bộ giao diện
- `TradingForm.jsx`: Form đặt lệnh với EIP-712 signing
- `OrderBook.jsx`: Hiển thị order book
- `UserOrders.jsx`: Quản lý orders của user
- `WalletConnection.jsx`: Kết nối và quản lý ví

### Hooks:
- `useWeb3.tsx`: Quản lý kết nối Web3 và MetaMask
- `useContracts.tsx`: Tương tác với smart contracts

### Libraries:
- `eip712.ts`: Utilities cho EIP-712 signing
- `config.ts`: Cấu hình contract addresses và tokens

## Smart Contract Integration

Frontend tích hợp với các contracts:
- **Router**: Entry point chính cho việc đặt/hủy orders
- **ClobPair**: Quản lý order book cho từng trading pair
- **Vault**: Quản lý funds locking/unlocking

### EIP-712 Signing
Orders được ký theo chuẩn EIP-712 với domain:
```javascript
{
  name: 'ClobRouter',
  version: '1',
  chainId: 31337, // hoặc chain ID thực tế
  verifyingContract: ROUTER_ADDRESS
}
```

## 🔥 New Features - Dynamic Trading Pairs

### ✨ What's New:
- **Dynamic Token Detection**: Automatically fetches supported tokens from Vault contract
- **Trading Pair Manager**: Create new trading pairs directly from UI
- **Smart Contract Integration**: Real-time data from blockchain
- **Getting Started Guide**: Step-by-step setup instructions
- **Improved UX**: Better error handling and loading states

### 🚀 How to Use Dynamic Pairs:

#### 1. Connect Your Wallet
```bash
# Make sure you're on the correct network
# Default: localhost:8545 (Anvil/Hardhat)
```

#### 2. Add Supported Tokens to Vault
As the Vault owner, you need to add tokens first:
```solidity
// Call this function on Vault contract
vault.addSupportedToken(tokenAddress);
```

#### 3. Create Trading Pairs
- Click the Settings (⚙️) button in the header
- Select base and quote tokens from your supported tokens
- Set tick size (minimum price increment)
- Click "Create Trading Pair"

#### 4. Start Trading
- Select your trading pair from the dropdown
- Place limit orders
- Monitor order book and trades

## Development Notes

### ✅ Completed Features:
1. **Dynamic Token Loading**: Fetches supported tokens from Vault
2. **Trading Pair Creation**: UI for creating new pairs
3. **Real-time Pair Management**: Auto-refresh after pair creation
4. **Smart Error Handling**: Better validation and user feedback
5. **Getting Started Guide**: Interactive setup wizard

### 🚧 Still Need Implementation:
1. **Order Book Real-time**: Event listening for live order book updates
2. **Order History**: Complete trade history tracking
3. **Balance Display**: Real user balance from Vault
4. **Token Approval UI**: One-click approve flow
5. **Price Oracle Integration**: Real market prices

### Token Approval
Trước khi đặt orders, users cần approve tokens cho Vault contract:
```javascript
// Ví dụ approve USDC cho Vault
const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
await usdcContract.approve(VAULT_ADDRESS, amount);
```

## Troubleshooting

### Lỗi thường gặp:
1. **"Contract not initialized"**: Kiểm tra contract addresses trong .env
2. **"Transaction failed"**: Kiểm tra balance và allowance
3. **"Invalid signature"**: Đảm bảo đang ký đúng order structure
4. **"Network mismatch"**: Đảm bảo MetaMask đang ở đúng network

### Debug:
- Mở Developer Console để xem logs
- Kiểm tra Network tab cho API calls
- Verify contract addresses và ABIs

## Tech Stack

- **React 18**: UI framework
- **Vite**: Build tool
- **Ethers.js v6**: Web3 library
- **Framer Motion**: Animations
- **Tailwind CSS**: Styling
- **Lucide React**: Icons

## License

MIT License
