import { Socket } from "net";
import { EventEmitter } from "events";

interface Query {
  DevMac: string
  events: string
  eventType: string
  content: string | string[]
  result?: string
  listener: (buffer: Buffer) => void
}
// apollo server result
interface ApolloMongoResult {
  msg: string
  ok: number
  n: number
  nModified: number
  upserted: any
}
interface registerConfig {
  clients: string;
  IP: string;
  Name: string;
  MaxConnections: number;
  Port: number;
}
interface queryObject {
  mac: string;
  type: number;
  protocol: string,
  pid: number,
  timeStamp: number
  content: string,
  time: string
}
interface queryObjectServer extends Query {
  mac: string;
  type: number;
  mountDev: string
  protocol: string,
  pid: number,
  timeStamp: number
  content: string[],
  time: string
  Interval: number
  useTime: number
  useBytes: number
}
interface queryOkUp extends queryObject {
  contents: IntructQueryResult[]
}
interface IntructQueryResult {
  content: string
  buffer: Buffer | string;
  useTime: number
}
interface socketNetInfo {
  ip: string;
  port: number;
  mac: string;
  jw: string;
  uart: string
}
interface client extends socketNetInfo {
  socket: Socket;
  stat: boolean;
  event: EventEmitter;
}

interface allSocketInfo {
  NodeName: string;
  Connections: number | Error;
  SocketMaps: socketNetInfo[];
}

interface nodeInfo {
  hostname: string;
  totalmem: string;
  freemem: string;
  loadavg: number[];
  type: string;
  uptime: string;
  userInfo: any;
}


interface timelog {
  content: string,
  num: number
}

interface instructQuery extends Query {
  pid: number
  type: number
  Interval?: number
}
type AT = 'Z' | 'VER' | 'UART=1' | 'LOCATE=1' | 'IMEI' | 'ICCID' | 'IMSI'
// 操作指令请求对象
interface DTUoprate extends Query { }