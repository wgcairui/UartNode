"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const net_1 = tslib_1.__importDefault(require("net"));
const events_1 = tslib_1.__importDefault(require("events"));
const config_1 = tslib_1.__importDefault(require("../config"));
class TcpServer extends net_1.default.Server {
    constructor(configs) {
        super();
        let { Name, MaxConnections, Port } = configs;
        //限定最大连接数
        this.setMaxListeners(MaxConnections);
        this.NodeName = Name;
        this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
        this.port = Port || config_1.default.localport; //监听端口
        this.timeout = config_1.default.timeOut; //超时时间(单位：毫秒)
        this.SocketMaps = new Map();
        this.MacSocketMaps = new Map();
    }
    start() {
        this.listen(this.port, this.host, () => {
            console.log(`Server listening: ${this.address()}`);
        })
            .on("connection", this._handleConnection)
            .on("error", err => console.log("Server error: %s.", err));
    }
    _handleConnection(socket) {
        let client;
        if (!socket.remotePort || !socket.remoteAddress)
            return;
        let port = socket.remotePort;
        let ip = socket.remoteAddress;
        if (this.SocketMaps.has(port)) {
            client = this.SocketMaps.get(port);
        }
        else {
            console.log(`new connect,ip:${ip}:${port}`);
            //限定超时时间
            socket
                .setTimeout(this.timeout)
                .setKeepAlive(true, 100)
                .setNoDelay(true);
            this.SocketMaps.set(port, {
                socket,
                ip,
                mac: "",
                jw: "",
                port,
                stat: false,
                event: new events_1.default(),
            });
            client = this.SocketMaps.get(port);
        }
        //触发连接事件
        if (!client)
            throw Error("client error");
        let connectStr = `${client["ip"]}, ${client["port"]}`;
        console.log("%s:%s connect.");
        //timeOut
        client.socket
            .on("close", () => {
            console.log("%s:%s disconnect.", connectStr);
            this.closeClient(port);
        })
            .on("error", err => {
            console.log("%s:%s error: %s.", connectStr, err);
            this.closeClient(port);
        })
            .once("data", data => {
            //判断是否是注册包
            if (data.toString().includes("register")) {
                if (!client)
                    throw Error("client error");
                let r = data.toString();
                client.mac = r.slice(9, 24);
                client.jw = r.slice(24, -1);
                this.MacSocketMaps.set(client["mac"], client);
                console.log(`设备注册:Mac=${client.mac},Jw=${client.jw}`);
                client.socket.on("data", (buffer) => {
                    if (!client)
                        throw Error("client error");
                    client.event.emit("recv", buffer);
                });
                this.emit("newTerminal");
            }
        });
    }
    //销毁socket实例，并删除
    closeClient(port) {
        let client = this.SocketMaps.get(port);
        if (!client)
            throw Error("client error");
        console.log("%s:%s close.", client.ip, client.port);
        client.socket.destroy();
        this.SocketMaps.delete(port);
        this.MacSocketMaps.delete(client.mac);
        this.emit("newTerminal");
    }
    //
    async GetAllInfo() {
        let getConnections = await new Promise((res, rej) => {
            this.getConnections((err, count) => {
                if (err)
                    rej(err);
                res(count);
            });
        });
        return {
            NodeName: this.NodeName,
            Connections: getConnections,
            SocketMaps: [...this.SocketMaps.values()].map(({ mac, port, ip, jw }) => ({
                mac,
                port,
                ip,
                jw,
            })),
        };
    }
}
exports.default = TcpServer;
//# sourceMappingURL=TcpServer.js.map