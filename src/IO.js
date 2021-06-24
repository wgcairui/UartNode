"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = __importDefault(require("socket.io-client"));
const config_1 = __importDefault(require("./config"));
/**
 * 连接到uartServer的IO对象
 */
const IOClient = socket_io_client_1.default(config_1.default.ServerHost, { path: "/Node" });
IOClient
    //断开连接时触发    
    .on("disconnect", (reason) => console.log(`${reason},socket连接已丢失，取消发送运行数据`))
    // 发生错误时触发
    .on("error", (error) => { console.log("error:", error.message); })
    // 无法在内部重新连接时触发
    .on('reconnect_failed', () => { console.log('reconnect_failed'); })
    // 重新连接尝试错误时触发
    .on('reconnect_error', (error) => { console.log("reconnect_error:", error.message); })
    // 尝试重新连接时触发
    .on('reconnecting', (attemptNumber) => { console.log({ 'reconnecting': attemptNumber }); })
    // 重新连接成功后触发
    .on('reconnect', (attemptNumber) => { console.log({ 'reconnect': attemptNumber }); })
    // 连接超时
    .on('connect_timeout', (timeout) => { console.log({ 'connect_timeout': timeout }); })
    // 连接出错
    .on('connect_error', (error) => { console.log("connect_error:", error.message); });
exports.default = IOClient;
