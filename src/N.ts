import net, { Socket } from "net";
import { EventEmitter } from "events";
import config from "../config";
import { client, queryObjectServer, queryOkUp, instructQuery, registerConfig, IntructQueryResult, ApolloMongoResult, DTUoprate, AT } from "uart";

export default class TcpServer extends net.Server {
    private host: string;
    private port: number;
    // 缓存mac->client
    MacSocketMaps: Map<string, client>;
    // 缓存mac
    public MacSet: Set<string>;
    //事件总线
    Event: EventEmitter;
    // 请求成功的结果集
    public QueryColletion: queryOkUp[];
    // 请求超时设备Set=>mac+pid =>num
    public QueryTimeOutList: Map<string, number>;
    // 缓存查询对象数组:instruct=>query
    private CacheQueryInstruct: Map<string, queryObjectServer[]>;
    // 操作指令缓存 DevMac => instructQuery
    private CacheOprateInstruct: Map<string, instructQuery[]>;
    // AT指令缓存
    private CacheATInstruct: Map<string, DTUoprate[]>
    // 使用DTU Set
    private UseDTUs: Set<string>
    // tick
    private WaitQuery: Map<string, queryObjectServer | instructQuery | DTUoprate>

    //
    private configs: registerConfig;
    //
    constructor(configs: registerConfig) {
        super();
        this.configs = configs;
        // net.Server 运行参数配置
        this.setMaxListeners(configs.MaxConnections);
        this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
        this.port = configs.Port || config.localport; //监听端口
        // this.SocketMaps = new Map();
        this.MacSocketMaps = new Map();
        this.MacSet = new Set();
        this.QueryColletion = [];
        this.QueryTimeOutList = new Map();
        //
        this.CacheATInstruct = new Map()
        this.CacheOprateInstruct = new Map()
        this.CacheQueryInstruct = new Map()
        // 在用设备列表
        this.UseDTUs = new Set()
        // tick
        this.WaitQuery = new Map()
        // 事件总线
        this.Event = new EventEmitter();
    }

    start() {
        // webSocketServer start
        this.on("connection", this._Connection)
            .on("error", (err) => console.log("Server error: %s.", err))
            .listen(this.port, this.host, () => {
                const ad = this.address() as net.AddressInfo;
                console.log(`### WebSocketServer listening: ${this.configs.IP}:${ad.port}`);
            });
    }

