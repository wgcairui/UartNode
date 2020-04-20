const isProd = process.env.NODE_ENV !== "production"
export default {
  ServerHost:
    isProd
      ? "http://116.62.48.175:9010"
      : "http://120.202.61.88:3000",
  ServerApi:
    isProd
      ? "http://116.62.48.175:9010/Api/Node"
      : "http://120.202.61.88:3000/Api/Node",
  ApiPath: {
    uart: "/UartData",
    runNode: "/RunData",
  },
  localhost: isProd ? "116.62.48.175" : "0.0.0.0",
  localport: isProd ? 9000 : 9000,
  timeOut: 1000 * 60 * 10,
  queryTimeOut: 1500
};
