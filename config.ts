export default {
  ServerHost:
    process.env.NODE_ENV !== "production"
      ? "http://localhost:3000/Node"
      : "http://116.62.48.175:9010/Node",
  ServerApi:
    process.env.NODE_ENV !== "production"
      ? "http://localhost:3000/Api/Node"
      : "http://116.62.48.175:9010/Api/Node",
  localhost: process.env.NODE_ENV !== "production" ? "0.0.0.0" : "116.62.48.175",
  localport: process.env.NODE_ENV !== "production" ? 9000 : 9000,
  timeOut: 1000 * 60 * 10,
};
