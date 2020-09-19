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
            .on("close", hrr => {
                console.log('socket close is ' + hrr);
                this._closeClient('close');
            })
            .on("error", (err) => {
                console.error({ msg: 'socket connect error', code: err.name, message: err.message, stack: err.stack });
                // this._closeClient('error');
            })
            .on("timeout", () => {
                console.log(`### timeout==${this.ip}:${this.port}`);
                this._closeClient('timeOut');
            })
            .on('data', (buffer: Buffer | string) => {
                if (!Buffer.isBuffer(buffer) && buffer === 'end') {
                    this.occcupy = false
                    // console.log({ mac: client.mac, msg: 'querySuccess', AT: client.CacheATInstruct, OPRATE: client.CacheOprateInstruct, QUERY: client.CacheQueryInstruct });
                    this.CheckClient()
                }
            })
    }

    // 重新连接之后重新绑定socket
    public setSocket(socket: Socket) {
        this.socket = this.setSocketOpt(socket)
        this.ip = socket.remoteAddress as string
        this.port = socket.remotePort as number
        this.readDtuArg().then(() => {
            console.info(`${new Date().toLocaleTimeString()} ## DTU恢复连接:Mac=${this.mac},Jw=${this.jw},Uart=${this.uart}`);
            this.Server.io.emit(config.EVENT_TCP.terminalOn, this.mac, true)
            // console.log({ msg: this.mac + '恢复连接', TickClose: this.TickClose, destroyed: this.socket.destroyed });
        })
    }

    // 销毁socket实例，并删除
    _closeClient(event: string) {
        console.error(`${new Date().toLocaleTimeString()} ## 设备断开:Mac${this.mac} close,event:${event}`);
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
                    // 设置等待超时,单条指令最长等待时间为5s
                    const QueryTimeOut = setTimeout(() => { this.socket.emit("data", 'timeOut') }, Query.Interval > 5000 ? 5000 : Query.Interval);
                    // 注册一次监听事件，监听超时或查询数据
                    this.socket.once('data', buffer => {
                        clearTimeout(QueryTimeOut);
                        resolve({ content, buffer, useTime: Date.now() - QueryStartTime });
                    })
                    // 构建查询字符串转换Buffer
                    const queryString = Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8");
                    // socket套接字写入Buffer
                    this.socket.write(queryString);
                });
                IntructQueryResults.push(QueryResult);
            }
            // 如果查询设备PID没有超时记录，发送end字符串,提示本次查询已结束
            // if (!this.timeOut.has(Query.pid)) this.socket.emit("data", 'end')
            // 统计
            Query.useBytes = this.socket.bytesRead + this.socket.bytesWritten - Bytes;
            Query.useTime = Date.now() - useTime;

            // 设备查询超时记录
            const QueryTimeOutList = this.timeOut
            // 如果结果集每条指令都超时则加入到超时记录
            if (IntructQueryResults.every((el) => !Buffer.isBuffer(el.buffer))) {
                let num = QueryTimeOutList.get(Query.pid) || 1
                QueryTimeOutList.set(Query.pid, num + 1);
                this.Server.io.emit(config.EVENT_TCP.terminalMountDevTimeOut, Query, num)
                // 超时次数=10次,硬重启DTU设备
                console.log(`###DTU ${Query.mac}/${Query.pid}/${Query.mountDev}/${Query.protocol} 查询指令超时 [${num}]次,pids:${Array.from(this.pids)}`);
                // 如果挂载的pid全部超时且次数大于10,执行设备重启指令
                if (num === 10 && !this.socket.destroyed && !this.TickClose && this.timeOut.size >= this.pids.size && Array.from(this.timeOut.values()).every(num => num > 10)) {
                    console.error(`###DTU ${Query.mac}/pids:${Array.from(this.pids)} 查询指令全部超时十次,硬重启,断开DTU连接`)
                    this._closeClient('QueryTimeOut');
                } else {
                    this.socket.emit("data", 'end')
                }
            } else {
                this.socket.emit("data", 'end')
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
                    // 发送end字符串,提示本次查询已结束
                    this.socket.emit("data", 'end')
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
                    // 发送end字符串,提示本次查询已结束
                    this.socket.emit("data", 'end')
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
            console.log({ TickClose: this.TickClose, socket_destroyed: this.socket.destroyed });
            // 销毁socket
            try {
                this.socket.removeAllListeners()
                this.QueryAT('Z')
                this.socket.destroy();
                if (this.socket.destroyed) {
                    this.CacheQueryInstruct = []
                    this.CacheOprateInstruct = []
                    this.CacheATInstruct = []
                    this.Server.getConnections((err, count) => {
                        console.log('Tcp Server连接数: ' + count);
                    });
                }
            } catch (error) {
                console.log({ msg: 'close socket', error });
            } finally {
                console.log(`发送DTU:${this.mac} 离线告警`);
                this.occcupy = false
                this.TickClose = false
                this.Server.io.emit(config.EVENT_TCP.terminalOff, this.mac, true)
            }
            return
        }
        if (this.CacheATInstruct.length > 0) {
            console.log(`${time}### DTU ${this.mac} 缓存有AT指令=${this.CacheATInstruct.length}`);
            this.ATInstruct(this.CacheATInstruct.shift() as DTUoprate)
            return
        }
        if (this.CacheOprateInstruct.length > 0) {
            console.log(`${time}### DTU ${this.mac} 缓存有Oprate指令=${this.CacheOprateInstruct.length}`);
            this.OprateInstruct(this.CacheOprateInstruct.shift() as instructQuery)
            return
        }
        if (this.CacheQueryInstruct.length > 0) {
            console.log(`${time}### DTU ${this.mac} 缓存有Query指令=${this.CacheQueryInstruct.length}`);
            this.QueryInstruct(this.CacheQueryInstruct.shift() as queryObjectServer)
            if (this.CacheQueryInstruct.length > 10) {
                console.log(`###DTU ${this.mac} 查询指令已堆积超过10条,清除缓存`);
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
                // 发送end字符串,提示本次查询已结束
                this.socket.emit("data", 'end')
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
}