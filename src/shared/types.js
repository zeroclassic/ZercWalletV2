"use strict";
// ─── RPC Config ────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC = exports.DEFAULT_RPC_CONFIG = void 0;
exports.DEFAULT_RPC_CONFIG = {
    host: '127.0.0.1',
    port: 8545,
    username: 'zerc',
    password: '',
};
// ─── IPC Channels ─────────────────────────────────────────────────────────────
exports.IPC = {
    // RPC
    RPC_CALL: 'rpc:call',
    RPC_RESULT: 'rpc:result',
    // Wallet
    GET_BALANCE: 'wallet:getBalance',
    GET_ADDRESSES: 'wallet:getAddresses',
    GET_TRANSACTIONS: 'wallet:getTransactions',
    NEW_ADDRESS: 'wallet:newAddress',
    SEND_TX: 'wallet:sendTransaction',
    GET_NODE_INFO: 'wallet:getNodeInfo',
    // Config
    GET_CONFIG: 'config:get',
    SET_CONFIG: 'config:set',
    // App
    OPEN_EXTERNAL: 'app:openExternal',
};
