const { LiveDataClient } = require("../live_data");

async function main() {
  const client = new LiveDataClient();
  await client.start();

client.onUpdate((data) => {
  if (data.symbolCode !== "XU100") {
    return;
  }

  console.log("XU100 geldi");
  console.log("Son fiyat:", data.last);
  console.log("===================================");
  console.log("Data details;", data)
});

  
}

main();
