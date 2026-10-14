// Run in the browser console on a tracker.gg match page (any tab).
// Opens the Rounds tab, visits every round and reads the visible scoreboard and event log.
// Output (compact, see data/tracker-rounds/*.json):
//   players: "name|team|agent|agentUuid" (Red = Team A, Blue = Team B)
//   rounds:  "<A|B> <outcome>|<loadout>/<bank> x10|<events>"
//   events:  K<sec>.<killer>.<victim>.<weapon uuid prefix | ab = ability>, P<sec>.<planter>, D<sec>.<defuser>,
//            X<sec>.<planter> (spike exploded), S<sec>.<victim> (killed by the spike blast)
// Kills and deaths rebuilt from the log are checked against each round's scoreboard.
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const num = (text) => Number(String(text ?? "").trim().replace(/,/g, ""));
  const agentId = (src) => decodeURIComponent(src || "").match(/agents\/([0-9a-f-]{36})/)?.[1];
  const color = (element) => String(element?.className || "").match(/team-(Red|Blue)/)?.[1];
  const leaf = (text) => [...document.querySelectorAll("*")].find((element) => element.children.length === 0 && element.textContent.trim() === text);
  const seconds = (time) => { const [minutes, secs] = (time || "0:0").split(":").map(Number); return minutes * 60 + secs; };

  for (let attempt = 0; attempt < 20 && !leaf("Rounds"); attempt++) await sleep(500);
  leaf("Rounds").click();
  await sleep(1500);
  const selectors = () => {
    const first = [...document.querySelectorAll("div.text-12")].find((element) => element.textContent.trim() === "1" && element.parentElement.className.includes("cursor-pointer"));
    return [...first.parentElement.parentElement.children].filter((child) => child.className.includes("cursor-pointer"));
  };

  function read() {
    const title = [...document.querySelectorAll("div.border-r")].find((element) => /^Round\s*\d+$/.test(element.textContent.trim()));
    const result = title.parentElement.textContent.replace(title.textContent, "").trim().replace(/\s+/g, " ");
    const players = [...document.querySelectorAll(".st-valorant-team")].flatMap((table) => [...table.querySelectorAll(".st-content__item")].map((row) => {
      const cells = [...row.querySelectorAll(".st-content__item-value")];
      const value = (index) => num(cells[index].querySelector(".value")?.textContent);
      return { team: color(table), name: row.querySelector(".trn-ign__username")?.textContent.trim(), agent: row.querySelector("img")?.alt, agentId: agentId(row.querySelector("img")?.src),
        k: value(2), d: value(3), econ: value(5), bank: num(cells[5].querySelector(".label")?.textContent) };
    }));
    const events = [...leaf("Event Log").parentElement.children].slice(1).map((row) => {
      const [actor, middle, victim] = [...row.children];
      const icon = (middle.querySelector("img")?.src || "").replace("https://titles.trackercdn.com/valorant-api/", "");
      return { time: middle.querySelector(".text-16")?.textContent.trim(), actor: agentId(actor.querySelector("img")?.src), actorTeam: color(actor), icon,
        text: middle.lastElementChild.textContent.trim(), victim: victim && agentId(victim.querySelector("img")?.src), victimTeam: victim && color(victim) };
    });
    return { result, players, events };
  }

  const rounds = [];
  for (let index = 0; index < selectors().length; index++) {
    selectors()[index].click();
    await sleep(700);
    rounds.push(read());
  }

  const players = rounds[0].players.map(({ name, team, agent, agentId: id }) => ({ name, team, agent, agentId: id }));
  const indexOf = (id, team) => players.findIndex((player) => player.agentId === id && player.team === team);
  const problems = [];
  const lines = rounds.map((round, roundIndex) => {
    const row = (index) => round.players.find((player) => player.name === players[index].name);
    const kills = Array(10).fill(0), deaths = Array(10).fill(0);
    const events = round.events.map((event) => {
      const actor = indexOf(event.actor, event.actorTeam);
      if (event.text === "Planted") return `P${seconds(event.time)}.${actor}`;
      if (event.text === "Defused") return `D${seconds(event.time)}.${actor}`;
      if (event.text === "Exploded") return `X${seconds(event.time)}.${actor}`;
      const victim = indexOf(event.victim, event.victimTeam);
      // Same player on both sides, no weapon: killed by the spike blast; scoreboards do not count it.
      if (victim === actor && !event.icon) return `S${seconds(event.time)}.${victim}`;
      const weapon = event.icon.startsWith("weapons/") ? event.icon.split("/")[1].slice(0, 8) : event.icon.startsWith("agents/") ? "ab" : "-";
      if (actor >= 0 && event.actorTeam !== event.victimTeam) kills[actor]++;
      if (victim >= 0) deaths[victim]++;
      return `K${seconds(event.time)}.${actor}.${victim}.${weapon}`;
    });
    players.forEach((player, index) => {
      if (row(index).k !== kills[index] || row(index).d !== deaths[index]) problems.push(`round ${roundIndex + 1} ${player.name}: K ${row(index).k}/${kills[index]} D ${row(index).d}/${deaths[index]}`);
    });
    const economy = players.map((_, index) => `${row(index).econ}/${row(index).bank}`).join(",");
    return `${round.result.replace(/^Team ([AB]) (\w+) Win$/, "$1 $2")}|${economy}|${events.join(" ")}`;
  });
  return { url: location.href, players: players.map((player) => `${player.name}|${player.team}|${player.agent}|${player.agentId}`), rounds: lines, problems };
})();
