const config = require("../config");
const socketClient = require("socket.io-client");
const os = require("os");

class Socket {
  constructor() {
    this.io = socketClient(config.ServerHost);
    this.io.on("connect", () => this._register());
  }

  _register() {
    this.io.emit("register", {
      hostname: os.hostname(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      loadavg: os.loadavg(),
      networkInterfaces: os.networkInterfaces(),
      type: os.type(),
      uptime: os.uptime(),
      userInfo: os.userInfo()
    });
  }
}

module.exports = { Socket };
