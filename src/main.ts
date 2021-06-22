
import axios from "axios"
import config from "./config"
import { registerConfig, queryObjectServer, instructQuery, DTUoprate } from "uart"
import IOClient from "./IO"
import TcpServer from "./TcpServer"
import tool from "./tool"
import { clearInterval } from "timers"

let tcpServer: TcpServer
let intervals: NodeJS.Timeout[] = []

IOClient
    // 连接成功,触发node注册,发送node信息
    .on("connect", () => {
        console.log(`${new Date().toLocaleString()}:已连接到UartServer:${config.ServerHost},socketID:${IOClient.id},`);
        IOClient.emit(config.EVENT_SOCKET.register, tool.NodeInfo());
    })
    // 注册成功,初始化TcpServer
    .on(config.EVENT_SOCKET.registerSuccess, (data: registerConfig) => {
        register(data)
    })
    //断开连接时触发    
    .on("disconnect", (reason: string) => {
        intervals.forEach(el => clearInterval(el))
    })
    .on(config.EVENT_SOCKET.query, (Query: queryObjectServer) => {
        Query.DevMac = Query.mac
        tcpServer.Bus('QueryInstruct', Query)
    })

    // 终端设备操作指令
    .on(config.EVENT_SERVER.instructQuery, (Query: instructQuery) => {
        tcpServer.Bus('OprateInstruct', Query)
    })

    // 发送终端设备AT指令
    .on(config.EVENT_SERVER.DTUoprate, async (Query: DTUoprate) => {
        tcpServer.Bus("ATInstruct", Query as DTUoprate)
    })

/**
 * 注册dtu
 * @param data dtu注册信息
 */
function register(data: registerConfig) {
    console.log('进入TcpServer start流程');
    intervals = interval(data)
    if (tcpServer) {
        console.log('TcpServer实例已存在');
        // 重新注册终端
        const clients = [...tcpServer.MacSocketMaps.values()].filter(el => el.getPropertys().connecting).map(el => el.mac)
        IOClient.emit(config.EVENT_TCP.terminalOn, clients, false)
    } else {
        // 根据节点注册信息启动TcpServer
        tcpServer = new TcpServer(data);
        IOClient
    }
    // 等待10秒,等待终端连接节点,然后告诉服务器节点已准备就绪
    setTimeout(() => {
        IOClient.emit(config.EVENT_SOCKET.ready)
    }, 10000)
}

/**
 * 设置定时操作
    每10分钟统计一次所有DTU实时信息
 * @param registerConfig dtu注册信息
 */
function interval(registerConfig: registerConfig) {
    console.log('开始定时上传节点数据');

    const upRun = setInterval(async () => {
        // 统计dtu信息
        // console.time('统计dtu信息');
        const WebSocketInfos = {
            NodeName: registerConfig!.Name,
            SocketMaps: await Promise.all([...tcpServer.MacSocketMaps].map(el => el[1].run())),
            // tcpserver连接数量
            Connections: await tcpServer.getConnections()
        }
        // console.timeEnd('统计dtu信息')
        axios.post(config.ServerApi + config.ApiPath.runNode,
            { NodeInfo: tool.NodeInfo(), WebSocketInfos, updateTime: new Date().toString() })
            .catch(_e => console.log({ err: _e, msg: config.ServerApi + config.ApiPath.runNode + "/UartData api error" }));
    }, 1000 * 60)


    return [upRun]
}

