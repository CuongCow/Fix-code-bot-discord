import app from "./app";
import { logger } from "./lib/logger";

const DEFAULT_PORT = 8080;
const envPort = process.env["PORT"];
const normalizedPort =
  envPort && envPort !== "undefined" && envPort !== "null"
    ? envPort
    : String(DEFAULT_PORT);
const port = Number(normalizedPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${envPort}"`);
}

if (normalizedPort !== envPort) {
  logger.warn(
    { fallbackPort: port, receivedPort: envPort },
    "PORT was not provided. Falling back to default port.",
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
