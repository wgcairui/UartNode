import net, { Socket } from "net";
import config from "./config";
import { queryObjectServer, instructQuery, registerConfig, DTUoprate, eventType } from "uart";
import Client, { ProxyClient } from "./client";
/**
 * tcpServer实例,用于管理所有dtu连接
 */
export default class TcpServer extends net.Server {
  /**
   * 缓存mac->client
   */
  MacSocketMaps: Map<string, Client>;
  /**
   * 
   * @param conf dtu注册信息
   */
  constructor(conf: registerConfig) {
    super();
    // net.Server 运行参数配置
    this.setMaxListeners(conf.MaxConnections);
    this.MacSocketMaps = new Map();
    this
      // connection
      .on("connection", async socket => {
        this._Connection(socket)
      })
      // error
      .on("error", (err) => console.log("Server error: %s.", err))
      // start listen
      .listen(process.env.NODE_ENV === 'production' ? conf.Port : config.localport, "0.0.0.0", () => {
        const ad = this.address() as net.AddressInfo;
        console.log(`### WebSocketServer listening: ${conf.IP}:${ad.port}`);
      });
  }

  /**
   * 处理新连接的socket对象
   * @param socket 
   */
  private async _Connection(socket: Socket) {
    console.log(`新的socket连接,连接参数: ${socket.remoteAddress}:${socket.remotePort}`);
    const timeOut = setTimeout(() => {
      console.log(socket.remoteAddress, '无消息,尝试发送注册信息');
      try {
        if (socket && !socket.destroyed && socket.writable) {
          socket.write(Buffer.from('+++AT+NREGEN=A,on\r', "utf-8"))
          socket.write(Buffer.from('+++AT+NREGDT=A,register&mac=%MAC&host=%HOST\r', "utf-8"))
        }
      } catch (error) {
        console.log(error);
      }
    }, 10000);
    // 配置socket参数
    socket
      // 监听第一个包是否是注册包'register&mac=98D863CC870D&jw=1111,3333'
      .once("data", async (data: Buffer) => {
        clearTimeout(timeOut)
        const registerArguments = new URLSearchParams(data.toString())
        //判断是否是注册包
        if (registerArguments.has('register') && registerArguments.has('mac')) {
          const IMEI = registerArguments.get('mac')!
          // 是注册包之后监听正常的数据
          // mac地址为后12位
          const maclen = IMEI.length;
          const mac = IMEI.slice(maclen - 12, maclen);
          const client = this.MacSocketMaps.get(mac)
          if (client) {
            client.reConnectSocket(socket)
          } else {
            // 使用proxy代理dtu对象
            const newClient = new Proxy(new Client(socket, mac, registerArguments), ProxyClient)
            this.MacSocketMaps.set(mac, newClient)
            console.log(`${new Date().toLocaleString()} ## ${mac}  上线,连接参数: ${socket.remoteAddress}:${socket.remotePort},Tcp Server连接数: ${await this.getConnections()}`);
          }
        } else {
          socket.end('please register DTU IMEI', () => {
            console.log(`###${socket.remoteAddress}:${socket.remotePort} 配置错误或非法连接,销毁连接,[${data.toString()}]`);
            socket.destroy();
          })
        }
      });
  }
  /**
   *  统计TCP连接数
   */
  getConnections() {
    return new Promise<number>((resolve) => {
      super.getConnections((err, nb) => {
        resolve(nb)
      })
    })
  }


  /**
   * 处理uartServer下发的查询和操作指令
   * @param EventType 指令类型
   * @param Query 指令内容
   */
  public Bus<T extends queryObjectServer | instructQuery | DTUoprate>(EventType: eventType, Query: T) {
    const client = this.MacSocketMaps.get(Query.DevMac)
    if (client) {
      Query.eventType = EventType
      client.saveCache(Query)
    }
  }
}
