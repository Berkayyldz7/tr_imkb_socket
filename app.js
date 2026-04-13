const { LiveDataClient } = require("./live_data");

async function main() {
  const client = new LiveDataClient();

  await client.start();
  console.log("Live data connected.");

  client.onUpdate((data) => {
    console.log(`[${data.marketType}] ${data.symbolCode}:`, data.last);
  });

  setInterval(() => {
    console.log("XU100 latest:", client.getLatestPrice("XU100"));
    console.log("XU100 dayClose:", client.getLatestDayClose("XU100"));
    console.log("F_XU0300426 latest:", client.getLatestPrice("F_XU0300426"));
    console.log("F_XU0300426 dayClose:", client.getLatestDayClose("F_XU0300426"));
  }, 5000);
}

main().catch((error) => {
  console.error("Application error:", error.message);
  process.exit(1);
});
