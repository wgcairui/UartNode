import { Socket } from "net";
import { queryObjectServer, instructQuery, DTUoprate, IntructQueryResult, AT } from "uart";
import config from "../config";
import TcpServer from "./TcpServer";

export default class Client {
    ip: string;
    port: number;
    readonly mac: string;
    jw: string;
    uart: string
    AT: boolean
    ICCID: string;
    socket: Socket;
    // 查询指令缓存列表
    private CacheQueryInstruct: queryObjectServer[];
    // 操作指令缓存列表
    private CacheOprateInstruct: instructQuery[];
    // AT指令缓存列表
    private CacheATInstruct: DTUoprate[]
    // 设备超时列表
    private timeOut: Map<number, number>
    // 是否断开连接
    private TickClose: boolean
    // 查询pid列表
    private pids: Set<number>
    // DTU占用状态
    private occcupy: boolean
    // 主动重启状态
    private reboot: boolean
    private readonly Server: TcpServer;

    //
    constructor(socket: Socket, Server: TcpServer, opt: { mac: string, jw: string }) {
        this.socket = this.setSocketOpt(socket)
        this.Server = Server
        this.ip = <string>socket.remoteAddress
        this.port = <number>socket.remotePort
        this.mac = opt.mac
        this.jw = opt.jw
        this.uart = ''
        this.ICCID = ''
        this.AT = false
        this.CacheATInstruct = []
        this.CacheOprateInstruct = []
        this.CacheQueryInstruct = []
        this.timeOut = new Map()
        this.TickClose = false
        this.pids = new Set()
        this.occcupy = false
        this.reboot = false

        this.readDtuArg().then(() => {
            console.info(`${new Date().toLocaleTimeString()} ## DTU注册:Mac=${this.mac},Jw=${this.jw},Uart=${this.uart}`);
            // 添加缓存
            this.Server.MacSocketMaps.set(this.mac, this);
            // 触发新设备上线
            this.Server.io.emit(config.EVENT_TCP.terminalOn, this.mac, false)
        })
    }

    // 读取DTU参数
    private async readDtuArg() {
        const { AT, msg } = await this.QueryAT('UART=1')
        this.AT = AT
        this.uart = AT ? msg : 'noData'
        if (this.AT) {
            this.ICCID = (await this.QueryAT('ICCID')).msg
        }
    }

    // 设置socket
    private setSocketOpt(socket: Socket) {
        return socket
            // 设置socket连接超时
            .setTimeout(config.timeOut)
            // socket保持长连接
            .setKeepAlive(true, 100000)
            // 关闭Nagle算法,优化性能,打开则优化网络,default:false
            .setNoDelay(true)
            // 配置socket监听
            .on("close", async hrr => {
                console.log(`${new Date().toLocaleTimeString()} ##DTU:${this.mac} socket close is ${hrr ? '传输错误' : '传输无误'},destroyed Stat: ${this.socket.destroyed}`);
                if (this.socket.destroyed) {
                    console.log(`${new Date().toLocaleTimeString()} ##DTU:${this.mac} socket is destroy,clean socket cacheData...`);
                    this.CacheQueryInstruct = []
                    this.CacheOprateInstruct = []
                    this.CacheATInstruct = []
                }
                console.log(`${new Date().toLocaleTimeString()} ##发送DTU:${this.mac} 离线告警,Tcp Server连接数: ${await this.Server.getConnections()}`);
                this.occcupy = false
                this.TickClose = false
                this.Server.io.emit(config.EVENT_TCP.terminalOff, this.mac, true)
                this.socket.removeAllListeners()
                // this._closeClient('close');
            })
            .on("error", (err) => {
                console.error({ type: 'socket connect error', time: new Date().toLocaleString(), code: err.name, message: err.message, stack: err.stack });
                // this._closeClient('error');
            })
            .on("timeout", () => {
                console.log(`### timeout==${this.ip}:${this.port}::${this.mac}`);
                this._closeClient('timeOut');
            })
            .on('success', (event: 'Query' | 'Oprate' | 'AT', Query: queryObjectServer | instructQuery | DTUoprate) => {
                // console.log({ success: 'success', event, Query })
                this.occcupy = false
                this.CheckClient()
            })
    }

