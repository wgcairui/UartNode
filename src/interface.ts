import { Socket } from "net";
import { EventEmitter } from "events";

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
  stat: string
  buffer: Buffer | string,
  time: Date
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

export interface queryOkUp extends queryObject {
  stat: string;
  buffer: Buffer | string;
  time: Date;
}

export interface nodeInfo {
  hostname: string;
  totalmem: string;
  freemem: string;
  loadavg: number[];
  networkInterfaces: any;
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