const isProd = process.env.NODE_ENV === "production";
export default {
  ServerHost: isProd ? "http://uart.ladishb.com:9010" : "http://test.ladishb.com:9002",
  ServerApi: isProd ? "http://uart.ladishb.com:9010/api/Node" : "http://test.ladishb.com:9002/api/Node",
  ApiPath: {
    uart: "/UartData",
    runNode: "/RunData",
  },
  EVENT_TCP: {
    terminalOn: "terminalOn", // 终端设备上线
    terminalOff: "terminalOff", // 终端设备下线
    terminalMountDevTimeOut: "terminalMountDevTimeOut", // 设备挂载节点查询超时
    terminalMountDevTimeOutRestore: "terminalMountDevTimeOutRestore", // 设备挂载节点查询超时
    instructOprate: 'instructOprate', // 协议操作指令
    instructTimeOut: 'instructTimeOut', // 设备指令超时

  },
  EVENT_SOCKET: {
    register: "register", // 节点注册
    registerSuccess: "registerSuccess", // 节点注册成功
    query: "query", // 服务器查询请求
    ready: "ready", // 启动Tcp服务成功
    startError: "startError", // 启动Tcp服务出错
    alarm: "alarm", // 节点告警事件
  },
  EVENT_SERVER: {
    instructQuery: "instructQuery", // 操作设备状态指令
    'DTUoprate': 'DTUoprate' // DTU AT指令
  },
  localhost: "0.0.0.0",
  localport: 8999,
  timeOut: 1000 * 60 * 5,
  queryTimeOut: 1500,
  queryTimeOutNum: 10,
  queryTimeOutReload: 1000 * 60,
};
