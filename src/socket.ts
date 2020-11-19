import { Socket } from "net";
import { socketResult } from "uart";
import config from "./config";
const events = new Set(['_pendingData', '_pendingEncoding', 'connecting'])

export default class socketsb {
    // 不暴露私有属性,避免被操作
    private readonly mac: string
    private socket: Socket;
    private lock: boolean;
    private ip: string;
    private port: number;
    private connecting: boolean;

    constructor(socket: Socket, mac: string) {
        this.mac = mac
        this.socket = new Proxy(socket, ProxySocket)
        this.ip = this.socket.remoteAddress!
        this.port = this.socket.remotePort!
        this.lock = false
        this.connecting = true
        this.socket
            // 设置socket连接超时
            .setTimeout(config.timeOut)
            // socket保持长连接
            .setKeepAlive(true, 100000)
            // 关闭Nagle算法,优化性能,打开则优化网络,default:false
            .setNoDelay(true)
            .on("error", (err) => {
                console.error({ type: 'socket connect error', time: new Date(), code: err.name, message: err.message, stack: err.stack });
            })
            .on("timeout", () => {
                console.log(`### timeout==${this.ip}:${this.port}::${this.mac}`);
            })
            /* // 监听socket开始传输
            .on("_pendingData", () => {
                console.log("_pendingData");
            })
            // 监听传输结束
            .on("_pendingEncoding", () => {
                console.log("_pendingEncoding");
            }) */
            // 监听socket connecting
            .on("connecting", (stat: boolean) => {
                this.connecting = stat
                this.lock = !stat
            })
    }


    // 查询操作,查询会锁住端口状态,完成后解锁
    write(content: Buffer, timeOut: number = 10000, lock: boolean = false) {
        this.lock = true
        return new Promise<socketResult>((resolve) => {
            // 记录socket.bytes
            const Bytes = this.getBytes()
            // 记录开始时间
            const startTime = Date.now();
            // 防止超时
            const time = setTimeout(() => {
                this.socket.emit('data', 'timeOut')
            }, timeOut)
            this.socket.once("data", buffer => {
                clearTimeout(time)
                if (!lock) {
                    this.lock = lock
                    this.socket.emit("free", 'lock')
                }
                resolve({ buffer, useTime: Date.now() - startTime, useByte: this.getBytes() - Bytes })
            })
            // 判断socket流是否安全， socket套接字写入Buffer
            if (this.socket.writable) {
                this.socket.write(content)
            }
            else {
                this.socket.emit("data", 'stream error')
                this.socket.destroy()
            }
        })
    }

    // 
    getBytes() {
        return this.socket.bytesRead + this.socket.bytesWritten;
    }
    // 获取socket对象
    getSocket() {
        return this.socket
    }
    // 获取状态属性
    getStat() {
        return {
            ip: this.ip,
            port: this.port,
            connecting: this.connecting,
            lock: this.lock
        }
    }
}

// 拦截socketsb
const ProxySocket: ProxyHandler<Socket> = {
    set(target, p, value) {
        // _pendingData 查询状态 null
        // _pendingEncoding 接收数据完毕状态 string
        // writable 写入状态 boolean
        // readable 读取状态 boolean
        // connecting 连接状态 boolean
        // 
        if (typeof p === 'string' && events.has(p)) {
            target.emit(p, value)
        }
        return Reflect.set(target, p, value)
    }
}
export const ProxySocketsb: ProxyHandler<socketsb> = {
    set(target, p, value) {
        /* if (p === 'lock' && !value) {
            console.log(target.getStat(),value);
            
            target.getSocket().emit("free",'lock')
        } */
        return Reflect.set(target, p, value)
    }
}