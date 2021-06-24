"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const isProd = process.env.NODE_ENV === "production";
exports.default = {
    /**
     * uartServer地址,用于socket连接
     */
    ServerHost: isProd ? "http://uart.ladishb.com:9010" : "http://test.ladishb.com:9002",
    /**
     * uartServerApi地址,用于发送查询结果数据和节点运行数据
     */
    ServerApi: isProd ? "http://uart.ladishb.com:9010/api/Node" : "http://test.ladishb.com:9002/api/Node",
    ApiPath: {
        uart: "/UartData",
        runNode: "/RunData",
    },
    EVENT_TCP: {
        terminalOn: "terminalOn",
        terminalOff: "terminalOff",
        terminalMountDevTimeOut: "terminalMountDevTimeOut",
        terminalMountDevTimeOutRestore: "terminalMountDevTimeOutRestore",
        instructOprate: 'instructOprate',
        instructTimeOut: 'instructTimeOut', // 设备指令超时
    },
    EVENT_SOCKET: {
        register: "register",
        registerSuccess: "registerSuccess",
        query: "query",
        ready: "ready",
        startError: "startError",
        alarm: "alarm", // 节点告警事件
    },
    EVENT_SERVER: {
        instructQuery: "instructQuery",
        'DTUoprate': 'DTUoprate' // DTU AT指令
    },
    /**
     * 监听ip
     */
    localhost: "0.0.0.0",
    /**
     * 监听端口
     */
    localport: 8999,
    /**
     * dtu连接超时
     */
    timeOut: 1000 * 60 * 5,
    /**
     * dtu查询超时
     */
    queryTimeOut: 1500,
    /**
     * dtu查询超时次数
     */
    queryTimeOutNum: 10,
    /**
     * dtu查询超时重启时间
     */
    queryTimeOutReload: 1000 * 60,
};
