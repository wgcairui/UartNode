import os from "os";
import { nodeInfo } from "./interface";

export default class tool {
  static NodeInfo(): nodeInfo {
    const hostname: string = os.hostname();
    const totalmem: number = os.totalmem() / 1024 / 1024 / 1024;
    const freemem: number = (os.freemem() / os.totalmem()) * 100;
    const loadavg: number[] = os.loadavg();
    const type: string = os.type();
    const uptime: number = os.uptime() / 60 / 60;
    const userInfo = os.userInfo();
    
    return {
      hostname,
      totalmem: totalmem.toFixed(1) + "GB",
      freemem: freemem.toFixed(1) + "%",
      loadavg:loadavg.map(el=>parseFloat(el.toFixed(1))),
      type,
      uptime: uptime.toFixed(0) + "h",
      userInfo,
    };
  }
}
