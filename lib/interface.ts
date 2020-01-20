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
  content: string;
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
