import os from "os";
interface nodeInfo {
  hostname: string;
  totalmem: string;
  freemem: string;
  loadavg: number[];
  networkInterfaces: any;
  type: string;
  uptime: string;
  userInfo: any;
}
export default class tool {
  static NodeInfo(): nodeInfo {
    let hostname: string = os.hostname();
    let totalmem: number = os.totalmem() / 1024 / 1024 / 1024;
    let freemem: number = (os.freemem() / os.totalmem()) * 100;
    let loadavg: number[] = os.loadavg();
    let networkInterfaces = os.networkInterfaces();
    let type: string = os.type();
    let uptime: number = os.uptime() / 60 / 60;
    let userInfo = os.userInfo();
    return {
      hostname,
      totalmem: totalmem + "GB",
      freemem: freemem + "%",
      loadavg,
      networkInterfaces,
      type,
      uptime: uptime + "h",
      userInfo,
    };
  }
}