    // 重新连接之后重新绑定socket
    public setSocket(socket: Socket) {
        // 记录socket状态，如果还没有被销毁而重新连接则可能是dtu不稳定，不发生设备恢复上线事件
        const socket_destroyed = this.socket.destroyed
        this.socket = this.setSocketOpt(socket)
        this.ip = socket.remoteAddress as string
        this.port = socket.remotePort as number
        this.readDtuArg().then(() => {
            console.info(`${new Date().toLocaleString()} ## DTU恢复连接,模式:${this.reboot ? '主动断开' : '被动断开'}，设备${socket_destroyed ? '正常' : '未销毁'}重连,##Mac=${this.mac},Jw=${this.jw},Uart=${this.uart}`);
            // 检测状态是否是主动断开，是的话先等待2分钟再发生上线事件
            if (this.reboot) {
                this.reboot = false
                this.occcupy = true
                setTimeout(() => {
                    this.occcupy = false
                    this.Server.io.emit(config.EVENT_TCP.terminalOn, this.mac, false)
                }, 1000 * 60 * 2);
            } else {
                if (socket_destroyed) this.Server.io.emit(config.EVENT_TCP.terminalOn, this.mac, true)
            }

        })
    }

    // 销毁socket实例，并删除
    _closeClient(event: string) {
        console.log(`${new Date().toLocaleTimeString()} ## 设备断开:Mac${this.mac} close,event:${event}`);
        // 设备下线
        this.TickClose = true
        this.CheckClient()
    }


    // 指令查询
    async QueryInstruct(Query: queryObjectServer) {
        if (this.occcupy) {
            this.CacheQueryInstruct.push(Query)
        } else {
            this.occcupy = true
            this.pids.add(Query.pid)
            // 记录socket.bytes
            const Bytes = this.socket.bytesRead + this.socket.bytesWritten;
            // 记录useTime
            const useTime = Date.now();
            // 存储结果集
            const IntructQueryResults = [] as IntructQueryResult[];
            // 便利设备的每条指令,阻塞终端,依次查询
            for (let content of Query.content) {
                const QueryResult = await new Promise<IntructQueryResult>((resolve) => {
                    // 指令查询操作开始时间
                    const QueryStartTime = Date.now();
                    // 设置等待超时,单条指令最长等待时间为5s,
                    const QueryTimeOut = setTimeout(() => this.socket.emit("data", 'timeOut'), 10000);
                    // 注册一次监听事件，监听超时或查询数据
                    this.socket.once('data', buffer => {
                        clearTimeout(QueryTimeOut);
                        resolve({ content, buffer, useTime: Date.now() - QueryStartTime });
                    })
                    // 构建查询字符串转换Buffer
                    const queryString = Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8");
                    // 判断socket流是否安全， socket套接字写入Buffer
                    if (this.socket.writable) this.socket.write(queryString)
                    else {
                        console.log(`DTU:${this.mac} 流已经被销毁，写入失败，触发err`);
                        this.socket.emit("data", 'stream err')
                    }
                });
                IntructQueryResults.push(QueryResult);
            }
            // 统计
            Query.useBytes = this.socket.bytesRead + this.socket.bytesWritten - Bytes;
            Query.useTime = Date.now() - useTime;

            // 设备查询超时记录
            const QueryTimeOutList = this.timeOut
            // 如果结果集每条指令都超时则加入到超时记录
            if (IntructQueryResults.every((el) => !Buffer.isBuffer(el.buffer))) {
                const num = QueryTimeOutList.get(Query.pid) || 1
                // 上传查询超时事件
                this.Server.io.emit(config.EVENT_TCP.terminalMountDevTimeOut, Query, num)
                // 超时次数=10次,硬重启DTU设备
                console.log(`${new Date().toLocaleString()}###DTU ${Query.mac}/${Query.pid}/${Query.mountDev}/${Query.protocol} 查询指令超时 [${num}]次,pids:${Array.from(this.pids)},interval:${Query.Interval}`);
                // 如果挂载的pid全部超时且次数大于10,执行设备重启指令
                if (num === 10 && !this.socket.destroyed && !this.TickClose && this.timeOut.size >= this.pids.size && Array.from(this.timeOut.values()).every(num => num >= 10)) {
                    console.log(`###DTU ${Query.mac}/pids:${Array.from(this.pids)} 查询指令全部超时十次,硬重启,断开DTU连接`)
                    this._closeClient('QueryTimeOut');
                } else {
                    this.instructSuccess('Query', Query)
                }
                QueryTimeOutList.set(Query.pid, num + 1);
            } else {
                this.instructSuccess('Query', Query)
                // 如果有超时记录,删除超时记录，触发data
                if (this.timeOut.has(Query.pid)) this.timeOut.delete(Query.pid)
                Query.listener({ Query, IntructQueryResults })
            }
        }
    }

