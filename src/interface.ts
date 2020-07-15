import { Socket } from "net";
import { EventEmitter } from "events";
// apollo server result
export interface ApolloMongoResult {
  msg: string
  ok: number
  n: number
  nModified: number
  upserted: any
}
export interface registerConfig {
  clients: string;
  IP: string;
  Name: string;
  MaxConnections: number;
  Port: number;
}
export interface queryObject {
  mac: string;
  type: number;
  protocol: string,
  pid: number,
  timeStamp: number
  content: string,
  time: string
}
export interface queryObjectServer {
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
export interface queryOkUp extends queryObject {
  contents: IntructQueryResult[]
}
export interface IntructQueryResult {
  content: string
  buffer: Buffer | string;
  useTime: number
}
export interface socketNetInfo {
  ip: string;
  port: number;
  mac: string;
  jw: string;
}
export interface client extends socketNetInfo {
  socket: Socket;
  stat: boolean;
  event: EventEmitter;
}

export interface allSocketInfo {
  NodeName: string;
  Connections: number | Error;
  SocketMaps: socketNetInfo[];
}

export interface nodeInfo {
  hostname: string;
  totalmem: string;
  freemem: string;
  loadavg: number[];
  type: string;
  uptime: string;
  userInfo: any;
}

export enum QueryEmit {
  query,
  uartEmploy,
  uartEmpty,
  QueryOk,
}

export interface timelog {
  content: string,
  num: number
}

export interface instructQuery {
  DevMac: string
  pid: number
  type: number
  events: string
  content: string
  result?: Buffer | string
  Interval?: number
}