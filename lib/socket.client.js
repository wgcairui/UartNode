"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const config_1 = tslib_1.__importDefault(require("../config"));
const tool_1 = tslib_1.__importDefault(require("./tool"));
const socket_io_client_1 = tslib_1.__importDefault(require("socket.io-client"));
const Query_1 = tslib_1.__importDefault(require("./Query"));
const TcpServer_1 = tslib_1.__importDefault(require("./TcpServer"));
class Socket {
    constructor() {
        this.io = socket_io_client_1.default(config_1.default.ServerHost);
    }
    start() {
        this.io
            .on("connect", () => this._register())
            .on("registerSuccess", (data) => this._registerSuccess(data))
            .on("disconnect", () => this._disconnect)
            .on("query", (data) => this.Query.emit("query", data));
    }
    _register() {
        console.log(`已连接到UartServer:${config_1.default.ServerHost},socketID:${this.io.id},`);
        this.io.emit("register", tool_1.default.NodeInfo());
    }
    _registerSuccess(config) {
        if (this.TcpServer)
            return;
        // let { clients, IP, Name, MaxConnections, Port } = config
        console.log(`已在 UartServer 成功注册`);
        this.TcpServer = new TcpServer_1.default(config);
        this.TcpServer.start();
        this.Query = new Query_1.default(this.io, this.TcpServer, config);
        this.Query.start();
        //run.IntelSendUartData(this.TcpServer)
    }
    _disconnect() {
        console.log(`socket连接已丢失，取消发送运行数据`);
    }
}
exports.Socket = Socket;
//# sourceMappingURL=socket.client.js.map