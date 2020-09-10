import net, { Socket } from "net";
import config from "../config";
import { queryObjectServer, instructQuery, registerConfig, DTUoprate, eventType } from "uart";
import Client from "./client";
//18056371098

export default class TcpServer extends net.Server {
  private host: string;
  private port: number;
  // 缓存mac->client
  MacSocketMaps: Map<string, Client>;
  //
  private configs: registerConfig;
  io: SocketIOClient.Socket;
  //
  constructor(configs: registerConfig, io: SocketIOClient.Socket) {
    super();
    this.configs = configs;
    this.io = io
    // net.Server 运行参数配置
    this.setMaxListeners(this.configs.MaxConnections);
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = configs.Port || config.localport; //监听端口
    this.MacSocketMaps = new Map();
    this.on("connection", this._Connection)
      .on("error", (err) => console.log("Server error: %s.", err))
      .listen(this.port, this.host, () => {
        const ad = this.address() as net.AddressInfo;
        console.log(`### WebSocketServer listening: ${this.configs.IP}:${ad.port}`);
      });
  }

  private _Connection(socket: Socket) {
    this.getConnections((err, count) => {
      console.log('Tcp Server连接数: ' + count);
    });
    console.log(
      `${new Date().toLocaleString()} ## DTU连接,连接参数: ${socket.remoteAddress}:${socket.remotePort}`,
    );
    // 配置socket参数
    socket
      // 监听第一个包是否是注册包
      .once("data", async (data) => {
        //判断是否是注册包
        const r = data.toString(); //'register&mac=98D863CC870D&jw=1111,3333'
        if (/^register&mac=/.test(r)) {
          const registerObjectArray = r
            .replace(/^register\&/, "")
            .split("&")
            .map((el) => {
              const [key, val] = el.split("=");
              return { [key]: val };
            });
          const registerObject = Object.assign({}, ...registerObjectArray) as { [x in string]: string; };
          // 是注册包之后监听正常的数据
          // mac地址为后12位
          const maclen = registerObject.mac.length;
          const mac = registerObject.mac.slice(maclen - 12, maclen);
          const jw = registerObject.hasOwnProperty("jw") && /[1-9]/.test(registerObject['jw']) ? registerObject.jw : "";
          if (this.MacSocketMaps.has(mac)) {
            (<Client>this.MacSocketMaps.get(mac)).setSocket(socket)
          } else {
            this.MacSocketMaps.set(mac, new Client(socket, this, { mac, jw }))
          }
        } else {
          // 如果第一个包不是注册包则销毁链接,等待重新连接
          console.log(`###${socket.remoteAddress}:${socket.remotePort} 配置错误或非法连接,销毁连接,[${r}]`);
          socket.destroy();
        }
      });
  }


  // 创建事件
  public Bus<T extends queryObjectServer | instructQuery | DTUoprate>(EventType: eventType, Query: T, listener: (buffer: Buffer | any) => void) {
    const { DevMac } = Query
    const client = this.MacSocketMaps.get(DevMac)
    if (client && !client.socket.destroyed) {
      Query.eventType = EventType
      Query.listener = listener
      switch (Query.eventType) {
        case 'ATInstruct':
          client.ATInstruct(Query)
          break
        case 'OprateInstruct':
          client.OprateInstruct(Query as instructQuery)
          break
        case "QueryInstruct":
          client.QueryInstruct(<queryObjectServer>Query)
          break
      }
    } else {
      console.log(`###DTU ${DevMac}未上线或socket已销毁，查询被抛弃`);
    }
  }
}
