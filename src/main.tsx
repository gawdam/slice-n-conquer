import './createPost.js';
import { Devvit, useState, useWebView } from '@devvit/public-api';
import type { DevvitMessage, WebViewMessage } from './message.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addCustomPostType({
  name: 'Divide n Conquer',
  height: 'tall',
  render: (context) => {
    const [username] = useState(async () => {
      return (await context.reddit.getCurrentUsername()) ?? 'anon';
    });

    const [userRank, setUserRank] = useState(async () => {
      const total = Number(await context.redis.zCard(`leaderboard_${context.postId}`));
      if (total === 0) {
        return total + 1;
      }
      const rank = Number(await context.redis.zRank(`leaderboard_${context.postId}`, username));
      return rank === null ? total + 1 : total - rank;
    });
    const [percentile, setPercentile] = useState(async () => {
      const total = Number(await context.redis.zCard(`leaderboard_${context.postId}`)) || 1;
      if (total === 0) {
        return 100;
      }
      const rank = Number(await context.redis.zRank(`leaderboard_${context.postId}`, username));
      if (rank === null) {
        return 100;
      }
      return Math.round(((total - rank) / total) * 100);
    });
    const [highScore, setHighscore] = useState(async () => {
      return Number(
        (await context.redis.get(`highscore_${context.postId}_${username}`)) ?? 0
      );
    });

    // 👇 new state to toggle leaderboard box
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [leaderboard, setLeaderboard] = useState<{ member: string; score: number }[]>(async () => { 
      const topUsers = await context.redis.zRange(
        `leaderboard_${context.postId}`,
        0,
        9,
        { by: 'score', reverse:true } // highest first
      );
      return topUsers;
    });

    async function loadLeaderboard() {
      const topUsers = await context.redis.zRange(
        `leaderboard_${context.postId}`,
        0,
        9,
        { by: 'score', reverse:true } // highest first
      );
      setLeaderboard(topUsers as { member: string; score: number }[]);
      return topUsers as { member: string; score: number }[];
    }

    const howtoPlayPopup = useWebView({
      url: 'howToPlay.html',
      onMessage: (message) => {
        console.log(`Received message: ${message}`);
      },
    });

    const webView = useWebView<WebViewMessage, DevvitMessage>({
      url: 'index.html',
      async onMessage(message, webView) {
        switch (message.type) {
          case 'webViewReady':
            webView.postMessage({
              type: 'initialData',
              data: {
                username,
                highScore,
              },
            });
            break;
          case 'setHighScore': {
            const newScore = message.data.highScore;
            const currentScore = Number(
              (await context.redis.get(`highscore_${context.postId}_${username}`)) ?? 0
            );

            if (newScore > currentScore) {
              await context.redis.set(
                `highscore_${context.postId}_${username}`,
                newScore.toString()
              );

              await context.redis.zAdd(`leaderboard_${context.postId}`, {
                score: newScore,
                member: username,
              });

              setHighscore(newScore);

              const total = Number(await context.redis.zCard(`leaderboard_${context.postId}`));
              const rank = Number(await context.redis.zRank(
                `leaderboard_${context.postId}`,
                username,
              ));

              if (total === 0 || rank === null) {
                setUserRank(total + 1);
                setPercentile(100);
              } else {
                setUserRank(total - rank);
                setPercentile(Math.round(((total - rank) / total) * 100));
              }
            }

            webView.postMessage({
              type: 'updateCounter',
              data: { highScore: Math.max(newScore, currentScore) },
            });
            break;
          }
          default:
            throw new Error(`Unknown message type: ${message satisfies never}`);
        }
      },
      onUnmount() {
        context.ui.showToast('Web view closed!');
      },
    });

    const leaderboardPopup = useWebView({
      url: 'leaderboard.html',
      async onMessage(message,webView) {
        const topUsers = await context.redis.zRange(
          `leaderboard_${context.postId}`,
          0,
          9,
          { by: 'score', reverse: true }
        );
        webView.postMessage({
          type: 'leaderboardData',
          data: topUsers,
        });
      },

    });


    return (
      <zstack grow>
        {/* Background image */}
        <image
          url="bg.jpg"
          description="Background"
          resizeMode="cover"
          imageHeight={1000}
          imageWidth={1000}
          height="100%"
          width="100%"
          grow
        />

        {/* Leaderboard button (top-right) */}
        <hstack alignment="top end" grow padding="medium">
        <button onPress={() => leaderboardPopup.mount()}>🏆</button>

        </hstack>

        <vstack grow padding="medium" alignment="middle center" gap="large">
          {/* Logo */}
          <vstack alignment="middle center" gap="small">
            <image
              url="logo2.png"
              description="Game Logo"
              imageHeight={1000}
              imageWidth={1000}
              height="64px"
            />
          </vstack>

          <spacer height="10%" />

          {/* Score Box (only if score > 0) */}
          {highScore > 0 && (
            <vstack
              alignment="middle center"
              gap="small"
              padding="medium"
              backgroundColor="#4e4422aa"
              border="thick"
              borderColor="rgba(31, 31, 31, 0.4)"
              cornerRadius="medium"
            >
              <text size="large" weight="bold" color="#eee7e7ff">
                Your score: {highScore}
              </text>
              <text size="large" weight="bold" color="#2e0505ff">
                Your rank: {userRank}
              </text>
              <text size="large" weight="bold" color="#eee7e7ff">
                Top {percentile}%
              </text>
            </vstack>
          )}

          {/* Buttons */}
          <vstack gap="medium" width="80%" alignment="middle center">
            <button onPress={() => howtoPlayPopup.mount()}>
              ❓How to Play
            </button>
            <button appearance="primary" onPress={() => webView.mount()}>
              🎮 Start Game
            </button>
          </vstack>
        </vstack>

        {/* Leaderboard overlay (shows when showLeaderboard is true) */}
        {showLeaderboard && (
          <zstack alignment="middle center" grow>
            <vstack
              backgroundColor="#000000dd"
              padding="large"
              cornerRadius="large"
              gap="small"
              width="80%"
            >
              <text size="xlarge" weight="bold" color="white">
                Leaderboard
              </text>
              {leaderboard.length === 0 ? (
                <text color="white">No scores yet!</text>
              ) : (
                leaderboard.map((entry, index) => (
                  <hstack key={entry.member} gap="medium">
                    <text color="white" weight="bold">
                      #{index + 1}
                    </text>
                    <text color="white">{entry.member}</text>
                    <spacer />
                    <text color="white">{entry.score}</text>
                  </hstack>
                ))
              )}
              <button
                appearance="secondary"
                onPress={() => setShowLeaderboard(false)}
              >
                Close
              </button>
            </vstack>
          </zstack>
        )}
      </zstack>
    );
  },
});

export default Devvit;
