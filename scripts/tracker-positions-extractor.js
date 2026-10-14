// Run in the browser console on a tracker.gg match page, after tracker-rounds-extractor.js,
// passing that output's `players` array: await extractPositions(players).
// The page must be on screen at desktop width: the Tracker only lays out the map markers then.
// For every event of every round it clicks the event in the log and reads the "Player Positions" map.
// Output: positions[round] = snapshots separated by spaces, one per event, in log order.
// Each snapshot lists 9 characters per marker: player index, x and y in thousandths of the minimap
// (Valorant-API displayIcon), facing in tens of degrees, or "--" for the player who just died.
window.extractPositions = async function extractPositions(players) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const leaf = (text) => [...document.querySelectorAll("*")].find((element) => element.children.length === 0 && element.textContent.trim() === text);
  const agentId = (src) => decodeURIComponent(src || "").match(/agents\/([0-9a-f-]{36})/)?.[1];
  const color = (element) => String(element?.className || "").match(/team-(Red|Blue)/)?.[1];
  const ids = players.map((line) => { const [, team, , agent] = line.split("|"); return `${agent}|${team}`; });
  for (let attempt = 0; attempt < 30 && !leaf("Rounds"); attempt++) await sleep(500);
  if (!leaf("Event Log")) { leaf("Rounds").click(); await sleep(2000); }
  const selectors = () => {
    const first = [...document.querySelectorAll("div.text-12")].find((element) => element.textContent.trim() === "1" && element.parentElement.className.includes("cursor-pointer"));
    return [...first.parentElement.parentElement.children].filter((child) => child.className.includes("cursor-pointer"));
  };
  const pad = (value, size) => String(Math.max(0, Math.min(10 ** size - 1, value))).padStart(size, "0");
  const markers = () => [...document.querySelectorAll(".vmr-map > div.absolute > div.absolute")];
  function snapshot() {
    const image = document.querySelector(".vmr-map img.vmr-map-image");
    return markers().map((marker) => {
      const icon = marker.querySelector("img");
      const index = ids.indexOf(`${agentId(icon?.src)}|${color(icon)}`);
      const x = Math.round((parseFloat(marker.style.left) + parseFloat(marker.style.width) / 2) / image.clientWidth * 1000);
      const y = Math.round((parseFloat(marker.style.top) + parseFloat(marker.style.height) / 2) / image.clientHeight * 1000);
      const arrow = marker.querySelector(".arrow-container");
      const radians = Number((arrow?.style.transform || "").match(/[-\d.]+/)?.[0]);
      const facing = arrow ? pad(((Math.round(radians * 180 / Math.PI / 10) % 36) + 36) % 36, 2) : "--";
      return { index, code: `${index}${pad(x, 3)}${pad(y, 3)}${facing}` };
    });
  }
  const positions = [], problems = [];
  for (let round = 0; round < selectors().length; round++) {
    selectors()[round].click();
    await sleep(600);
    const count = [...leaf("Event Log").parentElement.children].length - 1;
    const snapshots = [];
    for (let event = 0; event < count; event++) {
      [...leaf("Event Log").parentElement.children].slice(1)[event].click();
      await sleep(150);
      // Markers start at -12px and move once the Tracker has placed them.
      for (let wait = 0; wait < 30 && markers().some((marker) => parseFloat(marker.style.left) === -12); wait++) await sleep(100);
      const list = snapshot();
      if (list.some((marker) => marker.index < 0)) problems.push(`round ${round + 1} event ${event + 1}: unknown player`);
      if (list.some((marker) => marker.code.slice(1, 7) === "000000")) problems.push(`round ${round + 1} event ${event + 1}: marker not placed`);
      snapshots.push(list.map((marker) => marker.code).join(""));
    }
    positions.push(snapshots.join(" "));
  }
  return { positions, problems };
};
