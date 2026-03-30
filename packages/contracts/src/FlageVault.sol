// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FlageVault
/// @notice Holds trading capital and executes trades verified by Proof-of-Inference
contract FlageVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Structs ---

    struct TradePayload {
        uint8 action;           // 0=BUY, 1=SELL
        bytes32 pair;           // keccak256("ETH/USDC")
        uint256 amount;         // base token units (18 decimals)
        uint256 priceLimit;     // max buy price or min sell price (18 decimals)
        uint256 deadline;       // Unix timestamp
        uint256 nonce;          // monotonic, per-signer
        address vault;          // must equal address(this)
    }

    struct PairConfig {
        address tokenA;         // base token
        address tokenB;         // quote token
        uint256 maxPositionSize;
        uint256 maxDailyVolume;
        bool active;
    }

    struct TEERegistration {
        address signingAddress; // Enclave-born public key
        bytes32 tdxReportHash;
        bytes32 nvidiaReportHash;
        uint256 registeredAt;
        bool active;
    }

    // --- State ---

    address public owner;
    address public dexRouter;

    // Registered TEE signing keys
    mapping(address => TEERegistration) public teeRegistrations;

    // Used nonces: signer => nonce => used
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // Trading pair configs
    mapping(bytes32 => PairConfig) public pairs;

    // Daily volume: pair => day => volume
    mapping(bytes32 => mapping(uint256 => uint256)) public dailyVolume;

    // Whitelisted tokens
    mapping(address => bool) public whitelistedTokens;

    // Stats
    uint256 public totalTrades;
    int256 public realizedPnL;

    // --- Events ---

    event TradeExecuted(
        bytes32 indexed pair,
        uint8 action,
        uint256 amount,
        uint256 nonce,
        address indexed teeKey
    );
    event TEERegistered(address indexed signingKey, bytes32 tdxReport);
    event TEEDeactivated(address indexed signingKey);
    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount, address indexed to);
    event PairConfigured(bytes32 indexed pair, address tokenA, address tokenB);

    // --- Errors ---

    error NotOwner();
    error InvalidSignature();
    error TEENotRegistered();
    error TEEDeactivated_();
    error NonceUsed();
    error TradeExpired();
    error WrongVault();
    error PairNotActive();
    error ExceedsPositionLimit();
    error ExceedsDailyVolume();
    error TokenNotWhitelisted();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _dexRouter) {
        if (_dexRouter == address(0)) revert ZeroAddress();
        owner = msg.sender;
        dexRouter = _dexRouter;
    }

    // --- TEE Management ---

    /// @notice Register a TEE signing key with attestation
    function registerTEE(
        address signingKey,
        bytes32 tdxReportHash,
        bytes32 nvidiaReportHash
    ) external onlyOwner {
        teeRegistrations[signingKey] = TEERegistration({
            signingAddress: signingKey,
            tdxReportHash: tdxReportHash,
            nvidiaReportHash: nvidiaReportHash,
            registeredAt: block.number,
            active: true
        });
        emit TEERegistered(signingKey, tdxReportHash);
    }

    function deactivateTEE(address signingKey) external onlyOwner {
        teeRegistrations[signingKey].active = false;
        emit TEEDeactivated(signingKey);
    }

    // --- Trade Execution ---

    /// @notice Execute a trade signed by the TEE agent (Proof-of-Inference)
    function executeTrade(
        TradePayload calldata payload,
        bytes calldata signature
    ) external nonReentrant {
        // 1. Deadline check
        if (block.timestamp > payload.deadline) revert TradeExpired();

        // 2. Vault binding check
        if (payload.vault != address(this)) revert WrongVault();

        // 3. Recover signer from signature
        bytes32 payloadHash = _hashPayload(payload);
        bytes32 ethSignedHash = _toEthSignedMessageHash(payloadHash);
        address signer = _recover(ethSignedHash, signature);

        // 4. Verify TEE registration
        TEERegistration storage tee = teeRegistrations[signer];
        if (tee.signingAddress == address(0)) revert TEENotRegistered();
        if (!tee.active) revert TEEDeactivated_();

        // 5. Nonce replay protection
        if (usedNonces[signer][payload.nonce]) revert NonceUsed();
        usedNonces[signer][payload.nonce] = true;

        // 6. Pair config checks
        PairConfig memory config = pairs[payload.pair];
        if (!config.active) revert PairNotActive();
        if (payload.amount > config.maxPositionSize) revert ExceedsPositionLimit();

        // 7. Daily volume check
        uint256 today = block.timestamp / 1 days;
        uint256 newVolume = dailyVolume[payload.pair][today] + payload.amount;
        if (newVolume > config.maxDailyVolume) revert ExceedsDailyVolume();
        dailyVolume[payload.pair][today] = newVolume;

        // 8. Route to DEX
        _executeDEXSwap(payload, config);

        totalTrades++;
        emit TradeExecuted(payload.pair, payload.action, payload.amount, payload.nonce, signer);
    }

    function _executeDEXSwap(TradePayload calldata payload, PairConfig memory config) internal {
        IDEXRouter router = IDEXRouter(dexRouter);
        if (payload.action == 0) {
            // BUY: sell tokenB, receive tokenA
            IERC20(config.tokenB).safeIncreaseAllowance(dexRouter, payload.amount);
            router.swap(
                config.tokenB,
                config.tokenA,
                payload.amount,
                payload.priceLimit,
                payload.deadline
            );
        } else {
            // SELL: sell tokenA, receive tokenB
            IERC20(config.tokenA).safeIncreaseAllowance(dexRouter, payload.amount);
            router.swap(
                config.tokenA,
                config.tokenB,
                payload.amount,
                payload.priceLimit,
                payload.deadline
            );
        }
    }

    // --- Pair Configuration ---

    function configurePair(
        bytes32 pairHash,
        address tokenA,
        address tokenB,
        uint256 maxPositionSize,
        uint256 maxDailyVolume
    ) external onlyOwner {
        pairs[pairHash] = PairConfig({
            tokenA: tokenA,
            tokenB: tokenB,
            maxPositionSize: maxPositionSize,
            maxDailyVolume: maxDailyVolume,
            active: true
        });
        emit PairConfigured(pairHash, tokenA, tokenB);
    }

    function deactivatePair(bytes32 pairHash) external onlyOwner {
        pairs[pairHash].active = false;
    }

    // --- Capital Management ---

    function deposit(address token, uint256 amount) external onlyOwner {
        if (!whitelistedTokens[token]) revert TokenNotWhitelisted();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, amount);
    }

    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        if (!whitelistedTokens[token]) revert TokenNotWhitelisted();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, amount, to);
    }

    function whitelistToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        whitelistedTokens[token] = true;
    }

    // --- Signature Helpers ---

    function _hashPayload(TradePayload calldata p) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            p.action, p.pair, p.amount, p.priceLimit, p.deadline, p.nonce, p.vault
        ));
    }

    function _toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Bad sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }

    receive() external payable {}
}

interface IDEXRouter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 priceLimit,
        uint256 deadline
    ) external returns (uint256 amountOut);
}
