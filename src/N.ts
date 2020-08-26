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
    // 使用DTU Set
    private UseDTUs: Set<string>
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
        // 在用设备列表
        this.UseDTUs = new Set()
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
            uart: '',
            CacheATInstruct: [],
            CacheOprateInstruct: [],
            CacheQueryInstruct: []
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
                    client.socket.on('data', (buffer: Buffer | string) => {
                        console.log({ type: 'allData', buffer });
                        if (!Buffer.isBuffer(buffer) && buffer === 'end') {
                            //console.log({type:'allData',buffer});

                        }
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
        const client = this.MacSocketMaps.get(DevMac) as client
        switch (EventType) {
            case 'ATInstruct':
                if (this.UseDTUs.has(DevMac)) {
                    client.CacheATInstruct.push(Query)
                } else {
                    this.QueryInstruct(Query as queryObjectServer)
                }
                break
            case 'OprateInstruct':
                if (this.UseDTUs.has(DevMac)) {
                    client.CacheOprateInstruct.push(<instructQuery>Query)
                } else {

                }
                break
            case "QueryInstruct":
                if (this.UseDTUs.has(DevMac)) {
                    client.CacheQueryInstruct.push(<queryObjectServer>Query)
                } else {

                }
                break
        }

    }

    // 指令查询
    private async QueryInstruct(Query: queryObjectServer) {
        const client = this.MacSocketMaps.get(Query.DevMac) as client
        client.WaitQuery = Query
        // 记录socket.bytes
        const Bytes = client.socket.bytesRead + client.socket.bytesWritten;
        // 记录useTime
        const useTime = Date.now();
        // 存储结果集
        const IntructQueryResults = [] as IntructQueryResult[];
        // 便利设备的每条指令,阻塞终端,依次查询
        for (let content of Query.content) {
            const QueryResult = await new Promise<IntructQueryResult>((resolve) => {
                // 指令查询操作开始时间
                const QueryStartTime = Date.now();
                // 设置等待超时
                const QueryTimeOut = setTimeout(() => { client.socket.emit("data", 'timeOut') }, Query.Interval);
                // 注册一次监听事件，监听超时或查询数据
                client.socket.once('data', buffer => {
                    clearTimeout(QueryTimeOut);
                    resolve({ content, buffer, useTime: Date.now() - QueryStartTime });
                })
                // 构建查询字符串转换Buffer
                const queryString = Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8");
                // socket套接字写入Buffer
                client.socket.write(queryString);
            });
            IntructQueryResults.push(QueryResult);
        }
        Query.useBytes = client.socket.bytesRead + client.socket.bytesWritten - Bytes;
        Query.useTime = Date.now() - useTime;

        console.log(Query, IntructQueryResults);
        client.socket.emit("data", 'end')
    }

    // 指令操作
    private OprateInstruct(Query: instructQuery) {
        const client = this.MacSocketMaps.get(Query.DevMac) as client
        client.WaitQuery = Query

    }

    // AT指令
    private ATInstruct(Query: DTUoprate) {
        const client = this.MacSocketMaps.get(Query.DevMac) as client
        client.WaitQuery = Query

    }

    /* // 
    private static DTUQuery(client:client,Query: | instructQuery | DTUoprate|queryObjectServer ){
        return new Promise<Buffer|string>((resolve)=>{
            client.socket.once('data',buffer=>{
                setTimeout(() => {
                    client.socket.emit("data",'timeOut')
                }, Query?.Interval || );
                resolve(buffer)
            })
        })
    } */
}
