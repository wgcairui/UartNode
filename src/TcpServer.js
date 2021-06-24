"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const net_1 = __importDefault(require("net"));
const config_1 = __importDefault(require("./config"));
const client_1 = __importStar(require("./client"));
/**
 * tcpServer实例,用于管理所有dtu连接
 */
class TcpServer extends net_1.default.Server {
    /**
     *
     * @param conf dtu注册信息
     */
    constructor(conf) {
        super();
        // net.Server 运行参数配置
        this.setMaxListeners(conf.MaxConnections);
        this.MacSocketMaps = new Map();
        this
            // connection
            .on("connection", async (socket) => {
            this._Connection(socket);
        })
            // error
            .on("error", (err) => console.log("Server error: %s.", err))
            // start listen
            .listen(process.env.NODE_ENV === 'production' ? conf.Port : config_1.default.localport, "0.0.0.0", () => {
            const ad = this.address();
            console.log(`### WebSocketServer listening: ${conf.IP}:${ad.port}`);
        });
    }
    /**
     * 处理新连接的socket对象
     * @param socket
     */
    async _Connection(socket) {
        console.log(`新的socket连接,连接参数: ${socket.remoteAddress}:${socket.remotePort}`);
        if (!socket || !socket.remoteAddress)
            return;
        const timeOut = setTimeout(() => {
            console.log(socket.remoteAddress, '无消息,尝试发送注册信息');
            try {
                if (socket && !socket.destroyed && socket.writable) {
                    socket.write(Buffer.from('+++AT+NREGEN=A,on\r', "utf-8"));
                    socket.write(Buffer.from('+++AT+NREGDT=A,register&mac=%MAC&host=%HOST\r', "utf-8"));
                }
            }
            catch (error) {
                console.log(error);
            }
        }, 10000);
        try {
            // 配置socket参数
            socket
                .on("error", err => {
                console.error(`socket error:${err.message}`, err);
                socket?.destroy();
            })
                // 监听第一个包是否是注册包'register&mac=98D863CC870D&jw=1111,3333'
                .once("data", async (data) => {
                clearTimeout(timeOut);
                const registerArguments = new URLSearchParams(data.toString());
                //判断是否是注册包
                if (registerArguments.has('register') && registerArguments.has('mac')) {
                    const IMEI = registerArguments.get('mac');
                    // 是注册包之后监听正常的数据
                    // mac地址为后12位
                    const maclen = IMEI.length;
                    const mac = IMEI.slice(maclen - 12, maclen);
                    const client = this.MacSocketMaps.get(mac);
                    if (client) {
                        client.reConnectSocket(socket);
                    }
                    else {
                        // 使用proxy代理dtu对象
                        const newClient = new Proxy(new client_1.default(socket, mac, registerArguments), client_1.ProxyClient);
                        this.MacSocketMaps.set(mac, newClient);
                        console.log(`${new Date().toLocaleString()} ## ${mac}  上线,连接参数: ${socket.remoteAddress}:${socket.remotePort},Tcp Server连接数: ${await this.getConnections()}`);
                    }
                }
                else {
                    socket.end('please register DTU IMEI', () => {
                        console.log(`###${socket.remoteAddress}:${socket.remotePort} 配置错误或非法连接,销毁连接,[${data.toString()}]`);
                        socket.destroy();
                    });
                }
            });
        }
        catch (error) {
            console.error(`创建新的socket事件出错,socket异常,ip===${socket.remoteAddress}:${socket.remotePort}`);
        }
    }
    /**
     *  统计TCP连接数
     */
    getConnections() {
        return new Promise((resolve) => {
            super.getConnections((err, nb) => {
                resolve(nb);
            });
        });
    }
    /**
     * 处理uartServer下发的查询和操作指令
     * @param EventType 指令类型
     * @param Query 指令内容
     */
    Bus(EventType, Query) {
        const client = this.MacSocketMaps.get(Query.DevMac);
        if (client) {
            Query.eventType = EventType;
            client.saveCache(Query);
        }
    }
}
exports.default = TcpServer;
