// Wait for DOM to load
document.addEventListener("DOMContentLoaded", () => {
  const leaderboardList = document.getElementById("leaderboard-list");
  const closeBtn = document.getElementById("close-btn");

  // Handle incoming data from Devvit
  window.onmessage = (event) => {
    const message = event.data;

    if (message.type === "leaderboardData") {
      const data = message.data;
      leaderboardList.innerHTML = "";

      if (!data || data.length === 0) {
        leaderboardList.innerHTML = "<li>No scores yet!</li>";
        return;
      }

      data.forEach((entry, index) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span class="rank">#${index + 1}</span>
          <span class="user">${entry.member}</span>
          <span class="score">${entry.score}</span>
        `;
        leaderboardList.appendChild(li);
      });
    }
  };

  // Close button sends message back to Devvit
  closeBtn.addEventListener("click", () => {
    window.parent.postMessage({ type: "closeLeaderboard" }, "*");
  });
});
