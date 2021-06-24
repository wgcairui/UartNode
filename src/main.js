"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("./config"));
const IO_1 = __importDefault(require("./IO"));
const TcpServer_1 = __importDefault(require("./TcpServer"));
const tool_1 = __importDefault(require("./tool"));
const timers_1 = require("timers");
let tcpServer;
let intervals = [];
IO_1.default
    // 连接成功,触发node注册,发送node信息
    .on("connect", () => {
    console.log(`${new Date().toLocaleString()}:已连接到UartServer:${config_1.default.ServerHost},socketID:${IO_1.default.id},`);
    IO_1.default.emit(config_1.default.EVENT_SOCKET.register, tool_1.default.NodeInfo());
})
    // 注册成功,初始化TcpServer
    .on(config_1.default.EVENT_SOCKET.registerSuccess, (data) => {
    register(data);
})
    //断开连接时触发    
    .on("disconnect", (reason) => {
    intervals.forEach(el => timers_1.clearInterval(el));
})
    .on(config_1.default.EVENT_SOCKET.query, (Query) => {
    Query.DevMac = Query.mac;
    tcpServer.Bus('QueryInstruct', Query);
})
    // 终端设备操作指令
    .on(config_1.default.EVENT_SERVER.instructQuery, (Query) => {
    tcpServer.Bus('OprateInstruct', Query);
})
    // 发送终端设备AT指令
    .on(config_1.default.EVENT_SERVER.DTUoprate, async (Query) => {
    tcpServer.Bus("ATInstruct", Query);
});
/**
 * 注册dtu
 * @param data dtu注册信息
 */
function register(data) {
    console.log('进入TcpServer start流程');
    intervals = interval(data);
    if (tcpServer) {
        console.log('TcpServer实例已存在');
        // 重新注册终端
        const clients = [...tcpServer.MacSocketMaps.values()].filter(el => el.getPropertys().connecting).map(el => el.mac);
        IO_1.default.emit(config_1.default.EVENT_TCP.terminalOn, clients, false);
    }
    else {
        // 根据节点注册信息启动TcpServer
        tcpServer = new TcpServer_1.default(data);
        IO_1.default;
    }
    // 等待10秒,等待终端连接节点,然后告诉服务器节点已准备就绪
    setTimeout(() => {
        IO_1.default.emit(config_1.default.EVENT_SOCKET.ready);
    }, 10000);
}
/**
 * 设置定时操作
    每10分钟统计一次所有DTU实时信息
 * @param registerConfig dtu注册信息
 */
function interval(registerConfig) {
    console.log('开始定时上传节点数据');
    const upRun = setInterval(async () => {
        // 统计dtu信息
        // console.time('统计dtu信息');
        const WebSocketInfos = {
            NodeName: registerConfig.Name,
            SocketMaps: await Promise.all([...tcpServer.MacSocketMaps].map(el => el[1].run())),
            // tcpserver连接数量
            Connections: await tcpServer.getConnections()
        };
        // console.timeEnd('统计dtu信息')
        axios_1.default.post(config_1.default.ServerApi + config_1.default.ApiPath.runNode, { NodeInfo: tool_1.default.NodeInfo(), WebSocketInfos, updateTime: new Date().toString() })
            .catch(_e => console.log({ err: _e, msg: config_1.default.ServerApi + config_1.default.ApiPath.runNode + "/UartData api error" }));
    }, 1000 * 60);
    return [upRun];
}
