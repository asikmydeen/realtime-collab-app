// Note: Vercel doesn't support persistent WebSocket connections in serverless functions
// For real-time features, we need to use a different approach or external service

export default function handler(req, res) {
  res.status(200).json({ 
    message: "WebSocket connections require a persistent server. Please use Railway, Render, or another platform that supports WebSockets.",
    alternatives: [
      "Railway: https://railway.app",
      "Render: https://render.com",
      "Heroku: https://heroku.com"
    ]
  });
}