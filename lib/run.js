const axios = require("axios");
const config = require("../config");
const os = require("os");

class run {
  constructor() {
    this.IntelSendUart = null;
  }
  IntelSendUartData(TcpServer, intelTime = 10000) {
    async function SendUart(data) {
      axios.post(config.ServerApi + "/UartData", {
        hostname: os.hostname(),
        data: await data.GetAllInfo()
      });
    }
    this.IntelSendUart = setInterval(() => SendUart(TcpServer), intelTime);
  }
  CloseIntelSendUartData() {
    clearInterval(this.IntelSendUart);
  }
};

module.exports = new run()