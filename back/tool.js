const os = require("os")

module.exports = class tool {
    static NodeInfo() {
        let hostname = os.hostname()
        let totalmem = parseInt((os.totalmem()) / 1024 / 1024 / 1024)
        let freemem = parseInt((os.freemem() / os.totalmem()) * 100)
        let loadavg = os.loadavg()
        let networkInterfaces = os.networkInterfaces()
        let type = os.type()
        let uptime = parseInt((os.uptime()) / 60 / 60)
        let userInfo = os.userInfo()
        return {
            hostname,
            totalmem: totalmem + "GB",
            freemem: freemem + "%",
            loadavg,
            networkInterfaces,
            type,
            uptime: uptime + "h",
            userInfo,
        }
    }
}