    private _Connection(socket: Socket) {
        //构建客户端
        const client: client = {
            socket,
            ip: socket.remoteAddress as string,
            port: socket.remotePort as number,
            mac: "",
            jw: "",
            stat: false,
            event: new EventEmitter(),
            uart: ''
        };
        console.log(
            `${new Date().toLocaleString()} ## DTU连接,连接参数: ${client.ip}:${client.port}`,
        );
        // 配置socket参数
        client.socket
            // 设置socket连接超时
            .setTimeout(config.timeOut)
            // socket保持长连接
            .setKeepAlive(true, 100000)
            // 关闭Nagle算法,优化性能,打开则优化网络,default:false
            .setNoDelay(true)
            // 配置socket监听
            .on("close", () => {
                this._closeClient(client, 'close');
            })
            .on("error", (err) => {
                console.error(err);
                // this._closeClient(client, 'error');
            })
            .on("timeout", () => {
                console.log(`### timeout==${client.ip}:${client.port}`);
                this._closeClient(client, 'timeOut');
            })
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
                    client.socket.on("data", (buffer: Buffer) => {
                        this.Event.emit('recevicData', { client, buffer })
                    });
                    // mac地址为后12位
                    const maclen = registerObject.mac.length;
                    client.mac = registerObject.mac.slice(maclen - 12, maclen);
                    client.jw = registerObject.hasOwnProperty("jw") && /[1-9]/.test(registerObject['jw']) ? registerObject.jw : "";
                    console.info(`${new Date().toLocaleTimeString()} ## DTU注册:Mac=${client.mac},Jw=${client.jw},Uart=${client.uart}`);
                    // 添加缓存
                    this.MacSet.add(client.mac);
                    this.MacSocketMaps.set(client.mac, client);
                    // 触发新设备上线
                    this.Event.emit(config.EVENT_TCP.terminalOn, client);
                } else {
                    // 如果第一个包不是注册包则销毁链接,等待重新连接
                    console.log(`###${client.ip}:${client.port} 配置错误或非法连接,销毁连接,[${r}]`);
                    client.socket.destroy();
                }
            });
    }

    // 销毁socket实例，并删除
    private _closeClient(client: client, event: string) {
        // 错误和断开连接可能会触发两次事件,判断缓存是否被清除,是的话跳出操作
        if (!client || !this.MacSocketMaps.has(client.mac)) return;
        console.error(`${new Date().toLocaleTimeString()} ## 设备断开:Mac${client.mac} close,event:${event}`);
        // 设备下线
        this.Event.emit(config.EVENT_TCP.terminalOff, client, client.socket.bytesRead + client.socket.bytesWritten,);
        // 销毁socket
        client.socket.destroy();
        // 销毁缓存
        this.MacSet.delete(client.mac);
        // this.SocketMaps.delete(client.port);
        this.MacSocketMaps.delete(client.mac);
    }

    // 创建事件
    public Bus(EventType: 'QueryInstruct' | 'OprateInstruct' | 'ATInstruct', Query: queryObjectServer | instructQuery | DTUoprate, listener: (buffer: Buffer) => void) {

        Query.eventType = EventType
        Query.listener = listener
        const { DevMac } = Query
        switch (EventType) {
            case 'ATInstruct':
                const CacheATInstruct = this.CacheATInstruct.get(DevMac)
                if (CacheATInstruct) {
                    CacheATInstruct.push(Query as DTUoprate)
                } else {
                    this.CacheATInstruct.set(DevMac, [Query as DTUoprate])
                }
                break
            case 'OprateInstruct':
                const CacheOprateInstruct = this.CacheOprateInstruct.get(DevMac)
                if (CacheOprateInstruct) {
                    CacheOprateInstruct.push(Query as instructQuery)
                } else {
                    this.CacheOprateInstruct.set(DevMac, [Query as instructQuery])
                }
                break
            case "QueryInstruct":
                const Querys = (<queryObjectServer>Query).content.map(el => Object.assign(Query, { content: el }))
                const CacheQueryInstruct = this.CacheQueryInstruct.get(DevMac)
                if (CacheQueryInstruct) {
                    CacheQueryInstruct.push(...Querys as queryObjectServer[])
                } else {
                    this.CacheQueryInstruct.set(DevMac, Querys as queryObjectServer[])
                }
                break
        }

    }

    // 事件循环
    private EventsBus() {
        const UseDTUs = this.UseDTUs
        this.Event.on('recevicData', (client: client, buffer: Buffer) => {
            const Query = this.WaitQuery.get(client.mac)
            if (Query) {
                Query.listener(buffer)
            }
            UseDTUs.delete(client.mac)
        })
        //

        while (true) {
            // 遍历AT指令
            {
                this.CacheATInstruct.forEach((Querys, key) => {
                    if (UseDTUs.has(key) && Querys.length > 0) {
                        UseDTUs.add(key)
                        this.ATInstruct(Querys.shift() as DTUoprate)
                    }
                })
            }
            // 遍历操作指令
            {
                this.CacheOprateInstruct.forEach((Querys, key) => {
                    if (UseDTUs.has(key) && Querys.length > 0) {
                        UseDTUs.add(key)
                        this.OprateInstruct(Querys.shift() as instructQuery)
                    }
                })
            }
            // 遍历查询指令
            {
                this.CacheQueryInstruct.forEach((Querys, key) => {
                    if (UseDTUs.has(key) && Querys.length > 0) {
                        UseDTUs.add(key)
                        this.QueryInstruct(Querys.shift() as queryObjectServer)
                    }
                })
            }
        }
    }

    // 指令查询
    private QueryInstruct(Query: queryObjectServer) {

    }

    // 指令操作
    private OprateInstruct(Query: instructQuery) {

    }

    // AT指令
    private ATInstruct(Query: DTUoprate) {

    }
}
