export default {
  ServerHost:
    process.env.NODE_ENV !== "production"
      ? "http://localhost:9010"
      : "http://116.62.48.175:9010",
  ServerApi:
    process.env.NODE_ENV !== "production"
      ? "http://localhost:9010/Api/Node"
      : "http://116.62.48.175:9010/Api/Node",
  ApiPath: {
    uart: "/UartData",
    runNode: "/RunData",
  },
  localhost: process.env.NODE_ENV !== "production" ? "0.0.0.0" : "116.62.48.175",
  localport: process.env.NODE_ENV !== "production" ? 9000 : 9000,
  timeOut: 1000 * 60 * 10,
  queryTimeOut: 1500
};
