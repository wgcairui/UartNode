import socketClient from "socket.io-client";
import config from "./config";
import tool from "./tool";

/**
 * 连接到uartServer的IO对象
 */
console.log(`连接socket服务器:${config.ServerHost}`);

const IOClient = socketClient(config.ServerHost+'/node', { path: "/client" });
IOClient
    //断开连接时触发    
    .on("disconnect", (reason: string) => console.log(`${reason},socket连接已丢失，取消发送运行数据`))
    // 发生错误时触发
    .on("error", (error: Error) => { console.log("error:", error.message) })
    // 无法在内部重新连接时触发
    .on('reconnect_failed', () => { console.log('reconnect_failed') })
    // 重新连接尝试错误时触发
    .on('reconnect_error', (error: Error) => { console.log("reconnect_error:",error.message) })
    // 尝试重新连接时触发
    .on('reconnecting', (attemptNumber: number) => { console.log({ 'reconnecting': attemptNumber }) })
    // 重新连接成功后触发
    .on('reconnect', (attemptNumber: number) => { console.log({ 'reconnect': attemptNumber }) })
    // 连接超时
    .on('connect_timeout', (timeout: number) => { console.log({ 'connect_timeout': timeout }) })
    // 连接出错
    .on('connect_error', (error: Error) => { console.log("connect_error:",error.message) })

export default IOClient
