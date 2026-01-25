// index.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   CORS 設定
========================= */
app.use(cors({
  origin: [
    "https://teamgensourei.github.io", // GitHub Pages
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

/* =========================
   JSON 受け取り
========================= */
app.use(express.json());

/* =========================
   動作確認用
========================= */
app.get("/", (req, res) => {
  res.send("Gensourei API is running");
});

/* =========================
   アカウント登録 API
========================= */
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;

  // バリデーション
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "username と password は必須です",
    });
  }

  // ※ここではDB未使用（仮）
  console.log("新規登録:", username, password);

  res.json({
    success: true,
    message: "登録完了",
    user: {
      username,
    },
  });
});

/* =========================
   サーバー起動
========================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