    // 指令操作
    async OprateInstruct(Query: instructQuery) {
        if (this.occcupy) {
            this.CacheOprateInstruct.push(Query)
        } else {
            this.occcupy = true
            const buffer = await new Promise<Buffer | string>((resolve) => {
                const QueryTimeOut = setTimeout(() => { this.socket.emit("data", 'timeOut') }, 10000);
                // 注册一次监听事件，监听超时或查询数据
                this.socket.once('data', buffer => {
                    this.instructSuccess('Oprate', Query)
                    clearTimeout(QueryTimeOut);
                    resolve(buffer);
                })
                // 构建查询字符串转换Buffer
                const queryString = Query.type === 485 ? Buffer.from(Query.content as string, "hex") : Buffer.from(Query.content as string + "\r", "utf-8");
                // socket套接字写入Buffer
                this.socket.write(queryString);
            });
            Query.listener(buffer)
        }
    }

    // AT指令
    async ATInstruct(Query: DTUoprate) {
        if (this.occcupy) {
            this.CacheATInstruct.push(Query)
        } else {
            this.occcupy = true
            const buffer = await new Promise<string | Buffer>((resolve) => {
                const QueryTimeOut = setTimeout(() => { this.socket.emit("data", 'timeOut') }, 10000);
                // 注册一次监听事件，监听超时或查询数据
                this.socket.once('data', buffer => {
                    this.instructSuccess('DTU', Query)
                    clearTimeout(QueryTimeOut);
                    resolve(buffer);
                })
                this.socket.write(Buffer.from(Query.content + "\r", "utf-8"));
            });
            console.log({ Query, buffer });
            Query.listener(buffer)
        }
    }

    // 当DTU空闲,检查DTU client下面的缓存是否有指令,有的话执行一个
    private CheckClient() {
        const time = new Date().toLocaleString()
        // 如果TickClose为true,关闭连接
        if (this.TickClose && this.socket && !this.socket.destroyed) {
            // console.log({ TickClose: this.TickClose, socket_destroyed: this.socket.destroyed });
            // 销毁socket所有事件
            //this.socket.removeAllListeners()
            this.socket.removeListener("data", () => { })
            // 尝试设备硬重启
            this.QueryAT('Z')
            this.reboot = true
            // 终止socket stream流
            this.socket.end(() => {
                // 销毁socket实例
                this.socket.destroy();
                console.log({
                    type: `销毁：${this.mac} socket,`,
                    time: new Date().toLocaleString(),
                    listens: this.socket.getMaxListeners(),
                    destroy: this.socket.destroyed
                });


            })
            return
        }
        if (this.CacheATInstruct.length > 0) {
            // console.log(`${time}### DTU ${this.mac} 缓存有AT指令=${this.CacheATInstruct.length}`);
            this.ATInstruct(this.CacheATInstruct.shift() as DTUoprate)
            return
        }
        if (this.CacheOprateInstruct.length > 0) {
            // console.log(`${time}### DTU ${this.mac} 缓存有Oprate指令=${this.CacheOprateInstruct.length}`);
            this.OprateInstruct(this.CacheOprateInstruct.shift() as instructQuery)
            return
        }
        if (this.CacheQueryInstruct.length > 0) {
            // console.log(`${time}### DTU ${this.mac} 缓存有Query指令=${this.CacheQueryInstruct.length}`);
            this.QueryInstruct(this.CacheQueryInstruct.shift() as queryObjectServer)
            if (this.CacheQueryInstruct.length > 10) {
                // console.log(`###DTU ${this.mac} 查询指令已堆积超过10条,清除缓存`);
                this.CacheQueryInstruct = []
            }
            return
        }
    }

    // 查询AT指令
    private async QueryAT(at: AT) {
        this.occcupy = true
        return await new Promise<{ AT: boolean, msg: string }>((resolve) => {
            const QueryTimeOut = setTimeout(() => { this.socket.emit("data", 'timeOut') }, 1000);
            this.socket.once('data', (buffer: Buffer | string) => {
                clearTimeout(QueryTimeOut);
                this.instructSuccess('AT', at)
                const result = { AT: false, msg: 'timeOut' }
                if (Buffer.isBuffer(buffer)) {
                    const str = buffer.toString('utf8')
                    result.AT = /(^\+ok)/.test(str)
                    result.msg = str.replace(/(^\+ok)/, '').replace(/^\=/, '').replace(/^[0-9]\,/, '')
                }
                resolve(result);
            })
            this.socket.write(Buffer.from('+++AT+' + at + "\r", "utf-8"));
        })
    }

    // 发送无用的数据
    public async TestLink() {
        if (!this.occcupy && !this.socket.destroyed) {
            await this.QueryAT("VER")
        }
    }

    // 发送查询完成事件
    private instructSuccess(event: 'Query' | 'Oprate' | 'DTU' | 'AT', Query: queryObjectServer | instructQuery | DTUoprate | AT) {
        this.socket.emit('success', event, Query)
    }
}